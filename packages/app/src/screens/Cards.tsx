import { useMemo, useRef, useState } from 'react';
import { CardDetail } from '../components/CardDetail';
import { StarterKit } from '../components/StarterKit';
import { CardFrame } from '../components/CardFrame';
import { ChainBadge } from '../components/ChainBadge';
import { ChestRail } from '../components/Chests';
import { Shop } from '../components/Shop';
import { SeasonPassPanel } from '../components/SeasonPassPanel';
import { CoinBadge, Pill } from '../components/ui';
import { click } from '../lib/audio';
import { useChain } from '../state/chain';
import {
  ASSET_KINDS, COINS, tickerOf,
  type AssetKind, type Coin,
} from '../lib/coins';
import { fmtUsd } from '../lib/format';
import { revealSection } from '../lib/scroll';
import { useCollection } from '../state/collection';
import { useWallet } from '../state/wallet';

/** "All" first, then the three asset classes from the shared catalogue. */
const FILTERS: { id: AssetKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  ...ASSET_KINDS,
];

function CoinRow({coin}:{coin:Coin}){return <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0'}}><CoinBadge mint={coin.mint} size={40}/><div style={{minWidth:0}}><div style={{fontWeight:800,fontSize:14}}>{tickerOf(coin)}</div><div className="fine" style={{color:'var(--dim-on-wood)'}}>{coin.priceUsd>0?fmtUsd(coin.priceUsd):'—'}{coin.change24h!==undefined?` · ${coin.change24h.toFixed(1)}% 24h`:''}<br/>{coin.priceState}</div></div><span className="label" style={{marginLeft:'auto'}}>Free · Lv 1</span></div>;}

function TxReceipt() {
  const sig = useChain((s) => s.lastSignature);
  const mode = useChain((s) => s.mode);
  const explorer = useChain((s) => s.explorer);
  if (!sig || mode !== 'onchain') return null;
  return (
    <a
      href={explorer(sig)}
      target="_blank"
      rel="noopener noreferrer"
      className="well"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
        padding: '9px 11px', minHeight: 44, textDecoration: 'none', color: 'inherit',
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal)', boxShadow: '0 0 7px var(--teal)', flexShrink: 0 }} />
      <span className="fine" style={{ fontSize: 12, minWidth: 0, flex: 1 }}>
        last tx <span className="mono">{sig.slice(0, 8)}…{sig.slice(-6)}</span>
      </span>
      <span className="label" style={{ fontSize: 12, color: 'var(--blue-pale)', flexShrink: 0 }}>
        explorer ↗
      </span>
    </a>
  );
}


/**
 * The wallet's $MEMPIRE. The game's only currency, and the only counter here.
 *
 * This used to sit beside a Crowns pill showing a different, offchain number,
 * and the Crowns one was bigger, gold, and had a `+` on it — so that is the
 * one players watched. They would spend 25 $MEMPIRE on a chest skip, see the
 * gold counter stay on 120, and conclude nothing had been charged. The
 * transfer had happened every time. There were simply two currencies on one
 * header and the wrong one looked like the token.
 *
 * Tapping it opens the Empire wallet panel, where the account's balances and
 * the honest answer to "how do I get more" live: staked wins pay it.
 */
export function Cards() {
  const cards = useCollection((s) => s.cards);
  const connected = useWallet((s) => s.connected);
  const openPicker = useWallet((s) => s.openPicker);
  /** What actually exists on chain, so the header can stop guessing. */
  const [openCard, setOpenCard] = useState<string | null>(null);
  const bagsRef = useRef<HTMLElement>(null);
  const [kind, setKind] = useState<AssetKind | 'all'>('all');
  // Re-read when prices land: a fighter with no live price cannot be minted,
  // so it is folded into one line instead of a row of disabled buttons.
  const marketVersion = useChain((s) => s.marketVersion);


  const shownCoins=useMemo(()=>kind==='all'?COINS:COINS.filter(c=>c.kind===kind),[kind,marketVersion]);
  const detail = useMemo(() => cards.find((c) => c.id === openCard), [cards, openCard]);
  // Cards at level 2 or better — the ones that have actually been won up.

  if (!connected) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 16, padding: 30, textAlign: 'center',
      }}
      >
        <h1 className="display" style={{ fontSize: 30 }}>Cards</h1>
        <p style={{ color: 'var(--dim)', fontSize: 14 }}>
          Sign in to choose a free starter loadout. Every supported fighter is level 1; NFT ownership and minting are not on NEAR yet.
        </p>
        <Pill onClick={openPicker} style={{ maxWidth: 260 }}>Connect Wallet</Pill>
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div>
          <h1 className="display" style={{ fontSize: 30 }}>Cards</h1>
          {/* "8 minted · $487 staked" was the same sentence whether or not a
              single card existed on chain — a new player's starter deck is
              local until they mint it, and both of those words are claims. The
              count says onchain only when `chainCards` backs it. */}
          <p className="fine">
            {cards.length} free fighters · level 1 · no NFT ownership
          </p>
        </div>
      </header>

      <StarterKit />

      <ChestRail />

      <SeasonPassPanel />
      <Shop />

      <section aria-label="Your cards">
        {/* This section is the point of the screen; its neighbours both carry a
            visible header, so without one it read as a gap between them. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span className="label">Your cards</span>
          <span className="label" style={{ fontSize: 12 }}>{cards.length} available</span>
        </div>
        {cards.length === 0 ? (
          <div className="panel" style={{ padding: '20px 18px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 11, alignItems: 'center' }}>
            <span style={{ color: 'var(--dim-on-wood)', fontSize: 14 }}>
              bag is empty, anon — turn a coin you hold into a card
            </span>
            <Pill
              tone="blue"
              onClick={() => revealSection(bagsRef.current)}
              style={{ maxWidth: 220, fontSize: 15, minHeight: 46, padding: '10px 18px' }}
            >
              Show my bags
            </Pill>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
            {cards.map((c) => (
              <CardFrame key={c.id} card={c} width={104} fluid onClick={() => setOpenCard(c.id)} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Your bags" ref={bagsRef} style={{ scrollMarginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <span className="label">Signed relayer prices · testnet</span>
          <ChainBadge compact />
        </div>

        {/* Memes, blue-chips and stocks are three different reasons to be here,
            and the list is long enough that scrolling past two of them to reach
            the third is the whole problem. Counts are on the chips so an empty
            class is visible before it is tapped. */}
        <div
          role="tablist"
          aria-label="Filter bags by asset class"
          style={{ display: 'flex', gap: 6, marginBottom: 7 }}
        >
          {FILTERS.map((f) => {
            const on = kind === f.id;
            const n = f.id === 'all' ? COINS.length : COINS.filter((c) => c.kind === f.id).length;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={on}
                onClick={() => { click(); setKind(f.id); }}
                className="btn-3d"
                style={{
                  flex: 1, minWidth: 0, minHeight: 44, borderRadius: 9,
                  background: on
                    ? 'linear-gradient(180deg, var(--btn-blue-hi), var(--btn-blue))'
                    : 'var(--recess)',
                  border: '2px solid var(--ink)',
                  boxShadow: on
                    ? 'inset 0 2px 0 rgba(255,255,255,.4), 0 3px 0 var(--btn-blue-dark)'
                    : 'var(--bevel-in)',
                  fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)',
                  WebkitTextStroke: '1.8px var(--ink)', paintOrder: 'stroke fill',
                  transition: 'background 160ms var(--ease-snap)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                {f.label}
                <span style={{ opacity: 0.8, fontSize: 12 }}>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="panel" style={{ padding: '4px 14px' }}>
          {shownCoins.length === 0 ? (
            <p style={{ padding: '18px 0', textAlign: 'center', color: 'var(--dim-on-wood)', fontSize: 13 }}>
              nothing here yet, anon
            </p>
          ) : shownCoins.map((c, i) => (
            <div key={c.mint} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <CoinRow coin={c} />
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8 }}>
          The arena verifies signed relayer snapshots of Coinbase 24-hour prices. Market changes adjust stats by at most ±15%; stale prices are neutral. These are not Pyth or NFT mints.
        </p>
        <TxReceipt />
      </section>

      {detail && (
        <CardDetail
          card={detail}
          onClose={() => setOpenCard(null)}
        />
      )}
    </div>
  );
}
