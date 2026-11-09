// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { KeyPair } from 'near-api-js';
import { signSnapshot, toE8, SOURCE } from './prices';

describe('price relayer', () => {
  it('converts decimal prices to 8-decimal integers without floats', () => {
    expect(toE8('75011.37')).toBe(7501137000000n);
    expect(toE8('3.6045')).toBe(360450000n);
    expect(toE8('1196.18')).toBe(119618000000n);
    expect(() => toE8('1e5')).toThrow();
  });
  it('signs the exact payload bytes the arena verifies', () => {
    const kp = KeyPair.fromRandom('ed25519');
    const { payload, signature } = signSnapshot(kp, [['BTC', '1', '2']], 123);
    expect(JSON.parse(payload)).toEqual({ ts_ms: 123, source: SOURCE, prices: [['BTC', '1', '2']] });
    const sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    expect(kp.verify(new TextEncoder().encode(payload), sig)).toBe(true);
    expect(kp.verify(new TextEncoder().encode(payload.replace('"2"', '"3"')), sig)).toBe(false);
  });
});
