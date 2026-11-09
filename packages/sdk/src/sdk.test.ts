// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { KeyPair } from 'near-api-js';
import { PublicKey } from '@near-js/crypto';
import { buildDelegateAction, encodeSignedDelegate, signDelegateAction } from '@near-js/transactions';
import { sha256 } from '@noble/hashes/sha256';
import bs58Decode from './bs58';
import { addSessionKey, bs58Encode, decodeSignedDelegate, fnCall, parseOutcome, toBase64 } from './index';
import { formatNear, moveBps, parseNear } from './arena';

describe('sdk', () => {
  it('round-trips base58', () => {
    const bytes = new Uint8Array([0, 0, 1, 2, 250, 99, 7]);
    expect(bs58Decode(bs58Encode(bytes))).toEqual(bytes);
  });
  it('formats and parses NEAR amounts exactly', () => {
    expect(parseNear('0.01')).toBe(10n ** 22n);
    expect(formatNear(parseNear('1.234'))).toBe('1.234');
    expect(formatNear(18n * 10n ** 21n)).toBe('0.018');
  });
  it('computes the 24 h move in basis points from e8 prices', () => {
    expect(moveBps('7567880000000', '7501137000000')).toBe(-88);
    expect(moveBps('0', '5')).toBe(0);
  });
  it('a signed delegate (NEP-366) decodes to the same sender, receiver and session-key action', async () => {
    const kp = KeyPair.fromRandom('ed25519');
    const session = KeyPair.fromRandom('ed25519');
    const delegateAction = buildDelegateAction({
      actions: [addSessionKey(session.getPublicKey().toString(), 'arena.testnet', ['play'], parseNear('0.25'))],
      maxBlockHeight: 1000n, nonce: 7n, publicKey: PublicKey.from(kp.getPublicKey().toString()), receiverId: 'p.relay.testnet', senderId: 'p.relay.testnet',
    });
    const { signedDelegateAction } = await signDelegateAction({ delegateAction, signer: { sign: async (m: Uint8Array) => kp.sign(sha256(m)).signature } });
    const decoded = decodeSignedDelegate(toBase64(encodeSignedDelegate(signedDelegateAction)));
    expect(decoded.delegateAction.senderId).toBe('p.relay.testnet');
    const add = (decoded.delegateAction.actions[0] as Record<string, any>).addKey;
    expect(add.accessKey.permission.functionCall.methodNames).toEqual(['play']);
    expect(add.accessKey.permission.functionCall.receiverId).toBe('arena.testnet');
    expect(BigInt(add.accessKey.permission.functionCall.allowance)).toBe(parseNear('0.25'));
  });
  it('reads a contract panic out of a failed outcome', () => {
    const out = parseOutcome({
      status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: claim rejected by the referee: replay gives winner 1' } } } } },
      transaction: { hash: 'h' }, transaction_outcome: { outcome: { gas_burnt: 1 } }, receipts_outcome: [],
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe('claim rejected by the referee: replay gives winner 1');
    expect(fnCall('play', {}, 15)).toBeTruthy();
  });
});
