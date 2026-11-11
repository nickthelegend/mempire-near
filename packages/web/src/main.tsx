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
import { Cards, CardDetail } from './screens/Cards';
import { Receipt } from './screens/Receipt';
import { Leaderboard } from './screens/Leaderboard';
import { Profile } from './screens/Profile';
import { PracticePick } from './screens/PracticePick';
import { HowTo } from './screens/HowTo';
import { Art, Countdown, Icon, Logo, type IconName } from './ui/kit';
import { accountUrl, net } from './lib/net';
import { shortAcct } from './lib/fighters';
import { OBJ3D } from './lib/art';
import './styles/tokens.css';
import './styles/app.css';
import './styles/battle.css';
import './styles/landing.css';
import './styles/screens.css';

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

type Tab = { to: string; label: string; icon: IconName; main?: boolean; end?: boolean };
const TABS: Tab[] = [
  { to: '/app', label: 'Battle', icon: 'swords' as const, main: true, end: true },
  { to: '/app/practice', label: 'Practice', icon: 'play' as const },
  { to: '/app/cards', label: 'Cards', icon: 'cards' as const },
  { to: '/app/deck', label: 'Deck', icon: 'layers' as const, end: true },
  { to: '/app/leaderboard', label: 'Leaderboard', icon: 'trophy' as const },
  { to: '/app/season', label: 'Season', icon: 'crown' as const },
  { to: '/app/houses', label: 'Houses', icon: 'castle' as const },
  { to: '/app/profile', label: 'Profile', icon: 'user' as const },
  { to: '/app/proof', label: 'Proof', icon: 'shield' as const },
  { to: '/app/how', label: 'How to play', icon: 'scroll' as const },
];
/** Phone order puts Battle in the middle, as a game tab bar does. */
const PHONE_TABS: Tab[] = [
  { to: '/app/cards', label: 'Cards', icon: 'cards' as const },
  { to: '/app/leaderboard', label: 'Ranks', icon: 'trophy' as const },
  { ...TABS[0] },
  { to: '/app/houses', label: 'Houses', icon: 'castle' as const },
  { to: '/app/profile', label: 'Profile', icon: 'user' as const },
];

/** Decorative sky: soft clouds, floating gems and coins. Pure CSS. */
function Sky() {
  return (
    <div className="sky" aria-hidden>
      <i className="cloud c1" /><i className="cloud c2" /><i className="cloud c3" /><i className="cloud c4" />
      <i className="gem g1" /><i className="gem g2" /><i className="coin k1"><b>Ⓝ</b></i><i className="dot d1" /><i className="dot d2" /><i className="spark s1" /><i className="spark s2" />
    </div>
  );
}

function Promo() {
  return (
    <Link to="/app/deck" className="promo">
      <Art className="promo-art" src={OBJ3D.up} alt="" width={84} height={84} fallback={<span />} />
      <span className="promo-t">Market up, fighter hits harder</span>
      <span className="promo-s">Twice the 24 h move, capped at ±15%</span>
    </Link>
  );
}

function GameShell() {
  const location = useLocation();
  const loadRelayer = useAccount((s) => s.loadRelayer);
  useEffect(() => { void loadRelayer(); }, [loadRelayer]);
  const inBattle = location.pathname.startsWith('/app/battle') || /^\/app\/practice\/[^/]+/.test(location.pathname);
  return (
    <div className={`game${inBattle ? ' game--battle' : ''}`}>
      <Sky />
      <header className="ghead">
        <p className="ghead-tag">Live markets.<br /><b>On-chain referee.</b></p>
        <Link to="/" className="ghead-logo" aria-label="Mempire home">
          <Logo small={inBattle} />
        </Link>
        <div className="ghead-chips">
          <span className="hud-chip hud-chip--net" title="NEAR testnet: stakes are testnet NEAR"><span className="dot" aria-hidden />Testnet</span>
          <SeasonChip />
          <AccountChip />
        </div>
      </header>
      <div className="gframe">
        <aside className="gside" aria-label="Game menu">
          <nav className="gnav" aria-label="Game">
            {TABS.map((t) => <NavLink key={t.to} to={t.to} end={!!t.end} className="gnav-link"><Icon name={t.icon} size={20} />{t.label}</NavLink>)}
          </nav>
          <Promo />
          <Link to="/" className="gside-foot"><Icon name="crown" size={16} />Mempire</Link>
        </aside>
        <main className="gmain page-in" key={location.pathname}>
          <Routes>
            <Route index element={<Arena />} />
            <Route path="deck" element={<DeckScreen />} />
            <Route path="season" element={<Season />} />
            <Route path="houses" element={<Houses />} />
            <Route path="proof" element={<Proof />} />
            <Route path="battle/:id" element={<Battle />} />
            <Route path="practice" element={<PracticePick />} />
            <Route path="practice/:rival" element={<Battle practice />} />
            <Route path="cards" element={<Cards />} />
            <Route path="cards/:ticker" element={<CardDetail />} />
            <Route path="match/:id" element={<Receipt />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="profile" element={<Profile />} />
            <Route path="player/:account" element={<Profile />} />
            <Route path="how" element={<HowTo />} />
          </Routes>
          {!inBattle && (
            <footer className="gfoot">
              <span><b>MEMPIRE</b> · NEAR testnet</span>
              <span className="gfoot-links"><a className="mono" href={accountUrl(net.arena)} target="_blank" rel="noreferrer">{net.arena} ↗</a><Link to="/">How it works</Link></span>
            </footer>
          )}
        </main>
      </div>
      {!inBattle && (
        <nav className="gtabs" aria-label="Main">
          {PHONE_TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={!!t.end} className={`gtab${t.main ? ' gtab--main' : ''}`}>
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
