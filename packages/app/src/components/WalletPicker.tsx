import { NETWORK_LABEL } from '../chain/provider';
import { useEffect, useState } from 'react';
import { click } from '../lib/audio';
import { useWallet } from '../state/wallet';
import { Spinner } from './ui';

/** Guest mark — the only entry without an official adapter icon. */
function GuestMark({ size = 34 }: { size?: number }) {
  return (
    <img
      src="/art/avatar_guest.webp"
      alt=""
      aria-hidden
      width={size}
      height={size}
      style={{ display: 'block', borderRadius: 8 }}
    />
  );
}

/**
 * `busy` is the row the player actually tapped. Dimming every row equally while
 * one connects left no trace of which one was chosen — the only signal was a
 * 12px sub-line.
 */
function Row({
  onClick, disabled, busy, mark, title, sub, right, highlight,
}: {
  onClick: () => void; disabled?: boolean; busy?: boolean; mark: React.ReactNode;
  title: string; sub: string; right?: React.ReactNode; highlight?: boolean;
}) {
  return (
    <button
      onClick={() => { click(); onClick(); }}
      disabled={disabled}
      /* Every row here is an icon plus styled spans, and the tree was computing
         no accessible name at all from them — the whole connect step read as a
         stack of unlabelled buttons to a screen reader. */
      aria-label={`${title} — ${sub}`}
      className="btn-3d"
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%',
        padding: '9px 13px', minHeight: 58, borderRadius: 'var(--r-card)',
        textAlign: 'left',
        background: highlight
          ? 'linear-gradient(180deg, var(--btn-blue-hi), var(--btn-blue))'
          : 'var(--recess)',
        border: `2.5px solid ${busy ? 'var(--gold)' : 'var(--ink)'}`,
        boxShadow: highlight
          ? 'inset 0 2px 0 rgba(255,255,255,.45), 0 4px 0 var(--btn-blue-dark)'
          : 'var(--bevel-in)',
        opacity: disabled && !busy ? 0.45 : 1,
      }}
    >
      {mark}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="display display--sm" style={{ display: 'block', fontSize: 16 }}>
          {title}
        </span>
        <span className="fine" style={{ display: 'block', fontSize: 12, color: 'var(--dim)' }}>
          {sub}
        </span>
      </span>
      {right}
    </button>
  );
}

/** The passkey mark: a key, in the arcade's own frame. */
function KeyMark({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(180deg, var(--gold-hi), var(--gold))',
        border: '2px solid var(--ink)', fontSize: size * 0.55,
      }}
    >
      🔑
    </span>
  );
}

/*
 * Sign in.
 *
 * The passkey comes first because it is the whole account: one fingerprint or
 * face check creates it, the same check on any of the player's devices brings
 * it back, and there is no seed phrase, extension or custodian anywhere in the
 * path. Guest is the fallback for a browser whose passkey store cannot derive
 * keys. Browser wallets are listed as they announce themselves (EIP-6963), for
 * players who already have one.
 */
export function WalletPicker() {
  const {pickerOpen,closePicker,connect,connectGuest,connecting,error}=useWallet();
  const [name,setName]=useState('');
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePicker(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen, closePicker]);

  if (!pickerOpen) return null;
  const busy = connecting !== null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'center' }}>
      <div aria-hidden onClick={closePicker} style={{ position: 'absolute', inset: 0, background: 'var(--scrim)' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        className="panel sheet"
        style={{ maxHeight: '90dvh', overflowY: 'auto', gap: 9 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
          <div>
            <h2 className="display" style={{ fontSize: 25, lineHeight: 1.1 }}>
              Every coin is a fighter.
            </h2>
            <p className="fine" style={{ color: 'var(--dim-on-wood)' }}>
              {NETWORK_LABEL} · the market is the meta
            </p>
          </div>
          <button
            onClick={() => { click(); closePicker(); }}
            aria-label="Close"
            className="icon-btn"
            style={{ marginLeft: 'auto', color: 'var(--dim-on-wood)', fontSize: 27, width: 44, height: 44, flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        <div className="well" style={{padding:10,borderRadius:'var(--r-card)',display:'grid',gap:8}}>
          <label className="label" htmlFor="pk-name" style={{fontSize:12}}>Create your account — no extension needed</label>
          <input id="pk-name" value={name} maxLength={20} placeholder="Player name" onChange={e=>setName(e.target.value)}
            style={{minHeight:44,padding:'0 12px',borderRadius:8,border:'2px solid var(--ink)',background:'var(--recess)',color:'var(--text)',font:'inherit',fontSize:16}} />
          <Row highlight disabled={busy} busy={connecting==='guest'} onClick={()=>void connectGuest(name||'player')}
            mark={<GuestMark/>} title="Play as Guest" sub={connecting==='guest'?'Creating your NEAR testnet account…':'A browser-held key and a relayer-funded testnet sub-account'} right={connecting==='guest'?<Spinner size={16}/>:undefined}/>
        </div>
        <Row disabled={busy} busy={connecting==='Meteor Wallet'} onClick={()=>void connect('meteor-wallet')}
          mark={<KeyMark/>} title="Meteor Wallet" sub="Use your NEAR testnet account; approve the stake in your wallet"/>
        {error && (
          <p role="alert" className="fine" style={{ color: 'var(--red-on-wood)', textAlign: 'center' }}>{error}</p>
        )}
        <p className="fine" style={{ color: 'var(--dim-on-wood)', textAlign: 'center' }}>
          In staked play, every move is a NEAR transaction. Your play-only session key signs card drops without wallet popups. Test tokens only.
        </p>
      </div>
    </div>
  );
}
