// SPDX-License-Identifier: MIT
// Minimal NEAR JSON-RPC over fetch: views, account/key queries, blocks and transaction status.
// Works in the browser and in Node 22 without any polyfill.

export interface Network {
  networkId: string;
  rpc: string;
  arena: string;
  relayer?: string;
  explorer: string;
}

export class RpcError extends Error {
  constructor(message: string, readonly data?: unknown) { super(message); }
}

let rpcId = 0;
export async function rpc<T>(url: string, method: string, params: unknown): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) });
      if (res.status === 429 || res.status >= 500) { lastError = new RpcError(`RPC ${res.status}`); await sleep(500 * 2 ** attempt); continue; }
      const body = await res.json() as { result?: T; error?: { message?: string; data?: unknown; cause?: { name?: string; info?: unknown } } };
      if (body.error) {
        const cause = body.error.cause?.name;
        throw new RpcError(cause ? `${cause}${body.error.cause?.info ? `: ${JSON.stringify(body.error.cause.info)}` : ''}` : (body.error.message ?? 'RPC error'), body.error.data ?? body.error);
      }
      return body.result as T;
    } catch (e) {
      if (e instanceof RpcError) throw e;
      lastError = e; await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new RpcError(String(lastError));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const enc = new TextEncoder();
const dec = new TextDecoder();
export function toBase64(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Call a contract view method. Contract panics come back as readable errors. */
export async function view<T>(url: string, contract: string, method: string, args: unknown = {}): Promise<T> {
  const res = await rpc<{ result?: number[]; error?: string }>(url, 'query', {
    request_type: 'call_function', finality: 'optimistic', account_id: contract, method_name: method,
    args_base64: toBase64(enc.encode(JSON.stringify(args))),
  });
  if (res.error) throw new RpcError(res.error);
  return JSON.parse(dec.decode(new Uint8Array(res.result ?? []))) as T;
}

export interface AccountView { amount: string; locked: string; code_hash: string; storage_usage: number }
export function viewAccount(url: string, accountId: string) {
  return rpc<AccountView>(url, 'query', { request_type: 'view_account', finality: 'optimistic', account_id: accountId });
}

export interface AccessKeyView {
  nonce: number; block_hash: string;
  permission: 'FullAccess' | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } };
}
export function viewAccessKey(url: string, accountId: string, publicKey: string) {
  return rpc<AccessKeyView>(url, 'query', { request_type: 'view_access_key', finality: 'optimistic', account_id: accountId, public_key: publicKey });
}
export function viewAccessKeys(url: string, accountId: string) {
  return rpc<{ keys: { public_key: string; access_key: AccessKeyView }[] }>(url, 'query', { request_type: 'view_access_key_list', finality: 'optimistic', account_id: accountId });
}

export interface BlockHeader { height: number; hash: string; timestamp: number; timestamp_nanosec: string }
export async function latestBlock(url: string, finality: 'final' | 'optimistic' = 'final') {
  const b = await rpc<{ header: BlockHeader }>(url, 'block', { finality });
  return b.header;
}
