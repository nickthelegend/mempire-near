import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {formatNear,type MatchView,type Totals} from '@mempire/sdk';
import deployment from '../../../../deployments/testnet.json';
import {reader,explorerUrl} from '../chain/provider';
import {Pill} from '../components/ui';
import {allReceipts} from '../lib/receipts';
export function Proof(){
 const nav=useNavigate();const [matches,setMatches]=useState<MatchView[]>([]);const [totals,setTotals]=useState<Totals|null>(null);const [error,setError]=useState('');const [id,setId]=useState('8');
 const [receipts]=useState(allReceipts);
 useEffect(()=>{let live=true;void Promise.all([reader.recent(12),reader.totals()]).then(([m,t])=>{if(live){setMatches(m);setTotals(t);}}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[]);
 return <div style={{padding:'18px 16px',display:'flex',flexDirection:'column',gap:20}}>
 <header><h1 className="display" style={{fontSize:30}}>Proof</h1><p className="fine">NEAR testnet · stored moves, referee results and transaction receipts</p></header>
 <section className="well" style={{padding:'10px 12px',display:'grid',gap:8}}>
 <a href={explorerUrl(deployment.arena,'address')} className="mono" style={{overflowWrap:'anywhere'}} target="_blank" rel="noreferrer">{deployment.arena} ↗</a>
 <p className="fine">{totals?`${totals.settled} settled · ${formatNear(totals.volume)} NEAR volume · ${totals.refereed_ticks} ticks replayed`:(error||'Reading the arena…')}</p>
 <label className="label" htmlFor="proof-match">Match ID</label><input id="proof-match" inputMode="numeric" value={id} onChange={e=>setId(e.target.value.replace(/\D/g,''))} style={{minHeight:44,padding:'0 12px',borderRadius:8,border:'2px solid var(--ink)',background:'var(--recess)',color:'var(--text)',font:'inherit',fontSize:16}}/>
 <Pill disabled={!id||Number(id)<1} onClick={()=>nav(`/replay/${id}`)}>Replay + verify receipt</Pill>
 </section>
 <section className="panel" style={{padding:'12px 14px',display:'grid',gap:8}}><span className="label">Recent matches · from the arena</span>
 {matches.map(m=><button className="menu-item" style={{padding:'10px 0',textAlign:'left',minHeight:44}} key={m.id} onClick={()=>nav(`/replay/${m.id}`)}>#{m.id} · {m.state===3?'settled':m.state===2?'live':m.state===1?'open':'cancelled'} · hash {m.final_hash||'pending'}</button>)}
 </section>
 <section className="panel" style={{padding:'12px 14px',display:'grid',gap:8}}><span className="label">Transactions · open on NearBlocks</span>
 {[...receipts.filter(r=>r.hash).reverse(),...deployment.deployTxs.map(t=>({label:t.step,hash:t.hash}))].map((t,i)=><a key={`${t.hash}-${i}`} href={explorerUrl(t.hash)} target="_blank" rel="noreferrer" className="fine" style={{overflowWrap:'anywhere',minHeight:44}}>{t.label}<br/><span className="mono">{t.hash}</span> ↗</a>)}
 </section><Pill tone="blue" onClick={()=>nav('/')}>Back to Arena</Pill></div>;
}
