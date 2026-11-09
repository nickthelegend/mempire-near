// node scripts/create-account.mjs <name.testnet>  -> creates via the testnet helper, key saved to .near-credentials/
import { helperCreate, balance, fmt, hasKey } from './lib.mjs';
const id = process.argv[2];
if (!id) throw new Error('usage: create-account.mjs <name.testnet>');
if (hasKey(id)) { console.log(`${id} already has a key; balance ${fmt(await balance(id))} NEAR`); process.exit(0); }
await helperCreate(id);
for (let i = 0; i < 20; i++) { try { console.log(`${id} created, balance ${fmt(await balance(id))} NEAR`); process.exit(0); } catch { await new Promise((r) => setTimeout(r, 1500)); } }
throw new Error(`${id} not visible on RPC yet`);
