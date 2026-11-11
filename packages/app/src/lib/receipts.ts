export interface Receipt { label: string; hash: string; ok?: boolean; matchId?: string }
interface Evidence { match?: { id: string }; transactions?: Receipt[] }
const recorded = import.meta.glob<Evidence>(['../../../../deployments/monad-client-match-*.json', '../../../../deployments/reposition-match-*.json'], { eager: true, import: 'default' });
function browserReceipts(): Receipt[] {
  try { return JSON.parse(localStorage.getItem('mempire:near:receipts') || '[]'); } catch { return []; }
}
function unique(rows: Receipt[]) {
  const byHash = new Map<string, Receipt>();
  for (const row of rows) if (row.hash) byHash.set(row.hash, row);
  return [...byHash.values()];
}
export function matchReceipts(id: number): Receipt[] {
  const local = browserReceipts().filter(r => r.matchId===String(id) || (!r.matchId && r.label.match(/#(\d+)/)?.[1]===String(id)));
  const chain = Object.values(recorded).filter(r => r.match?.id === String(id)).flatMap(r => r.transactions ?? []).filter(r=>r.matchId===String(id) || (!r.matchId && r.label.match(/#(\d+)/)?.[1]===String(id)));
  return unique([...local, ...chain]);
}
export function allReceipts(): Receipt[] {
  return unique([...browserReceipts(), ...Object.values(recorded).flatMap(r => r.transactions ?? [])]);
}
