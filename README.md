# Mempire on NEAR

A real-time card battler where players stake testnet NEAR and the contract replays the match to decide who gets paid.

## The problem

A real-time game needs a result that players can trust when money is at stake. Earlier Mempire builds paid out when
both players' clients agreed, so two colluding clients could report a false result. This version stores their moves on
NEAR and checks the result by replaying the game inside the contract.

## Try it

The approved sky-blue game app is `packages/web` on `main`: fighter cards, practice rivals, a VS intro, battle, referee receipt, podium leaderboard and profile. It uses the v3 fighter art, plus a 3D object set in candy enamel for headers, feature cards and empty states (kit: [docs/ART-3D.md](docs/ART-3D.md)). The imported Monad client remains on `monad-client` and is not this branch’s web app.

The web app and relayer run locally; there is no hosted demo. Use Node.js 22+ and pnpm 10.29.2.
Run these commands from the repository root. Practice and replay need no team credentials or sign-in.
Testnet reads need internet access; public RPC rate limits can delay them.

1. Run `pnpm install` - see the workspace dependencies install.
2. Run `pnpm --filter @mempire/web build` - see the production build complete in `packages/web/dist`.
3. Run `pnpm --filter @mempire/web preview` and keep that terminal open - see the app at
   <http://127.0.0.1:5199/>. The lobby may show **Setup required: relayer**; the steps below do not need it.
4. Open <http://127.0.0.1:5199/app/practice>, choose **Quick practice**, then **Start battle** on the first visit -
   see the countdown and a local 30-second match against the training bot. Drag a card into either lane (the card follows your finger, then a troop ghost and the lane light up), or tap a card and then your half of the
   field. On a wide screen the portrait arena fills the full height between the rival and live scoreboard (left) and the arena's live match feed (right); on a phone the arena is the whole screen and **Details** opens the same panels. At the bell, see crowns and towers left. Practice sends no transactions.
5. Open <http://127.0.0.1:5199/app/match/8> - see the recorded testnet match receipt and its automatic browser replay.
   After the reads finish, see **Verified: same winner, same final tick, same state hash**. This checks the stored
   on-chain result without signing a transaction; the previous browser run is recorded in [TESTING.md](TESTING.md).
6. Open <http://127.0.0.1:5199/app/proof> - see arena totals, recent matches and deployment transaction links.

7. For a new staked match without an operator relayer, open `/app#signin` and choose **Connect NEAR wallet** - see Meteor Wallet connect your own funded NEAR testnet player account. The guest relayer setup message does not block this option. Contract accounts are not used as player wallets.
8. Open **Houses**, leave **Rush** selected and choose **Challenge Kumo** - approve adding a per-match function-call key limited to arena `play` with a **0.25 NEAR gas allowance**, then approve the smallest **0.01 NEAR stake**. These are separate wallet transactions because the key belongs to your account and the stake goes to the arena. The allowance is a spending limit, not another stake or transfer.
9. Drag cards onto your half of the field, or select a card and tap to place it - see each accepted drop land as its own transaction, signed by the local play key with no card-drop wallet prompts. Approve referee settlement and play-key deletion when the wallet asks. Open the match receipt - see **Verified: same winner, same final tick, same state hash**. If key removal is cancelled, the existing error panel reports it; reload the match to retry cleanup.

Guest account creation and guest-sponsored staking still need a configured, funded testnet relayer. That operator path is below in [Run it](#run-it). Wallet house matches use the player's account for setup, stake, settlement and deletion and do not use the operator relayer.
Email codes still need provider setup. See [BLOCKED.md](BLOCKED.md) for hosting and other unfinished integrations.

## Live on NEAR testnet

Recorded deployment: November 9, 2026. These are testnet accounts, not a mainnet payout address.

- Arena contract: [`mempire-arena-41966.testnet`](https://testnet.nearblocks.io/address/mempire-arena-41966.testnet).
- Relayer / player parent: [`mempire-relay-41966.testnet`](https://testnet.nearblocks.io/address/mempire-relay-41966.testnet).
- Treasury: `treasury.mempire-arena-41966.testnet`.
- House accounts: `kumo.mempire-arena-41966.testnet`, `tora.mempire-arena-41966.testnet`,
  `ryu.mempire-arena-41966.testnet`.

| Recorded action | Transaction |
|---|---|
| Deploy and initialise the arena | [3eN5K22AYytBbDADBsZF2cw7jKdVdKebzsjiCyJruCfw](https://testnet.nearblocks.io/txns/3eN5K22AYytBbDADBsZF2cw7jKdVdKebzsjiCyJruCfw) |
| Add a play-only session key through a sponsored meta transaction | [4isQkQzAfqnFmE9mGDmgnfVkouw3UDNycCwzeG7Ai65r](https://testnet.nearblocks.io/txns/4isQkQzAfqnFmE9mGDmgnfVkouw3UDNycCwzeG7Ai65r) |
| Reject a fake winner claim in match #2 | [J8Bbuhcdjimhzjq1YRU9mToiauzMU5WTVZc52AFQzHJy](https://testnet.nearblocks.io/txns/J8Bbuhcdjimhzjq1YRU9mToiauzMU5WTVZc52AFQzHJy) |
| Settle match #2 with the replayed result | [BiJqVsL7cPsc3s71EHtCcHtqPBBgsnyxhM7aCY2KaYJB](https://testnet.nearblocks.io/txns/BiJqVsL7cPsc3s71EHtCcHtqPBBgsnyxhM7aCY2KaYJB) |
| Pay season 0; roll over the unearned third share | [5MGKPyqUgg6bkfs9BXFCUgk8NeyZgxwRMFY8CUCxTcuv](https://testnet.nearblocks.io/txns/5MGKPyqUgg6bkfs9BXFCUgk8NeyZgxwRMFY8CUCxTcuv) |

Sources: [deployment accounts and transactions](deployments/testnet.json),
[match and season transactions](deployments/testnet-2026-11-09.json).


The first fresh staked matches tested on the approved sky-blue client in R3 are **#17 at 1440px** and **#18 at 375px**. Each recorded six card drops, settled through the referee, replayed Verified and removed its play key. Both were losses to Kumo; the house received 0.0184 NEAR per match. The local development QA signer used real repo-owned testnet funds through Wallet Selector; no operator relayer ran during play. [All hashes, balance checks and the cumulative budget](deployments/r3-2026-11-12.json). See [FLOW-QA.md](FLOW-QA.md) for executed checks and the distinction between QA automation and human Meteor approvals.

The November 13 battle revision adds a full-height portrait field, mouse/touch dragging, lane and placement previews, and a pending-card state. In the final filmed wallet run, **#21**, all six drags became six play transactions. The referee and browser replay agreed on Kumo winning at tick 600, hash 193130042, and the exact play key was deleted. The opener uses separately labelled highlights from fresh match #20, which exposed the pending-hand issue fixed before #21. [All eighteen new transaction hashes and both replay checks](deployments/mobile-battle-v3-2026-11-13.json). The film is 2:45.6, starts on gameplay and has no subtitles. See [FLOW-QA.md](FLOW-QA.md) for before/after captures and limits.

## Keeping market prices fresh

Start the configured HTTP relayer with `RELAYER_PORT=5399 RELAYER_PRICES=0 pnpm --filter @mempire/relayer start`. It needs the operator's funded testnet account and credentials described below. Then run `pnpm meta:post` - see one real signed Coinbase snapshot posted, or confirmation that the current ten-minute epoch already has one. `pnpm meta:keep` checks each minute and posts each new ten-minute epoch while it runs. Ctrl-C stops it. `META_RELAY_URL` can override `http://127.0.0.1:5399`. For guest sign-in with that port, build the web app with `VITE_RELAYER_URL=http://127.0.0.1:5399 pnpm --filter @mempire/web build`. To reuse the standard port-5299 relayer instead, set `META_RELAY_URL=http://127.0.0.1:5299` for either keeper command.

The keeper checks balance before writing, retains a 0.05 NEAR balance reserve and limits gas per run with `META_BUDGET_NEAR` (default 0.05 NEAR). It authenticates snapshots with the existing price key and uses the HTTP relayer's shared signing queue, avoiding sponsor nonce races. Read-back prices and exact receipts are saved under `deployments/market-meta-YYYY-MM-DD.json`. It is a local service; it must stay running for scheduled updates. The sky-blue app reads market prices each minute. Matches lock their opening modifiers; prices older than six hours are neutral.

The fresh main-branch post is [AFbqKpE14jFjm9xuagMbyhb4WaB8MXZH3ySQkhG9KDhi](https://testnet.nearblocks.io/txns/AFbqKpE14jFjm9xuagMbyhb4WaB8MXZH3ySQkhG9KDhi), recorded in [market evidence](deployments/market-meta-2026-11-11.json). No imported-client UI was brought to `main` with this keeper.

## How it works

1. **Session key.** Before staking, the player's account adds a function-call key limited to the arena's `play`, with a
   0.25 NEAR allowance. A connected wallet approves this directly; guests use a NEP-366 meta transaction with relayer-paid gas. It is deleted after the match.
2. **Stake and kick-off.** `create_match` / `join_match` / `challenge_house` escrow the stake. At kick-off the arena reads
   each card's signed price, stores twice the 24 h move per card (capped at ±15 %), and derives the seed from
   `env::random_seed()`.
3. **Plays.** `play(id, tick, deck_index, x, y)` is accepted only from a seat, only within 5 s after (or 10 s before) its tick
   by the block clock, and is stored.
4. **Referee.** `settle(id, claim?)` replays the log (plus the house bot for house matches) from the last checkpoint while gas
   lasts; if it runs low it stores the sim state and returns `replaying`, the next call resumes. When the replay ends it pays
   92 % to the winner (split between seats on a draw), 3 % to the weekly season pool, 5 % to the protocol treasury.
   A claim with a different winner, end tick or state hash panics with `claim rejected by the referee`.
5. **Season.** Weekly (season 0 on testnet is a 90-minute launch season so a payout can be shown). The first settle of a new
   season pays the previous top three 50/30/20; unearned shares roll over. `finalize_season` is open to anyone.

**Measured gas (testnet):** match #2, 21 plays, 600 ticks: one `settle` call, **22.3 TGas**; match #1, 12 plays: 11.0 TGas.
A 3-minute Standard match is up to 8x the ticks, so it may take more than one call; the checkpoint path handles that and is
covered by a sandbox test that settles a Rush match in two 60 TGas calls. No TEE was needed.

### Prices (honest label: "relayer price (testnet)")

This build uses signed relayer prices, not an on-chain oracle. The relayer reads Coinbase Exchange's public 24 h stats
(`https://api.exchange.coinbase.com/products/{SYMBOL}-USD/stats`: `open` = 24 h ago, `last` = latest), signs the exact JSON
payload with an ed25519 key, and anyone may submit it. `post_prices` verifies it with `env::ed25519_verify` against the key
the arena was initialised with and refuses snapshots more than 15 minutes from the block clock. Prices older than 6 h at
kick-off count as neutral. Stocks are not offered in this build.

### Players never touch a wallet

Email sign-in (6-digit code, needs `RESEND_API_KEY` on the relayer: **Setup required** until set) or guest sign-in: the
browser generates a key, the relayer creates `name-NNNN.mempire-relay-41966.testnet` with that key and 0.3 testnet NEAR.
Session keys, settlement, cancellation and key deletion go through the relayer as NEP-366 meta transactions; the relayer
only sponsors those (see `checkDelegate` in `packages/relayer/src/server.ts`). Stakes and play gas are paid from the player
account; the function-call key allowance caps its play spending.

### Houses

Three bots (Kumo easy, Tora normal, Ryu hard) are sub-accounts of the arena that funded their own treasuries with
`house_deposit`. Challenging one escrows the matching stake from its treasury; the referee plays the published bot for
seat 1 inside the replay, so a house never sends a move. Win/loss record and treasury are public (`get_houses`).

## NEAR features used and why

| Feature | Where | Why |
|---|---|---|
| Function-call access keys | session key per match, `play` only | real-time drops with no pop-ups; cannot move funds |
| NEP-366 meta transactions | `packages/relayer`, `KeySigner.signDelegate` | sponsors key management and settlement |
| Sub-accounts | players, houses, treasury | named, cheap accounts; houses with their own treasuries |
| `env::ed25519_verify` | `post_prices` | prices count only when signed by the relayer key |
| `env::random_seed` | `kick_off` | match seed neither player chooses |
| Deterministic WASM replay + checkpoints | `settle`, `sim.rs`, `bot.rs` | the chain decides the winner |

## Run it

For credential-free practice and replay, use [Try it](#try-it). Contract checks also need Rust and `cargo-near`;
the sandbox suite uses nearcore through `near-workspaces`.

For the guest account and sponsored-transaction path, an operator must supply their own funded testnet relayer account and its local signing
credentials. Wallet players can instead use the independent path in [Try it](#try-it). Set `ARENA_ACCOUNT` and `RELAYER_ACCOUNT` for the relayer; the server expects the relayer credential at
`.near-credentials/<RELAYER_ACCOUNT>.json`. Posting fresh prices also needs `.near-credentials/price-relayer.json`
matching the arena's configured public key. Team credentials are not part of the public reproduction path.
Start the relayer in a separate terminal from the web preview. Never commit signing credentials.

```bash
pnpm install
# contract
cd packages/contract && cargo test --lib            # parity with the TS engine + buff maths
cargo near build non-reproducible-wasm --no-abi
cargo test --test sandbox -j 2 -- --test-threads=2  # real nearcore sandbox, ~2 min
cd ../..
# relayer (operator setup above required; run in a separate terminal)
pnpm --filter @mempire/relayer start                # http://127.0.0.1:5299
# web
pnpm --filter @mempire/web build && pnpm --filter @mempire/web preview   # http://127.0.0.1:5199
```

Do X → see Y:

- Open `/` → live totals, the fighter roster with signed prices, recent matches with the referee's state hash, the season
  and the house treasuries.
- `/app/practice` → pick a rival (the training bot, or Kumo, Tora or Ryu with the deck and bot level the arena stores for
  that house) → VS screen with three tips on the first visit → 3-2-1 → a local 30-second Rush with your deck (no chain) →
  result with crowns and towers left.
- `/app` (lobby) → Guest → name → **Create a guest account** → pick a stake tier → **Battle** opens or joins a PvP match.
- `/app/houses` → **Challenge** Kumo → drop cards → after the bell the page asks the referee to settle (meta tx) →
  **Replay & verify** recomputes the result in the browser and compares it with the stored hash.
- `/app/proof` → arena totals, recent matches (open one to replay it) and the deployment transactions.
- `/app/deck` builds the eight-card deck (saved in the browser); `/app/season` shows the race, points and past payouts.
- `/app/cards` → all 11 fighters with class filters → tap one → `/app/cards/btc`: its level-1 numbers as the sim builds
  them (trait and today's market change folded in), the signed price and 24 h move, **Add to deck** (swap when full).
- `/app/match/8` → the referee receipt: result with crowns, the pot split, the market read at kick-off, every stored play
  on a field map, and a replay of the log in your browser compared with the referee's stored hash. Transaction links come
  from the recorded testnet runs and from matches this browser played (the arena stores plays, not hashes).
- `/app/leaderboard` → all-time ladder computed from every settled match (paged `recent_matches`), podium, and the
  season's on-chain top three. `/app/profile` and `/app/player/<account>` → the arena's own record (`get_player`), season
  points, match history and most-fielded fighters. `/app/how` → how to play in four steps.
- `pnpm tsx scripts/testnet-run.ts` → two relayer-created players, a PvP match with a rejected fake claim, a house match.
- `pnpm tsx scripts/deploy.ts` → deploys a fresh arena for `ARENA_ACCOUNT` (testnet helper account) with houses and prices.

## Layout

`packages/sim` TypeScript engine (unchanged game rules) · `packages/contract` Rust arena + sim/bot port · `packages/sdk`
RPC, signer, runner · `packages/relayer` sign-in, meta tx, keeper, prices · `packages/web` landing and game ·
`scripts/` deploy, testnet run, settle · `deployments/` addresses and transaction hashes.

## Hackathon disclosures

Built for NEAR HACKATHON 2026 (Nov 1-14). Only the new NEAR work is submitted for judging.

### Prior work

Earlier Mempire versions are baseline, not new NEAR work. The reused game design, deterministic TypeScript simulation,
bot, existing art and app foundation remain prior work even when imported through a later port.
The [public owner repository inventory](https://api.github.com/users/nickthelegend/repos?type=owner&sort=full_name&direction=asc&per_page=100) (all seven pages) and the earlier READMEs were checked on November 12, 2026. Four earlier public repositories were accessible; the known `mempire-wif` import baseline is also disclosed below.

- [mempire](https://github.com/nickthelegend/mempire) — original Solana card battler and the earlier game/client foundation credited by subsequent ports.
- [mempire-arc](https://github.com/nickthelegend/mempire-arc) — Arc version with USDC stakes and market-driven fighter modifiers.
- [mempire-monad](https://github.com/nickthelegend/mempire-monad) — Monad build from October 5–14, 2026; its game client, art, audio and design predate the NEAR window.
- [mempire-clockin](https://github.com/nickthelegend/mempire-clockin) — Solana Mobile/Seeker edition with daily Clock-In, Ghost Duels and a Season Pass.
- [mempire-wif](https://github.com/nickthelegend/mempire-wif) — Robinhood Chain `$WIF`/stock-token port and this repo's immediate import baseline; its public GitHub URL returned 404 at this check, but its local history and README were verified.

The sibling `mempire-wif` history includes October 30-31, 2026 commits; its last commit before November 1 is
`cbec50b61cdddf75a11b45a80dbaa64ad68c725b`. Its README credits earlier Solana, Monad and Arc builds.
This repo starts November 9, so its own history alone does not date the original game to before November 1.
The import is [ea74ac8](../../commit/ea74ac80a45ec620e61e5ffefd31d73b1a5ed0f1); reused material remains baseline,
including changes imported from the sibling's November 1 commits.

**Built in the window.** November 9-10 commits add the Rust simulation/bot port and on-chain referee with checkpoints,
the NEAR arena, function-call session keys, NEP-366 relayer and SDK, signed-price posting, funded house accounts,
season payouts, testnet deployment evidence and NEAR app wiring. The current v3 art and app redesign were also made
in that period; they do not make the reused game rules new work. Review the
[post-import implementation diff](../../compare/ea74ac80a45ec620e61e5ffefd31d73b1a5ed0f1...909424808cdf1ff16f9aedb8dca2819a08ea156f)
or run `git diff ea74ac8..9094248` locally. This range includes UI/art changes as well as the NEAR integration.
See [REPORT.md](REPORT.md) for scope and limits, [TESTING.md](TESTING.md) for recorded validation and [FLOW-QA.md](FLOW-QA.md) for the approved sky-blue client’s latest full flow.

The market-price keeper on `main` was written on **November 11, 2026**, inside the NEAR HACKATHON window (November 1–14). It was developed on the separate NEAR `monad-client` branch (`b42ae15`, `7a93c34`), then ported here without that branch's UI. It is new NEAR work, not part of the October Monad baseline.

The battle-only portrait layout, drag/tap placement previews and pending-card handling were built on **November 13, 2026**, inside the NEAR window. They reuse the existing art and game rules; the contract, simulation and signing paths are unchanged.

The imported Monad client lives **only on branch `monad-client` and is NOT the submitted app**. The submitted app is the approved sky-blue **`packages/web` on `main`**.

**AI-assisted code.** Built with AI coding agents (Claude Code, Codex) under human direction; all code reviewed and tested by the team.

**Other projects by the same team in this hackathon**

Lead: <TBD by Nick>

**License.** MIT. [LICENSE](LICENSE) retains Copyright (c) 2026 Nivesh Gajengi, also present in the sibling's MIT license.
No NOTICE file is present in this repo.

## Credits

Art generated with ChatGPT, including the 3D object set (3D art generated with ChatGPT).

## License

MIT, Copyright (c) 2026 Nivesh Gajengi.
