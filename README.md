# Mempire on NEAR

Every coin is a fighter. The market is the meta. Every move is a NEAR transaction.

## The problem

A staked game needs more than a winner reported by two players. Mempire records every card drop as its own NEAR transaction, signed by a play-only session key without wallet popups. The referee contract replays the whole match before it pays the result; anyone can check the moves and replay.

## Try it

The main app is `packages/app`. It reuses the October Monad client's fonts, art, sound, drag controls and 3D arena. Its desktop layout has live market and match rails around a wider game screen; phone controls keep their original layout. The NEAR chain layer is new. The earlier `packages/web` remains in the repo and is no longer the default.
There is no hosted NEAR demo. Use Node.js 24+ and pnpm 10.29.2; run commands from this repository's root.

1. Run `pnpm install` - see the workspace dependencies install.
2. Run `pnpm build` - see the production build in `packages/app/dist`.
3. Run `pnpm preview` - see the imported game at <http://127.0.0.1:5390/>.
   Keep that terminal open. Its local RPC adapter shares real NEAR reads across tabs and retries public RPC limits.
   For development, `pnpm dev` opens the same app at the same address.
4. Without signing in, open <http://127.0.0.1:5390/#/proof> - see deployment links and recent matches read from the arena.
5. Open <http://127.0.0.1:5390/#/replay/11> - see the recorded match replayed in the imported 3D arena.
   The verifier compares the winner, final tick and final state hash against the NEAR referee.
6. For a new account and staked play, start the configured relayer in another terminal:
   `RELAYER_PORT=5399 STARTER_NEAR=0.15 pnpm --filter @mempire/relayer start` - see its listening message.
   This needs a funded testnet relayer account and its own signing credentials, as described in [Run it](#run-it).
7. At <http://127.0.0.1:5390/>, choose **Play now**, enter a name and choose **Play as Guest** - see a relayer-created
   NEAR sub-account and **Starter loadout ready**. The key stays in this browser. The loadout contains eight free
   level-1 fighters; this is not an NFT mint. Meteor Wallet is also offered for an existing NEAR testnet account.
8. Open **Deck** - see the eight-fighter loadout and three local save slots. Then choose **Arena → Practice · free** -
   drag a card onto your half of the 3D field and see a 30-second local battle and its result. Practice stakes nothing.
9. Open a second browser profile and sign in separately. Choose the same stake tier and **Rush · 30s** on both -
   see two stakes escrowed and each card drop recorded through a play-only function-call key. If both players open
   at once, the newer open stake is refunded before joining the older match. A reload resumes the saved queue.
10. After the play window closes, see the referee settle the match. Choose **Replay from the chain** - see the final
    result checked against the contract. Open **Empire** for settled history, season points, wins, draws and net NEAR;
    **Proof** contains NearBlocks links. No practice result is credited to the leaderboard.

Public proof and recorded replays need no credentials. New guests need the funded relayer; Meteor signs its own stake
and key-management transactions. Public RPC congestion can delay play. Email, passkeys, NFT minting, clans, chests,
paid passes and other unavailable features are listed honestly in [BLOCKED.md](BLOCKED.md).

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
| Card drop in match #16, player 1 | [9xSJccGFaGFxDdFToHUDrrkA4T8KcVvhKaD8HKp37PE3](https://testnet.nearblocks.io/txns/9xSJccGFaGFxDdFToHUDrrkA4T8KcVvhKaD8HKp37PE3) |
| Card drop in match #16, player 2 | [HmLffNf9UAPbtREpXSEwRrF216D5JYkRhUPzyaa5vhQC](https://testnet.nearblocks.io/txns/HmLffNf9UAPbtREpXSEwRrF216D5JYkRhUPzyaa5vhQC) |
| Referee replay and payout for match #16 | [6TWkZ5UfoWnSrcA1qBtPxkfg4chTqVT911R3VPdCp9pY](https://testnet.nearblocks.io/txns/6TWkZ5UfoWnSrcA1qBtPxkfg4chTqVT911R3VPdCp9pY) |

Sources: [deployment accounts and transactions](deployments/testnet.json),
[match and season transactions](deployments/testnet-2026-11-09.json).
The current client also has [market/keeper evidence](deployments/market-meta-2026-11-11.json) and [six-play match #16 evidence](deployments/reposition-match-16-2026-11-11.json). [Its real settlement receipt](https://testnet.nearblocks.io/txns/6TWkZ5UfoWnSrcA1qBtPxkfg4chTqVT911R3VPdCp9pY) paid 0.0184 testnet NEAR to the winner.

The imported client has earlier [match 9 recovery evidence](deployments/monad-client-match-9-2026-11-11.json) and
[match 11 clean-run evidence](deployments/monad-client-match-11-2026-11-11.json). Match #11 recorded six plays and its
browser replay matched the referee's final result. [Its settlement is on NearBlocks](https://testnet.nearblocks.io/txns/BckAqcnpP7xY1WX4QkxmgoajmwSE1z6YgL9NvG6VWW7).


## Live market meta

Start the HTTP relayer on port 5399 with `RELAYER_PRICES=0` first. With the configured price-relayer key and funded relayer account, run `pnpm meta:post` - see a real signed Coinbase snapshot posted to the arena (or confirmation that this ten-minute epoch already has one). Run `pnpm meta:keep` - see new snapshots posted once per ten-minute epoch while it runs; Ctrl-C stops it. Stop the HTTP relayer's duplicate price loop with `RELAYER_PRICES=0` when running the separate keeper.

The keeper sends authenticated snapshots through the running relayer's shared signing queue, so price posts cannot race its guest or settlement nonces. `META_RELAY_URL` can point to another configured relayer URL (default `http://127.0.0.1:5399`). The keeper checks the sender's balance before each write, reserves 0.05 NEAR of balance and limits each run to `META_BUDGET_NEAR` (default 0.05 NEAR of gas). Public transaction evidence is appended under `deployments/market-meta-YYYY-MM-DD.json`. Failed price fetches retry after a minute; they never invent quotes. The app polls prices every 30 seconds and shows the signed snapshot's actual age. Coinbase 24h moves × 2 adjust market fighter stats, capped at ±15%; the six house fighters stay neutral. After six hours, the contract treats a price as neutral. A running match uses its stored opening modifiers, even if a newer snapshot arrives.

## How a match is proven

**Move → NEAR transaction → referee replay → payout.** The stake/key setup happens before play. Each card drop then gets its own `play` transaction from a function-call access key restricted to that arena method. The contract replays the complete stored log, checkpoints if needed, and pays its result. The browser checks the winner, final tick and state hash against the referee. Practice stays local.

[Replay match #11](http://127.0.0.1:5390/#/replay/11) and inspect its [real settlement receipt](https://testnet.nearblocks.io/txns/BckAqcnpP7xY1WX4QkxmgoajmwSE1z6YgL9NvG6VWW7). This is team testnet evidence.

## How it works

1. **Session key.** Before staking, the player's account adds a function-call key limited to the arena's `play`, with a
   0.05 NEAR allowance in the imported client (the original web client uses 0.25). Guest key management is sponsored
   through NEP-366; Meteor approves its own key changes. The key is deleted after the match.
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

### Accounts and gas

The imported client offers Guest and Meteor Wallet. Guest creates a sub-account for an ed25519 key generated and
held in this browser, with the relayer's configured testnet starter funding (0.3 NEAR default; 0.15 in the port run).
There is no guest recovery. The relayer sponsors permitted guest session-key management, settlement and cancellation
through NEP-366. The player account pays its stake and play gas. Meteor accounts approve their stake and key changes
in Meteor; the per-match key still signs card drops without popups.
Email remains an operator setup option in the original web client, not the imported client's sign-in screen.

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

For credential-free proof and recorded replay, use [Try it](#try-it). Contract checks also need Rust and `cargo-near`;
the sandbox suite uses nearcore through `near-workspaces`.

For new staked matches, an operator must supply their own funded testnet relayer account and its local signing
credentials. Set `ARENA_ACCOUNT` and `RELAYER_ACCOUNT` for the relayer; the server expects the relayer credential at
`.near-credentials/<RELAYER_ACCOUNT>.json`. Posting fresh prices also needs `.near-credentials/price-relayer.json`
matching the arena's configured public key. Team credentials are not part of the public reproduction path.
Start the relayer in a separate terminal from the app preview. The imported client uses port 5399 for the relayer;
the original web client defaults to 5299. Never commit signing credentials.

### Original web client and contract tools

The commands and routes below refer to the unchanged `packages/web` client. The imported client uses the hash routes
and commands in [Try it](#try-it).

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

`packages/app` imported Monad game client with NEAR adapters · `packages/sim` TypeScript engine (unchanged game rules) · `packages/contract` Rust arena + sim/bot port · `packages/sdk`
RPC, signer, runner · `packages/relayer` sign-in, meta tx, keeper, prices · `packages/web` landing and game ·
`scripts/` deploy, testnet run, settle · `deployments/` addresses and transaction hashes.

## Prior work

The Mempire Monad client was built October 5-14, 2026, before this hackathon's November 1 window. It is prior work.
Source: `/Volumes/Extreme SSD/Projects/mempire-monad`, revision `0e0b85ede703ec6d0d7f9f575abb2846071d9aa2`
([source repository](https://github.com/nickthelegend/mempire-monad)). Its own README credits the earlier Solana game.

Commit [b2b1749](../../commit/b2b1749) imported 460 tracked `app/` and needed `shared/` files byte-for-byte into
`packages/app` and `packages/shared`, before changing chain bindings. Its art, fonts, sound, CSS, Three.js scene,
screens, components and game design are reused, not claimed as new NEAR work. The imported client uses the eleven
fighters supported by the deployed NEAR arena; unsupported Monad card ownership and paid features are hidden or
labelled. Source portraits are retained where they match; existing class crests cover fighters without a source portrait.

The earlier NEAR build also reused `mempire-wif`, the Robinhood Chain port, and its Arc/Solana/Monad ancestry.
The sibling has October 30-31 commits; its last commit before November 1 is
`cbec50b61cdddf75a11b45a80dbaa64ad68c725b`. The import here is `ea74ac8`. Reused code remains baseline even when
copied into this repository on November 9. Both projects carry the MIT copyright for Nivesh Gajengi.

New NEAR work in the November 1-14 window: the November 9-10 Rust referee and simulation/bot port, arena, SDK,
function-call keys, NEP-366 relayer, signed-price verification, houses, seasons, testnet deployment and app wiring;
and the November 11 adaptation of the imported Monad client to these NEAR accounts, plays, settlement and proof. The later November 11 market/proof positioning, responsive desktop rails, periodic price reads and price keeper are also new NEAR work; the underlying game and visual assets remain baseline.
No new contract method or deployment is required for this client port. The earlier `packages/web` is preserved.

```bash
git show --stat b2b1749
git diff b2b1749..HEAD -- packages/app
git diff ea74ac8..HEAD -- packages/contract packages/sdk packages/relayer scripts deployments
```

The [post-import branch diff](../../compare/b2b1749...monad-client) separates NEAR adaptations from the imported client.
See [PORT-PLAN.md](PORT-PLAN.md), [PORT-REPORT.md](PORT-REPORT.md), [REPOSITION-REPORT.md](REPOSITION-REPORT.md) and [TESTING.md](TESTING.md) for scope and evidence.

## Hackathon disclosures

Built for NEAR HACKATHON 2026 (Nov 1-14). Only new NEAR work is offered for judging. The imported Monad client and
earlier game/ports are baseline, as detailed in [Prior work](#prior-work).

**AI-assisted code.** Built with AI coding agents (Claude Code, Codex) under human direction; all code reviewed and tested by the team.

**Other projects by the same team in this hackathon**

Lead: <TBD by Nick>

**License.** MIT. [LICENSE](LICENSE) retains Copyright (c) 2026 Nivesh Gajengi.

## Credits

Imported Monad art/audio are prior work; its README credits the earlier Solana assets and Higgsfield pipeline.
The separate original NEAR web client uses art generated with ChatGPT. The imported asset files are preserved; the source and this repository share the MIT copyright above.

## License

MIT, Copyright (c) 2026 Nivesh Gajengi.
