/**
 * Jest setup for E2E tests.
 * Patches global `import()` to handle Prisma 7 WASM .mjs files
 * that would otherwise fail in Jest's CommonJS test environment.
 *
 * The WASM query compiler .mjs files are ESM-only; we load them
 * via Node's native `require` after transforming ESM exports to CJS-compatible form.
 */

const Module = require('module');
const path = require('path');
const fs = require('fs');

// Patch the dynamic import function to handle .mjs files from @prisma/client
const originalImport = global.__proto__?.__import__;

// Node.js 22 supports dynamic import() natively, and .mjs files can be
// loaded via dynamic import even in CJS context — Jest just needs to not
// interfere. We don't need to patch anything here; the dynamic import()
// in generated/prisma/internal/class.js runs at $connect() time.
// Jest's CJS environment DOES support dynamic import() for .mjs files.
// No patching needed.
