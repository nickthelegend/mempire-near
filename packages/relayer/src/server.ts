// SPDX-License-Identifier: MIT
// Mempire relayer (testnet):
//  - email sign-in: a 6-digit code by email (Resend), then a sub-account of the relayer is created
//    for the key the browser generated; without RESEND_API_KEY it answers "Setup required".
//  - guest sign-in: the same account creation without an email.
//  - NEP-366 meta transactions: the relayer wraps a player's SignedDelegate in its own transaction
//    and pays the gas. Only arena calls without a deposit and the player's own play-only session keys
//    are relayed; stakes are always sent by the player.
//  - keeper: settles live matches once their play log closes (anyone may call the referee).
//  - prices: posts a signed Coinbase snapshot every 10 minutes.
// Keys come from the gitignored .near-credentials/ and are never logged.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomInt } from 'node:crypto';
import { KeyPair } from 'near-api-js';
import { PublicKey } from '@near-js/crypto';
import { actionCreators } from '@near-js/transactions';
import {
  ArenaReader, KeySigner, arenaCalls, decodeSignedDelegate, fnCall, parseNear, signedDelegateAction, viewAccount,
  type Network,
} from '@mempire/sdk';
import { fetchSnapshot, signSnapshot, verifySnapshot } from './prices';

const ROOT = resolve(import.meta.dirname, '../../..');
loadEnv(resolve(ROOT, '.env'));
const RPC = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';
const ARENA = need('ARENA_ACCOUNT');
const RELAYER = need('RELAYER_ACCOUNT');
const PORT = Number(process.env.RELAYER_PORT || 5299);
const STARTER = parseNear(process.env.STARTER_NEAR || '0.3');
const MAX_ACCOUNTS = Number(process.env.RELAYER_MAX_ACCOUNTS || 25);
const ORIGIN = process.env.RELAYER_ALLOW_ORIGIN || '*';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'Mempire <onboarding@resend.dev>';
const net: Network = { networkId: 'testnet', rpc: RPC, arena: ARENA, explorer: 'https://testnet.nearblocks.io' };

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
function need(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`Setup required: ${name} (see .env.example)`); process.exit(1); }
  return v;
}
function keyFor(account: string): KeyPair {
  const file = resolve(ROOT, '.near-credentials', `${account}.json`);
  if (!existsSync(file)) { console.error(`Setup required: .near-credentials/${account}.json`); process.exit(1); }
  return KeyPair.fromString(JSON.parse(readFileSync(file, 'utf8')).private_key);
}

const relayer = new KeySigner(RPC, RELAYER, keyFor(RELAYER));
const reader = new ArenaReader(net);
const priceKeyFile = resolve(ROOT, '.near-credentials', 'price-relayer.json');
const priceKey = existsSync(priceKeyFile) ? KeyPair.fromString(JSON.parse(readFileSync(priceKeyFile, 'utf8')).private_key) : null;

// ── accounts ───────────────────────────────────────────────────────────────────────────────
let created = 0;
const perIp = new Map<string, number[]>();
function rateLimit(ip: string) {
  const now = Date.now();
  const hits = (perIp.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 3) throw new HttpError(429, 'At most 3 new accounts per hour from one address');
  hits.push(now); perIp.set(ip, hits);
}
async function exists(accountId: string) {
  try { await viewAccount(RPC, accountId); return true; } catch { return false; }
}
async function createPlayer(accountId: string, publicKey: string) {
  if (created >= MAX_ACCOUNTS) throw new HttpError(503, `This relayer's testnet budget is used up (${MAX_ACCOUNTS} accounts)`);
  PublicKey.from(publicKey); // throws on a malformed key
  const out = await relayer.send(accountId, [
    actionCreators.createAccount(),
    actionCreators.transfer(STARTER),
    actionCreators.addKey(PublicKey.from(publicKey), actionCreators.fullAccessKey()),
  ]);
  if (!out.ok) throw new HttpError(502, `Account creation failed: ${out.error}`);
  created++;
  return out.hash;
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'player';

// ── email codes ────────────────────────────────────────────────────────────────────────────
const codes = new Map<string, { code: string; until: number; tries: number }>();
async function sendCode(email: string) {
  if (!RESEND_API_KEY) throw new HttpError(503, 'Setup required: RESEND_API_KEY (email delivery). Use guest sign-in meanwhile.');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  codes.set(email, { code, until: Date.now() + 10 * 60_000, tries: 0 });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to: [email], subject: `Your Mempire code: ${code}`, text: `Your Mempire sign-in code is ${code}. It expires in 10 minutes.` }),
  });
  if (!res.ok) throw new HttpError(502, `Email provider refused: HTTP ${res.status}`);
}
function emailAccount(email: string) {
  return `p-${createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 12)}.${RELAYER}`;
}

// ── meta transactions ──────────────────────────────────────────────────────────────────────
const RELAYED_METHODS = new Set(['settle', 'cancel_match', 'finalize_season']);
function checkDelegate(d: ReturnType<typeof decodeSignedDelegate>) {
  const a = d.delegateAction;
  if (!a.senderId.endsWith(`.${RELAYER}`)) throw new HttpError(403, 'Only accounts created by this relayer are sponsored');
  for (const action of a.actions) {
    const kind = Object.keys(action)[0];
    const body = (action as Record<string, any>)[kind];
    if (kind === 'functionCall') {
      if (a.receiverId !== ARENA) throw new HttpError(403, 'Only arena calls are sponsored');
      if (!RELAYED_METHODS.has(body.methodName)) throw new HttpError(403, `${body.methodName} is not sponsored (stakes are paid by the player)`);
      if (BigInt(body.deposit) !== 0n) throw new HttpError(403, 'Sponsored calls carry no deposit');
    } else if (kind === 'addKey') {
      const perm = body.accessKey.permission;
      const fc = perm.functionCall;
      if (a.receiverId !== a.senderId || !fc) throw new HttpError(403, 'Only function-call session keys on your own account');
      if (fc.receiverId !== ARENA || fc.methodNames.length !== 1 || fc.methodNames[0] !== 'play') throw new HttpError(403, 'A session key may only call the arena\'s play');
      if (fc.allowance === null || fc.allowance === undefined || BigInt(fc.allowance) > parseNear('0.5')) throw new HttpError(403, 'Session-key allowance must be set and at most 0.5 NEAR');
    } else if (kind === 'deleteKey') {
      if (a.receiverId !== a.senderId) throw new HttpError(403, 'Only your own keys');
    } else throw new HttpError(403, `${kind} is not sponsored`);
  }
}

// ── keeper and prices ─────────────────────────────────────────────────────────────────────
async function keeper() {
  try {
    const recent = await reader.recent(30);
    for (const m of recent) {
      if (m.state === 2 && Date.now() > Number(m.close_ms) + 20_000) {
        const out = await relayer.send(ARENA, [arenaCalls.settle(m.id, null)]);
        console.log(`keeper: settle #${m.id} ${out.ok ? 'ok' : `failed: ${out.error}`} ${out.hash}`);
      }
    }
  } catch (e) { console.error(`keeper: ${(e as Error).message}`); }
}
async function postPrices() {
  if (!priceKey) { console.error('prices: Setup required: .near-credentials/price-relayer.json'); return; }
  try {
    const rows = await fetchSnapshot();
    const out = await relayer.send(ARENA, [fnCall('post_prices', signSnapshot(priceKey, rows), 30)]);
    console.log(`prices: ${out.ok ? 'posted' : `failed: ${out.error}`} ${out.hash}`);
  } catch (e) { console.error(`prices: ${(e as Error).message}`); }
}

// ── http ───────────────────────────────────────────────────────────────────────────────────
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function body(req: IncomingMessage): Promise<Record<string, string>> {
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > 64_000) throw new HttpError(413, 'Too large'); }
  try { return JSON.parse(raw || '{}'); } catch { throw new HttpError(400, 'Body must be JSON'); }
}
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': 'content-type' });
  res.end(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ?? req.socket.remoteAddress ?? '?';
  try {
    if (req.method === 'GET' && req.url === '/info') {
      return send(res, 200, { relayer: RELAYER, arena: ARENA, parent: RELAYER, starterNear: (Number(STARTER / 10n ** 21n) / 1000).toString(), email: RESEND_API_KEY ? { configured: true } : { configured: false, missing: 'RESEND_API_KEY' } });
    }
    if (req.method !== 'POST') throw new HttpError(404, 'Not found');
    const b = await body(req);
    if (req.url === '/prices') {
      // Reuse this signer queue: a separate keeper must not race guest/settlement nonces.
      if (!priceKey || !verifySnapshot(priceKey, b.payload, b.signature)) throw new HttpError(403, 'A fresh signed price snapshot is required');
      const prices = await reader.prices();
      if (Math.floor(Math.max(0, ...prices.prices.map(p => Number(p.ts_ms))) / 600_000) >= Math.floor(Date.now() / 600_000)) return send(res, 200, { skipped: true });
      const out = await relayer.send(ARENA, [fnCall('post_prices', { payload: b.payload, signature: b.signature }, 30)]);
      return send(res, out.ok ? 200 : 422, out);
    }
    if (req.url === '/auth/start') {
      const email = String(b.email ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
      await sendCode(email);
      return send(res, 200, { sent: true });
    }
    if (req.url === '/auth/verify') {
      const email = String(b.email ?? '').trim().toLowerCase();
      const entry = codes.get(email);
      if (!entry || Date.now() > entry.until) throw new HttpError(400, 'Code expired: request a new one');
      if (++entry.tries > 5) { codes.delete(email); throw new HttpError(429, 'Too many tries: request a new code'); }
      if (entry.code !== String(b.code ?? '')) throw new HttpError(400, 'Wrong code');
      codes.delete(email);
      const accountId = emailAccount(email);
      if (await exists(accountId)) throw new HttpError(409, `${accountId} exists. Sign in from the browser that holds its key.`);
      rateLimit(ip);
      const hash = await createPlayer(accountId, String(b.publicKey));
      return send(res, 200, { accountId, created: true, hash });
    }
    if (req.url === '/auth/guest') {
      rateLimit(ip);
      const accountId = `${slug(String(b.handle ?? 'player'))}-${randomInt(1000, 9999)}.${RELAYER}`;
      const hash = await createPlayer(accountId, String(b.publicKey));
      return send(res, 200, { accountId, created: true, hash });
    }
    if (req.url === '/relay') {
      const decoded = decodeSignedDelegate(String(b.signedDelegate ?? ''));
      checkDelegate(decoded);
      const out = await relayer.send(decoded.delegateAction.senderId, [signedDelegateAction(decoded)]);
      return send(res, out.ok ? 200 : 422, { hash: out.hash, ok: out.ok, error: out.error, value: out.value });
    }
    throw new HttpError(404, 'Not found');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    console.error(`${req.method} ${req.url} -> ${status}: ${(e as Error).message}`);
    send(res, status, { error: (e as Error).message });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`relayer ${RELAYER} for ${ARENA} on http://127.0.0.1:${PORT} (email ${RESEND_API_KEY ? 'on' : 'Setup required: RESEND_API_KEY'})`));
if (process.env.RELAYER_KEEPER !== '0') setInterval(() => void keeper(), 15_000);
if (process.env.RELAYER_PRICES !== '0') { void postPrices(); setInterval(() => void postPrices(), 10 * 60_000); }
