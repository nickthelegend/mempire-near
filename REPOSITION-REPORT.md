# Mempire market fighters and NEAR proof

Work on `monad-client`; no push. The main app is `packages/app`. Root `pnpm dev`, `pnpm build` and `pnpm preview` select it. `packages/web`, contracts and game rules are preserved.

## Product and layout

“Every coin is a fighter. The market is the meta. Every move is a NEAR transaction.”

Landing, guest sign-in and lobby use this positioning. The proof strip says **Move → NEAR tx → replay → payout**, explains the play-only session key and links to the verified match #11 replay and its real settlement. Practice is explicitly local.

At 1024px and above, the imported quilt, wood, card frames, fonts, colours and artwork now frame a wider central game screen. The left rail shows actual signed price moves and fighter stat modifiers; the right shows recent arena matches, settled standings and current confirmed card transactions. The arena canvas grows with the centre. Desktop reserves space for its capped card hand so all six towers, including the home king, remain visible. Phone navigation and controls retain their imported layout; copy, price badges and proof explain the NEAR behavior. No other product was edited.

Market fighters follow signed Coinbase 24h moves × 2, capped at ±15%; six house fighters remain neutral. The UI polls every 30s and computes “updated Xm ago” from the signed snapshot timestamp, not its rounded epoch. Cards show stat modifiers. Battle HUD uses the exact locked opening modifiers; new prices cannot change a running match.

## Keeper

`pnpm meta:post` posts once if this ten-minute epoch lacks a snapshot. `pnpm meta:keep` checks once a minute and posts each new ten-minute epoch while running. Start the HTTP relayer on 5399 with `RELAYER_PRICES=0`; `META_RELAY_URL` overrides its URL. Both need the operator's existing credentials by path. Keys were never printed or committed.

The keeper reads balance first, preserves a 0.05 NEAR balance reserve and uses a per-run gas budget (`META_BUDGET_NEAR`, default 0.05 NEAR), with a conservative reservation before each write. Signed requests go through the HTTP relayer's existing signer queue. Invalid, tampered and expired requests are rejected before broadcast. Public receipts and read-back snapshots are in `deployments/market-meta-2026-11-11.json`. This is a local service, not hosted perpetual freshness.

Posted snapshots:

- Initial refresh: `3SASKUzz1XPokto9bWDBY8NVDcyKUxBG37CSun32oggW`.
- Next epoch keeper post: `7NSVhHFFGsnkC88PegPuMYuZfTfPTDdmYpNDEgtRceWV`.
- Authenticated shared-queue keeper post: `FMhzEvZEuoxFp7j4NFLWEAaaqCgNkQwDnEG2ReaFfTvk`.
- Further keeper refresh during the final run: `84iXZTtYsqZAU3K79brZz1voVceBv3ZmxvBAg7RRkwhg`.

## Testnet and QA

The first new guest is `v5-a-7997.mempire-relay-41966.testnet` (0.1 NEAR funding); the saved opponent is `port-b-2681.mempire-relay-41966.testnet`. These are team-created test accounts.

Match #13 stored three plays, settled a draw and verified in browser replay. A concurrent newer open #14 was refunded before its player joined #13. Its settlement is `GokdgdSAkwjgSXuwzGybbidLEnz23CzBVhRbbc1dn38L`. Both accounts ended with one full-access device key and zero arena play keys. Exact plays, outcomes, fees and checks are in `deployments/reposition-match-13-2026-11-11.json`.

The first full loop captured 34 screenshot calls with no horizontal overflow, but recorded one HTTP 500. That log is retained as `first-live-result.json`; it is not claimed as a clean pass. Separate price writers could race the sponsor nonce; keeper writes now share the sponsor queue. Subsequent queue setup delays against public RPCs are retained in `queue-timeout-result.json` and `signing-delay-result.json`. No stake landed in those delayed attempts. The proxy now prioritises broadcasts and nonce reads, bounds read timeouts and shares background reads. Standings and match feeds poll separately and pause while a stake signs. A regression test holds the read pool busy and confirms signing traffic still completes.

Match #15 first passed with five plays. Final match #16, after correcting desktop hand/canvas fit, recorded six plays (three per seat). The Rust referee settled at tick 600, state hash 2248064605, winner seat 0; it paid 0.0184 NEAR to the winner, 0.0006 to the season and 0.001 to treasury. Browser replay matched all three result fields. [Settlement receipt](https://testnet.nearblocks.io/txns/6TWkZ5UfoWnSrcA1qBtPxkfg4chTqVT911R3VPdCp9pY). Both accounts again have one device full-access key and zero arena play keys.

[Match #16 evidence](deployments/reposition-match-16-2026-11-11.json) contains all 43 captured task transactions, with no failed on-chain outcome, stored plays, replay and key checks. The cumulative conservative task total is **0.2100559475797427 NEAR**, including 0.1 guest funding, all stake attachments again, recorded gas and a further 0.02 reserve for interrupted setup attempts; below the **0.5 NEAR** cap. This is an upper-bound ledger, not a claim that recycled stakes were burned.

Final full flow: **30 screenshot calls at 1440×900 and 375×900; zero console/page errors, zero HTTP failures and zero document/main overflow**. Guest creation is evidenced in the first run; the clean repeat restored the same browser account. The final stake joined the waiting match directly. Before capture: **28 screenshots, zero errors/overflow/writes**, from a preserved pre-change production build.

`pnpm test`: **34 JavaScript tests passed**. `pnpm typecheck`: all workspace checks passed. `pnpm build`: passed via the new default app. One build was terminated by SIGTERM; its immediate retry passed. Existing dependency/bundle warnings remain. The design detector found only two inherited CSS patterns in unchanged lines (display gradient and hall texture); the approved visual identity takes precedence.

Every browser run used the requested `withChromeLock`. Swap free was above 500 MB at each build/browser check. One build at a time, ports 5390/5399, never 8787. All task-started processes are stopped after QA. No keys were printed, no `.loom/` files edited, and nothing pushed.

Screenshots and sanitized logs: `/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-v5/`.

[Before/after gallery](/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-v5/index.html). `final-live-result.json` records the clean full loop; `before-qa.json` records the baseline. Final read-only confirmation: **24 screenshots, zero console/page errors, zero overflow, zero transaction writes**. Its match #16 receipt links to that match’s exact settlement hash. It is recorded in `final-readonly-qa.json`.

README try-it and Prior work, TESTING, BLOCKED and the submission form are updated. Proposed tracks: **games** first and only. The submission idea is **1,066 characters**; the X draft is **214 characters**. Human fields, public repo/X URLs and demo video remain for Nick.

## Prior work and limits

The October 5-14 Monad client, underlying game, art, sound, fonts and earlier ports remain disclosed prior work. The keeper, current responsive desktop composition, positioning, NEAR account/transaction adapters and full-match proof are the November NEAR work. See README Prior work and the historical PORT-REPORT.

No NFTs, minting, upgrades, paid chests, clans, purchased season passes, Mera/passkeys, Pyth/CRE writer, mainnet or hosting are claimed. Meteor's adapter is available; real wallet approval remains outside automated QA. Public RPC congestion can delay reads/play. See BLOCKED.
