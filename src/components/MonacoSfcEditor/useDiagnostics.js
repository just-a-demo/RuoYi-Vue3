import { compileTemplate, parse } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
import { WorkerManager as CssWorkerManager } from 'monaco-editor/languages/features/css/workerManager.js'
import { createVirtualModels } from './useVueSfcModels.js'

const OWNER = 'vue-studio-sfc'

export function useDiagnostics(monaco, sourceModel, componentKey, onResult, getTsWorker) {
  const virtual = createVirtualModels(monaco, componentKey)
  const cssManager = new CssWorkerManager(monaco.css.cssDefaults)
  let generation = 0
  let timer
  let disposed = false

  function marker(message, severity = monaco.MarkerSeverity.Error, source = 'vue-sfc', code = 'parse', start = { line: 1, column: 1 }, end = start) {
    return { message, severity, source, code: String(code),
      startLineNumber: start.line, startColumn: start.column,
      endLineNumber: end.line, endColumn: end.line === start.line ? Math.max(start.column + 1, end.column) : end.column }
  }
  async function run() {
    clearTimeout(timer)
    if (disposed) return
    const current = ++generation
    const version = sourceModel.getVersionId()
    const source = sourceModel.getValue()
    const stale = () => disposed || current !== generation || sourceModel.isDisposed() || sourceModel.getVersionId() !== version
    const { descriptor, errors } = parse(source, { filename: componentKey + '.vue' })
    const markers = errors.map(error => marker(error.message || String(error), undefined, 'vue-sfc', error.code || 'parse', error.loc?.start, error.loc?.end))
    if (!descriptor.template) markers.push(marker('缺少 <template> 区块', undefined, 'vue-sfc', 'missing-template'))
    if (descriptor.template && !errors.length) {
      const result = compileTemplate({ id: 'diagnostics', filename: 'Component.vue', source: descriptor.template.content })
      for (const error of result.errors) {
        const offset = descriptor.template.loc.start.offset
        const start = sourceModel.getPositionAt(offset + (error.loc?.start?.offset || 0))
        const end = sourceModel.getPositionAt(offset + (error.loc?.end?.offset || 1))
        markers.push(marker(error.message || String(error), undefined, 'vue-template', error.code || 'compile', { line: start.lineNumber, column: start.column }, { line: end.lineNumber, column: end.column }))
      }
    }
    if (descriptor.script && !descriptor.scriptSetup) markers.push(marker('建议使用 <script setup lang="ts">', monaco.MarkerSeverity.Warning, 'vue-sfc', 'prefer-script-setup', descriptor.script.loc.start))
    const { models } = virtual.update(source)
    const tsModel = models.get('script')
    try {
      if (tsModel.getValue().trim()) {
        const service = await getTsWorker(tsModel.uri)
        if (stale()) return
        const results = await Promise.all([service.getSyntacticDiagnostics(tsModel.uri.toString()), service.getSemanticDiagnostics(tsModel.uri.toString())])
        if (stale()) return
        const flatten = item => typeof item === 'string' ? item : item.messageText + (item.next || []).map(flatten).join(' ')
        for (const error of results.flat()) {
          const start = tsModel.getPositionAt(error.start || 0)
          const end = tsModel.getPositionAt((error.start || 0) + Math.max(1, error.length || 1))
          markers.push(marker(flatten(error.messageText), error.category === 0 ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error, 'typescript', error.code, { line: start.lineNumber, column: start.column }, { line: end.lineNumber, column: end.column }))
        }
      }
      const style = models.get('style')
      if (style.getValue().trim()) {
        const worker = await cssManager.getLanguageServiceWorker(style.uri)
        const diagnostics = await worker.doValidation(style.uri.toString())
        if (stale()) return
        for (const item of diagnostics) markers.push(marker(item.message, item.severity === 1 ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning, 'css', item.code || 'validation',
          { line: item.range.start.line + 1, column: item.range.start.character + 1 },
          { line: item.range.end.line + 1, column: item.range.end.character + 1 }))
      }
    } catch (error) {
      if (stale()) return
      markers.push(marker('语言服务检查失败：' + (error.message || String(error)), monaco.MarkerSeverity.Warning, 'language-service', 'unavailable'))
    }
    if (stale()) return
    const unique = [...new Map(markers.map(item => [JSON.stringify(item), item])).values()]
    monaco.editor.setModelMarkers(sourceModel, OWNER, unique)
    onResult(unique)
    return unique
  }
  function schedule() {
    generation += 1
    clearTimeout(timer)
    timer = setTimeout(run, 450)
  }
  return { run, schedule, dispose() {
    disposed = true
    generation += 1
    clearTimeout(timer)
    monaco.editor.setModelMarkers(sourceModel, OWNER, [])
    cssManager.dispose()
    virtual.dispose()
  } }
}
