// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { KeyPair } from 'near-api-js';
import { signSnapshot, verifySnapshot, toE8, SOURCE } from './prices';

describe('price relayer', () => {
  it('authenticates keeper posts and rejects tampering, expiry and malformed signatures', () => {
    const key=KeyPair.fromRandom('ed25519');
    const rows: [string,string,string][]=['BTC','ETH','NEAR','SOL','ZEC'].map(s=>[s,'100','101']);
    const signed=signSnapshot(key,rows,1000000);
    expect(verifySnapshot(key,signed.payload,signed.signature,1000000)).toBe(true);
    expect(verifySnapshot(key,signed.payload.replace('101','102'),signed.signature,1000000)).toBe(false);
    expect(verifySnapshot(key,signed.payload,signed.signature,2000000)).toBe(false);
    expect(verifySnapshot(key,signed.payload,'invalid',1000000)).toBe(false);
  });
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
