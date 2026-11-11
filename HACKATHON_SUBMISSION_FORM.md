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
| tracks | Proposed: `["games"]` — Real-time card battles with testnet NEAR stakes, contract-replayed results, funded house bots and season payouts. |
| nearAddress | TBD Nick: NEAR MAINNET payout account (2-64 characters; named or implicit account). Do not use a testnet deployment account. |
| projectUrl | TBD: public GitHub repo URL after push (max 300 characters) |
| demoUrl | TBD: the public X post URL (max 300 characters) |
| idea | Real-time games with staked pots need a result players can trust. Mempire on NEAR brings the prior Mempire Monad game client, with its 3D lane arena and drag-to-deploy cards, to an existing NEAR testnet referee. Guests receive a browser-held key and a relayer-created sub-account, then choose eight free level-1 fighters. Practice runs locally. In staked matches, every card drop is recorded through a per-match function-call key limited to play. The Rust contract replays the stored moves, checkpoints across calls when needed, and pays its result. Browser replay compares the winner, final tick and state hash with the referee. NEP-366 sponsors permitted guest key management and settlement; signed relayer prices adjust market fighters. The game client, art and game design predate November 1 and are disclosed as baseline. The NEAR contracts, account/transaction adapters, settlement and proof are the new integration. NFT minting, clans, chests and paid passes are not claimed on NEAR. The demo runs locally. |
| consent | Nick ticks after reading: “I agree that the organizers may use these details to review our submission and contact us about this hackathon.” |

Idea character count: **1013**, including spaces and punctuation (allowed: 20-2000).
Project name character count: **15** (allowed: 2-80).
Track proposal is best-fit first; cards are not tokenised, so no `nfts` track is proposed.

## X post draft

The human posts this. The demo is local-only, so attach a video showing an action and its result; screenshots alone
are insufficient under Q-012. No video exists in `/Volumes/Extreme SSD/Projects/grokbot/videos/mempire-near/`.

```text
can you trust a staked game result? mempire replays every move inside a NEAR contract before payout. built at NEAR HACKATHON on testnet. try practice + verify a match locally via the repo README. feedback welcome @NEARProtocol #NEARHackathon
```

Post character count: **241** (limit: 280).

attach: video TBD

Before submission, Nick fills the other-project names in the README disclosure, publishes the repository, records
and posts the demo, and completes the fields above. Do not submit this draft or post on Nick's behalf.
