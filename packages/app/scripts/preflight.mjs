import {readFileSync} from 'node:fs';
const d=JSON.parse(readFileSync(new URL('../../../deployments/testnet.json',import.meta.url)));
if(d.network!=='testnet'||!d.arena.endsWith('.testnet'))throw new Error('Expected a recorded NEAR testnet arena.');
console.log('NEAR testnet deployment:',d.arena);
