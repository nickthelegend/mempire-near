import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const deployments = resolve(import.meta.dirname, '../../deployments');
export default defineConfig({plugins:[react(),{
  name:'arena-deployments',
  configureServer(server){server.middlewares.use('/deployments', (req,res,next)=>{if(!/^\/[0-9]+\.json$/.test(req.url||''))return next();const file=resolve(deployments,(req.url||'').slice(1));if(!existsSync(file)){res.statusCode=404;res.end('No deployment');return}res.setHeader('content-type','application/json');res.end(requireText(file))})},
  writeBundle(){const out=resolve(import.meta.dirname,'dist/deployments');mkdirSync(out,{recursive:true});for(const name of readdirSync(deployments)){if(/^\d+\.json$/.test(name))copyFileSync(resolve(deployments,name),resolve(out,name))}}
}],server:{port:4610,strictPort:true},preview:{port:4611,strictPort:true}});
function requireText(file:string){return requireFile(file)}
import { readFileSync as requireFile } from 'node:fs';
