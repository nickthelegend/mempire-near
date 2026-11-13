// SPDX-License-Identifier: MIT
// One-off probe of OutLayer's TEE price oracle on testnet (price-oracle.testnet): does a paid
// request_price_data / request_custom_data succeed today, and what does it cost? Signs from the
// Mempire relayer account only. Prints hashes, results and balance deltas; never a key.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { view } from '@mempire/sdk';
import { ROOT, RPC, signer, balanceNear, txUrl, loadEnv } from './lib';
import { fnCall } from '@mempire/sdk';

loadEnv();
const ORACLE = 'price-oracle.testnet';
const ACCOUNT = process.env.RELAYER_ACCOUNT || 'mempire-relay-41966.testnet';
const ASSETS = ['nbtc.bridge.near', 'aurora', 'wrap.near', '22.contract.portalbridge.near', 'zec.omft.near'];
const SYMBOLS = ['BTC', 'ETH', 'NEAR', 'SOL', 'ZEC'];
const mode = process.argv[2] ?? 'price';

const s = signer(ACCOUNT);
const before = await balanceNear(ACCOUNT);
let hash = '';
const keep = (h: string) => { hash = h; };
const go = (p: Promise<unknown>) => p.catch((e) => { if (!hash) throw e; });
if (mode === 'price') {
  await go(s.send(ORACLE, [fnCall('request_price_data', { asset_ids: ASSETS }, 300, 20_000_000_000_000_000_000_000n)], keep));
} else {
  const custom_data_request = SYMBOLS.map((sym) => ({
    id: `${sym}:open24h`,
    token_id: '',
    source: { custom: { url: `https://api.exchange.coinbase.com/products/${sym}-USD/stats`, json_path: 'open', value_type: 'number', method: 'GET', headers: [] } },
  }));
  await go(s.send(ORACLE, [fnCall('request_custom_data', { custom_data_request }, 300, 20_000_000_000_000_000_000_000n)], keep));
}
// OutLayer answers through yield/resume, so the full receipt chain can take a while.
const final = await s.waitFor(hash, 240_000);
const after = await balanceNear(ACCOUNT);
const data = await view(RPC, ORACLE, 'get_price_data', { asset_ids: ASSETS });
const rec = { mode, account: ACCOUNT, hash, url: txUrl(hash), ok: final.ok, error: final.error, value: final.value, logs: final.logs, gasBurntTgas: Number(final.gasBurnt / 10n ** 12n), balanceBefore: before, balanceAfter: after, costNear: +(before - after).toFixed(4), priceDataAfter: data, at: new Date().toISOString() };
console.log(JSON.stringify(rec, null, 2));
writeFileSync(resolve(ROOT, `deployments/oracle-probe-${mode}-${Date.now()}.json`), JSON.stringify(rec, null, 2) + '\n');
