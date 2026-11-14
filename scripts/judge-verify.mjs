#!/usr/bin/env node
// Re-checks Mempire's key proofs against public NEAR testnet data. No install, no keys, no build:
//   node scripts/judge-verify.mjs
// Sources: FastNEAR transaction API, NEAR testnet RPC, and this repo's contract source.
// Exit code 0 only if every check passes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEAR_RPC = 'https://test.rpc.fastnear.com';
const NEAR_ARCHIVAL_RPC = 'https://archival-rpc.testnet.fastnear.com'; // older transactions are pruned from the main RPC
const NEAR_TX_API = 'https://tx.test.fastnear.com/v0/transactions';
const ARENA = 'mempire-arena-41966.testnet';
const ORACLE = 'price-oracle.testnet';

const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw Error(`${url} answered HTTP ${r.status}`);
  return r.json();
};
const rpc = async (method, params, url = NEAR_RPC) => { const j = await post(url, { jsonrpc: '2.0', id: 1, method, params }); if (j.error) throw Error(JSON.stringify(j.error)); return j.result; };
// `tx` lookup: the archival RPC first (the main RPC answers NOT_OBSERVED, after ~10 s, for older transactions), then the main RPC.
const txStatus = async (params) => rpc('tx', params, NEAR_ARCHIVAL_RPC).catch(() => rpc('tx', params));
const view = async (method, args = {}) => {
  const r = await rpc('query', { request_type: 'call_function', account_id: ARENA, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64'), finality: 'final' });
  return JSON.parse(Buffer.from(r.result).toString());
};

const rows = [];
const check = (ok, what, detail) => rows.push({ ok: !!ok, what, detail });
const guard = async (what, fn) => { try { await fn(); } catch (e) { check(false, what, `error: ${e.message}`); } };

// 1. Contract source: the referee, the price signature check and the random seed.
const src = readFileSync(join(ROOT, 'packages/contract/src/lib.rs'), 'utf8');
check(/claim rejected by the referee/.test(src) && /pub fn settle\(/.test(src), 'Contract source has a referee `settle` that rejects a wrong claim', 'packages/contract/src/lib.rs: settle, "claim rejected by the referee"');
check(/env::ed25519_verify\(/.test(src) && /env::random_seed\(\)/.test(src), 'Contract source uses env::ed25519_verify (price snapshots) and env::random_seed (match seed)', 'packages/contract/src/lib.rs: post_prices, create_match');
check(/pub fn play\(/.test(src) && /pub fn challenge_house\(/.test(src), 'Contract source has `play` and `challenge_house`', 'packages/contract/src/lib.rs');

// 2. Transactions, looked up without trusting our own records.
const PROOFS = [
  { what: 'Arena contract deployed and initialised', tx: '3eN5K22AYytBbDADBsZF2cw7jKdVdKebzsjiCyJruCfw', method: 'new', expect: 'success' },
  { what: 'Play-only session key added by a sponsored NEP-366 meta transaction', tx: '4isQkQzAfqnFmE9mGDmgnfVkouw3UDNycCwzeG7Ai65r', method: 'Delegate', expect: 'success' },
  { what: 'Wrong-winner claim in match #2 REFUSED on chain by the referee replay', tx: 'J8Bbuhcdjimhzjq1YRU9mToiauzMU5WTVZc52AFQzHJy', method: 'Delegate', expect: 'refused', reason: 'claim rejected by the referee' },
  { what: 'Match #2 settled by the contract replay (meta transaction, `settle`)', tx: 'BiJqVsL7cPsc3s71EHtCcHtqPBBgsnyxhM7aCY2KaYJB', method: 'settle', expect: 'success' },
  { what: 'Season payout (`finalize_season`)', tx: '5MGKPyqUgg6bkfs9BXFCUgk8NeyZgxwRMFY8CUCxTcuv', method: 'finalize_season', expect: 'success' },
  { what: 'Wallet-path match #29: stake escrowed (`challenge_house`)', tx: 'FqKpBzkUcmQnpjUdnLCrVyy27brVDtdnPiEATyqwS9N3', method: 'challenge_house', expect: 'success' },
  { what: 'Match #29: a card drop sent as a `play` transaction', tx: 'CW3jiLRqSL9h6eTDHAHea8VpcTPW5K7yf6bAiaHNQrHJ', method: 'play', expect: 'success' },
  { what: 'Match #29: referee `settle` by the player account', tx: '7kTCNNYjhPZt8NgcW1K6cBP6zzSuZXjk2ZQF11EKprDW', method: 'settle', expect: 'success' },
  { what: 'Signed relayer price snapshot posted (`post_prices`, ed25519 checked in contract)', tx: 'AFbqKpE14jFjm9xuagMbyhb4WaB8MXZH3ySQkhG9KDhi', method: 'post_prices', expect: 'success' },
  { what: 'Arena upgraded in place (`migrate`) to read the OutLayer price oracle', tx: 'BYAeK1sBRzLS3GpkWhCb7N8HRykhhj8FP49asWcXhvzS', method: 'migrate', expect: 'success' },
  { what: 'Prices refreshed through OutLayer TEE oracle (`refresh_prices` -> price-oracle.testnet)', tx: '698XRi9xyBMPfyMj9yTtYm3C5vXwgnxjcVQsQuXG4n8m', method: 'refresh_prices', expect: 'oracle' },
];
await guard('NEAR transaction lookup', async () => {
  const api = await post(NEAR_TX_API, { tx_hashes: PROOFS.map(p => p.tx) });
  const byHash = Object.fromEntries((api.transactions ?? []).map(t => [t.transaction.hash, t]));
  for (const p of PROOFS) {
    const t = byHash[p.tx];
    const link = `https://testnet.near.rocks/tx/${p.tx}`;
    if (!t) { check(false, p.what, `${p.tx} not found`); continue; }
    const signer = t.transaction.signer_id;
    const fin = await txStatus({ tx_hash: p.tx, sender_account_id: signer, wait_until: 'FINAL' }).catch(e => ({ error: e.message }));
    if (fin.error) { check(false, p.what, `RPC: ${fin.error}`); continue; }
    const rs = t.receipts ?? [];
    const fails = rs.map(r => r.execution_outcome?.outcome?.status).filter(s => s && s.Failure).map(s => JSON.stringify(s.Failure));
    const hasMethod = JSON.stringify(t.transaction.actions).includes(p.method) || p.method === 'Delegate' && JSON.stringify(t.transaction.actions).includes('Delegate');
    if (!hasMethod) { check(false, p.what, `transaction does not contain ${p.method} · ${link}`); continue; }
    if (p.expect === 'success') check(fails.length === 0, p.what, `${signer} · ${link}`);
    if (p.expect === 'oracle') {
      const hit = rs.some(r => r.execution_outcome?.outcome?.executor_id === ORACLE);
      check(fails.length === 0 && hit, p.what, `${signer}, receipts executed on ${ORACLE} · ${link}`);
    }
    if (p.expect === 'refused') check(fails.some(f => f.includes(p.reason)), p.what, `failure contains "${p.reason}" · ${link}`);
  }
});

// 3. Live contract state.
await guard('get_match 29', async () => {
  const m = await view('get_match', { id: '29' });
  check(m.state === 3 && m.winner === 0 && m.plays0 === 8 && m.end_tick === 600 && m.final_hash === 3205096048 && m.referee_calls === 1,
    'Match #29 is settled on chain: winner seat 0, 8 stored plays, end tick 600, state hash 3205096048', `p0 ${m.p0} vs ${m.p1}, paid ${m.paid} yoctoNEAR`);
});
await guard('get_match 2', async () => {
  const m = await view('get_match', { id: '2' });
  check(m.state === 3 && m.winner === 1 && m.end_tick === 600 && m.final_hash === 1045771825,
    'Match #2 stored the referee result the fake claim was compared with (winner 1, tick 600, hash 1045771825)', `final_hash ${m.final_hash}, winner ${m.winner}`);
});
await guard('get_totals', async () => {
  const t = await view('get_totals');
  check(Number(t.matches) >= 29 && Number(t.settled) >= 26 && t.houses === 3, 'Arena totals show 29+ matches, 26+ settled, 3 houses', JSON.stringify(t));
});
await guard('get_prices', async () => {
  const p = await view('get_prices');
  check(p.oracle === ORACLE && Number(p.oracle_refreshes) >= 1 && p.prices.some(x => x.source === 'oracle'), `Live prices carry source "oracle" from ${ORACLE}`, `oracle_refreshes ${p.oracle_refreshes}, ${p.prices.length} fighters`);
});
await guard('get_houses', async () => {
  const h = await view('get_houses');
  check(h.length === 3 && h.every(x => BigInt(x.treasury) > 0n), 'Three house bots (Kumo, Tora, Ryu) hold funded treasuries', h.map(x => `${x.name} ${x.wins}W/${x.losses}L`).join(', '));
});

const pass = rows.filter(r => r.ok).length;
console.log(`\nMempire live verification · ${new Date().toISOString()}\n`);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.what}\n      ${r.detail}`);
console.log(`\n${pass}/${rows.length} checks passed.`);
process.exit(pass === rows.length ? 0 : 1);
