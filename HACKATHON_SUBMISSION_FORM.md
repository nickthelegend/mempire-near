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
| idea | Real-time games with staked pots need a result players can trust. Earlier Mempire builds paid out when both clients agreed, so colluding clients could report a false result. Mempire on NEAR is a real-time lane card battler where players stake testnet NEAR and submit card drops through per-match function-call keys. The arena contract replays the stored moves through a Rust simulation, checkpoints when gas runs low, and pays from the replayed result. A browser replay lets anyone compare the result hash. Signed relayer prices adjust market fighters; house bots have funded sub-accounts, and part of each pot funds season rewards. NEP-366 meta transactions sponsor session-key management and settlement. The game builds on prior Mempire work; the NEAR integration is new. The contracts are deployed on testnet. The web app and relayer run locally; practice and recorded-match replay need no sign-in. |
| consent | Nick ticks after reading: “I agree that the organizers may use these details to review our submission and contact us about this hackathon.” |

Idea character count: **901**, including spaces and punctuation (allowed: 20-2000).
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
