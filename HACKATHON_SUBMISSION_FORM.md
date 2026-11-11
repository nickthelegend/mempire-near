# NEAR HACKATHON submission form: Mempire on NEAR

Draft only. Nick completes the human fields and reviews the exact values before submitting once.
Field names and choices follow the [official form contract](https://nearhackathon.com/HACKATHON.md).
Deadline: November 14, 2026, 23:59 UTC. The repository must be public by then.

| Field | Value |
|---|---|
| projectName | Mempire on NEAR |
| leadName | TBD Nick (2-80 characters) |
| email | TBD Nick (valid email, max 160 characters; max 2 submissions per email) |
| size | TBD Nick: one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` |
| tracks | Proposed: `["games"]` — Real-time coin fighters, market-driven stats and per-card NEAR transactions, with full-match referee replay and payout. |
| nearAddress | TBD Nick: NEAR MAINNET payout account (2-64 characters; named or implicit account). Do not use a testnet deployment account. |
| projectUrl | TBD: public GitHub repo URL after push (max 300 characters) |
| demoUrl | TBD: the public X post URL (max 300 characters) |
| idea | Every coin is a fighter. The market is the meta. Every move is a NEAR transaction. Mempire turns coins into fighters whose stats shift with signed market prices. Guests get a browser-held key and a relayer-created testnet account, choose eight free level-1 fighters and practise locally. In staked matches, each card drop is its own NEAR transaction, signed by a per-match function-call key restricted to play, with no wallet popups during the fight. The Rust referee replays the complete move log, checkpoints when needed and pays its result. Anyone can replay the match and compare the winner, final tick and state hash with the contract, then inspect the move and payout receipts. A running price keeper updates the lobby and cards; each match locks its opening modifiers. The desktop client puts market moves and real match standings beside the arena. The October Monad client, art and game design are disclosed prior work; the NEAR integration and proof are new. NFT minting, clans, chests and paid passes are not claimed. The demo runs locally on NEAR testnet. |
| consent | Nick ticks after reading: “I agree that the organizers may use these details to review our submission and contact us about this hackathon.” |

Idea character count: **1066**, including spaces and punctuation (allowed: 20-2000).
Project name character count: **15** (allowed: 2-80).
Track proposal is best-fit first; cards are not tokenised, so no `nfts` track is proposed.

## X post draft

The human posts this. The demo is local-only, so attach a video showing an action and its result; screenshots alone
are insufficient under Q-012. No video exists in `/Volumes/Extreme SSD/Projects/grokbot/videos/mempire-near/`.

```text
every coin is a fighter. the market is the meta. every move is a NEAR transaction. no wallet popups mid-fight. the referee replays the whole match before payout. built at NEAR HACKATHON @NEARProtocol #NEARHackathon
```

Post character count: **214** (limit: 280).

attach: video TBD

Before submission, Nick fills the other-project names in the README disclosure, publishes the repository, records
and posts the demo, and completes the fields above. Do not submit this draft or post on Nick's behalf.
