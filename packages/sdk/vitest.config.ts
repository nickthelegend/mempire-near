import { defineConfig } from 'vitest/config';
// @near-js ESM builds import without file extensions; let Vite resolve them.
export default defineConfig({ test: { server: { deps: { inline: [/@near-js/, /near-api-js/] } } } });
