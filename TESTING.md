# Testing

## Monad client port — November 11, 2026

The imported client builds with `pnpm --filter @mempire/app build`. Workspace TypeScript checks pass with
`pnpm typecheck`. The JavaScript suites pass: simulation 4, SDK 5, relayer 2, original web 9 and imported-client adapter
12. The Rust contract and existing SDK/sim implementations were not changed by this port; their older validation is
retained below rather than claimed as a new run.

The 12 adapter tests cover deployed fighter IDs/archetypes/traits, renderer identity preserving the Rust golden hash,
PvP and house golden replay, forged winner/hash/end-tick rejection, no verification before settlement, queue recovery
stake/seat/format guards, and correct attribution of receipts from different matches.

### Real testnet browser loop

The same two browser profiles completed Guest → relayer-funded testnet sub-account → free starter loadout → deck →
30-second local practice → staked Rush → Rust referee settlement → verified replay → proof → Empire leaderboard.
Playwright ran under the shared `withChromeLock` from the requested scratchpad. Tests used ports 5390 and 5399.
There is no mock chain, minted starter NFT, local payout credit or seeded leaderboard in this flow.

- Guest accounts: `port-a-3345.mempire-relay-41966.testnet` and `port-b-2681.mempire-relay-41966.testnet`;
  each received 0.15 testnet NEAR. Both are test accounts created by the team, not organic users.
- Concurrent opens #9/#10 exposed a queue race. The newer #10 was refunded before joining #9. Match #9 stored five
  plays and settled at tick 600, hash 2912743809. A redundant settlement attempt was rejected after the other seat
  had already paid the pot; its failed receipt is retained in the evidence.
- After coordinating automatic settlement, concurrent opens #11/#12 exercised recovery again. #12 was refunded;
  #11 stored six plays (three per seat), settled at tick 600, hash 2064331241, winner seat 0. The referee paid
  0.0184 NEAR, with 0.0006 to the season and 0.001 to treasury. Browser replay matched all three result fields.
- After each run, both accounts had one full-access device key and **zero** arena function-call keys. Per-match keys
  were limited to `play` with a 0.05 NEAR allowance; their deletion receipts are recorded.
- Final full-loop run: **30 screenshots**, 1440×900 and 375×900, **zero console/page errors**, zero document horizontal
  overflow. It covers signed-out entry, sign-in, arena, deck, practice/result, staked battle/result, cards/detail,
  clans, Empire, proof, replay and watch routes.
- Final read-only confirmation: 24 screenshots, zero console/page errors, zero document/main horizontal overflow,
  zero write requests; match #11 links to its own successful settlement hash.

Evidence: [match 9 / recovery](deployments/monad-client-match-9-2026-11-11.json),
[match 11 / clean run](deployments/monad-client-match-11-2026-11-11.json).
The files include exact transaction hashes, outcomes, stored plays, referee result, access-key counts and budget
accounting. The second file is a cumulative transaction ledger and retains the historical rejected #9 attempt.

Screenshot and sanitized browser logs:
`/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-port/`.
The `before-*` images show the unmodified imported client. Source-only battle baseline images use a local simulation
fixture and sent no transactions. The `after-*` images show the NEAR port. See [PORT-REPORT.md](PORT-REPORT.md).

Meteor Wallet's adapter compiles and is offered in sign-in. A real Meteor approval was not automated; the proven live
path uses guest accounts. Prices were read from the deployed signed snapshot with stale values neutral; the test
relayer's price poster and keeper were disabled so settlement was driven by the client.

## Original NEAR web client and contract evidence (historical)

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
