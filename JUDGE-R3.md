# JUDGE-R3 — Mempire on NEAR (strict self-review, November 13, 2026)

Scored against the NEAR HACKATHON screening contract (<https://nearhackathon.com/HACKATHON.md>): Claude Code / Codex
screening checks reproducibility ("do X - see Y" README steps), verifies the claimed features, and writes a preliminary
score; humans decide (Q-017). Local-only demos are allowed with a public repo, a reproducible README and an X post
with video (Q-012). Prior work must be disclosed and only the NEAR integration built in the window is judged (Q-002/5).

| Criterion | Evidence | Score |
|---|---|---|
| Reproducible from the README | `pnpm install`, build, preview; practice needs no account; receipt replay of a stored match needs no signing; staked play with Meteor or the operator relayer | 9 |
| Claimed features verifiable on testnet | Every card drop is a `play` call from a per-match function-call key; the arena contract replays the stored log and pays 92/5/3; receipts replay in the browser and compare winner, tick and state hash. Film match #29: 8/8 drops accepted, one enemy tower down, player won, settled, replay Verified, key deleted (hashes in `deployments/mobile-battle-v4-2026-11-13.json`) | 9 |
| NEAR fit | Function-call keys scoped to `play` (no pop-ups during a match), contract-side deterministic referee with gas checkpoints, house sub-accounts with treasuries, NEP-366 sponsored onboarding, signed price snapshots verified with ed25519 | 9 |
| Product quality (UI) | Approved sky-blue app; v4 battle is a full-height mobile-game stage with big cards, drag-to-lane, visible fights, live chain feed; liveness from real chain reads | 8.5 |
| Honesty / disclosure | Prior Mempire repos disclosed; Monad client excluded; testnet only; every film take (#22–#29: two wins, four losses, two abandoned) is recorded with its hashes, not hidden | 9 |
| Tests | 30 automated JS tests (sim 4, SDK 5, relayer 3, web 18 incl. new drag/stage tests) + Rust sandbox suite on a real nearcore | 8.5 |

**Preliminary R3 score: 8.9 / 10.**

What would still cost points with a strict human judge:
- No hosted demo (local-only, allowed by Q-012 but a hosted demo is a plus).
- Card drops can be refused when public RPCs rate-limit (the arena rejects plays that land more than 5 s after their tick, by design). The default RPC list now avoids the deprecated endpoint, but a paid RPC would make live play smoother.
- Physical-phone play and 60 fps were not benchmarked; touch was exercised through browser emulation.
- The filmed drags were driven by a Playwright script that chose drop timing from the match's published seed and the deterministic house bot; every drop was still a real `play` transaction refereed by the contract (disclosed in REPORT.md).
