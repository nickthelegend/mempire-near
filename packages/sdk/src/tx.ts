// SPDX-License-Identifier: MIT
// Signing and sending with one key: a full-access device key, or a per-match session key that can
// only call `play`. Nonces are kept locally so plays can be broadcast back to back without waiting
// for the previous one, and NEP-366 delegate actions (meta transactions) are signed here too.
import { KeyPair } from 'near-api-js';
import { PublicKey } from '@near-js/crypto';
import {
  actionCreators, buildDelegateAction, createTransaction, encodeSignedDelegate, encodeTransaction,
  Signature, SignedTransaction, signDelegateAction, SCHEMA, type Action,
} from '@near-js/transactions';
import { deserialize } from 'borsh';
import { sha256 } from '@noble/hashes/sha256';
import bs58Decode from './bs58';
import { latestBlock, rpc, RpcError, toBase64, fromBase64, viewAccessKey } from './rpc';

export const TGAS = 1_000_000_000_000n;
export { actionCreators, KeyPair };

export function fnCall(method: string, args: unknown, tgas = 30, depositYocto: bigint | string = 0n): Action {
  return actionCreators.functionCall(method, new TextEncoder().encode(JSON.stringify(args)), BigInt(tgas) * TGAS, BigInt(depositYocto));
}

/** AddKey action for a session key: function-call only, on `receiver`, for `methods`, with a gas allowance. */
export function addSessionKey(publicKey: string, receiver: string, methods: string[], allowanceYocto: bigint): Action {
  return actionCreators.addKey(PublicKey.from(publicKey), actionCreators.functionCallAccessKey(receiver, methods, allowanceYocto));
}
export function deleteKey(publicKey: string): Action {
  return actionCreators.deleteKey(PublicKey.from(publicKey));
}

export interface TxOutcome {
  hash: string;
  ok: boolean;
  error?: string;
  /** SuccessValue of the first receipt, JSON-decoded when possible. */
  value?: unknown;
  gasBurnt: bigint;
  logs: string[];
}

type FinalOutcome = {
  status: { SuccessValue?: string; Failure?: unknown };
  transaction: { hash: string };
  transaction_outcome: { outcome: { gas_burnt: number } };
  receipts_outcome: { outcome: { gas_burnt: number; logs: string[]; status: { SuccessValue?: string; Failure?: unknown } } }[];
};

function readFailure(f: unknown): string {
  const s = JSON.stringify(f);
  const m = s.match(/"ExecutionError":"((?:[^"\\]|\\.)*)"/);
  if (m) return m[1].replace(/^Smart contract panicked: /, '').replace(/\\"/g, '"');
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

export function parseOutcome(o: FinalOutcome): TxOutcome {
  const gasBurnt = BigInt(o.transaction_outcome.outcome.gas_burnt) + o.receipts_outcome.reduce((n, r) => n + BigInt(r.outcome.gas_burnt), 0n);
  const logs = o.receipts_outcome.flatMap((r) => r.outcome.logs);
  const failed = o.status.Failure ?? o.receipts_outcome.find((r) => r.outcome.status.Failure)?.outcome.status.Failure;
  if (failed) return { hash: o.transaction.hash, ok: false, error: readFailure(failed), gasBurnt, logs };
  let value: unknown;
  const raw = o.status.SuccessValue;
  if (raw) { const text = new TextDecoder().decode(fromBase64(raw)); try { value = JSON.parse(text); } catch { value = text; } }
  return { hash: o.transaction.hash, ok: true, value, gasBurnt, logs };
}

/** One account + one key. Serialises nonce use so concurrent sends never collide. */
export class KeySigner {
  private nonce: bigint | null = null;
  private blockHash: { hash: Uint8Array; at: number } | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly rpcUrl: string, readonly accountId: string, readonly keyPair: KeyPair) {}

  get publicKey(): string { return this.keyPair.getPublicKey().toString(); }

  private async recentBlockHash() {
    if (!this.blockHash || Date.now() - this.blockHash.at > 10 * 60_000) {
      const b = await latestBlock(this.rpcUrl, 'final');
      this.blockHash = { hash: bs58Decode(b.hash), at: Date.now() };
    }
    return this.blockHash.hash;
  }

  private async nextNonce(): Promise<bigint> {
    if (this.nonce === null) {
      const k = await viewAccessKey(this.rpcUrl, this.accountId, this.publicKey);
      this.nonce = BigInt(k.nonce);
    }
    this.nonce += 1n;
    return this.nonce;
  }

  /** Sign (in order, with the next nonce) without sending. */
  async sign(receiverId: string, actions: Action[]): Promise<{ hash: string; bytes: Uint8Array }> {
    const job = this.queue.then(async () => {
      const nonce = await this.nextNonce();
      const tx = createTransaction(this.accountId, this.keyPair.getPublicKey(), receiverId, nonce, actions, await this.recentBlockHash());
      const digest = sha256(encodeTransaction(tx));
      const sig = this.keyPair.sign(digest);
      const signed = new SignedTransaction({ transaction: tx, signature: new Signature({ keyType: tx.publicKey.keyType, data: sig.signature }) });
      return { hash: bs58Encode(digest), bytes: signed.encode() };
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  /**
   * Sign and send. Broadcasts through this key are serialised until each transaction is included
   * in a block: NEAR rejects a nonce lower than one already used, so two in-flight transactions
   * that land out of order would lose the earlier one. The outcome is awaited outside the queue.
   */
  async send(receiverId: string, actions: Action[], onSigned?: (hash: string) => void): Promise<TxOutcome> {
    const job = this.queue.then(async () => {
      const nonce = await this.nextNonce();
      const tx = createTransaction(this.accountId, this.keyPair.getPublicKey(), receiverId, nonce, actions, await this.recentBlockHash());
      const digest = sha256(encodeTransaction(tx));
      const sig = this.keyPair.sign(digest);
      const signed = new SignedTransaction({ transaction: tx, signature: new Signature({ keyType: tx.publicKey.keyType, data: sig.signature }) });
      const hash = bs58Encode(digest);
      onSigned?.(hash);
      try {
        await rpc(this.rpcUrl, 'send_tx', { signed_tx_base64: toBase64(signed.encode()), wait_until: 'INCLUDED' });
      } catch (e) {
        if (e instanceof RpcError && /InvalidNonce|Expired/.test(e.message)) { this.nonce = null; this.blockHash = null; }
        if (!(e instanceof RpcError && /TIMEOUT|Timeout/i.test(e.message))) throw e;
      }
      return hash;
    });
    this.queue = job.catch(() => undefined);
    const hash = await job;
    return this.waitFor(hash);
  }

  async waitFor(hash: string, timeoutMs = 60_000): Promise<TxOutcome> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      try {
        const o = await rpc<FinalOutcome>(this.rpcUrl, 'tx', { tx_hash: hash, sender_account_id: this.accountId, wait_until: 'EXECUTED_OPTIMISTIC' });
        return parseOutcome(o);
      } catch { await new Promise((r) => setTimeout(r, 2000)); }
    }
    throw new Error(`Transaction ${hash} did not finish in ${timeoutMs / 1000} s`);
  }

  /** Call a contract method and throw a readable error if it fails. */
  async call<T = unknown>(contract: string, method: string, args: unknown, opts: { tgas?: number; deposit?: bigint | string } = {}): Promise<TxOutcome & { value?: T }> {
    const out = await this.send(contract, [fnCall(method, args, opts.tgas ?? 30, opts.deposit ?? 0n)]);
    if (!out.ok) throw new Error(`${method} failed: ${out.error} (tx ${out.hash})`);
    return out as TxOutcome & { value?: T };
  }

  /**
   * NEP-366: sign a delegate action for `receiverId` that a relayer wraps in its own transaction
   * and pays the gas for. Returns the borsh-encoded SignedDelegate as base64.
   */
  async signDelegate(receiverId: string, actions: Action[], ttlBlocks = 120): Promise<string> {
    const job = this.queue.then(async () => {
      const nonce = await this.nextNonce();
      const head = await latestBlock(this.rpcUrl, 'final');
      const delegateAction = buildDelegateAction({
        actions, maxBlockHeight: BigInt(head.height + ttlBlocks), nonce, publicKey: this.keyPair.getPublicKey(), receiverId, senderId: this.accountId,
      });
      const kp = this.keyPair;
      const { signedDelegateAction } = await signDelegateAction({ delegateAction, signer: { sign: async (message: Uint8Array) => kp.sign(sha256(message)).signature } });
      return toBase64(encodeSignedDelegate(signedDelegateAction));
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
}

/** Relayer side: decode a base64 SignedDelegate into the action that carries it. */
export function decodeSignedDelegate(b64: string) {
  const decoded = deserialize(SCHEMA.SignedDelegate, fromBase64(b64)) as {
    delegateAction: { senderId: string; receiverId: string; actions: Record<string, unknown>[]; nonce: bigint; maxBlockHeight: bigint; publicKey: unknown };
    signature: unknown;
  };
  return decoded;
}
export function signedDelegateAction(decoded: ReturnType<typeof decodeSignedDelegate>): Action {
  return actionCreators.signedDelegate(decoded as never);
}

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function bs58Encode(bytes: Uint8Array): string {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}
