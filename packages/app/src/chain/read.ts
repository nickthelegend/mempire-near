import { priceUsd, moveBps, roster, viewAccount, type MatchView } from '@mempire/sdk';
import { reader, net } from './provider';
import { COINS } from '../lib/coins';
export interface ChainConfig { address:string;treasury:string;mintFeeMon:number;rakePct:number;tieRakePct:number;matchTimeoutSecs:number;powerBand:number;nextCardId:number;nextMatchId:number;timeScale:number;metaEpoch:number }
export async function fetchConfig():Promise<ChainConfig> { const [c,t]=await Promise.all([reader.config(),reader.totals()]);return {address:net.arena,treasury:c.treasury,mintFeeMon:0,rakePct:(c.bps.season+c.bps.treasury)/100,tieRakePct:(c.bps.season+c.bps.treasury)/100,matchTimeoutSecs:0,powerBand:0,nextCardId:0,nextMatchId:Number(t.matches)+1,timeScale:1,metaEpoch:0}; }
export interface ChainCoin { coinId:number;mint:string;archetype:number;active:boolean;ticker:string }
export async function fetchRegisteredCoins():Promise<ChainCoin[]> { const c=await reader.config();return c.roster.map((f,i)=>({coinId:i,mint:COINS[i].mint,archetype:f.archetype,active:true,ticker:f.ticker})); }
// This is availability, never an NFT ownership record. Every supported fighter is free at level 1.
export interface ChainCard { id:number;owner:string;coinId:number;mint:string;archetype:number;level:number;inMatch:boolean;lockedBy:string|null;mintPriceUsd:number|null }
export async function fetchCardsFor(_owner:string):Promise<ChainCard[]> {return roster.fighters.map(f=>({id:f.fighterId,owner:'',coinId:f.fighterId,mint:COINS[f.fighterId].mint,archetype:f.archetype,level:1,inMatch:false,lockedBy:null,mintPriceUsd:null}));}
export interface ChainChest { id:number;tier:number;state:number;readyAt:number;revealBlock:number }
export const fetchChests=async(_owner:string):Promise<ChainChest[]>=>[];
export const fetchTokenBalances=async(_owner:string)=>new Map<string,number>();
export const fetchMonBalance=async(owner:string)=>Number((await viewAccount(net.rpc,owner)).amount)/1e24;
export interface ChainMatch { address:string;id:number;tier:number;stake:number;stakeRaw:bigint;currency:'NEAR'|'AUSD';currencyAddress:string;players:[string,string];sessions:[string,string];state:number;createdAt:number;deadline:number;winner:number;claims:[number,number];decks:[string,string];powers:[number,number];metaEpoch:number;plays:[number,number];near:MatchView }
export function chainMatch(m:MatchView):ChainMatch {return {address:net.arena,id:Number(m.id),tier:m.tier,stake:Number(m.stake)/1e24,stakeRaw:BigInt(m.stake),currency:'NEAR',currencyAddress:'',players:[m.p0,m.p1??''],sessions:[m.session0??'',m.session1??''],state:m.state,createdAt:Number(m.created_ms)/1000,deadline:Number(m.close_ms)/1000,winner:m.winner,claims:[3,3],decks:[JSON.stringify(m.deck0),JSON.stringify(m.deck1)],powers:[8,8],metaEpoch:Math.floor(Number(m.start_ms)/600000),plays:[m.plays0,m.plays1],near:m};}
export async function fetchMatchById(id:number){const m=await reader.match(id);return m?chainMatch(m):null;}
export const fetchMatch=fetchMatchById;export const fetchMatchByAddress=fetchMatchById;
export async function fetchRecentMatches(limit=24){return(await reader.recent(limit)).map(chainMatch);}
export async function fetchRecentSettlements(limit=12){return(await fetchRecentMatches(Math.min(100,limit*3))).filter(m=>m.state===3).slice(0,limit);}
export async function fetchStrandedMatches(owner:string){return(await fetchRecentMatches(100)).filter(m=>(m.state===1||m.state===2)&&m.players.includes(owner));}
export async function fetchOpenMatches(){return(await fetchRecentMatches(100)).filter(m=>m.state===1);}
export const MATCH_STATE_OPEN=1,MATCH_STATE_ACTIVE=2,MATCH_STATE_SETTLED=3,NO_CLAIM=3;
export async function fetchMarketMeta(){const p=await reader.prices();for(const r of p.prices){const c=COINS[r.fighter_id];if(!c)continue;c.priceUsd=r.status===4?0:priceUsd(r.last_e8);c.change24h=r.status===4?undefined:moveBps(r.open_e8,r.last_e8)/100;c.metaBps=r.stat_bps;c.updatedAt=Number(r.ts_ms);c.priceState=r.status===0?'Signed relayer price':r.status===2?'Stale: neutral':'No price: neutral';}return{epoch:Math.floor(Math.max(0,...p.prices.map(r=>Number(r.ts_ms)))/600000),bps:new Map(p.prices.map(r=>[r.fighter_id,r.stat_bps]))};}
export const fetchStarterClaimed=async()=>false;
