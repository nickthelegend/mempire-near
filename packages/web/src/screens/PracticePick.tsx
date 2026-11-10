// SPDX-License-Identifier: MIT
// Practice: pick a rival, then play a free local Rush. The house rivals use the deck and bot level the arena stores for
// each house (get_houses), so practice against Ryu is the same opponent the referee plays in a staked Ryu match.
import { Link } from 'react-router';
import { formatNear } from '@mempire/sdk';
import { useHouses } from '../state/data';
import { HOUSE_LEVEL, shortError } from '../lib/fighters';
import { houseArt } from '../lib/art';
import { Art, Avatar, Icon, Loading, StateBox } from '../ui/kit';

const TONE = ['jade', 'gold', 'crimson'] as const;

export function PracticePick() {
  const houses = useHouses();
  return (
    <div className="screen">
      <section className="pp-hero" aria-labelledby="pp-title">
        <div>
          <p className="eyebrow eyebrow--light">Practice · free · nothing on chain</p>
          <h1 id="pp-title" className="h1 pp-title">Pick a rival</h1>
          <p className="pp-lede">A 30-second Rush in your browser with your own deck and today&apos;s signed prices. No account, no stake.</p>
        </div>
        <Link to="/app/practice/bot" className="btn btn--green btn--lg pp-quick"><Icon name="play" size={24} />Quick practice</Link>
      </section>

      <h2 className="h3 pp-sub">Or train against a house&apos;s real deck</h2>
      {houses.loading ? <div className="card"><Loading label="Loading the houses from the arena" lines={3} /></div>
        : houses.error ? <StateBox kind="error" title="Houses unavailable">{shortError(houses.error)} Quick practice still works.</StateBox> : (
          <ul className="pp-list">
            {houses.data!.map((h) => {
              const art = houseArt(h.name);
              return (
                <li key={h.index} className={`pp-card house--${TONE[h.difficulty] ?? 'gold'}`}>
                  <div className="pp-art">{art ? <Art src={art} className="house-img" fallback={<Avatar id={h.deck[0]} size={110} />} /> : <Avatar id={h.deck[0]} size={110} />}</div>
                  <div className="pp-body">
                    <div className="house-title"><h3 className="house-name">{h.name}</h3><span className="house-level pp-level">{HOUSE_LEVEL[h.difficulty]}</span></div>
                    <div className="pp-deck" aria-label={`${h.name}'s deck`}>{h.deck.map((id, i) => <Avatar key={i} id={id} size={30} />)}</div>
                    <p className="fine">Staked, {h.name} plays for {formatNear(h.stake)} NEAR from its treasury. Here it plays for fun.</p>
                  </div>
                  <Link className="btn btn--gold" to={`/app/practice/${h.name.toLowerCase()}`} aria-label={`Practise against ${h.name}`}><Icon name="swords" size={18} />Practise</Link>
                </li>
              );
            })}
          </ul>
        )}
      <div className="card card--note"><p className="fine">Ready for real NEAR? <Link to="/app">Stake a PvP match</Link> or <Link to="/app/houses">challenge a house</Link>. Every staked match is replayed and settled by the arena contract.</p></div>
    </div>
  );
}
