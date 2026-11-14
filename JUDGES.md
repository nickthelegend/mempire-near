# Judge guide: Mempire on NEAR (NEAR HACKATHON 2026)

For human judges and for the Claude Code / Codex screening pass (HACKATHON.md Q-017). Every claim below has a command or a link that checks it.

## In one paragraph

**Product:** Mempire is a real-time card battler. Two players, or a player and a funded house bot, stake testnet NEAR and drop cards onto a field for 30 seconds (Rush format).
**Problem:** In a staked real-time game, someone has to decide who won. Earlier Mempire builds paid out when both clients agreed, so two colluding clients could report a false result.
**What Mempire does:** Each card drop is stored on NEAR by a play-only function-call key. When the match ends, the arena contract replays the stored moves (deterministic Rust port of the game engine, compiled to Wasm) and pays 92 % to the winner, 3 % to a weekly season pool and 5 % to the treasury. A settle call that claims a different winner, end tick or state hash is rejected by the contract.
**Tracks:** `games` (proposed in `HACKATHON_SUBMISSION_FORM.md`).

## Verify in one command (no install, no keys)

```sh
node scripts/judge-verify.mjs
```

Needs Node 18+ and nothing else. It checks public data, not this repo's records: the FastNEAR transaction API, the NEAR testnet RPC (main, and the archival node for older transactions) and the contract source. Expected output: `19/19 checks passed.` It exits 0 only if all 19 pass (takes about 5 seconds).

| # | Check | Source of truth |
|---|---|---|
| 1 | Contract has `settle` with the `claim rejected by the referee` panic | `packages/contract/src/lib.rs` |
| 2 | Contract uses `env::ed25519_verify` (price snapshots) and `env::random_seed` (match seed) | same |
| 3 | Contract has `play` and `challenge_house` | same |
| 4 | Arena deployed and initialised | tx `3eN5K2…` |
| 5 | Play-only session key added by a sponsored NEP-366 meta transaction | tx `4isQkQ…` |
| 6 | **Wrong-winner claim in match #2 is refused on chain**: failure text contains `claim rejected by the referee` (replay gives winner 1, end tick 600, hash 1045771825) | tx `J8Bbuh…` |
| 7 | Match #2 settled by the replay | tx `BiJqVs…` |
| 8 | Season payout `finalize_season` | tx `5MGKPy…` |
| 9 | Match #29: stake escrowed (`challenge_house`) | tx `FqKpBz…` |
| 10 | Match #29: a card drop sent as a `play` transaction | tx `CW3jiL…` |
| 11 | Match #29: referee `settle` | tx `7kTCNN…` |
| 12 | Signed price snapshot posted (`post_prices`) | tx `AFbqKp…` |
| 13 | Arena upgraded in place (`migrate`) for the oracle | tx `BYAeK1…` |
| 14 | `refresh_prices` ran receipts on `price-oracle.testnet` (OutLayer TEE oracle) | tx `698XRi…` |
| 15 | `get_match(29)`: settled, winner seat 0, 8 plays, end tick 600, hash 3205096048 | arena view |
| 16 | `get_match(2)`: winner 1, tick 600, hash 1045771825, the values the fake claim was compared with | arena view |
| 17 | `get_totals`: 29+ matches, 26+ settled, 3 houses | arena view |
| 18 | `get_prices`: fighters priced with source `oracle` | arena view |
| 19 | `get_houses`: three funded house treasuries | arena view |

Each transaction line prints a link of the form `https://testnet.near.rocks/tx/<hash>`. The arena account is `mempire-arena-41966.testnet`.

## Do X → see Y

There is no hosted demo; the app runs locally (Node 22+, pnpm 10.29.2). Practice and replay need no credentials.

1. **`pnpm install && pnpm test`** → TypeScript tests pass (sim, SDK, relayer, web; the last recorded count is 30 in [TESTING.md](TESTING.md)).
2. **`cd packages/contract && cargo test --lib`** → 4 Rust unit tests pass, including parity with the TypeScript engine on 60 recorded matches.
3. **`cargo near build non-reproducible-wasm --no-abi && cargo test --test sandbox -j 2 -- --test-threads=2`** (about 2 minutes, needs Rust and `cargo-near`) → sandbox suite on a real nearcore sandbox: fake claims rejected, forged hash rejected, session key cannot stake, settle or transfer, 92/5/3 payouts, house bot inside the referee, checkpointed settle over two 60 TGas calls, season payouts.
4. **`pnpm --filter @mempire/web build && pnpm --filter @mempire/web preview`**, then open `http://127.0.0.1:5199/app/practice` → **Quick practice**, **Start battle**: a local 30-second match against a training bot. Drag a card to a lane. No transaction is sent.
5. Open `http://127.0.0.1:5199/app/match/8` → the recorded testnet match receipt, replayed in your browser from the stored plays: "Verified: same winner, same final tick, same state hash". Reads only, no signing.
6. Open `http://127.0.0.1:5199/app/proof` → arena totals, recent matches and deployment transaction links.
7. Optional, needs a funded NEAR testnet account and Meteor Wallet: **Houses → Challenge Kumo** adds a play-only key with a 0.25 NEAR gas allowance, stakes 0.01 NEAR, and every card drop is its own `play` transaction. The receipt then shows the same Verified line.

## How Mempire uses NEAR (specific)

| NEAR feature | How Mempire uses it | Where |
|---|---|---|
| Deterministic Wasm replay with checkpoints | `settle` replays the stored plays to decide the winner; a long match resumes across calls. Measured 22.3 TGas for a 21-play, 600-tick match | `packages/contract/src/{lib,sim,bot}.rs`; check 6, 7, 11 |
| Function-call access keys | Per-match key limited to `play`, 0.25 NEAR allowance, deleted after the match; it cannot stake, settle or transfer | `create_match`/`challenge_house` take `session_key`; sandbox tests; check 5, 10 |
| NEP-366 meta transactions | Relayer sponsors key setup and settlement for guest accounts | `packages/relayer`, `packages/sdk`; checks 5, 7 |
| Sub-accounts | Player accounts under the relayer, house bots and treasury under the arena | `deployments/testnet.json`; check 19 |
| `env::random_seed` | Match seed neither player chooses | `create_match`; check 2 |
| `env::ed25519_verify` | `post_prices` accepts only snapshots signed by the relayer key | `post_prices`; check 12 |
| Cross-contract call to OutLayer TEE price oracle (`price-oracle.testnet`) | `refresh_prices` pays the oracle for five prices; fighters' stat buffs come from them | `packages/contract/src/oracle.rs`; checks 14, 18 |
| In-place contract upgrade with `migrate` | Arena upgraded to add the oracle path without redeploying state | check 13 |
| Escrow and payouts | Stakes held by the arena, paid 92/3/5 on settle, weekly season pool 50/30/20 | checks 8, 15 |

## Honest limits

From [BLOCKED.md](BLOCKED.md) and the code:

- **No hosted app or relayer.** Both run locally. Guest account creation needs an operator-funded relayer (not part of the public reproduction path), and email sign-in codes need `RESEND_API_KEY`.
- **Wallet path:** the real-browser wallet runs (#17, #18, #21, #29) used a build-gated Wallet Selector signer with repo-owned testnet funds. Human Meteor popup approvals were not automated.
- **Not built:** NEAR Intents / 1Click stakes (mainnet only), USDC stake tiers, NEP-245 card tokens, mainnet deployment.
- **Stakes are 0.01 to 0.25 testnet NEAR.** Not audited.
- **Match #29's settle** was sent from a node script (`settleUntilDone`) after the in-app settle did not fire in time (see `deployments/mobile-battle-v4-2026-11-13.json`). The contract replay is the same either way.
- **Oracle:** the OutLayer TEE oracle is a third-party testnet service. `get_prices` shows which fighters use it; the relayer-signed path (check 12) is the fallback.
- **Prior work:** the game design, deterministic TypeScript simulation, bot and art come from earlier Mempire versions (README "Prior work"). The NEAR contract, relayer, SDK and web app on `main` are the new work.
- **Verifier scope:** checks 1 to 19 cover on-chain results and contract source. The browser UI and the sandbox suite are not exercised by `judge-verify.mjs`; use the steps above.
- Check 17 uses lower bounds (29+ matches) because the arena keeps counting.

## Repository map

- `packages/contract`: Rust arena (`lib.rs`), game engine port (`sim.rs`, `bot.rs`), oracle call (`oracle.rs`), unit and sandbox tests.
- `packages/sim`: TypeScript engine (reference for parity tests).
- `packages/sdk`: RPC, signer, NEP-366 delegates, settle runner.
- `packages/relayer`: sign-in, meta transactions, price keeper.
- `packages/web`: landing and game app.
- `scripts/`: deploy and live testnet runs that wrote `deployments/*.json`, plus `judge-verify.mjs`.
- `deployments/`: raw records of live runs.

## Rules compliance

- Built during the window: commits from the scaffold `1a17fb0` (2026-11-09); earlier Mempire work is disclosed in README "Prior work".
- Public repo and MIT licence (`LICENSE`).
- Demo post on X with the film: see `HACKATHON_SUBMISSION_FORM.md`.
- One submission per team, track `games`.
