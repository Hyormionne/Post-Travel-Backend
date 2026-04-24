/**
 * Custom Jest transform for E2E tests.
 *
 * Handles two issues with Prisma 7 + Jest CJS:
 *
 * 1. `import.meta.url` in generated `.ts`/`.js` files (ESM __dirname polyfill)
 *    → replaced with CJS-compatible `("file://" + __filename)`
 *
 * 2. ESM `export { ... }` syntax in `.mjs` WASM runtime files
 *    → converted to `Object.assign(module.exports, { ... })` so Jest CJS can load them
 */

const { TsJestTransformer } = require('ts-jest');

const transformer = new TsJestTransformer({
  tsconfig: {
    module: 'CommonJS',
    moduleResolution: 'node',
    resolvePackageJsonExports: false,
  },
});

function patchTsJs(sourceText) {
  // Replace `import.meta.url` with CJS equivalent
  return sourceText.replace(/import\.meta\.url/g, '("file://" + __filename)');
}

function patchMjs(sourceText) {
  // Convert ESM export syntax to CJS for .mjs files
  // Pattern: export { A as B, C as D, ... };
  let patched = sourceText;

  // Replace named exports at end of file: export { ... };
  patched = patched.replace(
    /export\s*\{([^}]+)\}\s*;?\s*$/gm,
    (match, exports) => {
      const pairs = exports
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
        .map((e) => {
          const parts = e.split(/\s+as\s+/);
          const localName = parts[0].trim();
          const exportedName = parts[1] ? parts[1].trim() : localName;
          return `  ${JSON.stringify(exportedName)}: ${localName}`;
        })
        .join(',\n');
      return `Object.assign(module.exports, {\n${pairs}\n});`;
    },
  );

  // Remove any remaining `export` keywords from declarations
  patched = patched.replace(/^export\s+/gm, '');

  return patched;
}

module.exports = {
  process(sourceText, sourcePath, options) {
    if (sourcePath.endsWith('.mjs')) {
      return { code: patchMjs(sourceText) };
    }
    return transformer.process(patchTsJs(sourceText), sourcePath, options);
  },
  getCacheKey(sourceText, sourcePath, options) {
    const patched = sourcePath.endsWith('.mjs')
      ? patchMjs(sourceText)
      : patchTsJs(sourceText);
    if (typeof transformer.getCacheKey === 'function' && !sourcePath.endsWith('.mjs')) {
      return transformer.getCacheKey(patched, sourcePath, options);
    }
    return JSON.stringify({ patched, sourcePath });
  },
};
