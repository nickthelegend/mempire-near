import { afterEach, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { middleware } from '../scripts/near-rpc-proxy';

afterEach(()=>vi.unstubAllGlobals());
it('broadcasts and reads signing nonces while background reads occupy the read pool', async()=>{
  const releases:(()=>void)[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{
    const request=JSON.parse(String(init.body));
    if(request.method==='block')await new Promise<void>(resolve=>releases.push(resolve));
    return new Response(JSON.stringify({result:request.method}));
  }));
  const post=(data:unknown)=>new Promise<string>((resolve,reject)=>{
    const request=Readable.from([JSON.stringify(data)]) as IncomingMessage;
    request.url='/near-rpc';request.method='POST';
    const response={writeHead:()=>{},end:(body:string)=>resolve(body)} as unknown as ServerResponse;
    void middleware(request,response,()=>reject(Error('Unexpected fallthrough'))).catch(reject);
  });
  const reads=[1,2,3].map(id=>post({id,method:'block',params:{finality:'final',fixture:id}}));
  try{
    await vi.waitFor(()=>expect(releases).toHaveLength(3));
    const write=await post({id:4,method:'send_tx',params:{signed_tx_base64:'test fixture'}});
    const nonce=await post({id:5,method:'query',params:{request_type:'view_access_key'}});
    expect(JSON.parse(write).result).toBe('send_tx');
    expect(JSON.parse(nonce).result).toBe('query');
  }finally{for(const release of releases)release();await Promise.all(reads);}
});
