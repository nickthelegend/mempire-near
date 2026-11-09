// SPDX-License-Identifier: MIT
// Shared helpers for the testnet scripts. Keys live in the gitignored .near-credentials/ and are
// read in code only; nothing here prints a secret.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { connect, keyStores, KeyPair, utils } from 'near-api-js';

export const ROOT = resolve(import.meta.dirname, '..');
export const CREDS = resolve(ROOT, '.near-credentials');
export const RPC = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';
export const NETWORK = process.env.NEAR_NETWORK || 'testnet';

export function keyFile(accountId) { return resolve(CREDS, `${accountId}.json`); }
export function hasKey(accountId) { return existsSync(keyFile(accountId)); }
export function loadKey(accountId) {
  const j = JSON.parse(readFileSync(keyFile(accountId), 'utf8'));
  return KeyPair.fromString(j.private_key);
}
export function saveKey(accountId, keyPair) {
  mkdirSync(CREDS, { recursive: true });
  writeFileSync(keyFile(accountId), JSON.stringify({ account_id: accountId, public_key: keyPair.getPublicKey().toString(), private_key: keyPair.toString() }), { mode: 0o600 });
}
export async function near() {
  const keyStore = new keyStores.InMemoryKeyStore();
  return { keyStore, conn: await connect({ networkId: NETWORK, nodeUrl: RPC, keyStore }) };
}
export async function account(accountId, keyPair = loadKey(accountId)) {
  const { keyStore, conn } = await near();
  await keyStore.setKey(NETWORK, accountId, keyPair);
  return conn.account(accountId);
}
export const yocto = (n) => utils.format.parseNearAmount(String(n));
export const fmt = (y) => utils.format.formatNearAmount(String(y), 4);
export async function balance(accountId) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: accountId } }) }).then((r) => r.json());
  if (res.error) throw new Error(res.error.cause?.name || res.error.message);
  return BigInt(res.result.amount);
}
/** Testnet helper: creates a top-level .testnet account funded by the faucet. */
export async function helperCreate(accountId) {
  const kp = KeyPair.fromRandom('ed25519');
  const res = await fetch('https://helper.nearprotocol.com/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: kp.getPublicKey().toString() }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`helper ${res.status}: ${text.slice(0, 160)}`);
  saveKey(accountId, kp);
  return accountId;
}
export const explorerTx = (hash) => `https://testnet.nearblocks.io/txns/${hash}`;
export const explorerAccount = (id) => `https://testnet.nearblocks.io/address/${id}`;
