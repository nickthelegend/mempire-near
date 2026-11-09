import { roster, wif } from '@mempire/sdk';
import { chainId, isFork } from '../chain/wallet';
import { useBurnStats } from '../state/data';
import { formatWif } from '../state/format';
import { useChainStore } from '../state/chain';
import { useMarket } from '../state/market';
import { CLASS_NAMES, artSmallOf, fighter, minHoldLabel, pct, shortError } from '../lib/fighters';
import { AddrLink, Avatar, Big, Icon, Loading, MoveChip, StateBox, TxLink } from '../ui/kit';
import { NOTICE, RESTRICTED_URL } from '../lib/notice';

const STEPS: { title: string; text: string; art: string; contain?: boolean }[] = [
  { title: 'Stake $WIF', text: 'Both players put the same $WIF into the arena: 1,000, 5,000, 25,000 or 100,000 each.', art: '/brand/v2/badge-duke.webp', contain: true },
  { title: 'Field what you hold', text: 'Eight fighters. A Stock Token fighter needs a small holding, read with balanceOf and never moved. House fighters are free.', art: artSmallOf(15) },
  { title: 'The market sets the stats', text: 'At kick-off the contract reads each Chainlink feed against 24 h ago and stores 2x the move as the stat change, capped at ±15%.', art: '/brand/v2/fx-coins.webp', contain: true },
  { title: 'Fight on chain', text: 'Spend elixir, drop cards, take towers. Every drop is a transaction from a session key: no pop-ups, and the chain is the clock.', art: '/brand/v2/tower-foe.webp', contain: true },
  { title: 'Get paid, burn $WIF', text: 'Both browsers replay the log and claim the winner. Matching claims pay 92% to the winner, burn 5% and send 3% to the season.', art: '/brand/v2/fx-burn.webp', contain: true },
  { title: 'Climb the season', text: 'Wins earn the tier base times your streak, up to 5x. Each week the top three split the pool 50 / 30 / 20.', art: '/brand/v2/fx-victory.webp', contain: true },
];

const SAFETY: [string, string][] = [
  ['No admin can take a stake', 'The owner can only pause new matches and cap the tier. No withdraw, rescue or upgrade path for escrowed $WIF.'],
  ['The chain is the clock', 'A play must land within 3 seconds of its tick, so nobody adds a move after the fact.'],
  ['Every exit refunds', 'Unjoined matches cancel or expire after 30 minutes. Missing or disagreeing claims refund both stakes.'],
  ['Honest baselines', 'The joiner names the 24-hour-old Chainlink round and the contract checks it, so nobody can shop for a price.'],
  ['Anyone can audit a match', 'Replay & verify rebuilds a settled match from its on-chain plays and checks the result hash against both claims. The contract itself does not verify the sim.'],
];

export function About() {
  const deployment = useChainStore((s) => s.deployment);
  const burn = useBurnStats();
  const market = useMarket();
  // A worked example from today's real feeds: the fighter with the largest live move.
  const example = [...market.list].filter((p) => p.state === 'live' && p.moveBps !== null).sort((a, b) => Math.abs(b.moveBps!) - Math.abs(a.moveBps!))[0];

  return (
    <div className="section stack" style={{ gap: 18 }}>
      <section className="stack" style={{ gap: 6 }}>
        <span className="label">How Mempire works</span>
        <h1 className="display h1 ivory">Six steps,<br /><span className="gold-text">one burn</span>.</h1>
      </section>

      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="step">
            <span className={`step-art${s.contain ? ' contain' : ''}`}><img src={s.art} alt="" aria-hidden loading="lazy" /><span className="step-n">{i + 1}</span></span>
            <div className="stack" style={{ gap: 3 }}><h3>{s.title}</h3><p className="fine">{s.text}</p></div>
          </li>
        ))}
      </ol>

      <section className="panel stack" aria-labelledby="formula-title">
        <h2 id="formula-title" className="display h3 ivory">Today&apos;s market, as a stat</h2>
        {market.loading && !market.list.length ? <Loading label="Reading Chainlink" lines={2} />
          : market.error && !market.list.length ? <StateBox kind="error" title="Feeds unavailable">{shortError(market.error)}</StateBox>
          : !example ? <StateBox title="Markets are closed">No fighter has a live 24 h move right now, so every fighter would kick off neutral.</StateBox> : (
            <>
              <div className="formula">
                <div className="well"><Avatar id={example.fighterId} size={44} /><b className="display" style={{ fontSize: 20 }}>{example.ticker}</b><span className="fine">24 h move</span><span className={`display ${example.moveBps! >= 0 ? 'up' : 'down'}`} style={{ fontSize: 24 }}>{pct(example.moveBps!, 2)}</span></div>
                <span className="display" style={{ fontSize: 28, color: 'var(--gold-hi)' }}>×2</span>
                <div className="well"><img src={artSmallOf(example.fighterId)} alt="" aria-hidden style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} /><b className="display" style={{ fontSize: 20 }}>Stats</b><span className="fine">HP and damage</span><MoveChip statBps={example.statBps} /></div>
              </div>
              <p className="fine">Live Chainlink read for {fighter(example.fighterId).ticker}, the biggest mover right now. Capped at ±15%; a closed or paused market is neutral; house fighters have no feed.</p>
            </>
          )}
      </section>

      <section className="panel stack" aria-labelledby="fair-title">
        <h2 id="fair-title" className="display h3 ivory">Fair by construction</h2>
        <ul className="stack" style={{ gap: 10 }}>
          {SAFETY.map(([t, d]) => (
            <li key={t} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
              <span style={{ color: 'var(--jade)', marginTop: 2 }}><Icon name="shield" size={20} /></span>
              <div><b>{t}</b><p className="fine">{d}</p></div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel stack" id="burns" aria-labelledby="burn-title" style={{ scrollMarginTop: 70 }}>
        <div className="panel-head">
          <h2 id="burn-title" className="display h3 ivory">Burn log</h2>
          <img src="/brand/v2/fx-burn.webp" alt="" aria-hidden width={40} height={40} style={{ objectFit: 'contain' }} />
        </div>
        {burn.loading ? <Loading label="Reading WifBurned events" lines={3} />
          : burn.error ? <StateBox kind="error" title="Burn log unavailable">{burn.error}</StateBox>
            : (
              <>
                <div className="row between" style={{ alignItems: 'flex-end' }}>
                  <div><span className="label">Burned by the arena</span><div><Big value={formatWif(burn.data!.totalBurned, 0)} unit="WIF" tone="ember" /></div></div>
                  <div style={{ textAlign: 'right' }}><span className="label">$WIF supply now</span><div className="num" style={{ fontWeight: 700 }}>{formatWif(burn.data!.totalSupply, 0)}</div></div>
                </div>
                {burn.data!.recent.length === 0 ? <StateBox art title="Nothing burned yet">The first settled match burns 5% of its pot.</StateBox> : (
                  <ul className="list">
                    {burn.data!.recent.map((e) => (
                      <li key={`${e.transactionHash}-${e.logIndex}`} className="list-row">
                        <span className="chip chip--ember">{e.args.matchId === 0n ? 'Season' : `#${e.args.matchId?.toString()}`}</span>
                        <div style={{ minWidth: 0 }}><div className="t">{e.args.matchId === 0n ? 'Unclaimed season shares' : `Match #${e.args.matchId?.toString()}`}</div><div className="s"><TxLink hash={e.transactionHash} /></div></div>
                        <span className="num" style={{ color: 'var(--ember-hi)', fontWeight: 800 }}>{formatWif(e.args.amount ?? 0n, 0)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
      </section>

      <section className="panel stack" aria-labelledby="c-title">
        <h2 id="c-title" className="display h3 ivory">Contracts</h2>
        <p className="fine">{isFork ? 'Local Anvil fork of chain 4663 mainnet, running as chain 31337. Fork addresses are not on the public explorer.' : `Mainnet, chain ${chainId}.`}</p>
        <div className="well"><span className="label">Arena</span><div>{deployment ? <AddrLink address={deployment.arena} full /> : <span className="fine">Setup required</span>}</div></div>
        <div className="well"><span className="label">$WIF</span><div><AddrLink address={wif} full /></div></div>
        <ul className="contract-rows">
          {roster.fighters.filter((f) => f.token).map((f) => (
            <li key={f.fighterId} className="contract-row">
              <Avatar id={f.fighterId} size={34} />
              <div className="addrs">
                <span><b style={{ color: 'var(--text)' }}>{f.ticker}</b> · {CLASS_NAMES[f.archetype]} · hold {minHoldLabel(f)}</span>
                <span>Token <AddrLink address={f.token!} /> · Feed <AddrLink address={f.feed!} /></span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel stack" id="notice" aria-labelledby="n-title">
        <h2 id="n-title" className="display h3 ivory">Stock Tokens notice</h2>
        <p>{NOTICE}</p>
        <p className="fine">See <a href={RESTRICTED_URL} target="_blank" rel="noreferrer">Restricted Jurisdictions</a>. Mempire is an independent game and is not affiliated with or endorsed by Robinhood. Stock Tokens carry risk; nothing here is investment advice.</p>
      </section>
    </div>
  );
}
