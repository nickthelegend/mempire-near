// Real testnet browser QA. Credentials are loaded by path only and never printed.
import pw from '/Volumes/Extreme SSD/Projects/tasteprobe/node_modules/playwright-core/index.js';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {ArenaReader,viewAccount,viewAccessKeys,rpc,parseOutcome,replayFromChain,type Network} from '@mempire/sdk';
import {withChromeLock} from '/Volumes/Extreme SSD/Projects/grokbot/orchestration/chrome-lock.mjs';
const root=resolve(import.meta.dirname,'../..'),base='http://127.0.0.1:5390';
const out='/Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/mempire-near/r3';
const privateDir='/private/tmp/mempire-r3-private';mkdirSync(out,{recursive:true});mkdirSync(privateDir,{recursive:true,mode:0o700});
const account='aiko-8197.mempire-relay-41966.testnet',arena='mempire-arena-41966.testnet',parent='mempire-relay-41966.testnet';
const net:Network={networkId:'testnet',rpc:'https://test.rpc.fastnear.com,https://rpc.testnet.near.org',arena,explorer:'https://testnet.nearblocks.io'};
const reader=new ArenaReader(net),date=new Date().toISOString().slice(0,10),file=resolve(root,`deployments/r3-${date}.json`);
if(existsSync(file))throw Error('R3 ledger already exists; inspect and resume explicitly instead of overwriting evidence.');
const ledger:any={at:new Date().toISOString(),status:'running',network:'testnet',branch:'main',client:'packages/web',account,budgetCapNear:'0.3',reservations:[],transactions:[],matches:[],screens:[],errors:[],relayerRequests:[]};
let reserved=0n;const cap=300000000000000000000000n;const save=()=>writeFileSync(file,JSON.stringify({...ledger,reservedUpperBoundYocto:reserved.toString()},null,2)+'\n');save();
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function resources(){const free=Number(execFileSync('memory_pressure',[],{encoding:'utf8'}).match(/System-wide memory free percentage: (\d+)%/)![1]);if(free<30)throw Error('Memory below 30%; retry when other jobs finish.');const text=execFileSync('df',['-k','/System/Volumes/Data'],{encoding:'utf8'}).trim().split('\n').at(-1)!.trim().split(/\s+/);if(Number(text[3])<5*1024*1024)throw Error('Disk below 5 GB');}
async function ready(url:string){for(let i=0;i<60;i++){try{if((await fetch(url)).ok)return;}catch{}await delay(500);}throw Error('Server did not start: '+url);}
const start=(args:string[],env=process.env)=>spawn('pnpm',args,{cwd:root,env,detached:true,stdio:'ignore'});
async function finalizeTransactions(){for(const t of ledger.transactions){if(t.tokensBurnt)continue;const raw:any=await rpc(net.rpc,'tx',{tx_hash:t.hash,sender_account_id:t.account,wait_until:'FINAL'});const out=parseOutcome(raw);t.ok=out.ok;t.error=out.error??null;t.tokensBurnt=(BigInt(raw.transaction_outcome.outcome.tokens_burnt)+raw.receipts_outcome.reduce((n:bigint,r:any)=>n+BigInt(r.outcome.tokens_burnt),0n)).toString();t.actualSender=raw.transaction.signer_id;t.receiver=raw.transaction.receiver_id;t.url=`${net.explorer}/txns/${t.hash}`;t.functionMethods=raw.transaction.actions.filter((a:any)=>a.FunctionCall).map((a:any)=>a.FunctionCall.method_name);t.transactionPublicKeyMatchesSession=t.matchId?raw.transaction.public_key===ledger.matches.find((m:any)=>m.id===t.matchId)?.chain.session0:undefined;if(!out.ok)throw Error('On-chain transaction failed: '+t.hash);save();}}
await withChromeLock(async()=>{
 let browser:any,web:any,relay:any;try{
 await resources();
 const daily=resolve(root,`deployments/market-meta-${date}.json`);if(existsSync(daily))throw Error('Daily price evidence exists; do not overwrite sealed evidence.');
 const balance=await viewAccount(net.rpc,parent);ledger.relayerBalanceBefore=balance.amount;save();
 relay=start(['--filter','@mempire/relayer','start'],{...process.env,ARENA_ACCOUNT:arena,RELAYER_ACCOUNT:parent,RELAYER_PORT:'5399',RELAYER_PRICES:'0',RELAYER_KEEPER:'0',RELAYER_MAX_ACCOUNTS:'0'});await ready('http://127.0.0.1:5399/info');
 const child=spawn('pnpm',['meta:post'],{cwd:root,env:{...process.env,ARENA_ACCOUNT:arena,RELAYER_ACCOUNT:parent,META_RELAY_URL:'http://127.0.0.1:5399',META_BUDGET_NEAR:'0.005'},stdio:'ignore'});if(await new Promise(r=>child.on('exit',r))!==0)throw Error('Price post failed; inspect the price command before continuing.');
 const prices=JSON.parse(readFileSync(daily,'utf8'));for(const t of prices.transactions){ledger.transactions.push({hash:t.hash,account:t.sender,kind:'price',deposit:'0',tokensBurnt:t.tokensBurnt,ok:t.ok,url:t.url});reserved+=BigInt(t.tokensBurnt);}ledger.priceSnapshot=prices.transactions.at(-1).snapshot;save();process.kill(-relay.pid,'SIGTERM');relay=null;
 // No operator relayer is running during the wallet tests.
 web=start(['--filter','@mempire/web','dev','--port','5390'],{...process.env,VITE_QA_SIGNER:'1',VITE_RELAYER_URL:'http://127.0.0.1:5999'});await ready(base);
 browser=await pw.chromium.launch({channel:'chrome',headless:true,args:['--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 for(const width of [1440,375]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  // Runtime loads the repo's existing demo credential. It is never an env value or output.
  const credential=JSON.parse(readFileSync(resolve(root,'.near-credentials',`${account}.json`),'utf8'));
  await context.addInitScript((config:any)=>{(window as any).__MEMPIRE_R3_SIGNER__=config;},{accountId:account,secretKey:credential.private_key});
  let matchId:string|undefined;
  await context.exposeBinding('__MEMPIRE_R3_AUTHORIZE__',async(_source:any,e:any)=>{
   if(e.account!==account)throw Error('Wrong player');const dep=BigInt(e.deposit);const live=await viewAccount(net.rpc,e.account);if(BigInt(live.amount)<dep+1000000000000000000000n)throw Error('Not enough player balance');
   let houseStake=0n;if(e.actions.some((a:any)=>a.method==='challenge_house')){const h=(await reader.houses())[0];if(h.stake!=='10000000000000000000000'||BigInt(h.treasury)<BigInt(h.stake))throw Error('Smallest house stake unavailable');const v=await viewAccount(net.rpc,h.account);if(BigInt(v.amount)<BigInt(h.stake))throw Error('House balance insufficient');houseStake=BigInt(h.stake);e.houseBalanceBefore=v.amount;e.houseTreasuryBefore=h.treasury;}
   const fee=e.actions.some((a:any)=>a.method==='settle')?30000000000000000000000n:3000000000000000000000n;
   if(reserved+dep+houseStake+fee>cap)throw Error('R3 cumulative budget cap reached');reserved+=dep+houseStake+fee;ledger.reservations.push({...e,width,matchId,at:new Date().toISOString(),nodeBalanceBefore:live.amount,feeReserve:fee.toString(),houseStake:houseStake.toString(),upperBoundAfter:reserved.toString()});save();
  });
  await context.exposeBinding('__MEMPIRE_R3_REPORT__',async(_source:any,e:any)=>{if(!ledger.transactions.some((t:any)=>t.hash===e.hash)){ledger.transactions.push({...e,width,matchId,at:new Date().toISOString(),kind:e.actions.map((a:any)=>a.method??a.type).join(',')});save();}});
  const page=await context.newPage();page.on('pageerror',(e:any)=>{ledger.errors.push({width,type:'page',message:e.message});save();});page.on('console',(m:any)=>{if(m.type()==='error'){ledger.errors.push({width,type:'console',message:m.text()});save();}});page.on('request',(r:any)=>{if(/\/relay$|\/auth\/|:5999\//.test(r.url())){ledger.relayerRequests.push({url:r.url(),method:r.method()});save();}});
  const shot=async(name:string,focus?:string)=>{if(focus)await page.locator(focus).scrollIntoViewIfNeeded();await delay(400);const path=`${name}-${width}.png`;await page.screenshot({path:resolve(out,path)});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);ledger.screens.push({name,width,path,overflow});save();};
  await page.goto(base+'/app#signin');await page.getByRole('button',{name:'Connect NEAR wallet',exact:true}).waitFor();await shot('after-signin','#signin');await page.getByRole('button',{name:'Connect NEAR wallet',exact:true}).click();await page.getByRole('heading',{name:'Your account',exact:true}).waitFor({timeout:60000});
  const publicDevice=await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('mempire:near:device')??'{}');return{account:d.accountId,kind:d.kind,hasPrivateKey:!!d.key,qaStartupKeyPresent:'__MEMPIRE_R3_SIGNER__'in window};});if(publicDevice.account!==account||publicDevice.kind!=='wallet'||publicDevice.hasPrivateKey||publicDevice.qaStartupKeyPresent)throw Error('Wallet identity/storage invariant failed');await shot('wallet-account','#signin');
  await page.goto(base+'/app/houses');await page.getByRole('button',{name:/Challenge Kumo/}).waitFor({timeout:60000});await shot('houses');await page.getByRole('button',{name:/Challenge Kumo/}).click();await page.waitForURL(/\/app\/battle\/\d+$/,{timeout:90000});matchId=page.url().split('/').pop()!;
  const chain=await reader.match(matchId);if(!chain||chain.stake!=='10000000000000000000000'||chain.house!==0)throw Error('Unexpected match stake/house');const keys=await viewAccessKeys(net.rpc,account);const permission=keys.keys.find(k=>k.public_key===chain.session0)?.access_key.permission;if(!permission||permission==='FullAccess'||permission.FunctionCall.allowance===null||permission.FunctionCall.receiver_id!==arena||permission.FunctionCall.method_names.join(',')!=='play')throw Error('Session key scope failed');
  ledger.matches.push({id:matchId,width,chain,permissionDuringMatch:permission,device:publicDevice});for(const t of ledger.transactions.filter((t:any)=>t.width===width&&!t.matchId))t.matchId=matchId;save();
  const privatePath=resolve(privateDir,`${width}.json`);await context.storageState({path:privatePath});chmodSync(privatePath,0o600);
  await page.locator('.hand-bar[data-can-play="1"] .hand').waitFor({timeout:60000});await page.waitForFunction(()=>!document.querySelector('.vs-intro'),null,{timeout:30000});
  for(let i=0;i<6;i++){const card=page.locator('.hand button.fcard:not(.unaffordable):not([disabled])').first();if(await card.count()){await card.click();const b=await page.locator('canvas').first().boundingBox();if(b)await page.mouse.click(b.x+b.width*(i%2?.3:.7),b.y+b.height*.72);}await delay(2400);if(i===1)await shot('staked-battle');}
  for(let i=0;i<100;i++){const m=await reader.match(matchId);if(m?.state===3)break;await delay(1000);if(i===99)throw Error('Referee did not settle');}
  await page.locator('.cer-title').waitFor({timeout:30000});await page.waitForFunction(id=>!localStorage.getItem(`mempire:near:session:${id}`),matchId,{timeout:60000});await shot('staked-result');
  await page.goto(base+'/app/match/'+matchId);await page.getByText('Verified: same winner, same final tick, same state hash',{exact:false}).waitFor({timeout:60000});await shot('receipt','.verify');
  const replay=await replayFromChain(net,matchId);if(!replay.matchesChain)throw Error('Independent replay mismatch');const after=await viewAccessKeys(net.rpc,account);if(after.keys.some(k=>k.public_key===chain.session0))throw Error('Play key still installed');
  Object.assign(ledger.matches.at(-1),{chain:replay.match,storedPlays:await reader.plays(matchId),replay:{winner:replay.result.winner,endTick:replay.result.end_tick,finalHash:replay.result.final_hash,matchesChain:true},playKeyDeleted:true,fullAccessKeysAfter:after.keys.filter(k=>k.access_key.permission==='FullAccess').length});save();await context.close();console.log(JSON.stringify({width,match:matchId,plays:replay.inputs.length,verified:true,keyDeleted:true}));
 }
 await finalizeTransactions();const gas=ledger.transactions.reduce((n:bigint,t:any)=>n+BigInt(t.tokensBurnt??'0'),0n);const deposits=ledger.transactions.reduce((n:bigint,t:any)=>n+BigInt(t.deposit??'0'),0n);const house=ledger.matches.reduce((n:bigint,m:any)=>n+BigInt(m.chain.stake),0n);ledger.budget={gasBurntYocto:gas.toString(),playerDepositsYocto:deposits.toString(),houseStakesYocto:house.toString(),conservativeSpentYocto:(gas+deposits+house).toString()};
 if(gas+deposits+house>cap||ledger.relayerRequests.length||ledger.screens.some((s:any)=>s.overflow>0))throw Error('Budget, operator independence, or overflow check failed');ledger.status='complete';save();console.log(JSON.stringify({status:ledger.status,transactions:ledger.transactions.length,errors:ledger.errors.length,spentNear:Number(gas+deposits+house)/1e24,file}));
 }catch(e){ledger.status='interrupted';ledger.failure=e instanceof Error?e.message:String(e);save();console.error(ledger.failure);process.exitCode=1;}
 finally{if(browser)await browser.close();for(const p of [web,relay])if(p)try{process.kill(-p.pid,'SIGTERM');}catch{}}
});
