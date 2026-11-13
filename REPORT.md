# Report: Mempire on NEAR (Nov 9, 2026)

## Built
- `packages/contract`: the arena (Rust, near-sdk 5.30 rc), with `sim.rs`/`bot.rs`, a line-for-line port of the TypeScript
  engine and house bot. The referee (`settle`) replays the stored play log and checkpoints the sim state when gas runs low.
- `packages/sim`: the original engine, plus `referee.ts` (the exact loop the contract runs) and the parity-fixture recorder.
- `packages/sdk`: RPC with a read limiter, a nonce-ordered `KeySigner` that also signs NEP-366 delegates, typed views,
  a match runner and `replayFromChain`.
- `packages/relayer`: guest/email sign-in, sponsored meta transactions (session keys, settle, cancel only), a keeper that
  settles closed matches, and the signed Coinbase price poster.
- `packages/web`: a landing at `/` and the game at `/app` (lobby, deck, battle, season, houses, proof); full-width lobby on
  desktop, bottom tab bar on phones.

## Decisions
- **Referee path:** on-chain replay in WASM with checkpoints, no TEE. A 600-tick Rush match costs 11–22 TGas on testnet.
- **Fees:** 92 % winner, 3 % season, 5 % to a protocol treasury sub-account (there is no token to burn on NEAR).
- **Prices:** Pyth Core no longer serves NEAR, so the arena verifies ed25519-signed relayer snapshots of Coinbase 24 h stats.
- **Clock window:** a play must land within 5 s after its tick (100 ticks). Public-RPC 429s made some plays late on testnet;
  the arena refuses them rather than backdating, which is the honest trade-off (a wider window lets a player react later).
- **House moves** are computed by the referee, so houses never sign during a match and cannot deviate from the published bot.
- **Art:** a new bright 3D cartoon set generated with ChatGPT's image model on Nov 10 (`packages/web/public/art/v3/`):
  key art, the arena floor, one original character per fighter (BTC = Hoard Dragon, NEAR = Forge Warlock,
  SOL = Volt Pack, ZEC = The Veiled Seer, ETH = The Prism, plus the six house fighters), towers, houses, tier badges,
  chest, crown, trophy and the crest. The painted v2 set was removed. The battle floor maps the arena art onto the
  sim's field so its lanes, river and king keeps line up with the simulation.
- **UI:** an arcade game look (sky, glossy 3D buttons, Titan One headings, Urbanist text), modelled on the layout of
  Nick's reference and of Supercell's game sites; every number on screen is read from the arena or labelled.

## Known limits
- Email codes need `RESEND_API_KEY`; guest sign-in works without it.
- A player's key lives only in the browser that created the account (no recovery).
- Season 0 is a 90-minute launch season on testnet so a payout can be observed; later seasons are 7 days.
- See BLOCKED.md for Intents, NEP-141, NEP-245 and hosting.
- Storage is paid by the arena: a match record (~0.003 NEAR) and its play log (up to 400 plays, ~0.03 NEAR) stay on-chain
  so anyone can replay them. Opening and cancelling matches, or filling a match with plays, costs an attacker more gas
  than it costs the arena, but it is griefing the arena could price in with a storage deposit (next contract change).
- The public testnet RPCs (fastnear, rpc.testnet.near.org) rate-limit this machine's IP, which other builds share. The
  SDK caps concurrent reads, shares identical ones and falls back between endpoints, but late plays still happen under
  429s; the arena refuses them instead of backdating.

## V3 battle and film revision

Nick's v1 verdict is authoritative: **5/10**, due to the long title and small, passive game view. V1 is preserved. This revision changes only the battle surface in the sky-blue app on main: 860px field at 1080p, a full-screen phone view, draggable cards, tap fallback, lane/ghost preview, readable health bars and compact transaction feedback. Game rules and signing/settlement code are unchanged. Mouse and actual browser-emulated touch passed; physical iOS/Android hardware was unavailable and is not claimed. Sound is muted until enabled.

The design detector flags existing energy tick borders, the established spring animation and energy width transition. These belong to the approved game language; no unrelated restyle was made. The new film omits subtitles and starts on real gameplay. The final opening uses explicitly labelled accepted-play/tower-fall highlights from fresh match #20. The complete main match is #21. These are different matches; no v1 transactions are presented as new.

### Executed live proof and final film

The first fresh take (#20) exposed a pending-hand UI race: three of six gestures became accepted plays because a just-sent card could remain visible before its authoritative hand changed. Commit `3516f00` reserves pending energy and disables that card until it cycles, rather than inventing a local hand. Free mouse/touch checks passed again, and #21 recorded all six drags as six successful card transactions. Both matches settled, replayed Verified and deleted their play-only keys. Kumo won both and received 0.0184 testnet NEAR each. [Eighteen independently confirmed FINAL outcomes, exact hashes, replay results and budget](deployments/mobile-battle-v3-2026-11-13.json). Conservative spend 0.0463495808885464 testnet NEAR includes both sides' stakes and gas; no further writes were needed.

The revised film is 2:45.6, gameplay first, without subtitles or an opening title. Whole app capture, no zoom or crop; main match gameplay 1x, countdown/confirmation waits 4x with honest badges. Each new transaction gets an explorer view. Kokoro af_nova and an original ducked music bed accompany it. 1080p full and 720p 17.6 MB share files pass stream/faststart checks. Every four-second contact tile for both exports, each opening second and critical full-size frames were inspected. Freeze detection found no full-frame freeze >6 s; silence detection found no gap ≥1 s at -60 dB.

V1 is preserved with Nick's 5/10 verdict. The first v3 cut scored 8.7 internally; its concrete weaknesses were a missing prize explanation and explorer-transition time. The revised v3.1 cut explains the prize while playing, starts explorer clips on expanded details and shows full hashes. Its separate frame-only internal review scores 9.0/10. This is not Nick's or an external judge's verdict. The version folder retains both reviews, scripts, encoded scene cuts, narration and stills; raw WebM intermediates are removed after final QA.

Final validation: 27 JavaScript tests, all workspace typechecks, production build and QA-signer exclusion passed. Browser-emulated touch was used, not physical phone hardware; no 60 fps hardware benchmark is claimed. Human Meteor approvals were not automated or filmed. Hosting/email still need setup, and mainnet/card tokens/other-token stakes remain unbuilt. These limits are disclosed on screen. All task-started servers and browser processes are stopped. No push.
