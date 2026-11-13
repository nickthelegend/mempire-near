# Blocked or setup required

| Item | State | Needs |
|---|---|---|
| Email sign-in codes | Setup required (the UI says so and offers guest sign-in) | `RESEND_API_KEY` (and optionally `RESEND_FROM`) in `.env` for the relayer |
| NEAR Intents / 1Click any-chain stakes | Not built | Mainnet only (no testnet), and `NEAR_MAINNET_ACCOUNT` funded by Nick; out of scope for the testnet build |
| USDC (NEP-141) stake tiers | Not built | Stakes are NEAR only; a NEP-141 `ft_on_transfer` path would be the next contract change |
| NEP-245 card tokens | Not built | Every fighter is free to field; card ownership is not tokenised |
| Hosted web app and relayer | Not deployed | A host for `packages/web` (static) and `packages/relayer` (Node); both run locally today |
| Mainnet | Not deployed | Nick's decision and funds; prices would move to a mainnet oracle (Rhea, contract ID to verify) |

## R3 wallet path status

The optional Meteor Wallet path is implemented on testnet. It signs player-owned play-key setup, smallest-tier house stakes, referee settlement and deletion without operator sponsorship. The two real browser runs, #17 and #18, used a build-gated Wallet Selector QA signer and verified receipt replays. This path is not BLOCKED by AddKey action support: the Meteor action codec round-trip and actual testnet AddKey/settle/DeleteKey flows passed. Human Meteor popup/extension approvals were not automated. Wallet cancellation or a popup failure is surfaced as an error rather than a successful transaction; cancelled cleanup can be retried by reopening the match.

Guest account creation still needs the configured relayer and email still needs provider setup. These requirements do not apply to an already funded wallet player's house match. [R3 results and limits](FLOW-QA.md#r3--own-wallet-house-matches-on-the-approved-app).

## OutLayer TEE oracle upgrade (paused Nov 13 21:45 UTC on memory pressure)

Done and live on testnet: the arena was upgraded in place (tx BYAeK1sBRzLS3GpkWhCb7N8HRykhhj8FP49asWcXhvzS) and `refresh_prices` priced all five market fighters through `price-oracle.testnet` / OutLayer TEE (tx 698XRi9xyBMPfyMj9yTtYm3C5vXwgnxjcVQsQuXG4n8m). The app labels each fighter "Priced by OutLayer TEE oracle". Contract unit, sandbox and web tests pass.
Not done yet: the 390px QA screenshot of the market table, README/TESTING/FLOW-QA updates, and the film v5 oracle scene (app plus explorer). The old film `videos/mempire-near/mempire-near-film.mp4` is unchanged.
