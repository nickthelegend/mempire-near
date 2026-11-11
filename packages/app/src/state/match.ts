import { create } from 'zustand';
import { MatchRunner, roster, replayFromChain, type MatchView, type RunnerEvent } from '@mempire/sdk';
import { decideBot, stepSim, matchCards, FORMATS, type InputEvent } from '@mempire/sim';
import { createMatch, viewState } from '../sim/engine';
import type { MatchCard, SimState } from '../sim/types';
import { net, reader } from '../chain/provider';
import { activeSigner } from '../chain/account';
import { openOrJoin, sessionFor, settleMatch, cancelMatch, removeSession, recoverWaiting } from '../chain/session';
import { play, startMusic, stopMusic } from '../lib/audio';
import { COINS } from '../lib/coins';
import { warmBattleChunk, warmMatchArt } from '../lib/warm';
import { useWallet } from './wallet';
import { useDeck, type StakeCurrency } from './deck';
import { useCollection } from './collection';
import { useChain } from './chain';
import { useEscrow } from './escrow';
import { usePlayLog, noteRunnerEvent } from './playLog';
import { useLadder } from './ladder';
import type { ChestTier } from './economy';
export type MatchStatus='idle'|'queuing'|'found'|'battle'|'settled';
export interface MatchOpts{practice?:boolean;ranked?:boolean;rush?:boolean;}
export interface MatchResult{won:boolean;draw:boolean;currency?:StakeCurrency;potSol:number;payoutSol:number;rakeSol:number;hashes:number;crowns:[number,number];chest:ChestTier|null;escrowed:boolean;matchId?:number|null;trophyDelta?:number;trophiesAfter?:number;promoted?:boolean;demoted?:boolean;leagueAfter?:string;voided?:boolean;}
export interface Shock{id:number;kind:'tower'|'deploy';forPlayer:0|1;}
interface Store{status:MatchStatus;version:number;sim:SimState|null;playerDeck:MatchCard[];botDeck:MatchCard[];stakeSol:number;currency:StakeCurrency;result:MatchResult|null;history:MatchResult[];opponentName:string;crowns:[number,number];shock:Shock|null;practice:boolean;ranked:boolean;rush:boolean;waitingForHuman:boolean;soloVsBot:boolean;mode:'bot'|'human';perspective:0|1;error:string|null;startQueue:(opts?:MatchOpts)=>string|null;cancelQueue:()=>void;playCard:(deckIndex:number,x:number,y:number)=>void;forfeit:()=>void;dismiss:()=>void;resumeWaiting:()=>Promise<void>;}
let loop:ReturnType<typeof setInterval>|null=null;
let queued:InputEvent[]=[];
let runner:MatchRunner|null=null;
let generation=0;
let cancelling=false;
let waitingId:string|null=null;
let resuming=false;
const stop=()=>{if(loop)clearInterval(loop);loop=null;runner?.stop();runner=null;stopMusic();};
const idsOfDeck=()=>{const cards=useCollection.getState().cards;return useDeck.getState().active.map(id=>COINS.find(c=>c.mint===cards.find(k=>k.id===id)?.mint)?.coinId??-1);};
const viewDeck=(ids:number[],mods:number[])=>matchCards(roster.fighters,ids,mods).map(c=>({...c,coinId:COINS[c.fighterId].mint}));
const crowns=(sim:SimState,me:0|1):[number,number]=>[sim.towers.filter(t=>t.owner!==me&&t.hp<=0).length,sim.towers.filter(t=>t.owner===me&&t.hp<=0).length];
function showState(sim:SimState){const s=useMatch.getState();const next=crowns(sim,s.perspective);const fell=next[0]!==s.crowns[0]||next[1]!==s.crowns[1];if(fell)play('tower');useMatch.setState({sim,version:s.version+1,crowns:next,...(fell?{shock:{id:Date.now(),kind:'tower' as const,forPlayer:s.perspective}}:{})});}
function localDone(){const s=useMatch.getState();if(!s.sim||s.status==='settled')return;stop();const won=s.sim.winner===s.perspective,draw=s.sim.winner===-2;play(won||draw?'victory':'defeat');useMatch.setState({status:'settled',result:{won,draw,currency:'NEAR',potSol:0,payoutSol:0,rakeSol:0,hashes:0,crowns:crowns(s.sim,s.perspective),chest:null,escrowed:false}});}
function startPractice(ids:number[],rush:boolean){const a=viewDeck(ids,ids.map(id=>COINS[id].metaBps??0));const b=viewDeck([0,9,2,10,4,7,3,1],[0,0,0,0,0,0,0,0]);
 const sim=createMatch(crypto.getRandomValues(new Uint32Array(1))[0],[a,b],rush?FORMATS.rush:FORMATS.standard);
 queued=[];useEscrow.getState().reset();useMatch.setState({status:'battle',sim,playerDeck:a,botDeck:b,mode:'bot',perspective:0,practice:true,stakeSol:0,crowns:[0,0],opponentName:'Training bot'});startMusic();
 loop=setInterval(()=>{const s=useMatch.getState();if(!s.sim)return;const ev=decideBot(s.sim,1,'normal');if(ev)queued.push(ev);const now=queued.filter(x=>x.tick===s.sim!.tick);queued=queued.filter(x=>x.tick>s.sim!.tick);stepSim(s.sim,now);showState({...s.sim});if(s.sim.phase==='ended')localDone();},50);
}
async function chainDone(m:MatchView){if(m.state!==3)return;const s=useMatch.getState();const me=useWallet.getState().address;const seat:mSeat=m.p0===me?0:1;const draw=m.winner===2;const won=m.winner===seat;
 const r=await replayFromChain(net,m.id);const sim=viewState(r.final);
 if(!r.matchesChain)throw new Error('This browser replay disagrees with the referee. Open the proof before trusting the result.');
 const result:MatchResult={won,draw,currency:'NEAR',potSol:Number(m.stake)*2/1e24,payoutSol:draw?Number(m.paid)/2/1e24:won?Number(m.paid)/1e24:0,rakeSol:(Number(m.to_season)+Number(m.to_treasury))/1e24,hashes:1,crowns:crowns(sim,seat),chest:null,escrowed:true,matchId:Number(m.id)};
 stop();usePlayLog.setState({phase:'done'});useEscrow.setState({phase:'settled'});
 useMatch.setState({sim,status:'settled',result,history:[result,...s.history.filter(h=>h.matchId!==Number(m.id))]});
 await removeSession(m.id).catch(e=>useEscrow.setState({lastError:`Session key cleanup: ${String(e)}`}));
 play(won||draw?'victory':'defeat');await useChain.getState().refresh();await useLadder.getState().load(me);
}
type mSeat=0|1;
async function startStaked(m:MatchView,g:number){if(g!==generation)return;stop();waitingId=null;localStorage.removeItem('mempire:near:waiting');const me=useWallet.getState().address;const seat:0|1=m.p0===me?0:1;
 const a=viewDeck(m.deck0,m.mods.slice(0,8)),b=viewDeck(m.deck1,m.mods.slice(8));
 useMatch.setState({status:'found',mode:'human',practice:false,perspective:seat,playerDeck:seat===0?a:b,botDeck:seat===0?b:a,opponentName:seat===0?(m.p1??'Opponent'):m.p0,stakeSol:Number(m.stake)/1e24,waitingForHuman:false});
 useEscrow.setState({phase:'live',matchId:Number(m.id),stake:Number(m.stake)/1e24});usePlayLog.setState({phase:'live',matchId:Number(m.id)});
 const r=new MatchRunner({net,matchId:m.id,seat,session:sessionFor(m.id),pollMs:250,
 settle:async claim=>{useEscrow.setState({phase:'claiming'});try{
  // Seat 0 settles first; seat 1 remains a fallback if that browser leaves.
  if(seat===1){const delay=Number(m.close_ms)+8000-r.chainNow();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));const done=await reader.match(m.id);if(done?.state===3){await chainDone(done);return;}}
  const after=await settleMatch(m.id,claim);await chainDone(after);
 }catch(e){useEscrow.setState({lastError:String(e)});throw e;}},
 onEvent:(e:RunnerEvent)=>{if(g!==generation)return;noteRunnerEvent(e);
 if(e.type==='state'){const sim=viewState(e.state);if(useMatch.getState().status==='found')useMatch.setState({status:'battle'});showState(sim);}
 if(e.type==='playRefused')useMatch.setState({error:`Play refused: ${e.error}`});
 if(e.type==='match'&&e.match.state===3&&useMatch.getState().status!=='settled')void chainDone(e.match).catch(e=>useMatch.setState({error:String(e)}));
 if(e.type==='error')useMatch.setState({error:e.error.message});
 }});runner=r;await r.init();if(g!==generation){r.stop();return;}startMusic();void r.run();
}
async function watchWaiting(id:string,g:number) {
 waitingId=id;let checking=false;
 const check=async()=>{
  if(checking || g!==generation || useMatch.getState().status!=='queuing')return;
  checking=true;
  try {
   let m=await reader.match(waitingId!);
   if(m?.state===1 && !cancelling)m=await recoverWaiting(m);
   if(g!==generation || !m)return;
   waitingId=m.id;
   useEscrow.setState({matchId:Number(m.id),stake:Number(m.stake)/1e24,phase:m.state===2?'live':'waiting'});
   if(m.state===2){await startStaked(m,g);return;}
   if(m.state===3){await chainDone(m);return;}
   if(m.state===4){stop();await removeSession(m.id);useMatch.setState({status:'idle',error:'The waiting stake was refunded.'});}
   if(cancelling && m.state===1){await cancelMatch(m.id);generation++;stop();waitingId=null;useMatch.setState({status:'idle'});}
  } finally {checking=false;}
 };
 await check();
 if(g===generation && useMatch.getState().status==='queuing')loop=setInterval(()=>{void check().catch(e=>useMatch.setState({error:String(e)}));},1200);
}
export const useMatch=create<Store>((set,get)=>({status:'idle',version:0,sim:null,playerDeck:[],botDeck:[],stakeSol:0,currency:'NEAR',result:null,history:[],opponentName:'Training bot',crowns:[0,0],shock:null,practice:false,ranked:false,rush:true,waitingForHuman:false,soloVsBot:false,mode:'bot',perspective:0,error:null,
 startQueue:(opts={})=>{if(get().status!=='idle'&&get().status!=='settled')return'A match is already open.';const ids=idsOfDeck();if(ids.length!==8||ids.some(id=>id<0)||new Set(ids).size!==8)return'Choose eight different NEAR fighters in Deck.';
 if(!opts.practice&&!activeSigner())return'Sign in before staking.';
 if(!opts.practice&&useChain.getState().mode!=='onchain')return'The NEAR arena is not ready. Retry the chain read.';
 const stake=opts.practice?0:Number(useChain.getState().config?useDeck.getState().tier:0);
 if(!opts.practice&&useWallet.getState().mon<([.01,.05,.1,.25][stake]+.01))return'Not enough testnet NEAR for this stake plus gas.';
 stop();usePlayLog.getState().reset();const g=++generation;cancelling=false;warmBattleChunk();warmMatchArt(ids.map(id=>COINS[id].mint));set({status:'queuing',result:null,error:null,practice:!!opts.practice,ranked:!!opts.ranked,rush:!!opts.rush,currency:'NEAR',waitingForHuman:!opts.practice});
 if(opts.practice){setTimeout(()=>{if(g===generation)startPractice(ids,!!opts.rush);},800);return null;}
 useEscrow.setState({phase:'opening',lastError:null});
 void openOrJoin(useDeck.getState().tier,opts.rush?1:0,ids).then(async out=>{
  waitingId=out.id;useEscrow.setState({matchId:Number(out.id),phase:out.active?'live':'waiting'});
  if(cancelling){await cancelMatch(out.id);waitingId=null;set({status:'idle'});return;}
  await watchWaiting(out.id,g);
 }).catch(e=>{stop();useEscrow.setState({phase:'failed',lastError:String(e)});set({status:'idle',error:e instanceof Error?e.message:String(e)});});return null;
 },
 resumeWaiting:async()=>{
  if(resuming || get().status!=='idle')return;
  resuming=true;try{
  const id=localStorage.getItem('mempire:near:waiting');const signer=activeSigner();
  if(!id || !signer)return;
  const m=await reader.match(id);
  if(!m || ![m.p0,m.p1].includes(signer.accountId)){localStorage.removeItem('mempire:near:waiting');return;}
  if(m.state===4){await removeSession(id);return;}
  if(m.state===3){await removeSession(id);return;}
  const g=++generation;stop();cancelling=false;
  warmBattleChunk();set({status:'queuing',practice:false,ranked:true,rush:m.format===1,result:null,error:null,waitingForHuman:true});
  await watchWaiting(id,g);
  }finally{resuming=false;}
 },
 cancelQueue:()=>{if(get().status==='battle')return;cancelling=true;if(get().practice){generation++;stop();set({status:'idle'});return;}
 // The polling loop serializes cancellation with any queue recovery already in flight.
 set({error:null});},
 playCard:(deckIndex,x,y)=>{const s=get();if(s.status!=='battle'||!s.sim||s.sim.phase==='ended')return;
 if(s.practice){queued.push({tick:s.sim.tick+2,player:s.perspective,deckIndex,x:Math.round(x),y:Math.round(y)});}else{try{runner?.queuePlay(deckIndex,x,y);}catch(e){set({error:String(e)});return;}}
 play('deploy');set({shock:{id:Date.now(),kind:'deploy',forPlayer:s.perspective}});
 },
 forfeit:()=>{const s=get();if(s.practice&&s.sim){s.sim.phase='ended';s.sim.winner=s.perspective===0?1:0;localDone();}else{generation++;stop();set({status:'idle',sim:null,error:null});}},
 dismiss:()=>{generation++;stop();set({status:'idle',sim:null,result:null,shock:null,error:null});},
}));
export const withMeta=(deck:MatchCard[],bps:Map<number,number>)=>deck.map(c=>({...c,metaBps:bps.get(c.fighterId)??0}));
export async function modifiersAt(_epoch:number){throw new Error('Use the modifiers stored with the NEAR match.');}
