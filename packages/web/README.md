# Mempire app wiring

Vite reads `VITE_CHAIN=fork` for the local Anvil fork on port 8547 or `VITE_CHAIN=mainnet` for Robinhood Chain (4663). `VITE_RPC_URL` overrides the chain RPC. The deployment loader reads `deployments/<chainId>.json` at the repository root; the Vite build copies available deployments into `dist/deployments`.

From the repository root, run `pnpm --filter app dev` on port 4610 or `pnpm --filter app build` followed by `pnpm --filter app preview` on 4611. Use `VITE_CHAIN=fork` for both build and dev when testing against Anvil. The fork funding button only appears in fork mode and verifies the RPC chain ID before impersonating holders.

For the browser regression, start one Anvil on 8547, deploy the arena, build with `VITE_CHAIN=fork`, start preview on 4611, then run `pnpm exec tsx scripts/e2e-browser-fork.mjs`. It saves screenshots under `.shots/` and chain evidence under `docs/evidence/browser-e2e.json` after a successful settlement.
