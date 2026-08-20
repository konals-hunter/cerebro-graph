import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    platform: 'node',
    dts: true,
    clean: true,
    fixedExtension: false,
  },
  {
    name: '@dsh-external/dsh-doc-graph/client',
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2023',
    dts: false,
    clean: false,
    fixedExtension: false,
    hash: false,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      codeSplitting: false,
      banner: "window.__ModuleLoader__.load({ id: '@dsh-external/dsh-doc-graph', factory: (require) => {",
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])