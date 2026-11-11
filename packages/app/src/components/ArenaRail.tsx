import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reader } from '../chain/provider';
import type { MatchView } from '@mempire/sdk';
import { leaderboard, type LeaderRow } from '../lib/near-data';
import { shortAddr } from '../lib/format';
import { useWallet } from '../state/wallet';
import { useMatch } from '../state/match';
import { usePlayLog } from '../state/playLog';
import { explorerUrl } from '../chain/provider';

export function ArenaRail() {
  const [matches,setMatches]=useState<MatchView[]>([]);
  const [leaders,setLeaders]=useState<LeaderRow[]>([]);
  const [error,setError]=useState<string|null>(null);
  const account=useWallet(s=>s.address);
  const confirmed=usePlayLog(s=>s.confirmed);
  const lastHash=usePlayLog(s=>s.lastHash);
  const phase=usePlayLog(s=>s.phase);
  const status=useMatch(s=>s.status);
  useEffect(()=>{
    let alive=true;
    const load=async()=>{try{const [m,l]=await Promise.all([reader.recent(6),leaderboard()]);if(alive){setMatches(m);setLeaders(l);setError(null);}}catch{if(alive)setError('NEAR reads unavailable. Retrying…');}};
    void load();const timer=setInterval(()=>void load(),10000);
    return()=>{alive=false;clearInterval(timer);};
  },[status]);
  const me=leaders.find(p=>p.address===account);
  return <aside className="desktop-rail right-rail" aria-label="NEAR matches and standings">
    {phase!=='off' && <section className="panel rail-panel"><h2 className="label">Your moves on NEAR</h2><p className="display" style={{fontSize:26,margin:'8px 0'}}>{confirmed} confirmed</p><p className="fine" style={{color:'var(--dim-on-wood)'}}>Each card drop is a separate transaction.</p>{lastHash&&<a href={explorerUrl(lastHash)} target="_blank" rel="noreferrer">Latest move receipt ↗</a>}</section>}
    <section className="panel rail-panel"><h2 className="label">Match feed</h2><p className="fine" style={{color:'var(--dim-on-wood)',margin:'5px 0 12px'}}>Read from the NEAR arena · refreshes every 10s</p>{error&&<p role="status" className="fine">{error}</p>}
      {!matches.length&&!error&&<p className="fine">Loading matches…</p>}
      {matches.map(m=><Link className="rail-row" key={m.id} to={`/${m.state===2?'watch':'replay'}/${m.id}`}><span><b>#{m.id}</b> · {m.state===3?'Settled':m.state===2?'Live':m.state===1?'Waiting':'Refunded'}<br/><span className="fine">{shortAddr(m.p0)}{m.p1?` vs ${shortAddr(m.p1)}`:''}</span></span><span className="mono">{(Number(m.stake)/1e24).toFixed(2)} NEAR</span></Link>)}
    </section>
    <section className="panel rail-panel"><h2 className="label">Leaderboard</h2><p className="fine" style={{color:'var(--dim-on-wood)',margin:'5px 0 8px'}}>Settled wins · practice excluded</p>
      {leaders.slice(0,4).map((p,i)=><div className="rail-row" key={p.address}><span>{i+1}. {shortAddr(p.address)}</span><b>{p.wins} W</b></div>)}
      {account&&<p className="fine" style={{marginTop:10}}>You: {me?`${me.wins} wins · ${me.losses} losses · ${me.points} season points`:'No settled matches read yet.'}</p>}
      <Link to="/empire">Your empire →</Link>
    </section>
  </aside>;
}
