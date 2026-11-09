import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router';
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/big-shoulders-display/900';
import '@fontsource/barlow/500';
import '@fontsource/barlow/600';
import '@fontsource/barlow/700';
import '@fontsource/barlow-condensed/600';
import '@fontsource/barlow-condensed/700';
import { chainId, isFork } from './chain/wallet';
import { useChainStore } from './state/chain';
import { useWalletStore } from './state/wallet';
import { useBurnStats, useWifBalance } from './state/data';
import { formatWif } from './state/format';
import { Lobby } from './screens/Lobby';
import { DeckScreen } from './screens/Deck';
import { Battle } from './screens/Battle';
import { Ladder } from './screens/Ladder';
import { About } from './screens/About';
import { BrandMark, Icon, Loading, StateBox } from './ui/kit';
import { MarketPanel, SeasonPanel } from './ui/market';
import './styles/tokens.css';

import { NOTICE, RESTRICTED_URL } from './lib/notice';
const NOTICE_KEY = 'mempire:notice:dismissed';

function readNotice() { try { return localStorage.getItem(NOTICE_KEY) === '1'; } catch { return false; } }

function Notice({ onClose }: { onClose: () => void }) {
  return (
    <div className="notice-scrim" role="dialog" aria-modal="true" aria-labelledby="notice-title">
      <div className="panel panel--glow notice stack">
        <span className="chip chip--gold" style={{ justifySelf: 'start' }}>Before you play</span>
        <h2 id="notice-title" className="display h2 ivory">Stock Tokens notice</h2>
        <p style={{ fontSize: 15 }}>{NOTICE}</p>
        <p className="fine">
          Full list: <a href={RESTRICTED_URL} target="_blank" rel="noreferrer">Restricted Jurisdictions</a>.
          Mempire is an independent game and is not affiliated with or endorsed by Robinhood.
        </p>
        <button className="key key--wide" onClick={onClose} autoFocus>I understand</button>
      </div>
    </div>
  );
}

function BurnChip() {
  const burn = useBurnStats();
  return (
    <Link to="/about#burns" className="hud-chip hud-chip--burn" aria-label="Total WIF burned by the arena">
      <span className="ico"><Icon name="flame" size={14} /></span>
      {burn.loading ? <span className="skeleton" style={{ width: 40, minHeight: 12 }} /> : burn.error ? <b>n/a</b> : <b>{formatWif(burn.data?.totalBurned ?? 0n, 0)}</b>}
      <small>BURNED</small>
    </Link>
  );
}

function WalletChip() {
  const address = useWalletStore((s) => s.address);
  const wif = useWifBalance(address);
  if (!address) return <Link to="/#wallet" className="hud-chip hud-chip--wif"><span className="ico"><Icon name="wallet" size={14} /></span>Connect</Link>;
  return (
    <Link to="/#wallet" className="hud-chip hud-chip--wif" title={address} aria-label="Your WIF balance">
      <span className="ico">W</span>
      {wif.loading ? <span className="skeleton" style={{ width: 44, minHeight: 12 }} /> : wif.error ? 'n/a' : formatWif(wif.data!.balance, 0)}
      <small>WIF</small>
    </Link>
  );
}

const TABS = [
  { to: '/', label: 'Arena', icon: 'swords' as const },
  { to: '/deck', label: 'Deck', icon: 'cards' as const },
  { to: '/ladder', label: 'Season', icon: 'trophy' as const },
  { to: '/about', label: 'Rules', icon: 'scroll' as const },
];

function Shell() {
  const chainState = useChainStore();
  const discover = useWalletStore((s) => s.discover);
  const [noticeDone, setNoticeDone] = useState(readNotice);
  const location = useLocation();
  useEffect(() => { void chainState.load(); return discover(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } else window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);
  const closeNotice = () => { try { localStorage.setItem(NOTICE_KEY, '1'); } catch { /* private mode: show again next time */ } setNoticeDone(true); };
  const ready = !chainState.loading && !chainState.error;

  return (
    <div className={`app${location.pathname === '/battle' ? ' battle-page' : ''}`}>
      <div className="frame">
        <aside className="side" aria-label="Market Pulse">{ready && <MarketPanel />}</aside>
        <div className="phone">
          <header className="topbar">
            <Link to="/" className="brand" aria-label="Mempire home"><BrandMark /><span className="brand-word">Mempire</span></Link>
            <BurnChip />
            <WalletChip />
          </header>
          {isFork && <div className="forkbar" role="note">Local fork of chain 4663 · real tokens · nothing broadcast</div>}
          <main className="page page-in" key={location.pathname}>
            {chainState.loading ? (
              <div className="section"><div className="panel"><Loading label={`Loading the arena on chain ${chainId}`} lines={3} /></div></div>
            ) : chainState.error ? (
              <div className="section">
                <StateBox kind="setup" title={`Setup required: no arena on chain ${chainId}`}
                  action={<button className="key key--sm" onClick={() => void chainState.load()}>Retry</button>}>
                  <p>{chainState.error}</p>
                  <p>{isFork
                    ? 'Start the fork with scripts/fork-up.sh, deploy with scripts/deploy-fork.sh, then retry.'
                    : 'The mainnet arena is not deployed yet (BLOCKED: needs a funded deployer wallet). Run scripts/deploy-mainnet.sh, which writes deployments/4663.json, then rebuild.'}</p>
                </StateBox>
              </div>
            ) : (
              <Routes>
                <Route path="/" element={<Lobby />} />
                <Route path="/deck" element={<DeckScreen />} />
                <Route path="/battle" element={<Battle />} />
                <Route path="/ladder" element={<Ladder />} />
                <Route path="/about" element={<About />} />
              </Routes>
            )}
            {location.pathname !== '/battle' && (
              <footer className="footer">
                <p className="fine">{NOTICE} <a href={RESTRICTED_URL} target="_blank" rel="noreferrer">Restricted Jurisdictions</a>.</p>
                <p className="fine">Mempire is an independent game on Robinhood Chain and is not affiliated with or endorsed by Robinhood. MIT licensed.</p>
              </footer>
            )}
          </main>
          {location.pathname !== '/battle' && (
            <nav className="tabbar" aria-label="Main">
              {TABS.slice(0, 2).map((t) => <NavLink key={t.to} to={t.to} end={t.to === '/'} className="tab"><Icon name={t.icon} size={22} />{t.label}</NavLink>)}
              <Link to="/#play" className="tab-fight" aria-label="Fight: pick a stake"><span><Icon name="swords" size={26} /></span><span>Fight</span></Link>
              {TABS.slice(2).map((t) => <NavLink key={t.to} to={t.to} className="tab"><Icon name={t.icon} size={22} />{t.label}</NavLink>)}
            </nav>
          )}
        </div>
        <aside className="side" aria-label="Season and burn">{ready && <SeasonPanel />}</aside>
      </div>
      {!noticeDone && <Notice onClose={closeNotice} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><Shell /></BrowserRouter></React.StrictMode>,
);
