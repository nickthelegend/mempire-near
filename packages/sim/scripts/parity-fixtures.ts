// SPDX-License-Identifier: MIT
// Records matches with the TypeScript engine for the Rust parity test:
//   pnpm --filter @mempire/sim fixtures  ->  packages/contract/tests/fixtures/parity.json
// Plays are driven by the bot for both seats (or seat 0 against the referee's house bot), mixed
// with deliberately bad inputs (cards not in hand, unaffordable, out-of-bounds coordinates).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decideBot, hashState, stepSim, matchCards, initialState, refereeStep, HOUSE_DIFFICULTY, type InputEvent } from '../src/index';

const root = resolve(import.meta.dirname, '../../..');
const roster = JSON.parse(readFileSync(resolve(root, 'shared/roster.json'), 'utf8')).fighters;
let r = 0x2545f491;
const rand = (n: number) => { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r % n; };
const fixtures = [];
const COUNT = Number(process.env.FIXTURES ?? 24);
for (let k = 0; k < COUNT; k++) {
  const format = (k % 4 === 3 ? 0 : 1) as 0 | 1;
  const house = k % 3 === 2 ? rand(3) : null;
  const pick = () => { const ids: number[] = []; while (ids.length < 8) { const id = rand(roster.length); if (!ids.includes(id)) ids.push(id); } return ids; };
  const deck0 = pick(); const deck1 = pick();
  const mods = [...deck0, ...deck1].map((id) => (roster[id].kind === 'house' ? 0 : rand(3001) - 1500));
  const seed = (rand(0xffffffff) ^ (k * 2654435761)) >>> 0;
  const init = initialState(seed, [matchCards(roster, deck0, mods.slice(0, 8)), matchCards(roster, deck1, mods.slice(8))], format);
  const d0 = (['easy', 'normal', 'hard'] as const)[rand(3)];
  const d1 = (['easy', 'normal', 'hard'] as const)[rand(3)];
  // record: the log is what the arena would store (seat 0, plus seat 1 unless it is the house)
  const s = structuredClone(init);
  const log: InputEvent[] = [];
  const pending: InputEvent[] = [];
  const checkpoints: [number, number][] = [];
  while (s.phase !== 'ended') {
    const a = decideBot(s, 0, d0); if (a) log.push(a);
    if (house === null) { const b = decideBot(s, 1, d1); if (b) log.push(b); }
    if (rand(23) === 0) log.push({ tick: s.tick + 1 + rand(3), player: (house === null ? rand(2) : 0) as 0 | 1, deckIndex: rand(8), x: rand(65536), y: rand(65536) });
    refereeStep(s, log, house === null ? null : HOUSE_DIFFICULTY[house], pending);
    if (s.tick % 40 === 0) checkpoints.push([s.tick, hashState(s)]);
  }
  void stepSim;
  log.sort((x, y) => x.tick - y.tick);
  fixtures.push({
    seed, format, house, deck0, deck1, mods,
    cards: [init.players[0].deck.map((c) => [c.archetype, c.trait, c.metaBps ?? 0]), init.players[1].deck.map((c) => [c.archetype, c.trait, c.metaBps ?? 0])],
    plays: log.map((e) => [e.tick, e.player, e.deckIndex, e.x, e.y]),
    initialHash: hashState(init), checkpoints, winner: s.winner === -2 ? 2 : s.winner, endTick: s.tick, finalHash: hashState(s),
  });
}
const out = resolve(root, 'packages/contract/tests/fixtures');
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'parity.json'), JSON.stringify({ traits: roster.map((f: { ticker: string }) => f.ticker), fixtures }));
console.log(`wrote ${fixtures.length} fixtures; winners ${fixtures.map((f) => f.winner).join('')}; plays ${fixtures.reduce((n, f) => n + f.plays.length, 0)}`);
