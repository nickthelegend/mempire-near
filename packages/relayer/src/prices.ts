// SPDX-License-Identifier: MIT
// The testnet price relayer. Pyth Core ended NEAR support, so the arena accepts ed25519-signed
// snapshots instead: this reads Coinbase Exchange's public 24 h stats (`open` = 24 h ago, `last` =
// latest trade) for each market fighter, signs the exact JSON payload, and posts it. The contract
// verifies the signature against the relayer key it was initialised with. Labelled "relayer price
// (testnet)" everywhere it is shown.
import type { KeyPair } from 'near-api-js';
import { toBase64 } from '@mempire/sdk';

export const SOURCE = 'https://api.exchange.coinbase.com/products/{SYMBOL}-USD/stats';
export const MARKET = ['BTC', 'ETH', 'NEAR', 'SOL', 'ZEC'] as const;

/** "75011.37" -> 7501137000000n (8 decimals), exactly, without floats. */
export function toE8(s: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a price: ${s}`);
  const [w, f = ''] = s.split('.');
  return BigInt(w) * 100_000_000n + BigInt((f + '00000000').slice(0, 8));
}

export async function fetchSnapshot(fetchImpl: typeof fetch = fetch) {
  const rows: [string, string, string][] = [];
  for (const sym of MARKET) {
    const url = SOURCE.replace('{SYMBOL}', sym);
    const res = await fetchImpl(url, { headers: { 'user-agent': 'mempire-relayer/0.1' } });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    const j = await res.json() as { open?: string; last?: string };
    if (!j.open || !j.last) throw new Error(`${url} -> no open/last`);
    rows.push([sym, toE8(j.open).toString(), toE8(j.last).toString()]);
  }
  return rows;
}

export function signSnapshot(key: KeyPair, rows: [string, string, string][], tsMs = Date.now()) {
  const payload = JSON.stringify({ ts_ms: tsMs, source: SOURCE, prices: rows });
  const sig = key.sign(new TextEncoder().encode(payload)).signature;
  return { payload, signature: toBase64(sig) };
}
