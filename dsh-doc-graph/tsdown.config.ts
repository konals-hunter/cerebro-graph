import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import { defineConfig } from 'tsdown'

const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-tool/client',
  '@deepseek-ai/dsh-client-ui-conversation/client',
  '@deepseek-ai/dsh-client-runtime/client',
] as const

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

const inlineCssPlugin: any = {
  name: 'dsh-css-inline',
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith('.css') || source.includes('?')) return null
    const abs = importer !== undefined ? resolvePath(dirname(importer), source) : source
    return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
  },
  async load(id: string) {
    if (!id.startsWith(CSS_VIRTUAL_PREFIX)) return null
    const fileId = id.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
    this.addWatchFile(fileId)
    const source = await readFile(fileId, 'utf8')
    return [
      'const css = ' + JSON.stringify(source) + ';',
      'const tagId = ' + JSON.stringify('dsh-doc-graph/' + basename(fileId)) + ';',
      "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
      "  const tag = document.createElement('style');",
      "  tag.dataset.plugin = 'dsh-doc-graph';",
      '  tag.dataset.pluginCss = tagId;',
      '  tag.textContent = css;',
      '  document.head.appendChild(tag);',
      '}',
    ].join('\n')
  },
}

export default defineConfig([
  {
    name: '@dsh-external/dsh-doc-graph/node',
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
    external: [...PLATFORM_MODULES],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    plugins: [inlineCssPlugin],
    outputOptions: {
      entryFileNames: 'client.js',
      codeSplitting: false,
      banner: "window.__ModuleLoader__.load({ id: '@dsh-external/dsh-doc-graph', factory: (require) => {",
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])