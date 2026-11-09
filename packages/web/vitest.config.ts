import { defineConfig } from 'vitest/config';
// @near-js ESM builds import without file extensions; let Vite resolve them (same as packages/sdk).
export default defineConfig({ test: { server: { deps: { inline: [/@near-js/, /near-api-js/] } } } });
