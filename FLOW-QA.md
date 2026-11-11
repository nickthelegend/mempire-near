# Flow QA — approved sky-blue Mempire on main

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

[Open the screenshot gallery](/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/flow-qa/mempire-near/index.html).

Folder: `/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/flow-qa/mempire-near/`.

`result.json` contains the full flow and account-creation hash; `receipt-detail.json` contains the focused read-only verification. Filenames follow `<stem>-1440.png` and `<stem>-375.png`. The gallery links every image.

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

Before/after sheets: `/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-3d/before-after-1440.jpg`, `/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-3d/before-after-375.jpg`, `/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-3d/before-after-key.jpg`.
After screenshots: `/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-3d/after/<view>-1440.png` and `<view>-375.png`.

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
