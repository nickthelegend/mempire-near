// SPDX-License-Identifier: MIT
// near-api-js needs Buffer and global in the browser. Imported FIRST by main.tsx.
import { Buffer } from 'buffer';
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
(globalThis as unknown as { global: typeof globalThis }).global ??= globalThis;
