// SPDX-License-Identifier: MIT
// Shared helpers for the testnet scripts. Keys live in the gitignored .near-credentials/ and are
// read in code only; nothing here prints a secret.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { KeyPair } from 'near-api-js';
import { KeySigner, viewAccount, type Network } from '@mempire/sdk';

export const ROOT = resolve(import.meta.dirname, '..');
export const CREDS = resolve(ROOT, '.near-credentials');
export const RPC = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';
export const EXPLORER = 'https://testnet.nearblocks.io';

export function loadEnv() {
  const file = resolve(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
export function setEnv(name: string, value: string) {
  const file = resolve(ROOT, '.env');
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => l && !l.startsWith(`${name}=`)) : [];
  lines.push(`${name}=${value}`);
  writeFileSync(file, lines.join('\n') + '\n');
  process.env[name] = value;
}
export const keyFile = (id: string) => resolve(CREDS, `${id}.json`);
export const hasKey = (id: string) => existsSync(keyFile(id));
export function loadKey(id: string): KeyPair {
  return KeyPair.fromString(JSON.parse(readFileSync(keyFile(id), 'utf8')).private_key);
}
export function saveKey(id: string, kp: KeyPair) {
  mkdirSync(CREDS, { recursive: true });
  writeFileSync(keyFile(id), JSON.stringify({ account_id: id, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
}
export const signer = (id: string, kp = loadKey(id)) => new KeySigner(RPC, id, kp);
export async function exists(id: string) { try { await viewAccount(RPC, id); return true; } catch { return false; } }
export async function balanceNear(id: string) { return Number(BigInt((await viewAccount(RPC, id)).amount) / 10n ** 20n) / 1e4; }

/** Testnet helper: a top-level .testnet account funded by the faucet. */
export async function helperCreate(id: string) {
  const kp = KeyPair.fromRandom('ed25519');
  const res = await fetch('https://helper.nearprotocol.com/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }) });
  if (!res.ok) throw new Error(`helper ${res.status}: ${(await res.text()).slice(0, 160)}`);
  saveKey(id, kp);
  for (let i = 0; i < 30 && !(await exists(id)); i++) await new Promise((r) => setTimeout(r, 1000));
}
export function network(): Network {
  return { networkId: 'testnet', rpc: RPC, arena: process.env.ARENA_ACCOUNT!, relayer: process.env.RELAYER_URL, explorer: EXPLORER };
}
export const txUrl = (h: string) => `${EXPLORER}/txns/${h}`;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
