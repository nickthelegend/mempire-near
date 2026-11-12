// Release guard: development wallet automation must never ship, even if its env flag was set.
import {readdirSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'../dist');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
const forbidden=/MEMPIRE_R3_QA_ONLY|__MEMPIRE_R3_SIGNER__|__MEMPIRE_R3_AUTHORIZE__|__MEMPIRE_R3_REPORT__|mempire-qa-signer/;
for(const path of files(root))if(/\.(js|html|map)$/.test(path)&&forbidden.test(readFileSync(path,'utf8')))throw Error('Development QA signer found in production artifact');
console.log('Production assets contain no QA signer.');
