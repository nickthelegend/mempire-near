# Mempire Monad client → NEAR port plan

Historical import plan, completed through `c1eec03`. The owner later approved the desktop market/proof layout and positioning documented in [REPOSITION-REPORT.md](REPOSITION-REPORT.md); the source import remains disclosed baseline.

Source: `/Volumes/Extreme SSD/Projects/mempire-monad`, revision
`0e0b85ede703ec6d0d7f9f575abb2846071d9aa2`. The Monad client was built October 5-14, 2026;
its screens, art, fonts, audio, Three.js rendering and game design are prior work.
Import tracked `app/` verbatim to `packages/app/`, with needed `shared/` alongside it in `packages/shared/`,
in a separate commit before adapting anything. Do not copy credentials, build output or dependencies.
Keep `packages/web/` intact. All work is on `monad-client`; never push or modify `.loom/`.

| Monad feature | NEAR implementation / honest availability |
|---|---|
| Mera passkey / passkey sessions | Hide Mera and passkey assertions. Guest accounts already use the relayer; add Meteor Wallet through NEAR Wallet Selector, testnet only. No MyNearWallet. |
| Guest account | Existing relayer creates a funded testnet sub-account for an ed25519 key generated and held by this browser. Display account and balance from NEAR. No invented guest balance. |
| Starter deck mint | No card ownership/mint method exists in the NEAR arena. Offer the contract-supported free level-1 roster and save an eight-fighter starter loadout locally. Label it a free loadout, not NFTs or a mint. |
| Cards / collection / levels / merge | NEAR arena validates fighter IDs; every fighter is free, level 1. Keep card art and collection screens for supported fighters. Hide mint/merge actions; explain that ownership and upgrades are not on NEAR yet. |
| Pyth mint / eligibility | Hide. No NFT mint or Pyth integration on NEAR. Do not show a successful mint. |
| Deck builder / slots | Keep eight unique supported fighter IDs and local saved slots; use deployed NEAR roster IDs and exact contract archetypes/traits for staked play. |
| Arena / per-card transactions | Reuse deployed `play(id,tick,deck_index,x,y)`, recorded log and SDK MatchRunner. Per-match function-call access key limited to arena `play`, finite allowance, removed after match; no play-time wallet popups. |
| Staked 1v1 | Existing `create_match` / `join_match`; NEAR-only stakes from deployed config. Reuse NEP-366 sponsorship for key management and settlement. Show failures; never silently fall back to an unstaked match. |
| Practice bot | Local, no stake or rewards. Preserve 3D scene, drag controls, tutorial and sound; use the exact NEAR sim for compatible battle data. |
| House bots | Existing `get_houses` / `challenge_house`; optional solo staked path with the arena's published bot. Match existing stakes and treasury availability. |
| Settlement / timeouts | Existing Rust referee `settle`, resumable checkpoints; pays 92% to winner (split on draw), 3% season, 5% treasury. No two-client claim agreement or fake local credit. Cancel only an unjoined match. |
| Market meta buffs / nerfs | Existing ed25519-signed relayer prices and `get_prices`; match modifiers come from stored kick-off snapshot. Label source and stale/neutral states. No fabricated quotes or CRE/Pyth claims. |
| Clans / clan wars | Label not on NEAR yet; disable create/join/war actions. No seeded clan or war presented as real. |
| Chests / EIP-7702 / paymaster | Hide chest purchases/open/skip and token balances. Label rewards not on NEAR yet. NEP-366 sponsors only methods the existing relayer allows. |
| Season pass | Label not on NEAR yet. Existing weekly season pool/points/payouts may be shown as such; not a purchased pass. |
| Empire / leaderboards | Read settled arena matches and `get_player` / season views; exclude local practice and any imported rating fixtures. No AUSD/MON/$MEMPIRE accounts or balances. |
| Proof / receipt / replay / live spectating | Use stored NEAR match/play log, exact SDK replay hash comparison, deployment evidence and nearblocks links. Preserve imported replay rendering; settled verification must compare with the Rust referee. |
| Network heartbeat | Poll real NEAR optimistic/final blocks. Display observed block interval/finality lag, no Monad block stages, fixed timing claims, staking/P256 precompile or EIP-7702 claims. |
| Passkey locker / Privy / Kimi / indexer / shop | Hide unavailable external services and Monad signing paths. Keep local audio/settings; explain unsupported routes without fake success. |

## Execution and verification

1. Commit this plan, then a byte-for-byte source import with the requested import title and AI co-author trailer.
2. Before changing UI, run the unmodified imported client and capture all reachable screens at 1440 and 375.
   After chain adaptation, capture the same widths, plus onboarding, battle and result states. Store all evidence in
   `/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-port/`.
3. Swap chain/account/relay/state bindings to existing NEAR SDK and simulation. Keep source CSS, art, fonts and scene geometry.
   Changes to screen copy/controls are limited to chain truth and hiding unsupported functionality.
4. Use one build at a time. Before builds/browser QA, check `sysctl vm.swapusage`; wait while free swap is below 500 MB.
   Use free ports 5300-5999, never 8787; Playwright must run under the shared `withChromeLock`.
5. Exercise guest → free starter loadout → deck → practice → staked match → referee settlement → proof → leaderboard.
   Total new testnet NEAR expenditure capped at 3 NEAR, including onboarding transfers/stakes/gas. Reuse deployed contracts;
   no redeployment is planned. Credentials are read only by runtime from paths and never printed or committed.
6. Record new real transaction hashes in `deployments/`; update README, TESTING, BLOCKED and submission idea.
   Write PORT-REPORT with working/hidden features, real evidence, screenshot path and any remaining limitations.
7. Commit integration, verification and documentation after each step with `Co-Authored-By: Codex <noreply@openai.com>`.
   Stop only processes started for this task; do not push.
