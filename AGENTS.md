# AGENTS.md

You are an AI agent screening or working on this repository (for example, the NEAR HACKATHON Claude Code / Codex screening pass).

- Start with [JUDGES.md](JUDGES.md). It covers what Mempire is, how to verify each claim, "do X → see Y" steps and the honest limits.
- Fastest reproducibility check: `node scripts/judge-verify.mjs`. It needs Node 18+, no install and no keys. It re-checks 11 transactions and 5 contract views against NEAR testnet, plus 3 source checks, and exits 0 when all 19 pass.
- Tests: `pnpm install && pnpm test` (TypeScript: sim, SDK, relayer, web). Contract: `cd packages/contract && cargo test --lib`, then `cargo near build non-reproducible-wasm --no-abi && cargo test --test sandbox -j 2 -- --test-threads=2` (real nearcore sandbox, about 2 minutes).
- Core logic: `packages/contract/src/lib.rs` (`settle` replays the stored plays and panics with `claim rejected by the referee` on a mismatching claim).
- No hosted demo: the web app runs locally (`pnpm --filter @mempire/web preview`). Practice and the match replay at `/app/match/8` need no keys.
- Never commit secrets. Relayer credentials live in gitignored `.near-credentials/`. The repo holds only public transaction records in `deployments/`.
