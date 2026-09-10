import { getCompletions } from '@/api/vueStudio/component'
import { getScopeAtOffset, getSfcBlocks, virtualSource } from './useVueSfcModels'
import { WorkerManager as CssWorkerManager } from 'monaco-editor/languages/features/css/workerManager.js'
import { WorkerManager as HtmlWorkerManager } from 'monaco-editor/languages/features/html/workerManager.js'
import { ElMessage } from 'element-plus'

const builtins = {
  global: [
    { label: 'vue-sfc', insertText: '<template>\n  $1\n</template>\n\n<script setup lang="ts">\n$2\n</script>\n\n<style scoped>\n$3\n</style>', documentation: 'Vue 3 单文件组件骨架' }
  ],
  template: [
    { label: 'v-if', insertText: 'v-if="$1"', documentation: '条件渲染' },
    { label: 'v-for', insertText: 'v-for="($1, index) in $2" :key="index"', documentation: '列表渲染' }
  ],
  script: [
    { label: 'defineProps', insertText: 'const props = defineProps<{\n  $1\n}>()', documentation: '声明组件 props' },
    { label: 'defineEmits', insertText: 'const emit = defineEmits<{\n  $1\n}>()', documentation: '声明组件事件' },
    { label: 'defineExpose', insertText: 'defineExpose({ $1 })', documentation: '暴露组件公开成员' }
  ],
  style: [{ label: 'display-flex', insertText: 'display: flex;\n$1', documentation: 'Flex 布局' }]
}

function wordRange(model, position) {
  const word = model.getWordUntilPosition(position)
  return {
    startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
    startColumn: word.startColumn, endColumn: word.endColumn
  }
}

export function useVueCompletion(monaco, sourceModel, getTsWorker) {
  let itemsByScope = { global: [], template: [], script: [], style: [] }
  let completionProvider
  let disposed = false
  let refreshGeneration = 0
  const providers = []
  const cssManager = new CssWorkerManager(monaco.css.cssDefaults)
  const htmlManager = new HtmlWorkerManager(monaco.html.htmlDefaults)
  const cssModel = monaco.editor.createModel('', 'plaintext', monaco.Uri.parse(`inmemory://vue-studio/completion-${Date.now()}.css`))
  const htmlModel = monaco.editor.createModel('', 'plaintext', monaco.Uri.parse(`inmemory://vue-studio/completion-${Date.now()}.html`))
  let reportedFailure = false
  function report(error) {
    if (!disposed && !reportedFailure) { reportedFailure = true; ElMessage.warning('部分语言服务暂不可用：' + (error.message || String(error))) }
  }
  async function scopedWorker(scope) {
    const target = scope === 'style' ? cssModel : htmlModel
    const value = virtualSource(sourceModel.getValue(), getSfcBlocks(sourceModel.getValue())[scope])
    if (target.getValue() !== value) target.setValue(value)
    const service = await (scope === 'style' ? cssManager : htmlManager).getLanguageServiceWorker(target.uri)
    return { service, target }
  }
  function fromRange(range) {
    return new monaco.Range(range.start.line + 1, range.start.character + 1, range.end.line + 1, range.end.character + 1)
  }
  const mirror = monaco.editor.createModel('', 'plaintext', monaco.Uri.parse(`inmemory://vue-studio/completion-${Date.now()}-${Math.random()}.ts`))

  function syncMirror() {
    const block = getSfcBlocks(sourceModel.getValue()).script
    const value = virtualSource(sourceModel.getValue(), block, true)
    if (mirror.getValue() !== value) mirror.setValue(value)
  }

  async function worker() {
    syncMirror()
    return getTsWorker(mirror.uri)
  }

  function registerCompletion() {
    completionProvider?.dispose()
    completionProvider = monaco.languages.registerCompletionItemProvider('vue', {
      triggerCharacters: ['<', ':', '@', '.', '"', "'"],
      async provideCompletionItems(model, position, _context, token) {
        if (model !== sourceModel || disposed) return { suggestions: [] }
        const version = model.getVersionId()
        const scope = getScopeAtOffset(model.getValue(), model.getOffsetAt(position))
        const candidates = [...builtins.global, ...builtins[scope], ...itemsByScope.global, ...itemsByScope[scope]]
        const suggestions = [...new Map(candidates.map(item => [`${item.label}:${item.insertText}`, item])).values()].map((item, index) => ({
          label: item.label, kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: item.insertText, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: item.documentation, detail: item.scope ? `项目字典 · ${item.scope}` : `Vue SFC · ${scope}`,
          sortText: String(item.sort ?? index).padStart(6, '0'), range: wordRange(model, position)
        }))
        if (scope === 'script') {
          try {
            const service = await worker()
            if (disposed || token.isCancellationRequested) return { suggestions: [] }
            const result = await service.getCompletionsAtPosition(mirror.uri.toString(), mirror.getOffsetAt(position), {})
            suggestions.push(...(result?.entries || []).map(entry => ({
              label: entry.name,
              kind: monaco.languages.CompletionItemKind[entry.kind === 'function' ? 'Function' : entry.kind === 'class' ? 'Class' : 'Variable'],
              insertText: entry.insertText || entry.name,
              sortText: entry.sortText,
              detail: 'TypeScript language service',
              range: wordRange(model, position)
            })))
          } catch (error) { report(error) }
        } else if (scope === 'template' || scope === 'style') {
          try {
            const { service, target } = await scopedWorker(scope)
            const result = await service.doComplete(target.uri.toString(), { line: position.lineNumber - 1, character: position.column - 1 })
            suggestions.push(...(result?.items || []).map(item => ({
              label: item.label, kind: monaco.languages.CompletionItemKind.Property,
              insertText: item.textEdit?.newText || item.insertText || item.label,
              insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : 0,
              documentation: item.documentation, detail: item.detail,
              range: item.textEdit?.range ? fromRange(item.textEdit.range) : wordRange(model, position)
            })))
          } catch (error) { report(error) }
        }
        return { suggestions: disposed || token.isCancellationRequested || model.getVersionId() !== version ? [] : suggestions }
      }
    })
  }

  providers.push(monaco.languages.registerHoverProvider('vue', {
    async provideHover(model, position) {
      if (model !== sourceModel || disposed || getScopeAtOffset(model.getValue(), model.getOffsetAt(position)) !== 'script') return null
      try {
        const service = await worker()
        if (disposed) return null
        const info = await service.getQuickInfoAtPosition(mirror.uri.toString(), mirror.getOffsetAt(position))
        if (!info || disposed) return null
        const start = mirror.getPositionAt(info.textSpan.start)
        const end = mirror.getPositionAt(info.textSpan.start + info.textSpan.length)
        const display = (info.displayParts || []).map(item => item.text).join('')
        const docs = (info.documentation || []).map(item => item.text).join('')
        return { range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), contents: [{ value: `\`\`\`ts\n${display}\n\`\`\`` }, { value: docs }] }
      } catch (error) { report(error); return null }
    }
  }))

  providers.push(monaco.languages.registerSignatureHelpProvider('vue', {
    signatureHelpTriggerCharacters: ['(', ','],
    async provideSignatureHelp(model, position, token) {
      if (model !== sourceModel || disposed || getScopeAtOffset(model.getValue(), model.getOffsetAt(position)) !== 'script') return null
      try {
        const service = await worker()
        if (disposed || token.isCancellationRequested) return null
        const info = await service.getSignatureHelpItems(mirror.uri.toString(), mirror.getOffsetAt(position), {})
        if (!info || disposed || token.isCancellationRequested) return null
        const parts = list => (list || []).map(item => item.text).join('')
        return { value: { activeSignature: info.selectedItemIndex, activeParameter: info.argumentIndex,
          signatures: info.items.map(item => ({ label: parts(item.prefixDisplayParts) + item.parameters.map(p => parts(p.displayParts)).join(parts(item.separatorDisplayParts)) + parts(item.suffixDisplayParts),
            documentation: parts(item.documentation), parameters: item.parameters.map(p => ({ label: parts(p.displayParts), documentation: parts(p.documentation) })) })) }, dispose() {} }
      } catch (error) { report(error); return null }
    }
  }))

  function tsRange(span) {
    const start = mirror.getPositionAt(span.start), end = mirror.getPositionAt(span.start + span.length)
    return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column)
  }
  async function locations(model, position, references) {
    if (model !== sourceModel || disposed || getScopeAtOffset(model.getValue(), model.getOffsetAt(position)) !== 'script') return []
    try {
      const service = await worker()
      if (disposed) return []
      const values = await service[references ? 'getReferencesAtPosition' : 'getDefinitionAtPosition'](mirror.uri.toString(), mirror.getOffsetAt(position))
      if (disposed) return []
      return (values || []).filter(item => item.fileName === mirror.uri.toString()).map(item => ({ uri: sourceModel.uri, range: tsRange(item.textSpan) }))
    } catch (error) { report(error); return [] }
  }
  providers.push(monaco.languages.registerDefinitionProvider('vue', { provideDefinition: (model, position) => locations(model, position, false) }))
  providers.push(monaco.languages.registerReferenceProvider('vue', { provideReferences: (model, position) => locations(model, position, true) }))

  async function refresh() {
    const current = ++refreshGeneration
    const scopes = ['global', 'template', 'script', 'style']
    const responses = await Promise.all(scopes.map(scope => getCompletions(scope).catch(error => { report(error); return { data: [] } })))
    if (disposed || current !== refreshGeneration) return
    itemsByScope = Object.fromEntries(scopes.map((scope, index) => [scope, responses[index].data || []]))
    registerCompletion()
  }

  registerCompletion()
  refresh()

  return {
    refresh,
    dispose() {
      disposed = true
      refreshGeneration += 1
      completionProvider?.dispose()
      providers.splice(0).forEach(item => item.dispose())
      mirror.dispose()
      cssModel.dispose()
      htmlModel.dispose()
      cssManager.dispose()
      htmlManager.dispose()
    }
  }
}
