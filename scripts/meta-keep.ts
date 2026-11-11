// SPDX-License-Identifier: MIT
// Uses the same signed Coinbase snapshot as the HTTP relayer, without starting a server.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { KeyPair } from 'near-api-js';
import { ArenaReader, fnCall, parseNear, rpc, viewAccount } from '@mempire/sdk';
import { fetchSnapshot, signSnapshot } from '../packages/relayer/src/prices';
import { CREDS, loadEnv, network, signer, sleep } from './lib';

loadEnv();
const net = network();
const account = process.env.RELAYER_ACCOUNT;
if (!account || !net.arena) throw new Error('Set RELAYER_ACCOUNT and ARENA_ACCOUNT (see .env.example).');
const key = KeyPair.fromString(JSON.parse(readFileSync(resolve(CREDS, 'price-relayer.json'), 'utf8')).private_key);
const reader = new ArenaReader(net);
const writer = signer(account);
const once = process.argv.includes('--once');
const epochMs = 600_000;
const budget = BigInt(parseNear(process.env.META_BUDGET_NEAR || '0.05'));
// Stop before another write when the per-run budget cannot cover a conservative gas reserve.
const reserve = BigInt(parseNear('0.003'));
let spent = 0n;
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
const evidenceFile = resolve(`deployments/market-meta-${new Date().toISOString().slice(0, 10)}.json`);
while (!stopping) {
  try {
    const prices = await reader.prices();
    const latest = Math.max(0, ...prices.prices.map(p => Number(p.ts_ms)));
    if (Math.floor(latest / epochMs) < Math.floor(Date.now() / epochMs)) {
      const before = await viewAccount(net.rpc, account);
      if (spent + reserve > budget || BigInt(before.amount) < BigInt(parseNear('0.05'))) throw new Error('Price keeper budget/balance reserve reached; stopping.');
      const rows = await fetchSnapshot();
      const out = await writer.send(net.arena, [fnCall('post_prices', signSnapshot(key, rows), 30)]);
      const raw = await rpc<{ transaction_outcome: { outcome: { tokens_burnt: string } }; receipts_outcome: { outcome: { tokens_burnt: string } }[] }>(net.rpc, 'tx', { tx_hash: out.hash, sender_account_id: account, wait_until: 'FINAL' });
      const gas = BigInt(raw.transaction_outcome.outcome.tokens_burnt) + raw.receipts_outcome.reduce((n, r) => n + BigInt(r.outcome.tokens_burnt), 0n);
      spent += gas;
      const history = existsSync(evidenceFile) ? JSON.parse(readFileSync(evidenceFile, 'utf8')) : { network: 'testnet', arena: net.arena, source: prices.source, transactions: [] };
      history.transactions.push({ at: new Date().toISOString(), hash: out.hash, url: `${net.explorer}/txns/${out.hash}`, ok: out.ok, error: out.error ?? null, sender: account, tokensBurnt: gas.toString(), balanceBefore: before.amount, snapshot: await reader.prices() });
      writeFileSync(evidenceFile, JSON.stringify(history, null, 2) + '\n');
      console.log(JSON.stringify({ action: 'post_prices', ok: out.ok, hash: out.hash, gasNear: Number(gas) / 1e24, runGasNear: Number(spent) / 1e24 }));
      if (!out.ok) throw new Error(out.error || 'Price post failed');
    } else console.log('Current ten-minute epoch already has a signed snapshot.');
    if (once) break;
    // Check once a minute. Failed fetches retry next minute, never overlap or fabricate prices.
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'Price keeper failed');
    if (once || String(e).includes('reserve reached')) { process.exitCode = 1; break; }
  }
  for (let i = 0; i < 60 && !stopping; i++) await sleep(1000);
}
