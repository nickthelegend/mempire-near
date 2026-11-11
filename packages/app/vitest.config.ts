import {defineConfig} from 'vitest/config';
// Match the existing SDK/web setup: @near-js 1.x ESM has extensionless imports.
export default defineConfig({test:{server:{deps:{inline:[/@near-js/,/near-api-js/]}}}});
