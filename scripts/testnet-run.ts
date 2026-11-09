// SPDX-License-Identifier: MIT
// The recorded testnet run: two relayer-created players, one PvP match and one match against a
// house, both refereed on-chain, with session keys and meta transactions. Needs the relayer
// running (pnpm --filter @mempire/relayer start). Appends to deployments/testnet-<date>.json.
//   pnpm tsx scripts/testnet-run.ts
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KeyPair } from 'near-api-js';
import {
  ArenaReader, KeySigner, RelayerClient, addSessionKey, arenaCalls, deleteKey, parseNear, formatNear, viewAccessKey,
  roster, type MatchView, type Claim,
} from '@mempire/sdk';
import { decideBot, initialState, matchCards, refereeStep, hashState, HOUSE_DIFFICULTY, type InputEvent } from '@mempire/sim';
import { ROOT, RPC, loadEnv, hasKey, loadKey, saveKey, network, txUrl, sleep, balanceNear } from './lib';

loadEnv();
const net = network();
const RELAYER_URL = process.env.RELAYER_URL || 'http://127.0.0.1:5299';
const relayer = new RelayerClient(RELAYER_URL);
const reader = new ArenaReader(net);
const date = new Date().toISOString().slice(0, 10);
const outFile = resolve(ROOT, `deployments/testnet-${date}.json`);
const log: Record<string, unknown> = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : { network: 'testnet', arena: net.arena, runs: [] };
const steps: { step: string; hash?: string; url?: string; detail?: unknown }[] = [];
const save = (extra: Record<string, unknown> = {}) => writeFileSync(outFile, JSON.stringify({ ...log, inProgress: { at: new Date().toISOString(), steps, ...extra } }, null, 2));
const rec = (step: string, hash?: string, detail?: unknown) => { steps.push({ step, hash, url: hash ? txUrl(hash) : undefined, detail }); console.log(`${step}${hash ? `: ${txUrl(hash)}` : ''}${detail ? ` ${JSON.stringify(detail)}` : ''}`); save(); };

/** A relayer-created player whose full-access key lives only on this machine (as in a browser). */
async function player(label: string): Promise<KeySigner> {
  const known = (log.players as Record<string, string> | undefined)?.[label];
  if (known && hasKey(known)) return new KeySigner(RPC, known, loadKey(known));
  const kp = KeyPair.fromRandom('ed25519');
  const res = await relayer.guest(label, kp.getPublicKey().toString());
  saveKey(res.accountId, kp);
  log.players = { ...(log.players as object), [label]: res.accountId };
  rec(`relayer creates ${label}'s account ${res.accountId} (0.3 NEAR starter)`, res.hash);
  for (let i = 0; i < 20; i++) { try { await viewAccessKey(RPC, res.accountId, kp.getPublicKey().toString()); break; } catch { await sleep(1000); } }
  return new KeySigner(RPC, res.accountId, kp);
}

/** NEP-366: the player signs, the relayer pays. */
async function meta(p: KeySigner, receiver: string, actions: Parameters<KeySigner['signDelegate']>[1], label: string) {
  const sd = await p.signDelegate(receiver, actions);
  const out = await relayer.relay(sd);
  rec(`${label} (meta tx, relayer pays gas)`, out.hash, out.ok ? out.value ?? undefined : { error: out.error });
  return out;
}

async function sessionFor(p: KeySigner, label: string) {
  const kp = KeyPair.fromRandom('ed25519');
  const out = await meta(p, p.accountId, [addSessionKey(kp.getPublicKey().toString(), net.arena, ['play'], parseNear('0.25'))], `${label} adds a play-only session key`);
  if (!out.ok) throw new Error(out.error);
  return new KeySigner(RPC, p.accountId, kp);
}

/** Each human seat plays the published bot (hard for seat 0, normal for seat 1), simulated ahead. */
function plan(m: MatchView): InputEvent[][] {
  const s = initialState(m.seed, [matchCards(roster.fighters, m.deck0, m.mods.slice(0, 8)), matchCards(roster.fighters, m.deck1, m.mods.slice(8))], m.format);
  const plays: InputEvent[] = [];
  const pending: InputEvent[] = [];
  const house = m.house === null ? null : 'normal' as const;
  while (s.phase !== 'ended') {
    const a = decideBot(s, 0, 'hard'); if (a) plays.push(a);
    if (!house) { const b = decideBot(s, 1, 'normal'); if (b) plays.push(b); }
    refereeStep(s, plays, house ? HOUSE_DIFFICULTY[1] : null, pending);
  }
  return [plays.filter((e) => e.player === 0), plays.filter((e) => e.player === 1)];
}

async function drive(session: KeySigner, m: MatchView, plays: InputEvent[], label: string) {
  const start = Number(m.start_ms);
  const sent: Promise<void>[] = [];
  let landed = 0, refused = 0, first = ''; const reasons = new Set<string>();
  for (const p of plays) {
    if (p.tick > 600) break;
    while (Date.now() < start + 300 || (Date.now() - start) * 20 / 1000 + 45 < p.tick) await sleep(80);
    sent.push(session.send(net.arena, [arenaCalls.play(m.id, p.tick, p.deckIndex, p.x, p.y)]).then((o) => { if (o.ok) { landed++; first ||= o.hash; } else { refused++; reasons.add(o.error ?? '?'); } }).catch((e) => { refused++; reasons.add((e as Error).message.slice(0, 120)); }));
  }
  await Promise.all(sent);
  rec(`${label}: ${landed} plays landed from the session key${refused ? ` (${refused} refused)` : ''}`, first || undefined, reasons.size ? { refused: [...reasons] } : undefined);
}

async function untilClosed(m: MatchView) { while (Date.now() < Number(m.close_ms) + 2500) await sleep(500); }

async function localClaim(id: string): Promise<Claim> {
  const m = (await reader.match(id))!;
  const plays = await reader.plays(id);
  const s = initialState(m.seed, [matchCards(roster.fighters, m.deck0, m.mods.slice(0, 8)), matchCards(roster.fighters, m.deck1, m.mods.slice(8))], m.format);
  const inputs = plays.map((p) => ({ tick: p.tick, player: p.seat, deckIndex: p.deck_index, x: p.x, y: p.y }));
  const pending: InputEvent[] = [];
  const house = m.house === null ? null : HOUSE_DIFFICULTY[(await reader.houses())[m.house].difficulty];
  while (s.phase !== 'ended') refereeStep(s, inputs, house, pending);
  return { winner: s.winner === -2 ? 2 : s.winner, end_tick: s.tick, final_hash: hashState(s) };
}

const DECK_A = [0, 1, 2, 3, 4, 5, 6, 8];
const DECK_B = [0, 9, 2, 10, 4, 7, 6, 3];
const a = await player('aiko');
const b = await player('bram');
console.log(`players ${a.accountId} (${await balanceNear(a.accountId)} NEAR), ${b.accountId} (${await balanceNear(b.accountId)} NEAR)`);
const config = await reader.config();
const stake = config.tier_stakes[0];

// ── PvP ──────────────────────────────────────────────────────────────────────────────────
const sa = await sessionFor(a, 'aiko');
const sb = await sessionFor(b, 'bram');
const created = await a.call<string>(net.arena, 'create_match', { tier: 0, format: 1, deck: DECK_A, session_key: sa.publicKey }, { deposit: stake });
const id = String(created.value);
rec(`aiko stakes ${formatNear(stake)} NEAR and opens Rush match #${id}`, created.hash);
const joined = await b.call(net.arena, 'join_match', { id, deck: DECK_B, session_key: sb.publicKey }, { deposit: stake });
let m = (await reader.match(id))!;
rec(`bram stakes and joins #${id}; the arena reads the market at kick-off`, joined.hash, { mods: m.mods, status: m.status, seed: m.seed });
const [p0, p1] = plan(m);
await Promise.all([drive(sa, m, p0, 'aiko'), drive(sb, m, p1, 'bram')]);
await untilClosed(m);
const claim = await localClaim(id);
const fake = { ...claim, winner: claim.winner === 0 ? 1 : 0 };
const rejected = await meta(b, net.arena, [arenaCalls.settle(id, fake)], `bram claims a fake winner (seat ${fake.winner})`);
if (rejected.ok) throw new Error('fake claim was accepted');
const settled = await meta(a, net.arena, [arenaCalls.settle(id, claim)], `aiko settles #${id} with the replayed result ${JSON.stringify(claim)}`);
if (!settled.ok) throw new Error(`settle failed: ${settled.error}`);
m = (await reader.match(id))!;
rec(`#${id} settled by the on-chain referee`, undefined, { winner: m.winner, end_tick: m.end_tick, final_hash: m.final_hash, paid: formatNear(m.paid), referee_calls: m.referee_calls, plays: m.plays0 + m.plays1 });
await meta(a, a.accountId, [deleteKey(sa.publicKey)], 'aiko deletes the session key');
await meta(b, b.accountId, [deleteKey(sb.publicKey)], 'bram deletes the session key');

// ── vs a house ───────────────────────────────────────────────────────────────────────────
const houses = await reader.houses();
const tora = houses.findIndex((h) => h.name === 'Tora');
const sa2 = await sessionFor(a, 'aiko');
const ch = await a.call<string>(net.arena, 'challenge_house', { house: tora, format: 1, deck: DECK_A, session_key: sa2.publicKey }, { deposit: houses[tora].stake });
const hid = String(ch.value);
let hm = (await reader.match(hid))!;
rec(`aiko challenges house Tora (${houses[tora].account}) in #${hid}; Tora's treasury escrows ${formatNear(houses[tora].stake)} NEAR`, ch.hash);
await drive(sa2, hm, plan(hm)[0], 'aiko vs Tora');
await untilClosed(hm);
const hclaim = await localClaim(hid);
const hs = await meta(b, net.arena, [arenaCalls.settle(hid, hclaim)], `bram (a bystander) settles #${hid}; the referee runs Tora's bot inside the replay`);
if (!hs.ok) throw new Error(`house settle failed: ${hs.error}`);
hm = (await reader.match(hid))!;
const after = (await reader.houses())[tora];
rec(`#${hid} settled`, undefined, { winner: hm.winner, end_tick: hm.end_tick, final_hash: hm.final_hash, tora: { wins: after.wins, losses: after.losses, treasury: formatNear(after.treasury) } });
await meta(a, a.accountId, [deleteKey(sa2.publicKey)], 'aiko deletes the session key');

const season = await reader.season(await reader.currentSeason());
rec('season standings', undefined, { season: season.season, pool: formatNear(season.pool), top: season.top, ends: new Date(Number(season.end_ms)).toISOString() });
(log.runs as unknown[]).push({ at: new Date().toISOString(), pvp: id, house: hid, steps });
delete log.inProgress;
writeFileSync(outFile, JSON.stringify(log, null, 2));
console.log(`recorded in ${outFile}`);
