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
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    platform: 'browser',
    dts: false,
    clean: false,
    fixedExtension: false,
    hash: false,
    outputOptions: {
      inlineDynamicImports: true,
    },
  },
])