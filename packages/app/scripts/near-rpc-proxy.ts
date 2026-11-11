import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

// Share real reads across browser tabs. Never cache signing nonces or transactions.
// Public endpoints are documented at https://docs.near.org/api/rpc/providers.
const endpoints = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];
type Request = { id: string | number; method: string; params?: { request_type?: string; method_name?: string } };
type Reply = { result?: unknown; error?: unknown };
const cache = new Map<string, { at: number; promise: Promise<Reply> }>();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let active = 0;
const queue: (() => void)[] = [];
async function slot() { if (active >= 3) await new Promise<void>(resolve => queue.push(resolve)); else active++; }
function release() { const next = queue.shift(); if (next) next(); else active--; }
function ttl(r: Request) {
  if (r.method === 'block') return 1500;
  if (r.method !== 'query') return 0;
  if (r.params?.request_type === 'call_function') {
    if (r.params.method_name === 'get_config') return 60_000;
    if (r.params.method_name === 'get_prices') return 30_000;
    if (r.params.method_name === 'get_houses') return 4000;
    if (['get_points', 'current_season'].includes(r.params.method_name ?? '')) return 15_000;
    if (r.params.method_name === 'recent_matches') return 1500;
    return 300;
  }
  return r.params?.request_type === 'view_account' ? 500 : 0;
}
async function forward(request: Request): Promise<Reply> {
  const queuedRead = (request.method === 'query' || request.method === 'block') && request.params?.request_type !== 'view_access_key';
  if (queuedRead) await slot();
  try {
    let last = 'NEAR RPC unavailable';
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetch(endpoints[attempt % endpoints.length], {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', ...request }),
          signal: AbortSignal.timeout(request.method === 'send_tx' || request.method === 'tx' ? 60_000 : 4000),
        });
        if (response.status === 429 || response.status >= 500) { last = `NEAR RPC ${response.status}`; await sleep(300 * (attempt + 1)); continue; }
        if (!response.ok) { last = `NEAR RPC ${response.status}`; continue; }
        return await response.json() as Reply;
      } catch (error) { last = error instanceof Error ? error.message : String(error); }
    }
    // JSON-RPC errors use HTTP 200, just as nearcore does. The client surfaces this as a failure.
    return { error: { code: -32000, message: `${last}; retry the NEAR read.` } };
  } finally { if (queuedRead) release(); }
}
export async function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (req.url !== '/near-rpc') return next();
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
  let raw = '';
  for await (const part of req) { raw += part; if (raw.length > 64_000) { res.writeHead(413); res.end(); return; } }
  let request: Request;
  try { request = JSON.parse(raw); } catch { res.writeHead(400); res.end(); return; }
  const age = ttl(request), key = JSON.stringify([request.method, request.params]);
  const prior = age ? cache.get(key) : undefined;
  const promise = prior && Date.now() - prior.at < age ? prior.promise : forward(request);
  if (age && promise !== prior?.promise) cache.set(key, { at: Date.now(), promise });
  const reply = await promise;
  if (reply.error) cache.delete(key);
  if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.at > 60_000) cache.delete(k);
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...reply }));
}
export function nearRpcProxy(): Plugin {
  return { name: 'near-rpc-proxy', configureServer: server => { server.middlewares.use(middleware); },
    configurePreviewServer: server => { server.middlewares.use(middleware); } };
}
