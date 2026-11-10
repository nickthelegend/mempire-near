// SPDX-License-Identifier: MIT
// Transaction hashes for a match. The arena stores plays and results but not the hashes that carried them, and the
// public explorer API is rate-limited, so a receipt shows two honest sources:
//   1. the testnet runs recorded in this repo (deployments/testnet-2026-11-09.json, docs/evidence-browser-house.json);
//   2. the transactions this browser sent or saw during the match (saved per match in localStorage).
import runs from '../../../../deployments/testnet-2026-11-09.json';
import evidence from '../../../../docs/evidence-browser-house.json';

export interface ReceiptTx { label: string; hash: string; source: 'recorded' | 'this browser' }

type Step = { step: string; hash?: string };
const HASH_IN_URL = /\/txns\/([A-Za-z0-9]+)/;

/** Recorded steps that name the match ("#5", "match #5"), keyed by match id. */
function recorded(): Map<string, ReceiptTx[]> {
  const out = new Map<string, ReceiptTx[]>();
  const add = (id: string, tx: ReceiptTx) => { const list = out.get(id) ?? []; if (!list.some((t) => t.hash === tx.hash)) list.push(tx); out.set(id, list); };
  const steps: Step[] = [
    ...(runs as { runs: { steps: Step[] }[] }).runs.flatMap((r) => r.steps),
    ...(runs as { settlements: Step[] }).settlements,
  ];
  for (const s of steps) {
    if (!s.hash) continue;
    for (const m of s.step.matchAll(/#(\d+)/g)) add(m[1], { label: s.step, hash: s.hash, source: 'recorded' });
  }
  const ev = evidence as { match: string; txs: { label: string; url: string }[] };
  for (const t of ev.txs) {
    const h = HASH_IN_URL.exec(t.url)?.[1];
    if (h) add(ev.match, { label: t.label, hash: h, source: 'recorded' });
  }
  return out;
}
const RECORDED = recorded();

const key = (id: string) => `mempire:near:txs:${id}`;
export function saveBrowserTxs(id: string, txs: { label: string; hash?: string }[]) {
  try {
    const rows = txs.filter((t) => t.hash).map((t) => ({ label: t.label, hash: t.hash! }));
    if (rows.length) localStorage.setItem(key(id), JSON.stringify(rows.slice(-60)));
  } catch { /* storage full or blocked: the receipt simply shows fewer rows */ }
}
function browserTxs(id: string): ReceiptTx[] {
  try {
    const raw = localStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as { label: string; hash: string }[]).map((t) => ({ ...t, source: 'this browser' as const })) : [];
  } catch { return []; }
}

export function receiptTxs(id: string): ReceiptTx[] {
  const seen = new Set<string>();
  return [...(RECORDED.get(id) ?? []), ...browserTxs(id)].filter((t) => (seen.has(t.hash) ? false : (seen.add(t.hash), true)));
}
