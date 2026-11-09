# Blocked or setup required

| Item | State | Needs |
|---|---|---|
| Email sign-in codes | Setup required (the UI says so and offers guest sign-in) | `RESEND_API_KEY` (and optionally `RESEND_FROM`) in `.env` for the relayer |
| NEAR Intents / 1Click any-chain stakes | Not built | Mainnet only (no testnet), and `NEAR_MAINNET_ACCOUNT` funded by Nick; out of scope for the testnet build |
| USDC (NEP-141) stake tiers | Not built | Stakes are NEAR only; a NEP-141 `ft_on_transfer` path would be the next contract change |
| NEP-245 card tokens | Not built | Every fighter is free to field; card ownership is not tokenised |
| Hosted web app and relayer | Not deployed | A host for `packages/web` (static) and `packages/relayer` (Node); both run locally today |
| Mainnet | Not deployed | Nick's decision and funds; prices would move to a mainnet oracle (Rhea, contract ID to verify) |
