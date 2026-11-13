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
| idea | Mempire on NEAR is a coin-fighter card battler with a sky-blue game app, eleven free fighters and an eight-card deck. Pick a practice rival and play a free local Rush on a full-height portrait field. Drag a card into a highlighted lane or tap to place it; a ghost previews the drop, with tower health, damage and refilling energy visible. In staked play, each card drop is a NEAR transaction signed by a per-match function-call key, with no wallet popups during the fight. The Rust referee contract replays the stored moves, checkpoints across calls when needed and pays its result. The receipt page replays the log in the browser and compares the winner, final tick and state hash with the contract. Signed Coinbase price snapshots buff or nerf market fighters; a local keeper refreshes them each epoch. The app also has card pages, a podium leaderboard, player profiles, funded house opponents and seasons. Optional Meteor Wallet lets players sign play-key setup, stakes, settlement and key deletion with their own testnet account, without an operator relayer. Guest sign-in retains NEP-366 sponsorship. Prior work includes mempire (Solana), mempire-arc, mempire-monad (October 5-14, 2026), mempire-clockin and mempire-wif; shared game foundations are baseline. The market-price keeper on main was written November 11, inside the NEAR window. The imported Monad client lives only on branch monad-client and is NOT the submitted app. This submission uses the approved sky-blue packages/web app on main; the NEAR integration is new work in the hackathon window. The demo runs locally on testnet. Cards are not NFTs. |
| consent | Nick ticks after reading: “I agree that the organizers may use these details to review our submission and contact us about this hackathon.” |

Idea character count: **1615**, including spaces and punctuation (allowed: 20-2000).
Project name character count: **15** (allowed: 2-80).
Track proposal is best-fit first; cards are not tokenised, so no `nfts` track is proposed.

[Prior-work inventory and provenance](README.md#prior-work): four earlier public repositories were accessible at the November 12 check. `mempire-wif` is also disclosed as the verified local import baseline; its public GitHub URL returned 404. The keeper is November NEAR work, and the imported Monad UI is excluded from this submission.

## X post draft

The human posts this. The demo is local-only, so attach a video showing an action and its result; screenshots alone
are insufficient under Q-012. The v4 film (2:46, no subtitles, gameplay first) shows the full-height mobile-game battle, a won testnet match #29 with a tower falling (each card drop a transaction), the Victory result, the Verified receipt, NearBlocks Lite views of the stake, two drops and the settlement, the podium and profile. The development test signer, the scripted drags and local hosting are disclosed in REPORT.md.

```text
can you trust a staked game result? mempire replays every move inside a NEAR contract before payout. built at NEAR HACKATHON on testnet. try practice + verify a match locally via the repo README. feedback welcome @NEARProtocol #NEARHackathon
```

Post character count: **241** (limit: 280).

attach: /Volumes/Extreme SSD/Projects/grokbot/videos/mempire-near/mempire-near-film-share.mp4

Before submission, Nick fills the other-project names in the README disclosure, publishes the repository, reviews
and posts the completed demo, and completes the fields above. Do not submit this draft or post on Nick's behalf.
