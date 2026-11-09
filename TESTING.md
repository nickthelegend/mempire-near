# Testing

Real counts from the runs on Nov 9, 2026. Nothing that touches a chain is mocked: the contract tests run a real nearcore
sandbox, and the testnet runs are real transactions (hashes in `deployments/`).

| Suite | Command | Tests | Result |
|---|---|---|---|
| TS sim (lockstep determinism, stale inputs, replay, Rush length) | `pnpm --filter @mempire/sim test` | 4 | pass |
| Rust unit: parity with the TS engine on 60 recorded matches (hash every 40 ticks), traits, buff maths, floor division | `cd packages/contract && cargo test --lib` | 4 | pass |
| Rust sandbox (real nearcore): PvP refereed on-chain, both seats' fake claims rejected, forged hash rejected, session-key scope (cannot stake, settle or transfer), escrow (short stake, self-join, settle before close), payouts 92/5/3, key deletion | `cargo test --test sandbox` | 1 | pass |
| Rust sandbox: house bot inside the referee, house treasury escrow and payout, owner-only `add_house`, house-only deposit and withdraw, checkpointed settle over 60 TGas calls matches the offline replay | same | 1 | pass |
| Rust sandbox: relayer signature required, stale and tampered snapshots refused, cancel refunds, stranger cannot cancel, cancelled match cannot be joined | same | 1 | pass |
| Rust sandbox: weekly season, top-one paid 50 %, unearned shares roll over, paid once | same | 1 | pass |
| SDK (base58, NEAR amounts, 24 h move, NEP-366 delegate round trip, panic parsing) | `pnpm --filter @mempire/sdk test` | 5 | pass |
| Relayer (exact e8 parsing, signed payload verifies, tampered payload fails) | `pnpm --filter @mempire/relayer test` | 2 | pass |
| **Total automated** | | **19** | **pass** |

Sandbox gas: a Rush match with 18 plays settled in 13–18 TGas; with 60 TGas per call the referee checkpointed at tick 532
and finished in a second call.

## Testnet runs (`deployments/testnet-2026-11-09.json`)

- Match #2 (PvP, two relayer-created players, 21 plays): a fake winner claim by bram was **rejected** by the referee
  (`J8Bbuhcd…`), aiko's settle with the replayed result settled it in **one call, 22.3 TGas** (`BiJqVsL7…`).
- Match #4 (PvP): fake claim rejected (`5VdrUURg…`), settled (`CuZTDSBz…`). Several plays were refused as late because the
  public RPC returned 429s; the arena refusing them is the intended behaviour.
- Matches #3 and #5 (vs house Tora): the referee ran Tora's bot; #3 Tora won (treasury +0.018), #5 a draw.
- Match #1: settled later with the replayed result, 11.0 TGas.

## Browser end-to-end (headless Chrome, NEAR testnet)

`node scripts/e2e/browser-house.mjs` with the relayer and `vite preview` running (evidence:
`docs/evidence-browser-house.json`). Match #8: guest sign-in → session key by meta tx → stake against house Kumo →
9 drops clicked, **8 landed** from the session key (2.2–12 s to land under RPC 429s; one landed after the 5 s window and the
arena refused it) → the page asked the referee to settle (meta tx) → **Replay & verify: this browser's replay matches the
referee** → session key deleted. No uncaught page errors.

## Route QA (headless Chrome, 1440×900 and 375×812)

`/`, `/app`, `/app/deck`, `/app/season`, `/app/practice`, `/app/battle/2`: root renders, no uncaught page errors,
`scrollWidth - innerWidth = 0` at both widths. The console can show "Failed to load resource" when the shared public RPC
answers 429 (requests are retried). `vite build` passes.
