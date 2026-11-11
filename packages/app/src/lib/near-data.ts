import { reader } from '../chain/provider';
import type { MatchView } from '@mempire/sdk';
export interface LeaderRow{address:string;netMon:number;netAusd:number;wins:number;losses:number;draws:number;matches:number;crowns:number;points:number;}
let cached:{at:number;rows:LeaderRow[]}|null=null;
let pending:Promise<LeaderRow[]>|null=null;
export async function allMatches(){const all:MatchView[]=[];let before:string|undefined;for(let page=0;page<100;page++){const rows=await reader.recent(100,before);if(!rows.length)break;all.push(...rows);const next=rows[rows.length-1].id;if(next===before)throw new Error('Match pagination did not advance.');before=next;if(rows.length<100)break;}return all;}
export async function leaderboard():Promise<LeaderRow[]>{if(cached&&Date.now()-cached.at<8000)return cached.rows;if(pending)return pending;
 pending=(async()=>{const [matches,season]=await Promise.all([allMatches(),reader.currentSeason()]);const rows=new Map<string,LeaderRow>();
 for(const m of matches.filter(m=>m.state===3)){for(const [seat,account] of [m.p0,m.p1].entries()){if(!account)continue;const row=rows.get(account)??{address:account,netMon:0,netAusd:0,wins:0,losses:0,draws:0,matches:0,crowns:0,points:0};row.matches++;if(m.winner===2){row.draws++;row.netMon+=(Number(m.paid)/2-Number(m.stake))/1e24;}else if(m.winner===seat){row.wins++;row.netMon+=(Number(m.paid)-Number(m.stake))/1e24;}else{row.losses++;row.netMon-=Number(m.stake)/1e24;}rows.set(account,row);}}
 for(const row of rows.values())row.points=await reader.points(season,row.address);
 const result=[...rows.values()].sort((a,b)=>b.wins-a.wins||b.netMon-a.netMon);cached={at:Date.now(),rows:result};return result;
 })().finally(()=>{pending=null;});return pending;
}
