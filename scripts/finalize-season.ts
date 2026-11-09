// SPDX-License-Identifier: MIT
// Pay out a finished season (anyone may call it): pnpm tsx scripts/finalize-season.ts <player-label> <season>
// Records the transaction and the payouts in deployments/testnet-<date>.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ArenaReader, KeySigner, formatNear } from '@mempire/sdk';
import { ROOT, RPC, loadEnv, loadKey, network, txUrl } from './lib';

loadEnv();
const [label, seasonArg] = process.argv.slice(2);
const season = Number(seasonArg ?? 0);
const file = resolve(ROOT, 'deployments/testnet-2026-11-09.json');
const log = JSON.parse(readFileSync(file, 'utf8'));
const account = log.players[label];
const signer = new KeySigner(RPC, account, loadKey(account));
const reader = new ArenaReader(network());
const before = await reader.season(season);
const out = await signer.call(network().arena, 'finalize_season', { season }, { tgas: 100 });
const after = await reader.season(season);
const next = await reader.season(season + 1);
const entry = {
  step: `${label} finalizes season ${season}: pool ${formatNear(before.pool)} NEAR paid 50/30/20 to the top three, unearned shares roll over`,
  hash: out.hash, url: txUrl(out.hash),
  top: before.top, paid: after.paid.map((p) => ({ account: p.account, near: formatNear(p.amount) })), rolledOver: formatNear(after.rolled_over), nextPool: formatNear(next.pool),
};
log.seasonPayout = entry;
writeFileSync(file, JSON.stringify(log, null, 2));
console.log(JSON.stringify(entry, null, 2));
