# Mempire on NEAR

A real-time 1v1 lane card battler where your fighters are live markets and **a NEAR contract is the referee**.

Two players stake testnet NEAR and drop troops (tank, swarm, ranged, splash, support, spell) into two lanes in real time.
Market fighters (BTC, ETH, NEAR, SOL, ZEC) hit harder or softer with their 24 h price move. Every card drop is a `play`
transaction signed by a per-match **function-call key** (no wallet pop-ups). When the match ends, the arena contract
**replays the stored play log through a Rust port of the deterministic sim** and pays whoever the replay says won. A claim
that disagrees with the replay is rejected.

- Arena contract (testnet): [`mempire-arena-41966.testnet`](https://testnet.nearblocks.io/address/mempire-arena-41966.testnet)
- Relayer / player parent: [`mempire-relay-41966.testnet`](https://testnet.nearblocks.io/address/mempire-relay-41966.testnet)
- House bots: `kumo.`, `tora.`, `ryu.mempire-arena-41966.testnet` · treasury: `treasury.mempire-arena-41966.testnet`
- Season 0 paid out on testnet: [`5MGKPyqU…`](https://testnet.nearblocks.io/txns/5MGKPyqUgg6bkfs9BXFCUgk8NeyZgxwRMFY8CUCxTcuv) (50/30 to the top two, the empty third share rolled over)
- Every deployment and match transaction: [`deployments/testnet.json`](deployments/testnet.json), [`deployments/testnet-2026-11-09.json`](deployments/testnet-2026-11-09.json)

## The problem

On-chain games either put the whole game on chain (too slow for real time) or trust the players' clients to report
the result (the "two seats claim, the contract believes" model). The earlier Mempire builds used the second model: if
both clients agreed the contract paid out, so colluding or lying clients could decide a pot. Here the contract decides.

## How it works

1. **Session key.** Before staking, the player's account adds a function-call key limited to the arena's `play`, with a
   0.25 NEAR allowance (added by NEP-366 meta transaction; the relayer pays the gas). It is deleted after the match.
2. **Stake and kick-off.** `create_match` / `join_match` / `challenge_house` escrow the stake. At kick-off the arena reads
   each card's signed price, stores twice the 24 h move per card (capped at ±15 %), and derives the seed from
   `env::random_seed()`.
3. **Plays.** `play(id, tick, deck_index, x, y)` is accepted only from a seat, only within 5 s after (or 10 s before) its tick
   by the block clock, and is stored.
4. **Referee.** `settle(id, claim?)` replays the log (plus the house bot for house matches) from the last checkpoint while gas
   lasts; if it runs low it stores the sim state and returns `replaying`, the next call resumes. When the replay ends it pays
   92 % to the winner, 3 % to the weekly season pool, 5 % to the protocol treasury. A claim with a different winner, end tick
   or state hash panics with `claim rejected by the referee`.
5. **Season.** Weekly (season 0 on testnet is a 90-minute launch season so a payout can be shown). The first settle of a new
   season pays the previous top three 50/30/20; unearned shares roll over. `finalize_season` is open to anyone.

**Measured gas (testnet):** match #2, 21 plays, 600 ticks: one `settle` call, **22.3 TGas**; match #1, 12 plays: 11.0 TGas.
A 3-minute Standard match is up to 8x the ticks, so it may take more than one call; the checkpoint path handles that and is
covered by a sandbox test that settles a Rush match in two 60 TGas calls. No TEE was needed.

### Prices (honest label: "relayer price (testnet)")

Pyth Core ended NEAR support, so no on-chain oracle is used. The relayer reads Coinbase Exchange's public 24 h stats
(`https://api.exchange.coinbase.com/products/{SYMBOL}-USD/stats`: `open` = 24 h ago, `last` = latest), signs the exact JSON
payload with an ed25519 key, and anyone may submit it. `post_prices` verifies it with `env::ed25519_verify` against the key
the arena was initialised with and refuses snapshots more than 15 minutes from the block clock. Prices older than 6 h at
kick-off count as neutral. Stocks are not offered (no NEAR feed for them).

### Players never touch a wallet

Email sign-in (6-digit code, needs `RESEND_API_KEY` on the relayer: **Setup required** until set) or guest sign-in: the
browser generates a key, the relayer creates `name-NNNN.mempire-relay-41966.testnet` with that key and 0.3 testnet NEAR.
Session keys, settlement, cancellation and key deletion go through the relayer as NEP-366 meta transactions; the relayer
only sponsors those (see `checkDelegate` in `packages/relayer/src/server.ts`). The stake is the one transaction the
player pays for.

### Houses

Three bots (Kumo easy, Tora normal, Ryu hard) are sub-accounts of the arena that funded their own treasuries with
`house_deposit`. Challenging one escrows the matching stake from its treasury; the referee plays the published bot for
seat 1 inside the replay, so a house never sends a move. Win/loss record and treasury are public (`get_houses`).

## NEAR features used and why

| Feature | Where | Why |
|---|---|---|
| Function-call access keys | session key per match, `play` only | real-time drops with no pop-ups; cannot move funds |
| NEP-366 meta transactions | `packages/relayer`, `KeySigner.signDelegate` | players pay no gas except their stake |
| Sub-accounts | players, houses, treasury | named, cheap accounts; houses with their own treasuries |
| `env::ed25519_verify` | `post_prices` | prices count only when signed by the relayer key |
| `env::random_seed` | `kick_off` | match seed neither player chooses |
| Deterministic WASM replay + checkpoints | `settle`, `sim.rs`, `bot.rs` | the chain decides the winner |

## Run it

```bash
pnpm install
# contract
cd packages/contract && cargo test --lib            # parity with the TS engine + buff maths
cargo near build non-reproducible-wasm --no-abi
cargo test --test sandbox -j 2 -- --test-threads=2  # real nearcore sandbox, ~2 min
cd ../..
# relayer (needs .env with ARENA_ACCOUNT and RELAYER_ACCOUNT and the keys in .near-credentials/)
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

## Prior work

Mempire exists on Arc and on Robinhood Chain (`mempire-wif`). The game (sim, art, UI) is ported from there. Only the NEAR
layer built Nov 9–14, 2026 is submitted for judging: the Rust referee, the NEAR contract, session keys, meta-transaction
relayer, signed-price relayer, houses, seasons and the NEAR app wiring.

## Team and other projects

Lead: <TBD by Nick>

## License

MIT, Copyright (c) 2026 Nivesh Gajengi.
