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
- **Art:** the market fighters reuse Mempire's own painted characters (BTC = Hoard Dragon, NEAR = Forge Warlock,
  SOL = Volt Pack, ZEC = The Veiled Seer, ETH = The Prism). No new art was generated.

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
