# NEAR Hackathon submission form: Mempire on NEAR

Fields from https://nearhackathon.com/HACKATHON.md ("What the human decides"). Human fields stay TBD; nothing is submitted
without Nick's explicit yes.

| Field | Value |
|---|---|
| Project name | Mempire (TBD: Nick confirms) |
| Team lead's name | TBD by Nick |
| Contact email | TBD by Nick |
| Team size | TBD by Nick |
| Tracks | games (primary), nfts (secondary: TBD, cards are not tokenised yet, see BLOCKED.md) |
| NEAR mainnet payout account | TBD by Nick (never invented) |
| Public repository | TBD (Nick publishes) |
| Public demo post | TBD (Nick writes and posts) |
| Consent to contact notice | TBD: read verbatim to Nick |

## What we built (draft, under 2000 characters)

Mempire is a real-time 1v1 lane card battler. Two players stake testnet NEAR and drop fighters into two lanes as the clock
runs; market fighters (BTC, ETH, NEAR, SOL, ZEC) are buffed or nerfed by twice their 24 h price move, read at kick-off from
ed25519-signed relayer prices the contract verifies. The problem with on-chain real-time games is the result: earlier
Mempire builds trusted the two players' clients. On NEAR the chain is the referee. Every drop is a `play` transaction
signed by a per-match function-call key limited to `play` (no pop-ups, cannot move funds), and `settle` replays the stored
log through a Rust port of the deterministic TypeScript sim inside the contract, checkpointing across calls if gas runs
low. A testnet Rush match with 21 plays settled in one call for 22.3 TGas, and a fake winner claim was rejected on testnet.
Players sign in by email or as a guest; a relayer creates a sub-account for a key made in the browser and sponsors
NEP-366 meta transactions for session keys and settlement, so the stake is the only thing a player pays for. Three house
bots are sub-accounts with their own treasuries; the referee plays their published bot inside the replay. 3 % of each
pot funds a weekly season whose top three are paid automatically.
