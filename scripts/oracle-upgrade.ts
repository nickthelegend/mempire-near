// SPDX-License-Identifier: MIT
// Upgrade the live testnet arena in place to the OutLayer-oracle build: one transaction with
// DeployContract + migrate(oracle, assets). Every match, play, season and stat is kept. Signs with
// the arena account's own key (read from .near-credentials, never printed).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { actionCreators } from '@mempire/sdk';
import { view } from '@mempire/sdk';
import { fnCall } from '@mempire/sdk';
import { ROOT, RPC, signer, balanceNear, txUrl, loadEnv } from './lib';

loadEnv();
const ARENA = process.env.ARENA_ACCOUNT!;
const ORACLE = process.env.PRICE_ORACLE || 'price-oracle.testnet';
const ASSETS: [string, string][] = [['BTC', 'nbtc.bridge.near'], ['ETH', 'aurora'], ['NEAR', 'wrap.near'], ['SOL', '22.contract.portalbridge.near'], ['ZEC', 'zec.omft.near']];
if (!ARENA) throw new Error('Set ARENA_ACCOUNT (see .env.example).');

const wasm = readFileSync(resolve(ROOT, 'packages/contract/target/near/mempire_arena.wasm'));
const sha = createHash('sha256').update(wasm).digest('hex');
const before = { balance: await balanceNear(ARENA), totals: await view(RPC, ARENA, 'get_totals'), prices: await view(RPC, ARENA, 'get_prices') };
const s = signer(ARENA);
let hash = '';
await s.send(ARENA, [actionCreators.deployContract(new Uint8Array(wasm)), fnCall('migrate', { oracle: ORACLE, assets: ASSETS }, 100)], (h) => { hash = h; }).catch((e) => { if (!hash) throw e; });
const out = await s.waitFor(hash, 180_000);
if (!out.ok) throw new Error(`upgrade failed: ${out.error} (tx ${hash})`);
const after = { balance: await balanceNear(ARENA), totals: await view(RPC, ARENA, 'get_totals'), prices: await view(RPC, ARENA, 'get_prices'), oracle: await view(RPC, ARENA, 'get_oracle') };
const rec = { network: 'testnet', arena: ARENA, oracle: ORACLE, assets: ASSETS, wasmSha256: sha, wasmBytes: wasm.length, hash, url: txUrl(hash), logs: out.logs, before, after, at: new Date().toISOString() };
writeFileSync(resolve(ROOT, `deployments/oracle-upgrade-${rec.at.slice(0, 10)}.json`), JSON.stringify(rec, null, 2) + '\n');
console.log(JSON.stringify({ hash, url: rec.url, logs: out.logs, balanceBefore: before.balance, balanceAfter: after.balance, totalsKept: JSON.stringify(before.totals) === JSON.stringify(after.totals) }, null, 2));
