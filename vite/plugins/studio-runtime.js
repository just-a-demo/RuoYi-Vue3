import { build } from 'esbuild'
import path from 'node:path'

// Ship the same Vue/FormCreate runtime into opaque-origin preview and designer frames.
export default function studioRuntime() {
  let bundle
  const id = '\0virtual:studio-runtime'
  return {
    name: 'studio-runtime',
    handleHotUpdate(context) {
      if (context.file.endsWith('/src/studio-runtime/frame.js')) {
        bundle = undefined
        const module = context.server.moduleGraph.getModuleById(id)
        if (module) context.server.moduleGraph.invalidateModule(module)
        context.server.ws.send({ type: 'full-reload' })
      }
    },
    resolveId(source) { if (source === 'virtual:studio-runtime') return id },
    async load(source) {
      if (source !== id) return
      if (!bundle) bundle = build({
        entryPoints: [path.resolve('src/studio-runtime/frame.js')],
        bundle: true, write: false, outdir: '.studio-runtime', format: 'iife',
        platform: 'browser', target: 'es2020', minify: true, legalComments: 'none',
        alias: { vue: 'vue/dist/vue.esm-bundler.js' },
        define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
        loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl' }
      }).then(result => ({
        script: result.outputFiles.find(file => file.path.endsWith('.js')).text,
        css: result.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')
      }))
      return 'export default ' + JSON.stringify(await bundle)
    }
  }
}
