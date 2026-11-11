// SPDX-License-Identifier: MIT
// How to play, in four steps a first-time player can read in a few seconds, then the rules the sim actually uses.
import { Link } from 'react-router';
import { formatNear, TIER_NAMES } from '@mempire/sdk';
import { useConfig } from '../state/data';
import { CLASS_BLURB, CLASS_NAMES, TIER_BADGES } from '../lib/fighters';
import { ART, badgeArt, OBJ3D } from '../lib/art';
import { Art, Avatar, Icon } from '../ui/kit';

const CLASS_FACE = [6, 9, 10, 8, 4, 7];

export function HowTo() {
  const config = useConfig();
  const steps = [
    { n: 1, t: 'Build a deck of 8', s: 'Pick eight fighters. Four sit in your hand; the next one waits.', art: <div className="how-cards">{[6, 8, 9].map((id) => <Avatar key={id} id={id} size={58} />)}</div>, to: '/app/deck', cta: 'Build deck' },
    { n: 2, t: 'Spend elixir', s: 'Each card costs 3 or 4 elixir. The bar refills on its own, faster near the end.', art: <div className="how-elixir"><span className="how-drop"><Icon name="drop" size={26} /><b>7</b></span><span className="how-bar"><i style={{ width: '70%' }} /></span></div> },
    { n: 3, t: 'Drop on your half', s: 'Tap a card, then tap your side of the river. Spells land anywhere.', art: <Art className="how-art" src={ART.arena} fallback={<Icon name="swords" size={48} />} /> },
    { n: 4, t: 'Take the crowns', s: 'Each tower you knock down is a crown. The king keep is all three.', art: <Art className="how-art how-art--crown" src={OBJ3D.crown} fallback={<Icon name="crown" size={48} />} />, to: '/app/practice', cta: 'Practise now' },
  ];
  return (
    <div className="screen">
      <header className="screen-head">
        <Art className="head-obj obj-bob" src={OBJ3D.cards} alt="" width={104} height={104} eager fallback={<span />} />
        <div>
          <h1 className="h1">Four taps to your first crown</h1>
          <p className="lede">Mempire is a real-time card battle for two. Practice is free and runs in your browser; staked matches are replayed and paid by a NEAR contract.</p>
        </div>
      </header>
      <ol className="how-steps">
        {steps.map((st) => (
          <li key={st.n} className="how-step">
            <span className="how-n">{st.n}</span>
            <div className="how-visual">{st.art}</div>
            <h2 className="h3">{st.t}</h2>
            <p className="fine">{st.s}</p>
            {st.to && <Link className="btn btn--white btn--sm" to={st.to}>{st.cta} <Icon name="arrow" size={16} /></Link>}
          </li>
        ))}
      </ol>

      <div className="how-grid">
        <section className="card stack" aria-labelledby="how-classes">
          <div className="card-head"><h2 id="how-classes" className="h3">Six classes</h2><Link className="link-strong" to="/app/cards">All cards</Link></div>
          <ul className="how-classes">
            {CLASS_NAMES.map((c, i) => (
              <li key={c}><Avatar id={CLASS_FACE[i]} size={44} /><div><b>{c}</b><span className="fine">{CLASS_BLURB[i]}</span></div></li>
            ))}
          </ul>
        </section>
        <div className="stack" style={{ gap: 16 }}>
          <section className="card stack" aria-labelledby="how-market">
            <h2 id="how-market" className="h3">Live markets</h2>
            <p className="fine">BTC, ETH, NEAR, SOL and ZEC are market fighters. When the match starts, the arena reads each one&apos;s signed 24 h price move and gives it twice that move as extra (or fewer) hit points and damage, capped at ±15%.</p>
          </section>
          <section className="card stack" aria-labelledby="how-formats">
            <h2 id="how-formats" className="h3">Two formats</h2>
            <ul className="kv">
              <li><span>Rush</span><b>30 s · most crowns wins</b></li>
              <li><span>Standard</span><b>3 min + 1 min overtime</b></li>
            </ul>
          </section>
          <section className="card stack" aria-labelledby="how-stakes">
            <h2 id="how-stakes" className="h3">Stakes and the referee</h2>
            <ul className="how-tiers">
              {TIER_NAMES.map((t, i) => (
                <li key={t}><Art className="tp-badge" eager src={badgeArt(TIER_BADGES[i])} fallback={<span className="tier-badge-ph">{t[0]}</span>} /><b>{t}</b><span className="num fine">{config.data ? `${formatNear(config.data.tier_stakes[i])} Ⓝ` : '…'}</span></li>
              ))}
            </ul>
            <p className="fine">Both players stake the same testnet NEAR. When the match ends, the contract replays every stored play through the same simulation and pays the winner 92%; 5% goes to the treasury and 3% to the weekly season pool.</p>
            <Link className="btn btn--green btn--wide" to="/app">Battle <Icon name="swords" size={20} /></Link>
          </section>
        </div>
      </div>
    </div>
  );
}
