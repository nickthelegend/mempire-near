// SPDX-License-Identifier: MIT
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** Base58 decode (block hashes from RPC). */
export default function bs58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) { const i = ALPHABET.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c === '1') bytes.unshift(0); else break; }
  return new Uint8Array(bytes);
}
