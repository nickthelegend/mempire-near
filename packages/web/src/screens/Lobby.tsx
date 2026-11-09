import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArenaClient, arenaAbi, buildJoinHints, roster, type Deck } from '@mempire/sdk';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { formatEther, parseEventLogs, type Address, type Hex } from 'viem';
import { fundOnFork, isFork, publicClient } from '../chain/wallet';
import { useWallet } from '../state/wallet';
import { useChainStore } from '../state/chain';
import { asDeck, eligibleSet, useBurnStats, useHoldings, useLive, useOpenMatches, useSeason, useWifBalance } from '../state/data';
import { loadDeck, validateDeck } from '../state/deck';
import { formatWif } from '../state/format';
import { FORMAT_NAMES, TIER_NAMES, fighter, shortError } from '../lib/fighters';
import { statFor, useMarket } from '../state/market';
import { Big, Countdown, FighterCard, Icon, Loading, StateBox, TxLink } from '../ui/kit';
import { MarketPanel, MarketTicker } from '../ui/market';

type Step = { title: string; sub?: string; state: 'done' | 'now' | 'todo' };
const BADGES = ['pauper', 'knight', 'duke', 'emperor'];

function useEth(address?: Address) {
  return useLive(async () => {
    if (!address) throw new Error('Not connected');
    return publicClient.getBalance({ address });
  }, [address], 15000);
}

function WalletCard() {
  const wallet = useWallet();
  const address = wallet.data?.address;
  const wif = useWifBalance(address);
  const eth = useEth(address);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [funded, setFunded] = useState<Hex[] | null>(null);
  async function fund() {
    if (!address || !isFork) return;
    setBusy(true); setError('');
    try {
      setFunded(await fundOnFork(address, ['NVDA', 'AMD', 'AAPL', 'TSLA']));
      setTimeout(() => window.location.reload(), 600);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <section className="panel stack" id="wallet" aria-labelledby="wallet-title">
      <div className="panel-head">
        <h2 id="wallet-title" className="display h3 ivory">Your purse</h2>
        {address && <span className="chip mono" title={address} style={{ textTransform: 'none' }}>{address.slice(0, 6)}…{address.slice(-4)}</span>}
      </div>
      {!address ? (
        <div className="stack">
          <p className="fine">Connect a wallet on Robinhood Chain to stake $WIF. Practice needs no wallet.</p>
          {isFork ? (
            <button className="key key--ghost key--wide" onClick={() => void wallet.connect()}><Icon name="wallet" />Create a fork wallet</button>
          ) : wallet.options.length ? (
            wallet.options.map((o) => (
              <button key={o.info.uuid} className="key key--ghost key--wide" onClick={() => void wallet.connect(o.provider)}>Connect {o.info.name}</button>
            ))
          ) : (
            <StateBox title="No browser wallet found">Install a wallet that supports Robinhood Chain (chain 4663), then reload.</StateBox>
          )}
          {wallet.loading && <p className="fine" role="status"><span className="spinner" /> Connecting…</p>}
          {wallet.error && <StateBox kind="error" title="Could not connect">{wallet.error}</StateBox>}
        </div>
      ) : (
        <>
          <div className="well" style={{ background: 'radial-gradient(120% 140% at 50% 120%, rgba(232,182,76,.22), rgba(3,12,13,.6) 70%)', borderColor: 'var(--hair)' }}>
            <span className="label">$WIF balance</span>
            <div>{wif.error ? <StateBox kind="error" title="Balance unavailable">{wif.error}</StateBox> : <Big value={wif.data ? formatWif(wif.data.balance, 0) : undefined} unit="WIF" tone="gold" loading={wif.loading} />}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="chip">Approved <b className="num" style={{ color: 'var(--text)' }}>{wif.data ? formatWif(wif.data.allowance, 0) : '…'}</b></span>
            <span className="chip">Gas <b className="num" style={{ color: 'var(--text)' }}>{eth.loading ? '…' : eth.error ? 'n/a' : `${Number(formatEther(eth.data!)).toFixed(4)} ETH`}</b></span>
          </div>
          {isFork && (
            <div className="stack" style={{ gap: 8 }}>
              <button className="key key--jade key--wide" disabled={busy} onClick={() => void fund()}>
                {busy && <span className="spinner" />}{busy ? 'Moving real tokens…' : 'Fund on fork'}
              </button>
              <p className="fine">Fork only: moves 100,000 real $WIF and 1 each of NVDA, AMD, AAPL and TSLA from real holders on this local fork, plus 0.1 ETH for gas. This button does not exist on mainnet.</p>
              {funded && <p className="fine" role="status">Funded in {funded.length} fork transactions. Reloading…</p>}
            </div>
          )}
          {error && <StateBox kind="error" title="Funding failed">{error}</StateBox>}
        </>
      )}
    </section>
  );
}

function Hero({ onPractice }: { onPractice: () => void }) {
  const burn = useBurnStats();
  const season = useSeason();
  const open = useOpenMatches();
  const waiting = open.data?.filter((x) => x.id !== 0n).length ?? 0;
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-art"><img src="/brand/v2/keyart-portrait.webp" width={720} height={1080} fetchPriority="high" alt="Two champions clash in a gilded colosseum as a column of gold coins catches fire" /></div>
        <div className="stack" style={{ gap: 14 }}>
          <span className="chip chip--sapphire hero-season">{season.data ? <>Season {season.data.current} · ends in <Countdown to={season.data.end} /></> : 'Season …'}</span>
          <h1 id="hero-title" className="display hero-title">Your portfolio<br />is your <span className="gold-text">deck</span>.</h1>
          <p className="hero-line">Today&apos;s market decides who hits harder. Every pot burns $WIF.</p>
          <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <a href="#play" className="key key--glint" style={{ flex: 1.3 }}><Icon name="swords" size={22} />Fight</a>
            <button className="key key--ghost" style={{ flex: 1 }} onClick={onPractice}>Practice</button>
          </div>
        </div>
      </section>
      <div className="stats3" role="list" aria-label="Live arena numbers">
        <div className="stat stat--wait" role="listitem"><Big value={String(waiting)} loading={open.loading} error={open.error} tone="ivory" /><span className="label">{waiting === 1 ? 'Match waiting' : 'Matches waiting'}</span></div>
        <div className="stat stat--burn" role="listitem"><Big value={burn.data ? formatWif(burn.data.totalBurned, 0) : undefined} loading={burn.loading} error={burn.error} tone="ember" /><span className="label">WIF burned</span></div>
        <div className="stat stat--season" role="listitem"><Big value={season.data ? formatWif(season.data.info[0], 0) : undefined} loading={season.loading} error={season.error} tone="sapphire" /><span className="label">Season pool</span></div>
      </div>
    </>
  );
}

function PotSplit() {
  return (
    <section className="panel stack" aria-labelledby="pot-title">
      <div className="panel-head"><h2 id="pot-title" className="display h3 ivory">Where a pot goes</h2><span className="chip chip--gold">Contract constants</span></div>
      <div className="split" role="img" aria-label="92 percent to the winner, 5 percent burned, 3 percent to the season pool"><i /><i /><i /></div>
      <div className="legend">
        <span><i style={{ background: 'var(--gold)' }} /><b>92%</b> to the winner</span>
        <span><i style={{ background: 'var(--ember)' }} /><b>5%</b> burned with <span className="mono">WIF.burn</span></span>
        <span><i style={{ background: 'var(--sapphire)' }} /><b>3%</b> to the season top three</span>
      </div>
      <p className="fine">Tie: both get 46%. No result or a dispute: full refund, nothing burned.</p>
    </section>
  );
}

export function Lobby() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const address = wallet.data?.address;
  const arena = useChainStore((s) => s.arena);
  const holdings = useHoldings(address);
  const wif = useWifBalance(address);
  const open = useOpenMatches();
  const season = useSeason(address);
  const [tiers, setTiers] = useState<{ stakes: readonly bigint[]; max: number; paused: boolean } | null>(null);
  const [tierError, setTierError] = useState('');
  const [tier, setTier] = useState(0);
  const [format, setFormat] = useState(1);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState<bigint | null>(() => {
    try { const id = localStorage.getItem('mempire:waiting'); return id ? BigInt(id) : null; } catch { return null; }
  });
  const [lastTx, setLastTx] = useState<Hex | null>(null);

  useEffect(() => {
    if (!arena) return;
    let alive = true;
    Promise.all([
      publicClient.readContract({ address: arena.arena, abi: arenaAbi, functionName: 'tierStakes' }),
      publicClient.readContract({ address: arena.arena, abi: arenaAbi, functionName: 'maxTier' }),
      publicClient.readContract({ address: arena.arena, abi: arenaAbi, functionName: 'paused' }),
    ]).then(([stakes, max, paused]) => { if (alive) setTiers({ stakes, max, paused }); })
      .catch((e) => { if (alive) setTierError((e as Error).message); });
    return () => { alive = false; };
  }, [arena]);

  useEffect(() => {
    if (!waiting || !arena) return;
    const timer = setInterval(async () => {
      try {
        const m = await arena.match(waiting);
        if (m.state === 2) { localStorage.removeItem('mempire:waiting'); navigate('/battle'); }
        if (m.state === 0 || m.state === 4) { localStorage.removeItem('mempire:waiting'); setWaiting(null); }
      } catch (e) { setError((e as Error).message); }
    }, 1500);
    return () => clearInterval(timer);
  }, [waiting, arena, navigate]);

  const deck = address ? loadDeck(address) : [];
  const eligible = eligibleSet(holdings.data);
  const deckError = address ? validateDeck(deck, eligible) : null;
  const waitingHere = open.data?.find((x) => x.tier === tier && x.format === format)?.id ?? 0n;
  const stake = tiers?.stakes[tier];

  async function fight() {
    if (!arena || !address || !wallet.data?.wallet || !tiers || !wif.data) return;
    const issue = validateDeck(deck, eligible);
    if (issue) { setError(issue); return; }
    if (tiers.paused || tier > tiers.max) { setError('This tier is closed'); return; }
    setError('');
    setBusy('Preparing match');
    try {
      const action = new ArenaClient(publicClient, arena.arena, wallet.data.wallet);
      const amount = tiers.stakes[tier];
      if (wif.data.balance < amount) throw new Error(`You need ${formatWif(amount, 0)} WIF for this stake and hold ${formatWif(wif.data.balance, 0)}.`);
      if (wif.data.allowance < amount) {
        setBusy('Approving WIF for this stake');
        const hash = await action.approveWif(amount);
        setLastTx(hash);
        const r = await publicClient.waitForTransactionReceipt({ hash });
        if (r.status !== 'success') throw new Error('Approval reverted');
      }
      const key = generatePrivateKey();
      const session = privateKeyToAccount(key);
      const found = await action.waiting(tier, format);
      const own = found !== 0n && (await arena.match(found)).p0.toLowerCase() === address.toLowerCase();
      const join = found !== 0n && !own;
      // The session key is kept before sending, so a reload mid-transaction can still play.
      localStorage.setItem('mempire:pendingSession', key);
      const gasFloat = 10n ** 15n;
      let hash: Hex;
      if (!join) {
        setBusy('Opening a match');
        hash = await action.createMatch(tier, format, asDeck(deck), session.address, gasFloat);
      } else {
        setBusy('Reading 16 Chainlink baselines and joining');
        const hints = await buildJoinHints(publicClient, arena.arena, found, asDeck(deck) as Deck);
        hash = await action.joinMatch(found, asDeck(deck), session.address, hints, gasFloat);
      }
      setLastTx(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('Match transaction reverted');
      // The match id comes from the chain's own event, never from a guess made before sending.
      const created = parseEventLogs({ abi: arenaAbi, logs: receipt.logs, eventName: 'MatchCreated' })[0];
      const id = join ? found : created?.args.matchId;
      if (id === undefined) throw new Error('No MatchCreated event in the receipt');
      localStorage.setItem(`mempire:session:${id}`, key);
      localStorage.removeItem('mempire:pendingSession');
      localStorage.removeItem('mempire:practice');
      localStorage.setItem('mempire:activeMatch', id.toString());
      localStorage.setItem('mempire:matchTx', hash);
      const m = await arena.match(id);
      if (m.state === 2) navigate('/battle');
      else { localStorage.setItem('mempire:waiting', id.toString()); setWaiting(id); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  async function cancel() {
    if (!waiting || !arena || !wallet.data?.wallet) return;
    setBusy('Cancelling and refunding');
    try {
      const a = new ArenaClient(publicClient, arena.arena, wallet.data.wallet);
      const m = await a.match(waiting);
      const now = (await publicClient.getBlock()).timestamp;
      const hash = now >= m.createdAt + 1800n ? await a.expireOpen(waiting) : await a.cancelMatch(waiting);
      setLastTx(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      localStorage.removeItem('mempire:waiting');
      localStorage.removeItem('mempire:activeMatch');
      setWaiting(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  const steps: Step[] = waiting ? [
    { title: 'Stake escrowed', sub: `${stake ? formatWif(stake, 0) : ''} WIF held by the arena contract`, state: 'done' },
    { title: 'Waiting for an opponent', sub: `Match #${waiting} is open for ${TIER_NAMES[tier]} · ${FORMAT_NAMES[format]}. Refundable any time.`, state: 'now' },
    { title: 'Market read on chain', sub: 'The joiner\'s transaction reads all 16 Chainlink feeds', state: 'todo' },
    { title: 'Fight', sub: 'Every card drop is a transaction from your session key', state: 'todo' },
  ] : [];

  const market = useMarket();
  const practice = () => { localStorage.setItem('mempire:practice', '1'); navigate('/battle'); };

  return (
    <div className="lobby">
      <Hero onPractice={practice} />
      <MarketTicker />

      <div className="section stack" style={{ gap: 16 }}>
        <section className={`panel panel--glow stack${waiting ? ' play--waiting' : ''}`} id="play" aria-labelledby="fight-title" style={{ scrollMarginTop: 70 }}>
          <div className="panel-head">
            <h2 id="fight-title" className="display h2 ivory">Pick your fight</h2>
            {season.data?.points != null && <span className="chip chip--sapphire">{season.data.points.toString()} season pts</span>}
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <span className="label">Stake per player</span>
            {tierError ? <StateBox kind="error" title="Tiers unavailable">{tierError}</StateBox> : !tiers ? <Loading label="Loading stake tiers" lines={1} /> : (
              <div className="tiers" role="group" aria-label="Stake tier">
                {tiers.stakes.map((s, i) => {
                  const closed = tiers.paused || i > tiers.max;
                  return (
                    <button key={i} className="tier" aria-pressed={tier === i} disabled={closed} onClick={() => setTier(i)} aria-label={`${TIER_NAMES[i]}: ${formatWif(s, 0)} WIF each, burns ${formatWif((s * 2n * 5n) / 100n, 0)}`}>
                      <img src={`/brand/v2/badge-${BADGES[i]}.webp`} width={64} height={64} alt="" aria-hidden />
                      <span className="tname">{TIER_NAMES[i]}</span>
                      <span className="tstake">{formatWif(s, 0)}</span>
                      <span className="tburn">burns {formatWif((s * 2n * 5n) / 100n, 0)}</span>
                      {closed && <span className="tier-lock chip">{tiers.paused ? 'Paused' : 'Closed'}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="seg" role="group" aria-label="Format">
            <button aria-pressed={format === 1} onClick={() => setFormat(1)}>Rush<small>30 s · most crowns</small></button>
            <button aria-pressed={format === 0} onClick={() => setFormat(0)}>Standard<small>3 min + overtime</small></button>
          </div>

          <div className="stack" style={{ gap: 10 }}>
            <div className="row between">
              <span className="label">Your deck · today&apos;s market</span>
              <Link to="/deck" className="fine">Edit deck</Link>
            </div>
            {!address ? <StateBox art title="No wallet yet">Your deck is built from what your wallet holds. Connect below to see it.</StateBox> : (
              <>
                <div className="deck-slots">
                  {deck.map((id, i) => {
                    const ok = roster.fighters[id] && (fighter(id).kind === 'house' || eligible.has(id));
                    return roster.fighters[id]
                      ? <FighterCard key={i} id={id} size="sm" locked={!holdings.loading && !ok} lockText="Not held" statBps={statFor(market.byId, id)} pulse={market.byId.get(id)?.state} />
                      : <div key={i} className="slot-empty">?</div>;
                  })}
                </div>
                {deckError && !holdings.loading && <StateBox kind="error" title="This deck can't fight yet">{deckError}. <Link to="/deck">Fix it in the deck builder</Link>.</StateBox>}
              </>
            )}
          </div>

          {waiting ? (
            <div className="well stack" role="status">
              <div className="row between"><span className="chip chip--live">Live</span><span className="chip num">Match #{waiting.toString()}</span></div>
              <ol className="rail">
                {steps.map((s) => (
                  <li key={s.title} data-state={s.state}>
                    <span className="dot" aria-hidden>{s.state === 'done' ? <Icon name="check" size={13} /> : ''}</span>
                    <div><div className="rail-title">{s.title}</div>{s.sub && <div className="rail-sub">{s.sub}</div>}</div>
                  </li>
                ))}
              </ol>
              <button className="key key--crimson key--sm" disabled={!!busy} onClick={() => void cancel()}>{busy ? <span className="spinner" /> : null}Cancel and refund</button>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              <p className="fine" role="status">
                {open.loading ? 'Checking for waiting matches…' : open.error ? `Queue unavailable: ${open.error}`
                  : waitingHere ? `Match #${waitingHere} is waiting at this stake. Fight joins it and the arena reads the market on chain.`
                    : 'Nobody is waiting at this stake. Fight opens a match and you wait for an opponent.'}
              </p>
              <button className="key key--xl key--glint"
                disabled={!address || !arena || !tiers || !!deckError || !!busy || holdings.loading}
                onClick={() => void fight()}>
                {busy ? <><span className="spinner" />{busy}…</> : <><Icon name="swords" size={26} />Fight{stake ? ` for ${formatWif(stake * 2n, 0)} WIF` : ''}</>}
              </button>
              <button className="key key--ghost key--wide" onClick={practice}>Practice vs bot · free</button>
            </div>
          )}
          {lastTx && <p className="fine">Last transaction: <TxLink hash={lastTx} /></p>}
          {error && <StateBox kind="error" title="That didn't go through">{shortError(error, 240)}</StateBox>}
        </section>

        <WalletCard />
        <PotSplit />
        <div className="mobile-only"><MarketPanel /></div>
      </div>
    </div>
  );
}
