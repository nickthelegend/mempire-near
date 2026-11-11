import { reader } from '../chain/provider';
import { leaderboard } from './near-data';
export const API_BASE=null;
export const hasApi=()=>true;
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
// Read-only adapters for the imported screens. Every value comes from the deployed NEAR arena.
export async function apiFetch(path:string,_init?:RequestInit):Promise<Response|null>{try{
 if(/^\/api\/replay\/\d+\/exists$/.test(path)){const id=path.split('/')[3];const m=await reader.match(id);return json({exists:!!m&&m.state!==1});}
 if(path==='/api/ai/status')return json({mode:'off',model:null});
 if(path==='/api/live'){const rows=await reader.recent(40);return json({matches:rows.filter(m=>m.state===2).map(m=>({matchId:Number(m.id),startAt:Number(m.start_ms),format:m.format===0?'standard':'rush',seats:[m.p0,m.p1]}))});}
 if(path.startsWith('/api/leaderboard'))return json(await leaderboard());
 if(path==='/api/ladder'){const rows=await leaderboard();return json({players:rows.map(r=>({...r,name:null,trophies:r.points,best:r.points,league:'Season points'}))});}
 if(path.startsWith('/api/ladder/')){const account=decodeURIComponent(path.slice('/api/ladder/'.length));const [p,season]=await Promise.all([reader.player(account),reader.currentSeason()]);const points=await reader.points(season,account);return json({...p,trophies:points,best:points,rank:null});}
 return json({error:'This feature is not on NEAR yet.'},503);
 }catch(e){return json({error:e instanceof Error?e.message:String(e)},503);}}
export async function apiPost(_path:string,_action:string,_body:Record<string,unknown>,_method='POST'):Promise<Response|null>{return json({error:'This feature is not on NEAR yet.'},503);}
export const wsUrl=()=>null;
