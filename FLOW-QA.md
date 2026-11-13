# Flow QA — approved sky-blue Mempire on main

The original flow below is the pre-wallet checkpoint through `964477d`; its unchanged-web-tree statements apply to that checkpoint. The later R3 wallet feature and its new staked tests are recorded in the final section.

Completed November 12, 2026 (Asia/Kolkata; evidence timestamps are UTC). Branch: `main`. Client: `packages/web`.

The imported Monad client remains on `monad-client`. No `packages/app` files were brought to `main`. The two requested keeper commits (`b42ae15`, `7a93c34`) were cherry-picked with non-keeper README, match evidence and imported-client changes excluded. Keeper-only timeout/backoff fixes were retained. The HTTP relayer authenticates fresh signed snapshots before sending through its existing signer queue.

## UI preservation

No functional web bug was found, so no web code, styles, layout, fonts, colours or art changed. The complete tracked `packages/web` tree is byte-identical to approved starting commit `bcf4a49`: tree hash `38eab303611e9bf0885edc065ad34a42b756eafc` before and after. No before/after UI-change set is needed because no UI change occurred; the full requested flow is captured at both widths.

## Results

| Step | Status | Observed result | Screenshot stem (both widths) |
|---|---|---|---|
| Fresh market snapshot | FIXED | Signed post and live read-back for five market fighters; no invented moves. | `` |
| Landing | PASS | Approved sky-blue landing and links. | `landing` |
| Guest sign-in | PASS | Created sky-flow-8125.mempire-relay-41966.testnet; 0.02 NEAR funding. | `signin / guest-account` |
| Lobby | PASS | Real account balance, stake controls, practice and house navigation. | `lobby` |
| Cards | PASS | Eleven fighters and the collection controls. | `cards` |
| Card page | PASS | BTC card page, live signed price and simulation stats. | `card-page` |
| Deck | PASS | Changed one fighter, saved and reloaded an eight-fighter loadout. | `deck` |
| Practice rival | PASS | Loaded published house decks and selected free Kumo practice. | `practice-rivals` |
| VS intro | PASS | Both decks, existing VS art, first-run tips and countdown. | `vs-intro` |
| Battle | PASS | Selected a card and dropped it into the local field; hand selection reset. | `practice-battle` |
| Result | PASS | Local Kumo practice reached Defeat; no payout or recorded win claimed. | `practice-result` |
| Receipt /app/match/8 | PASS | Real previously settled house match; automatic browser replay says Verified: same winner, same final tick, same state hash. | `receipt / receipt-verified` |
| Leaderboard | PASS | Loaded real all-time podium and standings. | `leaderboard` |
| Profile | PASS | New account, zero prior matches and browser deck. | `profile` |
| Houses | PASS | Loaded actual house decks, records and treasuries; no new staked challenge sent. | `houses` |
| Season | PASS | Loaded current on-chain season, pool and race. | `season` |
| How to play | PASS | Approved four-step instructions. | `how-to-play` |

All requested steps passed; no BLOCKED step remains in this flow. Practice is local and has no on-chain receipt. The receipt check deliberately opens existing settled match #8; it is not presented as the practice game's receipt. This run does not claim a new staked match or new season payout.

## Screenshots and browser evidence

**34 full-flow captures** at 1440×900 and 375×900, with zero console/page errors, zero failed HTTP responses and zero horizontal document overflow. Two additional read-only captures bring the receipt's **Verified** section into view at both widths. The latter run also checks that no transaction broadcast occurs.

`index.html`.

Folder: `mempire-near`.

`result.json` contains the full flow and account-creation hash; `receipt-detail.json` contains the focused read-only verification. Filenames follow `<stem>-1440.png` and `<stem>-375.png`. The gallery links every image.

Screenshots were captured locally during QA and are not committed.

## UI polish and 3D objects (November 12, 2026, later)

This pass changes the web client; the flow results above were recorded before it. The data paths, keeper, relayer and
referee code are untouched (only `packages/web/src` styles, screens and `public/art/3d` changed).

- **3D object kit:** eleven glossy candy-enamel objects with Mempire's own face (crown, fighter coin, card hand, tower,
  chest, trophy, sealed scroll, shield, sleepy cloud, price-up and price-down tokens), generated with ChatGPT and
  documented in [docs/ART-3D.md](docs/ART-3D.md). Fighter character art is unchanged.
- **Shell:** shorter header (logo 84 → 62 px, header 168 → 108 px), menu card that fits a 900 px screen, the sidebar promo
  rebuilt around the price-up token, battle in focus mode on desktop (menu hidden, back link in the match panel).
- **Screens:** white screen headers with one 3D object each, caps eyebrow labels removed, lobby hero crown and
  shield/card-hand mode cards, 3D record tiles, sleepy-cloud empty states, leaderboard trophy, receipt seal, season
  trophy and crowns, buff/nerf tokens on the card page, crown/chest/price-down result crests.

| Check | Result |
|---|---|
| `tsc --noEmit` and `vite build` | pass (existing bundle-size warning only) |
| `vitest run` (web) | 9 / 9 pass |
| Routes captured | 18 views at 1440×900 and 375×812 (landing, lobby, cards, card page, deck, practice rivals, leaderboard, season, houses, profile, player page, receipt #8, proof, how to play, replay #8, VS intro, practice battle, practice result) |
| Horizontal overflow | 0 on all 36 captures |
| Console / page errors | 0, apart from the expected refused request to the local relayer port 5299, which was not running (the app shows its "Setup required: relayer" state) |
| Reduced motion | `prefers-reduced-motion: reduce` turns every object bob off (`animation-name: none`) |

Before/after sheets: `before-after-1440.jpg`, `before-after-375.jpg`, `before-after-key.jpg`.
After screenshots: `<view>-1440.png` and `<view>-375.png`.

Screenshots were captured locally during QA and are not committed.

## Testnet actions and budget

The relayer balance was checked before posting: 6.6215478012063777 testnet NEAR.

- Signed market refresh: [AFbqKpE14jFjm9xuagMbyhb4WaB8MXZH3ySQkhG9KDhi](https://testnet.nearblocks.io/txns/AFbqKpE14jFjm9xuagMbyhb4WaB8MXZH3ySQkhG9KDhi). All five price rows read back live. Gas: 0.000229325022149 NEAR.
- Guest creation: [mT2A6jCumaoa2s8YH18odCQCzgqErcinDa4hB37sibt](https://testnet.nearblocks.io/txns/mT2A6jCumaoa2s8YH18odCQCzgqErcinDa4hB37sibt). Funding: 0.02 NEAR. The account ends with one device full-access key and zero function-call keys; practice created no match key.
- Conservative total, including guest funding and both recorded transaction fees: **0.027344314559649 NEAR**, below **0.05 NEAR**. No deployment or mainnet spend.

[Public transaction outcomes and budget](deployments/sky-blue-flow-2026-11-12.json). [Signed snapshot and read-back prices](deployments/market-meta-2026-11-11.json). Keys were supplied by runtime paths or held in private browser storage; none were printed or committed.

## Validation and operation

- `pnpm test`: **21 JavaScript tests passed** (sim 4, SDK 5, relayer 3, web 9).
- `pnpm typecheck`: all workspace checks passed.
- `VITE_RELAYER_URL=http://127.0.0.1:5399 pnpm --filter @mempire/web build`: passed; existing bundle-size warnings remain.
- Browser: Chrome/Playwright under the requested `withChromeLock`. Preview used `pnpm --filter @mempire/web preview --port 5390`; relayer used port 5399, automatic prices/settlement disabled, guest funding 0.02, one new account maximum. Port 8787 was never used.
- Swap was checked; build/browser work waited until at least 500 MB was free. One build at a time. All task-started servers and browsers are stopped.

README and HACKATHON_SUBMISSION_FORM describe this approved client. Prior game/simulation/art foundations remain disclosed baseline; keeper provenance is explicit. The refreshed submission idea is **1,027 characters**; proposed track remains **games**. Nothing was pushed.

## R3 — own-wallet house matches on the approved app

DONE on `main`, November 12, 2026. The first fresh staked match exercised on this approved sky-blue app in R3 is **#17 at 1440×900**; **#18 at 375×900** is the independent phone run. The earlier flow above tested local practice and an existing receipt only. These new matches use the player's own wallet path, not guest sponsorship. No imported client or other branch was touched.

| Item | Status | Executed evidence |
|---|---|---|
| Dead-link fix | DONE | The required tracked-Markdown path grep prints nothing; earlier result rows and status words were preserved. |
| Wallet connection | DONE | Optional Connect NEAR wallet uses Meteor via Wallet Selector. Real browser QA used a DEV-only injected signer through the same action codec; player identity was stored without a full-access secret. |
| Desktop house match | DONE | #17, 1440px; 0.01 NEAR against Kumo; wallet-signed AddKey and stake, six play transactions, referee settlement, Verified receipt and key deletion. |
| Phone house match | DONE | #18, 375px; same smallest stake and full flow; six play transactions, settlement, Verified receipt and key deletion. |
| Play-key scope | DONE | Both live keys were limited to arena `play`, with exactly 0.25 NEAR allowance; all 12 play signatures matched the corresponding match session key. Neither key remained after settlement. |
| Operator independence | DONE | The local price-posting relayer was stopped before browser play. Zero relayer/auth requests occurred during either match. Every game transaction was signed by the player account. |
| Production QA exclusion | DONE | A production build with VITE_QA_SIGNER=1 still excludes the QA module, startup credential globals and evidence/budget bindings. A release guard runs at the end of every web build. |
| Guest fallback (conditional item 3) | DONE | Not needed: the wallet action path succeeded. Both wallet runs also satisfy the fresh staked-house-match requirement. Guest sign-in and its sponsored transaction path remain available. |
| Fresh market prices | DONE | Ran pnpm meta:post once before play; signed snapshot 4PMZ3k1b1s7q2gyAs7HfbTtLXBNmmgTUnpUqFRhMtgwv read back live. |

Both matches were **Defeat**, not fabricated wins. Kumo received **0.0184 NEAR** in each, with **0.0006 NEAR** to the season and **0.001 NEAR** to treasury. The independent replays matched the referee: #17 ended at tick 600/hash 340252215; #18 at tick 600/hash 1419554228.

[Sealed R3 transaction and balance evidence](deployments/r3-2026-11-12.json) records 21 successful transactions, all hashes, pre-write balance checks, per-write budget reservations, live key permissions, six stored plays per match, final replay results and deletion checks. The player was the repo's existing `aiko-8197.mempire-relay-41966.testnet`; no account funding, faucet, redeployment or mainnet action was needed.

Conservative spend: **0.0479550458186581 testnet NEAR / 0.3 cap**. This includes 0.02 NEAR of player stakes, 0.02 NEAR of house stakes and 0.0079550458186581 NEAR of recorded gas, including the price post. Key allowances are limits, not transferred funds. Balances were checked before each submitted write; no keys on contract accounts were deleted.

Before screenshots: `before-signin-1440.png`, `before-signin-375.png`. After screenshots: `after-signin-1440.png`, `after-signin-375.png`. The same local gallery, `index.html`, contains both views plus wallet account, houses, live battle, result and Verified receipt captures at each width. The only UI addition is the optional existing-style wallet button and wallet-specific account text; no CSS, fonts, colours, layout system or art changed. The two live runs captured 12 screens with zero console/page errors, zero document overflow and zero relayer requests. All browser work used the shared Chrome lock; memory/disk checks passed and task-started servers/browsers were stopped.

Screenshots were captured locally during QA and are not committed.

`pnpm test` passed **22 JavaScript tests** (sim 4, SDK 5, relayer 3, web 10). All workspace typechecks passed. The production build passed with VITE_QA_SIGNER=1 and its release guard confirmed that QA code was excluded. Existing bundle warnings remain.

The automation is explicitly a development Wallet Selector signer backed by a real repo-owned testnet account, not a simulated success. Meteor's AddKey/DeleteKey action conversion was tested through its actual Wallet Selector codec. A human Meteor popup/extension approval was not automated; cancelling an approval remains a wallet/user action. No AddKey API refusal was observed, so item 2 is not BLOCKED. Production never loads the QA signer.

## V3 playable battle — November 13, 2026

Owner requested a battle-only rebuild after judging film v1 5/10 for its small, passive arena. Other app screens, palette, fonts and art stay unchanged. The portrait stage now fills the viewport: at 1440×1080 the field is **488×860 px**, with the timer/crowns above and four large cards, next-card preview and energy below. At 390×844 and 375×844 the stage fills the screen; document overflow and page scrolling are both zero. Match details are secondary, opened explicitly. Sound starts muted.

| Check | Result | Evidence |
|---|---|---|
| Mouse drag, 1440 | PASS | Real unit spawned, energy spent and card cycle advanced |
| Tap-card / tap-field | PASS | Separate native click path deployed another real unit |
| Release outside the field | PASS | No card cycle change or deployment |
| Touch drag, 390 | PASS | Real CDP touch events, placement ghost, unit spawned |
| Placement mapping | PASS | Both perspectives, letterbox gutters, river snap, invalid coordinates and drag threshold tested |
| Console/page errors | PASS | Zero in desktop and phone interaction runs |
| Tests/build | PASS | 27 workspace JavaScript tests (15 web); workspace typechecks, production build and QA-signer exclusion pass |

Before screenshots: `before-battle-1440.png`, `before-battle-390.png`, `before-battle-375.png`. After: `after-battle-1440.png`, `after-battle-390.png`, `after-battle-375.png`. Interaction stills: `after-drag-ghost-1440.png`, `after-touch-ghost-390.png`, `after-play-1440.png`, `after-play-390.png`. Local gallery group: `mempire-near/v3`; machine-readable layouts and interaction results: `after.json`, `interactions.json`. Screenshots were captured locally during QA and are not committed.

Only presentation and input handling changed. The same deterministic simulation, temporary play key, arena play method, referee settlement and receipt verification remain in use. Fresh filmed matches and their hashes are recorded below; older matches are not relabelled as new.

### V3 live integration and film — completed November 13

| Step | Status | Executed result |
|---|---|---|
| First fresh take, #20 | FIXED | Three accepted plays from six drag attempts exposed a pending-hand race: an already-sent card remained visible until the authoritative log caught up. The UI now reserves its energy and marks that card Sending until it cycles; other cards remain available. No signing or game rules changed. |
| Repeat full match, #21 | PASS | Six real drags produced six successful play transactions from the match's local key, against Kumo at the smallest 0.01-NEAR tier. |
| Referee and receipt | PASS | Both matches settled and independently replayed Verified. #20: Kumo, tick 600, hash 351631571; #21: Kumo, tick 600, hash 193130042. Both paid the house 0.0184 NEAR. No win was fabricated. |
| Access-key cleanup | PASS | Both keys were arena-play-only, allowance 0.25 NEAR; each exact key was absent after deletion. All card transactions used the corresponding session key. |
| Operator independence | PASS | Zero relayer/auth requests during either game; the existing build-gated QA wallet signed player setup/stake/settle/delete. Human Meteor popups were not filmed. |
| Browser checks | PASS | Mouse drag/tap/outside release at 1440 and 390; CDP touch at 390; layout checks at 1440, 390 and 375, with zero console/page errors and overflow. Main live run also recorded zero errors/overflow. Physical phone hardware was unavailable. |
| Fresh prices and budget | PASS | One signed price snapshot, eighteen unique FINAL successful transactions overall. Conservative combined spend 0.0463495808885464 testnet NEAR, including both sides' stakes and gas; cap 0.1. No new account funding or deployment. |
| Production and tests | PASS | 27 JavaScript tests (sim 4, SDK 5, relayer 3, web 15), all workspace typechecks and production build. Release guard confirms the development QA signer is absent. Contract tests were not rerun; no contract changed. |
| Film | PASS | 2:45.6; 1080p H.264 and 720p 17.6 MB share, faststart; Kokoro af_nova and original music, no subtitles/title opener. All contact sheets inspected, no detected full-frame freeze >6 s or silence ≥1 s. |

[Public evidence and every explorer link](deployments/mobile-battle-v3-2026-11-13.json). Opening is explicitly match #20 highlights (accepted drag, fighting, tower falling); the complete main match is #21 after the fix. Full gameplay is 1x; only measured countdown/confirmation waits are 4x, visibly badged. Every new hash is shown on the testnet explorer. No new write was repeated to improve the edit.

The film's first v3 cut received 8.7/10 in internal frame review; the revised cut received 9.0/10 internally after a clearer prize explanation and ready explorer views with full hash labels. Nick's v1 score remains 5/10; no new external score is claimed. Reviews and retained stills live with the versioned film assets. Public hosting and human wallet approvals are not shown; mainnet, card tokens and other-token stakes remain unbuilt.
