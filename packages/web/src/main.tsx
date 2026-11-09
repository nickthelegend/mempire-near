// SPDX-License-Identifier: MIT
import './polyfills';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { formatNear } from '@mempire/sdk';
import { useAccount } from './state/account';
import { useSeason } from './state/data';
import { Landing } from './screens/Landing';
import { Arena } from './screens/Arena';
import { DeckScreen } from './screens/Deck';
import { Battle } from './screens/Battle';
import { Season } from './screens/Season';
import { Houses } from './screens/Houses';
import { Proof } from './screens/Proof';
import { BrandMark, Countdown, Icon } from './ui/kit';
import { shortAcct } from './lib/fighters';
import './styles/tokens.css';
import './styles/app.css';
import './styles/battle.css';
import './styles/landing.css';

/** Account and NEAR balance; opens the account card in the lobby. */
function AccountChip() {
  const device = useAccount((s) => s.device);
  const balance = useAccount((s) => s.balance);
  const refresh = useAccount((s) => s.refresh);
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 15000); const on = () => void refresh(); window.addEventListener('mempire:chain-changed', on); return () => { clearInterval(t); window.removeEventListener('mempire:chain-changed', on); }; }, [refresh, device]);
  if (!device) return <Link to="/app#signin" className="hud-chip hud-chip--wif hud-chip--cta"><span className="ico"><Icon name="user" size={14} /></span>Sign in</Link>;
  return (
    <Link to="/app#signin" className="hud-chip hud-chip--wif" title={device.accountId} aria-label={`${device.accountId}: balance`}>
      <span className="ico ico--near">Ⓝ</span>
      <b className="num">{balance === null ? <span className="skeleton" style={{ width: 40, minHeight: 12 }} /> : formatNear(balance, 2)}</b>
      <small>{shortAcct(device.accountId).split('.')[0]}</small>
    </Link>
  );
}

function SeasonChip() {
  const season = useSeason();
  const info = season.data?.info;
  return (
    <Link to="/app/season" className="hud-chip hud-chip--season" aria-label="Season and time left">
      <span className="ico ico--gold"><Icon name="trophy" size={14} /></span>
      <b>S{season.data?.current ?? '…'}</b>
      {info ? <small><Countdown to={Number(info.end_ms) / 1000} /></small> : <small>{season.error ? 'n/a' : '…'}</small>}
    </Link>
  );
}

const TABS = [
  { to: '/app/deck', label: 'Deck', icon: 'cards' as const },
  { to: '/app', label: 'Battle', icon: 'swords' as const, main: true },
  { to: '/app/season', label: 'Season', icon: 'trophy' as const },
  { to: '/app/houses', label: 'Houses', icon: 'castle' as const },
  { to: '/app/proof', label: 'Proof', icon: 'shield' as const },
];

function GameShell() {
  const location = useLocation();
  const loadRelayer = useAccount((s) => s.loadRelayer);
  useEffect(() => { void loadRelayer(); }, [loadRelayer]);
  const inBattle = location.pathname.startsWith('/app/battle') || location.pathname.startsWith('/app/practice');
  return (
    <div className={`game${inBattle ? ' game--battle' : ''}`}>
      <header className="gbar">
        <Link to="/" className="gbar-brand" aria-label="Mempire home"><BrandMark size={40} /><span className="gbar-word">Mempire</span></Link>
        <nav className="gbar-nav" aria-label="Game">
          {TABS.map((t) => <NavLink key={t.to} to={t.to} end className={`gbar-link${t.main ? ' gbar-link--main' : ''}`}><Icon name={t.icon} size={18} />{t.label}</NavLink>)}
        </nav>
        <div className="gbar-chips">
          <span className="hud-chip hud-chip--net" title="NEAR testnet: stakes are testnet NEAR"><span className="dot" aria-hidden />Testnet</span>
          <SeasonChip />
          <AccountChip />
        </div>
      </header>
      <main className="gmain page-in" key={location.pathname}>
        <Routes>
          <Route index element={<Arena />} />
          <Route path="deck" element={<DeckScreen />} />
          <Route path="season" element={<Season />} />
          <Route path="houses" element={<Houses />} />
          <Route path="proof" element={<Proof />} />
          <Route path="battle/:id" element={<Battle />} />
          <Route path="practice" element={<Battle practice />} />
        </Routes>
        {!inBattle && (
          <footer className="gfoot">
            <p className="fine">Mempire on NEAR testnet. Stakes are testnet NEAR. Prices are signed relayer snapshots of Coinbase 24 h stats, labelled as such. MIT licensed. <Link to="/">About</Link></p>
          </footer>
        )}
      </main>
      {!inBattle && (
        <nav className="gtabs" aria-label="Main">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end className={`gtab${t.main ? ' gtab--main' : ''}`}>
              <span className="gtab-ico"><Icon name={t.icon} size={t.main ? 26 : 22} /></span>
              <span className="gtab-label">{t.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
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
