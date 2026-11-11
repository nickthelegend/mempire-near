import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {nearRpcProxy} from './scripts/near-rpc-proxy';
const proxy = {
  '/relay-api': { target: 'http://127.0.0.1:5399', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/relay-api/, '') },
};
export default defineConfig({ plugins: [react(),nearRpcProxy()], server: { proxy, fs: { allow: ['../..'] } }, preview: { proxy } });
