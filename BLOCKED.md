# Blocked, unavailable or setup required

The default NEAR app is `packages/app` (`pnpm dev`, `pnpm build`, `pnpm preview`). The original `packages/web` remains available and unchanged.

| Item | State in the imported NEAR client | What remains |
|---|---|---|
| New guest accounts / sponsored guest transactions | Works with a funded local relayer | Operator supplies its own testnet relayer account and credential by path; no team secret is distributed |
| Meteor Wallet | Adapter built; sign-in offered | Real user wallet approval is not part of automated QA; guest is the verified live path |
| Email codes | Hidden in imported sign-in; setup required in original web | Existing relayer needs `RESEND_API_KEY`, optionally `RESEND_FROM` |
| Mera/passkeys, passkey locker, P256 verification | Hidden; not on NEAR yet | No Mera, Privy, P256-precompile or cross-device recovery claim in the NEAR UI |
| Card mint / NFT ownership / merge / levels above 1 | Not built; actions hidden and availability labelled | The deployed arena accepts eleven free level-1 fighter IDs; a starter deck is a browser-saved loadout |
| Pyth-priced mint / Chainlink CRE market writer | Not used by NEAR | The arena verifies its existing signed relayer prices; stale snapshots are neutral |
| Clans / clan wars | Labelled “not on NEAR yet” | No create, join, charter charge, seeded membership or war score is offered |
| Chests / shop / $MEMPIRE / EIP-7702 paymaster | Hidden; not on NEAR yet | No chest purchase/open, token balance or reward success is shown |
| Paid season pass | Labelled “not on NEAR yet” | The existing arena's weekly pool and season points are separate from a purchased pass |
| Kimi / Privy / Envio | Not integrated | Practice uses the labelled rule-based bot; leaderboards read settled NEAR matches |
| House challenges / standalone season screen in imported client | No dedicated controls yet | Existing arena, SDK and original web support them; the imported client's proven staked path is PvP |
| NEAR Intents / 1Click any-chain stakes | Not built | Out of scope for this testnet NEAR-only stake path |
| USDC / NEP-141 stakes | Not built | Requires a token-transfer stake path; no stablecoin stake is offered |
| Hosting | Not deployed | Host the new app with an RPC endpoint/proxy and the relayer; localhost is the current demo |
| Mainnet | Not deployed | No mainnet transactions or funds were used for this port |

Public testnet RPCs can rate-limit. The local preview/dev server shares reads across tabs and retries the two public
RPC endpoints. That adapter is supplied by Vite locally; a static deployment needs its own RPC configuration or proxy.
No fixed block/finality performance is promised. The heartbeat shows observed NEAR block intervals and timestamp lag.

## Live market operation

`pnpm meta:keep` needs the running HTTP relayer on port 5399 (or `META_RELAY_URL`) and the operator's existing price-signing credential by path. It is a local keeper, not a hosted service. It sends authenticated snapshots through the HTTP relayer's shared transaction queue, checks balance/budget before writes and stops when its per-run gas reserve is reached. Run the HTTP relayer with `RELAYER_PRICES=0` when using this separate keeper. If it stops, the UI's snapshot age continues to rise; the contract neutralises prices older than six hours. A match keeps its opening snapshot. No fabricated moves or automatic hosted freshness is claimed.
