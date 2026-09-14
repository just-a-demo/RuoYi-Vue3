<template>
  <div class="monaco-sfc-editor">
    <div ref="containerRef" class="sfc-editor-surface" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'monaco-editor/nls/lang/zh-cn.js'
import * as monaco from 'monaco-editor'
import { ElMessage } from 'element-plus'
import { configureMonacoWorkers } from './useWorkers'
import { acquireVueLanguage } from './vueLanguage'
import { useDiagnostics } from './useDiagnostics'
import { useVueCompletion } from './useVueCompletion'
import { registerSfcFormatter } from './useFormatter'
import { registerVueTypes } from './vueTypes'
import { WorkerManager as TypeScriptWorkerManager } from 'monaco-editor/languages/features/typescript/workerManager.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  componentKey: { type: [String, Number], default: 'draft' },
  readOnly: { type: Boolean, default: false },
  theme: { type: String, default: 'vs-dark' },
  fontSize: { type: Number, default: 14 },
  wordWrap: { type: Boolean, default: false },
  minimap: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue', 'change', 'diagnostics', 'save', 'cursor'])
const containerRef = ref()
let editor
let model
let diagnostics
let completion
let releaseLanguage
const disposables = []

function currentMarker() {
  if (!editor || !model) return null
  const position = editor.getPosition()
  return monaco.editor.getModelMarkers({ resource: model.uri }).find(item =>
    item.startLineNumber <= position.lineNumber && item.endLineNumber >= position.lineNumber)
}

function addActions() {
  disposables.push(editor.addAction({
    id: 'vue-studio-save', label: '保存', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
    run: () => emit('save')
  }))
  disposables.push(editor.addAction({
    id: 'vue-studio-check', label: '代码检查', contextMenuGroupId: 'navigation', contextMenuOrder: 2,
    run: () => diagnostics.run()
  }))
  disposables.push(editor.addAction({
    id: 'vue-studio-copy-problem', label: '复制错误信息', contextMenuGroupId: 'navigation', contextMenuOrder: 3,
    precondition: '!editorHasSelection',
    run: async () => {
      const marker = currentMarker()
      if (!marker) return ElMessage.info('当前光标位置没有问题')
      await navigator.clipboard.writeText(`[${marker.source || 'Vue'} ${marker.code || ''}] ${marker.message}`)
      ElMessage.success('问题信息已复制')
    }
  }))
}

onMounted(() => {
  configureMonacoWorkers()
  releaseLanguage = acquireVueLanguage(monaco)
  monaco.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    allowJs: true,
    strict: true,
    noEmit: true
  })
  monaco.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true, allowJs: true, checkJs: false, noEmit: true
  })
  disposables.push(registerVueTypes(monaco))
  model = monaco.editor.createModel(props.modelValue, 'vue', monaco.Uri.parse(`inmemory://vue-studio/${props.componentKey}.vue`))
  model.setEOL(monaco.editor.EndOfLineSequence.LF)
  editor = monaco.editor.create(containerRef.value, {
    model,
    theme: props.theme,
    readOnly: props.readOnly,
    fontSize: props.fontSize,
    lineNumbers: 'on',
    glyphMargin: true,
    folding: true,
    foldingStrategy: 'indentation',
    showFoldingControls: 'always',
    minimap: { enabled: props.minimap },
    bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
    guides: { bracketPairs: true, indentation: true },
    autoClosingBrackets: 'always', autoClosingQuotes: 'always', autoClosingDelete: 'always', autoIndent: 'full',
    formatOnPaste: false, formatOnType: false,
    insertSpaces: true, tabSize: 2, detectIndentation: true,
    multiCursorModifier: 'alt', columnSelection: false,
    find: { addExtraSpaceOnTop: false, autoFindInSelection: 'multiline', seedSearchStringFromSelection: 'selection' },
    quickSuggestions: { other: true, comments: false, strings: true },
    suggestOnTriggerCharacters: true, parameterHints: { enabled: true }, hover: { enabled: true },
    stickyScroll: { enabled: true }, links: true, colorDecorators: true,
    wordWrap: props.wordWrap ? 'on' : 'off',
    renderValidationDecorations: 'on',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    padding: { top: 10, bottom: 10 }
  })
  const tsManager = new TypeScriptWorkerManager('typescript', monaco.typescript.typescriptDefaults)
  const jsManager = new TypeScriptWorkerManager('javascript', monaco.typescript.javascriptDefaults)
  disposables.push(tsManager, jsManager)
  const getTsWorker = (uri, language = 'typescript') => (language === 'javascript' ? jsManager : tsManager).getLanguageServiceWorker(uri)
  diagnostics = useDiagnostics(monaco, model, props.componentKey, markers => emit('diagnostics', markers), getTsWorker)
  completion = useVueCompletion(monaco, model, getTsWorker)
  disposables.push(registerSfcFormatter(monaco, error => ElMessage.error(`格式化失败，源码未修改：${error.message}`)))
  disposables.push(model.onDidChangeContent(() => {
    const value = model.getValue()
    emit('update:modelValue', value)
    emit('change', value)
    diagnostics.schedule()
  }))
  disposables.push(editor.onDidChangeCursorPosition(event => emit('cursor', event.position)))
  addActions()
  diagnostics.run()
})

watch(() => props.modelValue, value => {
  if (model && value !== model.getValue()) model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null)
})
watch(() => [props.readOnly, props.fontSize, props.wordWrap, props.minimap, props.theme], () => {
  if (!editor) return
  monaco.editor.setTheme(props.theme)
  editor.updateOptions({ readOnly: props.readOnly, fontSize: props.fontSize, wordWrap: props.wordWrap ? 'on' : 'off', minimap: { enabled: props.minimap } })
})

function getProblems() {
  return model ? monaco.editor.getModelMarkers({ resource: model.uri }) : []
}

function goToProblem(problem) {
  if (!editor || !problem) return
  editor.setPosition({ lineNumber: problem.startLineNumber, column: problem.startColumn })
  editor.revealPositionInCenter({ lineNumber: problem.startLineNumber, column: problem.startColumn })
  editor.focus()
}

async function formatDocument() {
  await editor?.getAction('editor.action.formatDocument')?.run()
}

defineExpose({
  focus: () => editor?.focus(),
  getValue: () => model?.getValue() || '',
  getProblems,
  goToProblem,
  check: () => diagnostics?.run(),
  refreshCompletions: () => completion?.refresh(),
  formatDocument
})

onBeforeUnmount(() => {
  diagnostics?.dispose()
  completion?.dispose()
  disposables.splice(0).forEach(item => item.dispose())
  editor?.dispose()
  model?.dispose()
  releaseLanguage?.()
  editor = undefined
  model = undefined
})
</script>

<style scoped>
.monaco-sfc-editor { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
.sfc-editor-surface { flex: 1; min-height: 0; overflow: hidden; }
</style>
