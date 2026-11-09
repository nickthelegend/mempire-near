// SPDX-License-Identifier: MIT
// Deploy the arena to NEAR testnet and set up its houses and price relayer.
//   pnpm build:contract && pnpm tsx scripts/deploy.ts
// Idempotent where it can be: existing accounts and keys are reused. Writes
// deployments/testnet.json with every transaction hash.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { KeyPair } from 'near-api-js';
import { PublicKey } from '@near-js/crypto';
import { actionCreators } from '@near-js/transactions';
import { fnCall, parseNear, ArenaReader } from '@mempire/sdk';
import { fetchSnapshot, signSnapshot } from '@mempire/relayer/src/prices';
import { ROOT, CREDS, loadEnv, setEnv, hasKey, loadKey, saveKey, signer, exists, helperCreate, network, txUrl, balanceNear } from './lib';

loadEnv();
const ARENA = process.env.ARENA_ACCOUNT;
if (!ARENA) throw new Error('Setup required: ARENA_ACCOUNT in .env');
const suffix = ARENA.replace(/^mempire-arena-/, '').replace(/\.testnet$/, '');
const RELAYER = process.env.RELAYER_ACCOUNT || `mempire-relay-${suffix}.testnet`;
const TREASURY = `treasury.${ARENA}`;
const WASM = resolve(ROOT, 'packages/contract/target/near/mempire_arena.wasm');
const STAKES = ['0.01', '0.05', '0.1', '0.25'];
const LAUNCH_SEASON_MINUTES = Number(process.env.LAUNCH_SEASON_MINUTES || 90);
const HOUSES = [
  { name: 'Kumo', sub: 'kumo', difficulty: 0, tier: 0, deck: [0, 1, 2, 3, 4, 5, 6, 9] },
  { name: 'Tora', sub: 'tora', difficulty: 1, tier: 0, deck: [0, 9, 2, 10, 4, 5, 8, 3] },
  { name: 'Ryu', sub: 'ryu', difficulty: 2, tier: 1, deck: [6, 1, 10, 8, 4, 7, 2, 3] },
];

const record: Record<string, unknown> = existsSync(resolve(ROOT, 'deployments/testnet.json'))
  ? JSON.parse(readFileSync(resolve(ROOT, 'deployments/testnet.json'), 'utf8')) : {};
const txs: { step: string; hash: string; url: string }[] = (record.deployTxs as never) ?? [];
const note = (step: string, hash: string) => { txs.push({ step, hash, url: txUrl(hash) }); console.log(`${step}: ${txUrl(hash)}`); };

// 1. price relayer key
const priceFile = resolve(CREDS, 'price-relayer.json');
if (!existsSync(priceFile)) { mkdirSync(CREDS, { recursive: true }); saveKey('price-relayer', KeyPair.fromRandom('ed25519')); }
const priceKey = loadKey('price-relayer');

// 2. relayer account (testnet helper)
if (!hasKey(RELAYER)) { await helperCreate(RELAYER); console.log(`created ${RELAYER}`); }
setEnv('RELAYER_ACCOUNT', RELAYER);

const arena = signer(ARENA);
const code = await (await import('@mempire/sdk')).viewAccount(process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com', ARENA);
const deployed = code.code_hash !== '11111111111111111111111111111111';

// 3. treasury sub-account
if (!(await exists(TREASURY))) {
  const kp = KeyPair.fromRandom('ed25519'); saveKey(TREASURY, kp);
  const out = await arena.send(TREASURY, [actionCreators.createAccount(), actionCreators.transfer(parseNear('0.05')), actionCreators.addKey(PublicKey.from(kp.getPublicKey().toString()), actionCreators.fullAccessKey())]);
  if (!out.ok) throw new Error(out.error); note('create treasury sub-account', out.hash);
}

// 4. deploy + init
if (!deployed) {
  const wasm = readFileSync(WASM);
  const out = await arena.send(ARENA, [
    actionCreators.deployContract(new Uint8Array(wasm)),
    fnCall('new', {
      owner: ARENA, treasury: TREASURY, relayer_pk: priceKey.getPublicKey().toString(),
      tier_stakes: STAKES.map((s) => parseNear(s).toString()), first_season_minutes: LAUNCH_SEASON_MINUTES,
      price_source: 'https://api.exchange.coinbase.com/products/{SYMBOL}-USD/stats',
    }, 100),
  ]);
  if (!out.ok) throw new Error(`deploy failed: ${out.error}`);
  note(`deploy arena (${(wasm.length / 1024).toFixed(0)} KB wasm) and init`, out.hash);
}

// 5. houses: sub-accounts with their own treasuries
const reader = new ArenaReader(network());
const existing = await reader.houses();
for (const h of HOUSES) {
  const id = `${h.sub}.${ARENA}`;
  if (!(await exists(id))) {
    const kp = KeyPair.fromRandom('ed25519'); saveKey(id, kp);
    const out = await arena.send(id, [actionCreators.createAccount(), actionCreators.transfer(parseNear('0.75')), actionCreators.addKey(PublicKey.from(kp.getPublicKey().toString()), actionCreators.fullAccessKey())]);
    if (!out.ok) throw new Error(out.error); note(`create house ${h.name} (${id})`, out.hash);
  }
  if (!existing.some((x) => x.account === id)) {
    const out = await arena.call(ARENA, 'add_house', { account: id, name: h.name, difficulty: h.difficulty, tier: h.tier, deck: h.deck });
    note(`register house ${h.name}`, out.hash);
    const dep = await signer(id).call(ARENA, 'house_deposit', {}, { deposit: parseNear('0.6') });
    note(`${h.name} funds its treasury with 0.6 NEAR`, dep.hash);
  }
}

// 6. first signed price snapshot
const rows = await fetchSnapshot();
const posted = await arena.call(ARENA, 'post_prices', signSnapshot(priceKey, rows));
note('post signed relayer prices (Coinbase 24 h stats)', posted.hash);

const config = await reader.config();
mkdirSync(resolve(ROOT, 'deployments'), { recursive: true });
writeFileSync(resolve(ROOT, 'deployments/testnet.json'), JSON.stringify({
  ...record,
  network: 'testnet', rpc: 'https://test.rpc.fastnear.com', explorer: 'https://testnet.nearblocks.io',
  arena: ARENA, treasury: TREASURY, relayer: RELAYER, priceRelayerKey: config.relayer_pk,
  houses: (await reader.houses()).map((h) => ({ name: h.name, account: h.account, difficulty: h.difficulty, stake: h.stake })),
  tierStakesNear: STAKES, launchSeasonEndsMs: config.first_season_end_ms,
  deployedAt: (record.deployedAt as string) ?? new Date().toISOString(),
  deployTxs: txs,
}, null, 2));
console.log(`arena ${ARENA} ready; balance ${await balanceNear(ARENA)} NEAR`);
