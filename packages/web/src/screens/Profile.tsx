// SPDX-License-Identifier: MIT
// A player's page: the arena's own record for the account (get_player, season points) and their matches, read from chain.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatNear, TIER_NAMES } from '@mempire/sdk';
import { useAccount } from '../state/account';
import { usePlayer, useSeason } from '../state/data';
import { loadDeck } from '../state/deck';
import { favourites, ladder, mascotOf, seatOf, useHistory, winRate } from '../state/history';
import { artOf, characterOf, fighter, shortAcct, shortError, TIER_BADGES } from '../lib/fighters';
import { badgeArt } from '../lib/art';
import { accountUrl } from '../lib/net';
import { Art, Avatar, FighterCard, Icon, Loading, StateBox } from '../ui/kit';
import { MatchCard } from './Proof';
import { SignIn } from './Arena';

function FindPlayer() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); const a = q.trim().toLowerCase(); if (a) navigate(`/app/player/${a}`); }}>
      <h2 className="h3">Look up a player</h2>
      <label className="label" htmlFor="find">NEAR account</label>
      <input id="find" className="input mono" value={q} onChange={(e) => setQ(e.target.value)} placeholder="name.mempire-relay-41966.testnet" autoComplete="off" />
      <button className="btn btn--blue btn--wide">Open profile <Icon name="arrow" size={18} /></button>
      <Link to="/app/leaderboard" className="link-strong">Or browse the leaderboard</Link>
    </form>
  );
}

export function Profile() {
  const params = useParams();
  const me = useAccount((s) => s.device?.accountId ?? null);
  const balance = useAccount((s) => s.balance);
  const account = params.account ?? me;
  const isMe = !!account && account === me;
  const stats = usePlayer(account);
  const season = useSeason(account);
  const history = useHistory();

  if (!account) {
    return (
      <div className="screen">
        <header className="screen-head"><div><p className="eyebrow">Profile</p><h1 className="h1">Your player</h1><p className="lede">Sign in to get a NEAR testnet account; your record, matches and deck show up here.</p></div></header>
        <div className="lobby-row"><SignIn /><FindPlayer /></div>
      </div>
    );
  }

  const mine = (history.matches ?? []).filter((m) => seatOf(m, account) !== null);
  const row = history.matches ? ladder(history.matches).find((r) => r.account === account) : undefined;
  const rank = history.matches ? ladder(history.matches).findIndex((r) => r.account === account) : -1;
  const favs = row ? favourites(row.fighters, 3) : [];
  const hero = mascotOf(account);
  const topTier = mine.length ? Math.max(...mine.map((m) => m.tier)) : null;
  const seasonRank = season.data?.info.top.findIndex((t) => t.account === account) ?? -1;
  const s = stats.data;
  const v = (x: number | undefined) => (stats.loading ? '…' : stats.error ? 'n/a' : String(x ?? 0));
  const display = shortAcct(account).split('.')[0];
  const deck = isMe ? loadDeck(me) : null;
  return (
    <div className="screen">
      <section className="pf-hero" aria-labelledby="pf-name">
        <div className="pf-top">
          <span className="chip chip--gold">{isMe ? 'Your profile' : 'Player'}</span>
          <a className="chip chip--btn" href={accountUrl(account)} target="_blank" rel="noreferrer"><span className="mono">{shortAcct(account)}</span><Icon name="out" size={12} /></a>
        </div>
        <h1 id="pf-name" className="pf-name">{display}</h1>
        <div className="pf-stage">
          <div className="pf-flank pf-flank--l">
            <b className="num">{v(s?.wins)}</b><span>wins</span>
            <b className="num">{v(s?.best_streak)}</b><span>best streak</span>
          </div>
          <Art className="pf-art" src={artOf(hero)} eager fallback={<Avatar id={hero} size={180} />} />
          <div className="pf-flank pf-flank--r">
            <b className="num">{s ? `${winRate(s) ?? 0}%` : '…'}</b><span>win rate</span>
            <b className="num">{row ? formatNear(row.won) : history.loading ? '…' : '0'}</b><span>NEAR won</span>
          </div>
        </div>
        <ul className="pf-badges" aria-label="Badges">
          <li><span className="pf-badge-ico">{topTier !== null ? <Art src={badgeArt(TIER_BADGES[topTier])} fallback={<Icon name="shield" />} /> : <Icon name="shield" size={26} />}</span><b>{topTier !== null ? TIER_NAMES[topTier] : 'No stake yet'}</b><span>highest tier</span></li>
          <li><span className="pf-badge-ico pf-badge-ico--gold"><Icon name="trophy" size={26} /></span><b>{rank >= 0 ? `#${rank + 1}` : 'Unranked'}</b><span>all time</span></li>
          <li><span className="pf-badge-ico pf-badge-ico--sky"><Icon name="bolt" size={26} /></span><b>{season.data?.points != null ? `${season.data.points} pts` : '…'}</b><span>season {season.data?.current ?? ''}{seasonRank >= 0 ? ` · #${seasonRank + 1}` : ''}</span></li>
          <li><span className="pf-badge-ico pf-badge-ico--red"><Icon name="flame" size={26} /></span><b className="num">{v(s?.streak)}</b><span>current streak</span></li>
        </ul>
        {isMe && <div className="pf-cta"><Link to="/app" className="btn btn--green btn--lg">Battle <Icon name="swords" size={20} /></Link>{balance !== null && <span className="pf-bal num">Ⓝ {formatNear(balance, 3)} NEAR</span>}</div>}
      </section>

      <div className="pf-grid">
        <section className="card stack" aria-labelledby="pf-matches">
          <div className="card-head"><h2 id="pf-matches" className="h3">Match history</h2><span className="chip">{history.matches ? `${mine.length} on chain` : '…'}</span></div>
          {history.loading && !history.matches ? <Loading label="Reading matches" lines={4} />
            : history.error && !history.matches ? <StateBox kind="error" title="Matches unavailable">{shortError(history.error)}</StateBox>
              : !mine.length ? <StateBox art title="No matches yet" action={isMe ? <Link className="btn btn--green btn--sm" to="/app">Find a battle</Link> : undefined}>{isMe ? 'Your first staked match will show here, with its referee receipt.' : 'This account has not played a staked match on this arena.'}</StateBox>
                : <ul className="mlist">{mine.slice(0, 20).map((m) => <MatchCard key={m.id} m={m} me={account} />)}</ul>}
        </section>

        <div className="stack pf-side">
          <section className="card stack" aria-labelledby="pf-record">
            <div className="card-head"><h2 id="pf-record" className="h3">Arena record</h2><span className="chip">get_player</span></div>
            {stats.loading ? <Loading label="Loading record" lines={2} /> : stats.error ? <StateBox kind="error" title="Record unavailable">{shortError(stats.error)}</StateBox> : s && (
              <ul className="kv">
                <li><span>Wins · losses · draws</span><b className="num">{s.wins} · {s.losses} · {s.draws}</b></li>
                <li><span>Matches</span><b className="num">{s.matches}</b></li>
                <li><span>Streak (best)</span><b className="num">{s.streak} ({s.best_streak})</b></li>
                <li><span>Fake claims refused</span><b className="num">{s.rejected_claims}</b></li>
              </ul>
            )}
          </section>
          <section className="card stack" aria-labelledby="pf-favs">
            <div className="card-head"><h2 id="pf-favs" className="h3">{deck ? 'Battle deck' : 'Most fielded'}</h2>{deck && <Link className="link-strong" to="/app/deck">Edit</Link>}</div>
            {deck ? (
              <div className="deck-grid deck-grid--4">{deck.map((id) => <Link key={id} to={`/app/cards/${fighter(id).ticker.toLowerCase()}`} aria-label={`${fighter(id).ticker}: open card`}><FighterCard id={id} size="sm" /></Link>)}</div>
            ) : favs.length ? (
              <ul className="favs">{favs.map(([id, n]) => <li key={id}><Avatar id={id} size={44} /><div><b>{fighter(id).ticker}</b><span className="fine">{characterOf(id)} · in {n} deck{n === 1 ? '' : 's'}</span></div></li>)}</ul>
            ) : <p className="fine">No decks on chain yet.</p>}
          </section>
          {isMe && <SignIn />}
        </div>
      </div>
    </div>
  );
}
