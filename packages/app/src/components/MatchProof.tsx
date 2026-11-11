import { Link } from 'react-router-dom';
import { explorerUrl } from '../chain/provider';
import evidence from '../../../../deployments/monad-client-match-11-2026-11-11.json';
const settlement = evidence.transactions.find(t => t.label === 'Referee settlement #11' && t.ok);

export function MatchProof() {
  return <section className="well match-proof" aria-label="How a match is proven">
    <h2 className="label">How a match is proven</h2>
    <p style={{fontWeight:800,margin:'6px 0'}}>Move → NEAR tx → replay → payout</p>
    <p className="fine" style={{color:'var(--dim)',margin:0}}>Drop a card. A play-only session key signs it with no wallet popup. The referee replays every move and pays its result.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:8}}>
      <Link to="/replay/11">Watch proven match #11</Link>
      {settlement && <a href={explorerUrl(settlement.hash)} target="_blank" rel="noreferrer">Payout receipt ↗</a>}
    </div>
    <p className="fine" style={{color:'var(--dim)',margin:'6px 0 0'}}>Staked matches only. Practice stays local.</p>
  </section>;
}
