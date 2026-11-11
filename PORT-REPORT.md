# Mempire Monad → NEAR port report

Implemented on `monad-client`; nothing was pushed. The original `packages/web`, NEAR contract, SDK, relayer and
shared simulation are unchanged from `main`. No new contract method or deployment was needed.

## Import and prior work

`b2b1749` imported 460 tracked source files byte-for-byte from `/Volumes/Extreme SSD/Projects/mempire-monad`,
revision `0e0b85ede703ec6d0d7f9f575abb2846071d9aa2`. The Monad work dates to October 5-14, 2026 and is baseline.
Screens, components, design, art, fonts, sound and the 3D rendering are reused. NEAR adapters and verification are the
new work. The source's current fighter renderer uses its existing sprites/billboards within the 3D scene.

The imported `src/styles`, `src/three`, `public/art`, `public/fonts`, `public/sfx` and `public/chars` have no diff from
that import. Changes to screens are chain data/actions, unsupported-feature labels and receipt links; no restyle.
`PORT-PLAN.md` records every source feature's mapping. README has the full prior-work disclosure and import/diff commands.

## What works on NEAR

| Flow | Verified behavior |
|---|---|
| Guest sign-in | Relayer-created named testnet sub-account for a browser-generated ed25519 key; actual balance read from NEAR |
| Starter loadout / cards | Eight selected free level-1 fighters, eleven supported fighters available; clearly not an NFT mint |
| Deck | Eight unique fighter IDs, source card frames, three saved browser loadout slots |
| Practice | Local 30-second Rush, rule-based bot, drag-to-deploy, source 3D arena, sound and result; no stake or recorded win |
| Staked Rush | Two browser profiles escrow 0.01 NEAR each; card drops are real `play` transactions |
| Session scope | Function-call access key restricted to arena `play`, 0.05 NEAR allowance; no card-drop wallet prompts |
| Queue recovery | Newer open match refunded before joining the older compatible match; saved queues resume after reload |
| Referee | Existing Rust replay settles the log; seat 0 tries first and seat 1 remains a fallback |
| Replay / receipt / proof | Winner, final tick and hash checked against the contract; correct settlement NearBlocks link and recorded transaction index |
| Empire / leaderboard | Settled match history, season points, wins, draws and net NEAR from arena reads; excludes practice |
| Prices | Existing signed relayer snapshot, stored match modifiers, stale/neutral labels; no Pyth/CRE writer claimed |
| Heartbeat | Real NEAR optimistic/final block reads; observed interval and timestamp lag, no fixed performance promise |

Both test accounts ended with one full-access device key and zero arena function-call keys. Account keys remain local;
none were printed or committed. Meteor Wallet is implemented and offered, but a real user's Meteor approval was not
automated. The verified live account path is Guest.

## Hidden or labelled

Mera/passkeys and locker, Privy, P256/staking precompiles, Pyth minting, NFT ownership, merges/upgrades, AUSD/MON pots,
$MEMPIRE, paid shop/chests, EIP-7702/paymaster, clans/war, paid season passes, Kimi and Envio are not claimed on NEAR.
Unavailable purchases and writes are hidden; clans and passes have explicit “not on NEAR yet” states. The existing
house/season contracts and original web screens remain available; this client has no dedicated house challenge or
standalone season screen. Hosting and mainnet are not deployed. See `BLOCKED.md`.

## Testnet evidence

Players: `port-a-3345.mempire-relay-41966.testnet` and `port-b-2681.mempire-relay-41966.testnet`.
They are team-created test accounts, not organic usage.

- Match #9: recovered from concurrent opens #9/#10; five stored plays, tick 600, hash 2912743809, seat 0 won.
- Match #11: recovered from #11/#12; six stored plays, tick 600, hash 2064331241, seat 0 won.
- Each paid 0.0184 NEAR to the winner, 0.0006 to the season and 0.001 to treasury.
- A redundant #9 settlement was rejected after the other seat settled it. Its failed receipt is retained. The subsequent
  full #11 run had zero console/page errors after coordinating automatic settlement.

| Action | Exact testnet transaction |
|---|---|
| Refund #10 | [8DnbrbMcpD7Ls8U9B3L5EAs25AaxDwx8yUNAZfxs9CF](https://testnet.nearblocks.io/txns/8DnbrbMcpD7Ls8U9B3L5EAs25AaxDwx8yUNAZfxs9CF) |
| Join #9 after refund | [H2QYuvy7jmabnktUHMa3XC25shmNc6WcicPZj6NB354j](https://testnet.nearblocks.io/txns/H2QYuvy7jmabnktUHMa3XC25shmNc6WcicPZj6NB354j) |
| Settle #9 | [iL7xs5yvuM3whx4EVH3B5buRZVUb7cyyAge1BiDoCpM](https://testnet.nearblocks.io/txns/iL7xs5yvuM3whx4EVH3B5buRZVUb7cyyAge1BiDoCpM) |
| Refund #12 | [39qD8cJU8UwBLXeT57DjZ1J9Jq8C2FC1s77LFhKDvVCm](https://testnet.nearblocks.io/txns/39qD8cJU8UwBLXeT57DjZ1J9Jq8C2FC1s77LFhKDvVCm) |
| Join #11 after refund | [99RJqxRyvKBbBfd56xEfB1c155KUeCXpdDnjR8JyXA55](https://testnet.nearblocks.io/txns/99RJqxRyvKBbBfd56xEfB1c155KUeCXpdDnjR8JyXA55) |
| Settle #11 | [BckAqcnpP7xY1WX4QkxmgoajmwSE1z6YgL9NvG6VWW7](https://testnet.nearblocks.io/txns/BckAqcnpP7xY1WX4QkxmgoajmwSE1z6YgL9NvG6VWW7) |
| Delete player A key #11 | [8vVAAvC3ryURzgA4kWCxMssc3hE4Wf5zHPHFgyPaTYGu](https://testnet.nearblocks.io/txns/8vVAAvC3ryURzgA4kWCxMssc3hE4Wf5zHPHFgyPaTYGu) |
| Delete player B key #11 | [4BuyRvidcEVComAGXVXUqj2qqUGA3KBetu9LmqLAYFh2](https://testnet.nearblocks.io/txns/4BuyRvidcEVComAGXVXUqj2qqUGA3KBetu9LmqLAYFh2) |

Full outcomes, stored plays, replay results, access-key counts and cumulative ledger:
[match 9](deployments/monad-client-match-9-2026-11-11.json),
[match 11](deployments/monad-client-match-11-2026-11-11.json).

## Budget

Confirmed new guest funding: 0.30 NEAR. Conservative accounting also reserves 0.15 for the first interrupted attempt,
0.02 for its possible gas, counts all 0.06 NEAR of recorded stake attachments again, and includes the recorded gas.
The resulting upper bound is 0.5528592110733342 NEAR, below the 3 NEAR cap. This intentionally overcounts recycled
stakes; it is not a claim that all of that amount was spent. The final screenshot confirmation was read-only.

## Validation and screenshots

- `pnpm test`: 32 JavaScript tests passed (4 sim, 5 SDK, 2 relayer, 9 original web, 12 port adapter).
- `pnpm typecheck`: all workspace checks passed.
- `pnpm --filter @mempire/app build`: passed. Existing bundle-size/dependency warnings do not block the build.
- Final full browser loop: 30 screenshots at 1440×900 and 375×900; zero console/page errors and horizontal overflow.
- Final read-only confirmation: 24 screenshots; zero console/page errors, zero document/main horizontal overflow,
  zero transaction writes; #11 receipt points to its own successful settlement hash.
- Before screenshots cover the unmodified imported screens at both widths. Battle/result baseline uses a source-only
  local simulation fixture, with no transaction. The source design detector returned no findings.

All Playwright runs used the requested `withChromeLock`. Swap was checked before builds/browser work, with at least
500 MB free required. Builds ran one at a time. All task-started servers and browsers were stopped; ports 5390 and 5399
were checked clear. Port 8787 was never used.

Screenshots and sanitized browser logs:
`/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-port/`.

Open the local [before/after gallery](/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/mempire-port/index.html). It links each captured screen at both widths.
`final-live-result.json` records the full loop and `readonly-qa.json` records the final confirmation. The older
`resumed-result.json` retains the historical #9 redundant-call console error instead of hiding it.

## Documentation

Updated README try-it steps and prior-work disclosure, TESTING, BLOCKED and the submission form. The proposed track
remains `games`. The updated idea is 1,013 characters. Human submission fields, public repository/X URLs and the NEAR
demo video remain for Nick; no submission, publication, push or mainnet action was performed.
