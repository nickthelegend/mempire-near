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
| Web (v3 art paths, card frames by market buff, deck rules, troop-drop snapping; all-time ladder from settled matches, player portraits, card numbers vs the sim, receipt transactions by match id, crowns from tower hit points) | `pnpm --filter @mempire/web test` | 9 | pass |
| **Total automated** | | **28** | **pass** |

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

## Route QA, more screens (Nov 10, headless Chrome, 1440×900 and 375×812, relayer running locally)

`/`, `/app`, `/app/cards`, `/app/cards/btc`, `/app/deck`, `/app/practice`, `/app/practice/ryu`, `/app/leaderboard`,
`/app/season`, `/app/houses`, `/app/profile`, `/app/player/aiko-8197.mempire-relay-41966.testnet`, `/app/match/8`,
`/app/proof`, `/app/how`, `/app/battle/8`: root renders, no uncaught page errors, `scrollWidth - innerWidth = 0` at both
widths. The only console errors are the public `test.rpc.fastnear.com` answering 429 without CORS headers; the SDK falls
back to `rpc.testnet.near.org` and the page still loads. `/app/match/8` replays the stored plays in the browser:
"Verified: same winner, same final tick, same state hash" (hash 2350323608, tick 600). Scripted practice against Tora:
Start battle → 3-2-1 → 14 drops → result screen with crowns and towers left. Reduced motion: the card page's float and
rays stop (`animation-name: none`); keyboard focus shows a 3 px outline. Segmented buttons and chip buttons are 44 px tall.

## Route QA, v3 redesign (Nov 10, headless Chrome, 1440×900, 390×844 and 375×812)

`/`, `/app`, `/app/deck`, `/app/season`, `/app/houses`, `/app/proof`, `/app/practice`, `/app/battle/2`: root renders, no
uncaught page errors, `scrollWidth - innerWidth = 0` at all three widths. `/app/battle/2` → **Replay & verify** in the
browser: "Verified: this browser's replay matches the referee" (21 on-chain plays to tick 600, hash 1045771825). With
the relayer stopped the lobby shows "Setup required: relayer" instead of the sign-in form. `vite build` passes.

## Route QA, Nov 9 (headless Chrome, 1440×900 and 375×812)

`/`, `/app`, `/app/deck`, `/app/season`, `/app/practice`, `/app/battle/2`: root renders, no uncaught page errors,
`scrollWidth - innerWidth = 0` at both widths. The console can show "Failed to load resource" when the shared public RPC
answers 429 (requests are retried). `vite build` passes.

## Season payout (testnet)

After launch season 0 ended, `pnpm tsx scripts/finalize-season.ts aiko 0` paid its pool of 0.0048 NEAR: aiko (2 points)
0.0024 NEAR (50 %), bram (1 point) 0.0014 NEAR (30 %), and the unearned 20 % (0.0009 NEAR) rolled into season 1
(`5MGKPyqUgg6bkfs9BXFCUgk8NeyZgxwRMFY8CUCxTcuv`, recorded in `deployments/testnet-2026-11-09.json`).

## Approved sky-blue client flow — November 12, 2026

Historical checkpoint through `964477d`, before the R3 wallet addition below.

The `main` app remains `packages/web`, byte-identical to approved commit `bcf4a49`; the imported Monad UI stays on its own branch. The market keeper was ported independently. A real signed snapshot and one 0.02-NEAR guest account were created, with a conservative task total of 0.027344314559649 NEAR including gas. Public evidence is in `deployments/sky-blue-flow-2026-11-12.json`.

The latest full flow captured 34 screens at 1440×900 and 375×900 with no console/page errors, failed HTTP responses or document overflow: landing, guest, lobby, collection/card page, saved/reloaded deck, Kumo practice rival, VS intro, battle, local result, verified recorded match #8 receipt, leaderboard, profile, houses, season and how-to-play. Additional screenshots show the receipt’s Verified section at both widths. Practice sends no transactions; #8 is a separate existing settled match.

`pnpm test` passed 21 JavaScript tests (sim 4, SDK 5, relayer 3, web 9); workspace typechecks and the web production build passed. Rust/contract tests were not rerun because no contract changed. See [FLOW-QA.md](FLOW-QA.md) for per-step results, screenshot gallery, commands, constraints and exact transaction links.

## R3 — wallet-signed testnet matches, November 12, 2026

Two fresh house matches ran through the approved sky-blue app on `main`, without an operator relayer: #17 at 1440×900 and #18 at 375×900. Each added a play-only 0.25-NEAR-allowance access key, staked 0.01 NEAR against Kumo, recorded six player-signed card drops, settled through the Rust referee, replayed Verified and deleted its exact play key. Both lost to the house and paid its 0.0184-NEAR winner share. All game transactions used the player's account; only the one preceding price post used the repo relayer.

The production release guard checks that the DEV-only QA signer is absent even with its flag set during a production build. The wallet action test round-trips AddKey, stake and DeleteKey through the same Wallet Selector codec the Meteor adapter uses. Guest sponsorship remains the original path. No contract or simulation changes were made.

See [R3 evidence](deployments/r3-2026-11-12.json) and [FLOW-QA.md](FLOW-QA.md) for exact hashes, pre-write balances, scope/deletion checks, the 0.0479550458186581-NEAR conservative total and local screenshot names. Before/after sign-in captures and the twelve live-flow captures use both requested widths. They show no console/page errors or horizontal overflow.

Screenshots were captured locally during QA and are not committed.

R3 executed checks: `pnpm test` passed **22 JavaScript tests** (sim 4, SDK 5, relayer 3, web 10); `pnpm typecheck` passed for every workspace; the production build passed even with VITE_QA_SIGNER=1, and its release guard confirmed no QA signer was emitted. Existing dependency/bundle warnings are non-blocking.

## Full-height playable battle — November 13, 2026

`pnpm test` passed 27 JavaScript tests: sim 4, SDK 5, relayer 3, web 15. New placement/input coverage checks both perspectives, letterbox gutters, invalid/outside points, river snapping, drag threshold and pending-energy reservation. All workspace typechecks and the web production build passed; the release guard excludes the DEV QA signer. No Rust tests were rerun because the contract is unchanged.

Mouse drag, tap placement, outside-field cancellation and CDP touch passed in the real practice UI. Before/after and interaction screenshots cover 1440, 390 and 375; zero layout overflow or console/page errors were recorded. The field measures 860 px tall at desktop 1080p. Physical phone hardware and 60 fps performance were not benchmarked.

The first new wallet match #20 accepted three plays and revealed stale-hand feedback; pending-card handling was fixed. The final match #21 accepted six of six drags, settled, replayed Verified and deleted its exact key. Independent read-back matches both referee results. Eighteen unique successful FINAL outcomes, price post, key permissions/deletion and conservative 0.0463495808885464-NEAR combined cost are in [v3 live evidence](deployments/mobile-battle-v3-2026-11-13.json). Main live capture had no console/page errors, overflow or operator-relayer requests. See [FLOW-QA.md](FLOW-QA.md) for the complete per-step result and film provenance.

## v4 mobile-game battle stage — November 13–14, 2026

`pnpm test` passed **30 JavaScript tests**: sim 4, SDK 5, relayer 3, web 18 (three new stage tests: drag round-trip through the same transform the drag uses on the wide board, release in the hedge gutter refused, river snap/refusal). `pnpm typecheck` passed for every workspace; the web production build passed and its guard confirmed no QA signer in the assets. Rust tests were not rerun (contract unchanged).

Live testnet takes for the film, all through the real app on `main` with the dev QA wallet: matches #22–#29. 72 transactions were read back from RPC: 70 succeeded, 2 card drops in #23 were refused by the arena as late (the deprecated `rpc.testnet.near.org` fallback answered 429; the default RPC list was fixed). The film match #29 accepted 8 of 8 drops, took one enemy tower, was won by the player, settled, replayed **Verified** in the browser and had its play key deleted. Every hash: [deployments/mobile-battle-v4-2026-11-13.json](deployments/mobile-battle-v4-2026-11-13.json).
