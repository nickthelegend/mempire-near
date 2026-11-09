// SPDX-License-Identifier: MIT
// Settle matches whose play log has closed: compute the result locally from the chain's log
// (exactly what the referee replays), then send `settle` with that claim as a meta transaction
// signed by a relayer-created player (the relayer pays the gas).
//   pnpm tsx scripts/settle.ts <player-label> <match id>...
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ArenaReader, KeySigner, RelayerClient, arenaCalls, replayFromChain, formatNear } from '@mempire/sdk';
import { ROOT, RPC, loadEnv, loadKey, network, txUrl } from './lib';

loadEnv();
const net = network();
const [label, ...ids] = process.argv.slice(2);
const date = new Date().toISOString().slice(0, 10);
const file = resolve(ROOT, `deployments/testnet-${date}.json`);
const log = JSON.parse(readFileSync(file, 'utf8'));
const account = log.players[label];
const p = new KeySigner(RPC, account, loadKey(account));
const relayer = new RelayerClient(process.env.RELAYER_URL || 'http://127.0.0.1:5299');
const reader = new ArenaReader(net);
log.settlements ??= [];
for (const id of ids) {
  const r = await replayFromChain(net, id);
  if (r.match.state !== 2) { console.log(`#${id} is not live (state ${r.match.state})`); continue; }
  const out = await relayer.relay(await p.signDelegate(net.arena, [arenaCalls.settle(id, r.result)]));
  const m = (await reader.match(id))!;
  const entry = { step: `${label} settles #${id} with the replayed result ${JSON.stringify(r.result)} (meta tx)`, hash: out.hash, url: txUrl(out.hash), ok: out.ok, error: out.error, winner: m.winner, end_tick: m.end_tick, final_hash: m.final_hash, paid: formatNear(m.paid), plays: m.plays0 + m.plays1, house: m.house };
  log.settlements.push(entry);
  console.log(JSON.stringify(entry));
}
writeFileSync(file, JSON.stringify(log, null, 2));
