import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import autoImport from 'unplugin-auto-import/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const shared = { vue: '__studioVue', 'vue-router': '__studioRouter', 'element-plus': '__studioElement', '@form-create/element-ui': '__studioFormCreate', pinia: '__studioPinia' }

export async function bundleStudioImports(names) {
  if (!names.length) return null
  for (const name of names) {
    if (name.startsWith('.') || name.startsWith('@/') || name.startsWith('~/')) {
      const resolved = name.startsWith('~/') ? path.resolve(root, name.slice(2)) : path.resolve(root, 'src', name.startsWith('@/') ? name.slice(2) : name)
      if (!resolved.startsWith(root)) throw new Error('组件导入必须位于当前前端项目中：' + name)
    }
  }
  const entry = path.join(root, 'studio-imports-entry.js').replace(/\\/g, '/')
  const imports = names.map((name, index) => `import * as m${index} from ${JSON.stringify(name)};`).join('\n')
  const registry = names.map((name, index) => `${JSON.stringify(name)}: m${index}`).join(',')
  const result = await build({
    configFile: false, root, logLevel: 'silent',
    resolve: { alias: { '@': path.join(root, 'src'), '~': root }, extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'] },
    plugins: [
      { name: 'studio-import-entry', resolveId(id, importer) {
        if (id === entry) return entry
        if (importer === entry && id.startsWith('.')) return this.resolve(path.resolve(root, 'src', id))
      }, load(id) { if (id === entry) return `${imports}\nexport default {${registry}}` } },
      vue(), autoImport({ imports: ['vue', 'vue-router', 'pinia'], dts: false })
    ],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, target: 'es2022', minify: 'esbuild', assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      lib: { entry, name: 'StudioImports', formats: ['iife'] },
      rollupOptions: { external: Object.keys(shared), output: { globals: shared, inlineDynamicImports: true } }
    }
  })
  const output = (Array.isArray(result) ? result[0] : result).output
  const code = output.find(item => item.type === 'chunk').code
  const css = output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => String(item.source)).join('\n')
  return { code, css }
}
