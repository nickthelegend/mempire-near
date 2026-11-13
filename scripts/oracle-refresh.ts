// SPDX-License-Identifier: MIT
// Keep fighter prices fresh from OutLayer's TEE price oracle. Each run sends one
// arena.refresh_prices() transaction (0.02 NEAR attached for the two OutLayer TEE runs; OutLayer
// refunds the unused part to the arena), waits for the oracle's callbacks and saves the receipts
// and read-back prices under deployments/oracle-refresh-YYYY-MM-DD.json.
//   pnpm meta:post            one refresh
//   pnpm meta:keep            refresh every ten minutes until Ctrl-C (budget: META_BUDGET_NEAR)
// Signs with RELAYER_ACCOUNT's key (read from .near-credentials, never printed).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fnCall, parseNear, rpc, view } from '@mempire/sdk';
import { ROOT, RPC, signer, balanceNear, txUrl, loadEnv, sleep } from './lib';

loadEnv();
const ARENA = process.env.ARENA_ACCOUNT;
const ACCOUNT = process.env.RELAYER_ACCOUNT;
if (!ARENA || !ACCOUNT) throw new Error('Set ARENA_ACCOUNT and RELAYER_ACCOUNT (see .env.example).');
const keep = process.argv.includes('--keep');
const DEPOSIT = BigInt(parseNear('0.02'));
const budget = BigInt(parseNear(process.env.META_BUDGET_NEAR || '0.1'));
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

type Receipt = { outcome: { executor_id: string; logs: string[]; tokens_burnt: string; status: Record<string, unknown> } };
type Tx = { final_execution_status: string; status: Record<string, unknown>; transaction_outcome: { outcome: { tokens_burnt: string } }; receipts_outcome: Receipt[] };

/** OutLayer answers through yield/resume: poll until the arena's callbacks have run. */
async function receipts(hash: string, timeoutMs = 300_000): Promise<Tx> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const t = await rpc<Tx>(RPC, 'EXPERIMENTAL_tx_status', { tx_hash: hash, sender_account_id: ACCOUNT, wait_until: 'NONE' }).catch(() => null);
    if (t) {
      const done = (m: string) => t.receipts_outcome.some((r) => r.outcome.executor_id === ARENA && r.outcome.logs.length + Object.keys(r.outcome.status).length > 0 && JSON.stringify(r).includes(m));
      const callbacks = t.receipts_outcome.filter((r) => r.outcome.executor_id === ARENA).length;
      if ((t.final_execution_status === 'FINAL' && callbacks >= 3) || (callbacks >= 3 && done('Priced by OutLayer TEE oracle'))) return t;
    }
    if (Date.now() > until) throw new Error(`OutLayer callbacks for ${hash} did not arrive in ${timeoutMs / 1000} s`);
    await sleep(4000);
  }
}

let spent = 0n;
async function once() {
  const before = await balanceNear(ACCOUNT!);
  if (before < 0.1) throw new Error(`${ACCOUNT} has ${before} NEAR; keep at least 0.1 NEAR.`);
  if (spent + DEPOSIT > budget) throw new Error('Oracle keeper budget reached; stopping.');
  const s = signer(ACCOUNT!);
  let hash = '';
  await s.send(ARENA!, [fnCall('refresh_prices', {}, 300, DEPOSIT)], (h) => { hash = h; }).catch((e) => { if (!hash) throw e; });
  console.log(`refresh_prices sent: ${txUrl(hash)}; waiting for the OutLayer TEE callbacks…`);
  const t = await receipts(hash);
  const burnt = BigInt(t.transaction_outcome.outcome.tokens_burnt) + t.receipts_outcome.reduce((n, r) => n + BigInt(r.outcome.tokens_burnt), 0n);
  spent += DEPOSIT;
  const logs = t.receipts_outcome.flatMap((r) => r.outcome.logs.filter((l) => !l.startsWith('EVENT_JSON:{"standard":"near-outlayer"')).map((l) => `${r.outcome.executor_id}: ${l.slice(0, 400)}`));
  const failures = t.receipts_outcome.filter((r) => 'Failure' in r.outcome.status).map((r) => `${r.outcome.executor_id}: ${JSON.stringify(r.outcome.status).slice(0, 300)}`);
  const prices = await view(RPC, ARENA!, 'get_prices');
  const oracle = await view(RPC, ARENA!, 'get_oracle');
  const after = await balanceNear(ACCOUNT!);
  const rec = { at: new Date().toISOString(), hash, url: txUrl(hash), sender: ACCOUNT, depositNear: 0.02, senderBalanceBefore: before, senderBalanceAfter: after, gasTokensBurnt: burnt.toString(), logs, failures, prices, oracle };
  const file = resolve(ROOT, `deployments/oracle-refresh-${rec.at.slice(0, 10)}.json`);
  const history = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { network: 'testnet', arena: ARENA, oracle: 'price-oracle.testnet', refreshes: [] };
  history.refreshes.push(rec);
  writeFileSync(file, JSON.stringify(history, null, 2) + '\n');
  for (const l of logs) console.log(l);
  if (failures.length) console.error('failed receipts:', failures);
  const live = (prices as { prices: { ticker: string; source: string; stat_bps: number }[] }).prices.map((p) => `${p.ticker} ${p.source} ${p.stat_bps}bps`);
  console.log(JSON.stringify({ hash, live, senderCostNear: +(before - after).toFixed(4) }));
}

while (!stopping) {
  try { await once(); } catch (e) {
    console.error(e instanceof Error ? e.message : 'Oracle refresh failed');
    process.exitCode = 1;
    if (!keep || String(e).includes('budget') || String(e).includes('keep at least')) break;
  }
  if (!keep) break;
  for (let i = 0; i < 600 && !stopping; i++) await sleep(1000);
}
