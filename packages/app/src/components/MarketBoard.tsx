import { useEffect, useState } from 'react';
import { useChain } from '../state/chain';
import { COINS, tickerOf } from '../lib/coins';

/** Age is the signed snapshot timestamp, never the rounded epoch or last UI refresh. */
export function useMarketAge() {
  const updated = useChain(s => s.metaUpdatedAt);
  const [, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(timer); }, []);
  if (!updated) return 'No snapshot read';
  const minutes = Math.max(0, Math.floor((Date.now() - updated) / 60_000));
  return minutes < 60 ? `updated ${minutes}m ago` : `updated ${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

export function MarketBoard({ side }: { side: 'left' | 'right' }) {
  const age = useMarketAge();
  useChain(s => s.marketVersion);
  const error = useChain(s => s.marketError);
  const up = side === 'left';
  const rows = COINS.filter(c => up ? (c.metaBps ?? 0) > 0 : (c.metaBps ?? 0) < 0)
    .sort((a, b) => up ? (b.metaBps ?? 0) - (a.metaBps ?? 0) : (a.metaBps ?? 0) - (b.metaBps ?? 0));
  return <section className="panel market-board" aria-label={up ? 'Fighters buffed by today’s market' : 'Fighters nerfed by today’s market'}>
    <h2 className="label">{up ? 'Buffed by the market' : 'Nerfed by the market'}</h2>
    <p className="fine" style={{color:'var(--dim-on-wood)',margin:'5px 0 12px'}}>{age} · signed prices</p>
    {error && <p className="fine" role="status">{error}</p>}
    {!rows.length && <p className="fine" style={{color:'var(--dim-on-wood)'}}>No {up ? 'buffs' : 'nerfs'} in the last read. Prices older than 6h are neutral.</p>}
    <div style={{display:'grid',gap:8}}>{rows.map(c => <div key={c.coinId} className="well" style={{padding:8}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <img src={c.cardArt} alt="" width={32} height={32} style={{objectFit:'contain'}} />
        <b>{tickerOf(c)}</b>
        <b className="mono" style={{marginLeft:'auto',color:up?'var(--teal)':'var(--red)'}}>{up?'+':'−'}{Math.abs((c.metaBps??0)/100).toFixed(2)}%</b>
      </div>
      <div className="fine" style={{color:'var(--dim)',marginTop:4}}>${c.priceUsd.toLocaleString('en-US',{maximumFractionDigits:2})} · {c.change24h!>=0?'+':''}{c.change24h?.toFixed(2)}% in 24h</div>
    </div>)}</div>
  </section>;
}

export function MarketStrip() {
  const epoch = useChain(s => s.metaEpoch);
  useChain(s => s.marketVersion);
  const age = useMarketAge();
  if (!epoch) return null;
  const moved = COINS.filter(c => (c.metaBps ?? 0) !== 0).sort((a,b) => Math.abs(b.metaBps??0)-Math.abs(a.metaBps??0));
  const top = [...moved.filter(c=>(c.metaBps??0)>0).slice(0,2),...moved.filter(c=>(c.metaBps??0)<0).slice(0,2)];
  return <div className="market-strip panel" aria-label="Today's market meta" style={{alignItems:'center',gap:10,padding:'6px 10px',fontSize:12,flexWrap:'wrap'}}>
    <span className="label" style={{fontSize:11}}>Market meta</span>
    {top.map(c=><span key={c.coinId} style={{fontWeight:800,whiteSpace:'nowrap',color:(c.metaBps??0)>0?'var(--teal)':'var(--red-on-wood)'}}>{(c.metaBps??0)>0?'▲':'▼'} {tickerOf(c)} {(Math.abs(c.metaBps??0)/100).toFixed(1)}%</span>)}
    <span className="fine" style={{marginLeft:'auto',fontSize:11,color:'var(--dim-on-wood)'}}>{age} · on chain</span>
  </div>;
}
