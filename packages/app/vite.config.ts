import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const proxy = {
  '/near-rpc': { target: 'https://rpc.testnet.near.org', changeOrigin: true, rewrite: () => '/' },
  '/relay-api': { target: 'http://127.0.0.1:5399', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/relay-api/, '') },
};
export default defineConfig({ plugins: [react()], server: { proxy, fs: { allow: ['../..'] } }, preview: { proxy } });
