// SPDX-License-Identifier: MIT
import './polyfills';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { formatNear } from '@mempire/sdk';
import { useAccount } from './state/account';
import { Landing } from './screens/Landing';
import { Arena } from './screens/Arena';
import { DeckScreen } from './screens/Deck';
import { Battle } from './screens/Battle';
import { Season } from './screens/Season';
import { BrandMark, Icon } from './ui/kit';
import { MarketPanel, SeasonPanel } from './ui/market';
import { shortAcct } from './lib/fighters';
import './styles/tokens.css';
import './styles/landing.css';

function AccountChip() {
  const device = useAccount((s) => s.device);
  const balance = useAccount((s) => s.balance);
  const refresh = useAccount((s) => s.refresh);
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 15000); const on = () => void refresh(); window.addEventListener('mempire:chain-changed', on); return () => { clearInterval(t); window.removeEventListener('mempire:chain-changed', on); }; }, [refresh, device]);
  if (!device) return <Link to="/app#signin" className="hud-chip hud-chip--wif"><span className="ico"><Icon name="mail" size={14} /></span>Sign in</Link>;
  return (
    <Link to="/app#signin" className="hud-chip hud-chip--wif" title={device.accountId} aria-label={`${device.accountId}: balance`}>
      <span className="ico">Ⓝ</span>
      {balance === null ? <span className="skeleton" style={{ width: 40, minHeight: 12 }} /> : formatNear(balance, 2)}
      <small>{shortAcct(device.accountId).split('.')[0]}</small>
    </Link>
  );
}

const TABS = [
  { to: '/app', label: 'Arena', icon: 'swords' as const },
  { to: '/app/deck', label: 'Deck', icon: 'cards' as const },
  { to: '/app/season', label: 'Season', icon: 'trophy' as const },
  { to: '/', label: 'About', icon: 'scroll' as const },
];

function GameShell() {
  const location = useLocation();
  const loadRelayer = useAccount((s) => s.loadRelayer);
  useEffect(() => { void loadRelayer(); }, [loadRelayer]);
  const inBattle = location.pathname.startsWith('/app/battle') || location.pathname.startsWith('/app/practice');
  return (
    <div className={`app${inBattle ? ' battle-page' : ''}`}>
      <div className="frame">
        <aside className="side" aria-label="Market"><MarketPanel /></aside>
        <div className="phone">
          <header className="topbar">
            <Link to="/" className="brand" aria-label="Mempire home"><BrandMark /><span className="brand-word">Mempire</span></Link>
            <span className="hud-chip hud-chip--burn" title="NEAR testnet"><span className="ico"><Icon name="layers" size={14} /></span><b>Testnet</b></span>
            <AccountChip />
          </header>
          <main className="page page-in" key={location.pathname}>
            <Routes>
              <Route index element={<Arena />} />
              <Route path="deck" element={<DeckScreen />} />
              <Route path="season" element={<Season />} />
              <Route path="battle/:id" element={<Battle />} />
              <Route path="practice" element={<Battle practice />} />
            </Routes>
            {!inBattle && (
              <footer className="footer">
                <p className="fine">Mempire on NEAR testnet. Stakes are testnet NEAR. Prices are signed relayer snapshots of Coinbase 24 h stats, labelled as such. MIT licensed.</p>
              </footer>
            )}
          </main>
          {!inBattle && (
            <nav className="tabbar" aria-label="Main">
              {TABS.slice(0, 2).map((t) => <NavLink key={t.to} to={t.to} end={t.to === '/app'} className="tab"><Icon name={t.icon} size={22} />{t.label}</NavLink>)}
              <Link to="/app#play" className="tab-fight" aria-label="Fight: pick a stake"><span><Icon name="swords" size={26} /></span><span>Fight</span></Link>
              {TABS.slice(2).map((t) => <NavLink key={t.to} to={t.to} end className="tab"><Icon name={t.icon} size={22} />{t.label}</NavLink>)}
            </nav>
          )}
        </div>
        <aside className="side" aria-label="Season and houses"><SeasonPanel /></aside>
      </div>
    </div>
  );
}

function ScrollManager() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } else window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollManager />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app/*" element={<GameShell />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
