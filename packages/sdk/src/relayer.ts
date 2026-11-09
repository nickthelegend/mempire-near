// SPDX-License-Identifier: MIT
// Client for packages/relayer: email sign-in, account creation for a browser-held key, and NEP-366
// meta transactions (the relayer pays the gas for everything except the stake).
export interface RelayerInfo { relayer: string; arena: string; parent: string; starterNear: string; email: { configured: boolean; missing?: string } }

async function post<T>(base: string, path: string, body: unknown, allow422 = false): Promise<T> {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({ error: `Relayer ${res.status}` })) as T & { error?: string };
  if (allow422 && res.status === 422) return json;
  if (!res.ok || json.error) throw new Error(json.error ?? `Relayer ${res.status}`);
  return json;
}

export class RelayerClient {
  constructor(readonly base: string) {}
  async info(): Promise<RelayerInfo> {
    const res = await fetch(`${this.base}/info`);
    if (!res.ok) throw new Error(`Relayer ${res.status}`);
    return res.json();
  }
  /** Sends a 6-digit code to the email (needs the relayer's email provider key). */
  startEmail(email: string) { return post<{ sent: true }>(this.base, '/auth/start', { email }); }
  /** Verifies the code and creates (or recovers) the account for this browser's public key. */
  verifyEmail(email: string, code: string, publicKey: string) { return post<{ accountId: string; created: boolean; hash?: string }>(this.base, '/auth/verify', { email, code, publicKey }); }
  /** No email: a fresh relayer-created account for this browser's key. */
  guest(handle: string, publicKey: string) { return post<{ accountId: string; created: boolean; hash?: string }>(this.base, '/auth/guest', { handle, publicKey }); }
  /** Relay a base64 SignedDelegate; the relayer pays the gas. */
  relay(signedDelegate: string) { return post<{ hash: string; ok: boolean; error?: string; value?: unknown }>(this.base, '/relay', { signedDelegate }, true); }
}
