// SPDX-License-Identifier: MIT
// House challenges: the three bots with their own treasuries. Staking goes through the same challenge call as before.
import { Link } from 'react-router';
import { formatNear, FORMAT_NAMES } from '@mempire/sdk';
import { useMatchmaking } from '../state/matchmaking';
import { HOUSE_LEVEL, shortError } from '../lib/fighters';
import { houseArt } from '../lib/art';
import { accountUrl } from '../lib/net';
import { Art, Avatar, Icon, Loading, StateBox } from '../ui/kit';
import { StepList } from './Arena';

const TONE = ['jade', 'gold', 'crimson'] as const;

export function Houses() {
  const mm = useMatchmaking();
  const { houses, format, busy, me } = mm;
  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">House challenges</p>
          <h1 className="h1">Beat a house, take its stake.</h1>
          <p className="lede">Each house is a NEAR sub-account of the arena with its own treasury. Challenge one and the referee plays its published bot inside the replay, so a house never signs a move. Records and treasuries are public.</p>
        </div>
        <div className="seg seg--fmt" role="group" aria-label="Format">
          <button aria-pressed={format === 1} onClick={() => mm.setFormat(1)}>Rush<small>30 s</small></button>
          <button aria-pressed={format === 0} onClick={() => mm.setFormat(0)}>Standard<small>3 min</small></button>
        </div>
      </header>

      {houses.loading ? <div className="card"><Loading label="Loading houses" lines={3} /></div>
        : houses.error ? <StateBox kind="error" title="Houses unavailable">{shortError(houses.error)}</StateBox> : (
          <ul className="houses">
            {houses.data!.map((h) => {
              const covered = BigInt(h.treasury) >= BigInt(h.stake);
              const art = houseArt(h.name);
              const games = h.wins + h.losses + h.draws;
              return (
                <li key={h.index} className={`house house--${TONE[h.difficulty] ?? 'gold'}`}>
                  <div className="house-art">
                    {art ? <Art src={art} className="house-img" fallback={<Avatar id={h.deck[0]} size={120} />} /> : <Avatar id={h.deck[0]} size={120} />}
                    <span className="house-level">{HOUSE_LEVEL[h.difficulty]}</span>
                  </div>
                  <div className="house-body">
                    <div className="house-title">
                      <h2 className="house-name">{h.name}</h2>
                      <span className="stars" aria-label={`Difficulty ${h.difficulty + 1} of 3`}>{[0, 1, 2].map((i) => <i key={i} data-on={i <= h.difficulty} />)}</span>
                    </div>
                    <a className="mono house-acct" href={accountUrl(h.account)} target="_blank" rel="noreferrer">{h.account}</a>
                    <dl className="house-stats">
                      <div><dt>Record</dt><dd className="num">{h.wins}W {h.losses}L {h.draws}D</dd></div>
                      <div><dt>Treasury</dt><dd className="num">{formatNear(h.treasury, 3)} Ⓝ</dd></div>
                      <div><dt>Games</dt><dd className="num">{games}</dd></div>
                    </dl>
                  </div>
                  <div className="house-foot">
                    <button className="btn btn--green" disabled={!mm.signer || !!busy || !!mm.deckError || !covered || !mm.enough(h.stake)} onClick={() => void mm.onChallenge(h.index, h.stake)}
                      aria-label={`Challenge ${h.name} for ${formatNear(h.stake)} NEAR`}>
                      <Icon name="swords" size={20} />Challenge · {formatNear(h.stake)} Ⓝ
                    </button>
                    {!covered && <span className="fine warn">Treasury cannot cover a match right now.</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

      {busy && <p className="fine" role="status"><span className="spinner" /> {busy}…</p>}
      <StepList steps={mm.steps} />
      {mm.error && <StateBox kind="error" title="That didn't go through">{shortError(mm.error, 260)}</StateBox>}
      {!me && <StateBox kind="setup" title="Sign in to challenge a house" action={<Link className="btn btn--blue btn--sm" to="/app#signin">Sign in</Link>}>Guest sign-in creates a testnet account for you; no wallet needed. Format: {FORMAT_NAMES[format]}.</StateBox>}
      <div className="card card--note">
        <p className="fine">Your stake and the house&apos;s matching stake are escrowed by the arena. The winner takes 92%; a house&apos;s winnings go to its treasury. Your current deck plays: <Link to="/app/deck">edit it</Link>.</p>
      </div>
    </div>
  );
}
