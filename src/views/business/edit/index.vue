<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Repl, useStore, useVueImportMap } from '@vue/repl'
import Monaco from '@vue/repl/monaco-editor'

const props = defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue', 'change'])
const local = path => `${import.meta.env.BASE_URL}vendor/${path}`
const defaultCode = `<script setup>\nimport { ref } from 'vue'\n\nconst count = ref(0)\nconsole.log('hello')\n<\/script>\n\n<template>\n  <button @click="count++">{{ count }}</button>\n</template>`

const { importMap, vueVersion } = useVueImportMap({
    runtimeDev: () => local('vue/vue.runtime.esm-browser.js'),
    runtimeProd: () => local('vue/vue.runtime.esm-browser.prod.js'),
    serverRenderer: () => local('vue/server-renderer.esm-browser.js'),
    vueVersion: null,
})
const template = ref({ welcomeSFC: props.modelValue || defaultCode, newSFC: '<template><div /></template>' })
const resourceLinks = computed(() => ({
    esModuleShims: local('es-module-shims/es-module-shims.wasm.js'),
    vueCompilerUrl: () => new URL('/vendor/vue/compiler-sfc.esm-browser.js', self.location.origin).href,
    typescriptLib: () => new URL('/vendor/typescript/typescript.js', self.location.origin).href,
    // 将 Monaco/Volar 自动类型获取（ATA）从 unpkg.com 重定向到本地镜像 /vendor/types
    pkgDirUrl: pkg => new URL(`/vendor/types/${pkg}/__meta.json`, self.location.origin).href,
    pkgFileTextUrl: (pkg, _version, path) => new URL(`/vendor/types/${pkg}/${path}`, self.location.origin).href,
    pkgLatestVersionUrl: pkg => new URL(`/vendor/types/${pkg}/__latest.json`, self.location.origin).href,
}))
const store = useStore({ template, builtinImportMap: importMap, vueVersion, typescriptVersion: ref('5.9.2'), resourceLinks })
const content = computed({
    get: () => store.files['src/App.vue']?.code ?? '',
    set: value => { if (store.files['src/App.vue']) store.files['src/App.vue'].code = value },
})
watch(content, value => { emit('update:modelValue', value); emit('change', value) })
watch(() => props.modelValue, value => { if (value !== content.value) content.value = value })

// 自定义代码提示：在此数组增删条目即可扩展。label 为触发词，insertText 为插入内容（$1 为光标位）。
const customCompletions = [
    { label: 'log', insertText: 'console.log($1)', documentation: 'console.log(...)' },
]
// 编辑器选项：开启粘贴/输入时自动格式化。
const editorOptions = { monacoOptions: { formatOnPaste: true, formatOnType: true } }

// 自定义格式化：Volar 只格式化 SFC 各块的“内部内容”，不会处理顶层块的开始/结束标签与内容的换行，
// 导致“开始标签+首行代码”或“末行代码+结束标签”挤在同一行。
// 这里在 setup 顶层（早于 Monaco 子组件挂载、Volar 注册 provider 之前）包裹“文档格式化”
// provider：先执行 Volar 原有格式化，再把顶层 script、style 块的开始/结束标签强制单独成行。
//（这两个顶层块不会嵌套，处理安全；template 已由 Volar 正确换行，故不处理。）
function normalizeSfcBlockTags(code) {
    // 结束标签单独成行
    let out = code.replace(/[ \t]*<\/(script|style)>/g, (m, name, offset) =>
        (offset === 0 || code[offset - 1] === '\n' ? '' : '\n') + `</${name}>`)
    // 开始标签后若紧跟内容，则内容另起一行
    out = out.replace(/(<(?:script|style)(?:\s[^>]*)?>)[ \t]*(?=\S)/g, '$1\n')
    return out
}
function applyEditsToText(model, edits) {
    const ops = edits
        .map(e => ({
            start: model.getOffsetAt({ lineNumber: e.range.startLineNumber, column: e.range.startColumn }),
            end: model.getOffsetAt({ lineNumber: e.range.endLineNumber, column: e.range.endColumn }),
            text: e.text ?? '',
        }))
        .sort((a, b) => b.start - a.start)
    let text = model.getValue()
    for (const op of ops) text = text.slice(0, op.start) + op.text + text.slice(op.end)
    return text
}
{
    const monaco = window.monaco
    if (monaco?.languages && !monaco.languages.__sfcFormatPatched) {
        monaco.languages.__sfcFormatPatched = true
        const originalRegister = monaco.languages.registerDocumentFormattingEditProvider.bind(monaco.languages)
        monaco.languages.registerDocumentFormattingEditProvider = (selector, provider) => {
            const originalProvide = provider?.provideDocumentFormattingEdits?.bind(provider)
            if (!originalProvide) return originalRegister(selector, provider)
            const wrapped = {
                ...provider,
                async provideDocumentFormattingEdits(model, options, token) {
                    const edits = (await originalProvide(model, options, token)) || []
                    const original = model.getValue()
                    const applied = edits.length ? applyEditsToText(model, edits) : original
                    const normalized = normalizeSfcBlockTags(applied)
                    if (normalized === original) return []
                    if (normalized === applied) return edits
                    return [{ range: model.getFullModelRange(), text: normalized }]
                },
            }
            return originalRegister(selector, wrapped)
        }
    }
}

// 禁止自动运行：Repl 始终会挂载预览沙箱（一个会“编译并执行”代码的 iframe）。
// 这里监听 DOM，将其新建的预览 iframe 替换为无脚本的空白文档，并去掉 sandbox 的 allow-scripts
//（保留 allow-same-origin，避免 @vue/repl 因无法访问 contentDocument 而反复重建 iframe）。
// 编译报错提示由主线程的 compileFile 产生，与沙箱无关，因此仍会正常显示。
function neutralizeIframe(iframe) {
    if (iframe.dataset.noRun === '1') return
    iframe.dataset.noRun = '1'
    iframe.setAttribute('sandbox', 'allow-same-origin')
    iframe.srcdoc = '<!doctype html><html class="dark"><head><meta charset="utf-8"></head><body></body></html>'
}
let runBlocker
if (typeof MutationObserver !== 'undefined') {
    runBlocker = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeName === 'IFRAME') neutralizeIframe(node)
                else node.querySelectorAll?.('iframe').forEach(neutralizeIframe)
            }
        }
    })
    runBlocker.observe(document.documentElement, { childList: true, subtree: true })
}

let completionDisposable
onMounted(() => {
    const monaco = window.monaco
    if (!monaco) return
    completionDisposable = monaco.languages.registerCompletionItemProvider(['vue', 'javascript', 'typescript'], {
        provideCompletionItems(model, position) {
            const word = model.getWordUntilPosition(position)
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            }
            return {
                suggestions: customCompletions.map(c => ({
                    label: c.label,
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: c.insertText,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: c.documentation,
                    detail: '自定义片段',
                    range,
                })),
            }
        },
    })
})
onBeforeUnmount(() => { completionDisposable?.dispose(); runBlocker?.disconnect() })

defineExpose({ content, getValue: () => content.value, setValue: value => { content.value = value }, store })
</script>

<template>
    <div class="editor-only-root">
        <Repl :store="store" :editor="Monaco" theme="dark" :editor-options="editorOptions" :auto-resize="true"
            :show-compile-output="false" :clear-console="false" />
    </div>
</template>

<!-- 必须是全局 style。不要在非 scoped style 中使用 :deep()。 -->
<style>
* {
    box-sizing: border-box
}

html,
body,
#app {
    width: 100%;
    height: 100%;
    margin: 0
}

.editor-only-root {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #1e1e1e
}

.editor-only-root .file-selector,
.editor-only-root .editor-floating,
.editor-only-root .split-pane>.right,
.editor-only-root .split-pane>.dragger,
.editor-only-root .split-pane>.toggler {
    display: none !important
}

.editor-only-root .split-pane>.left {
    display: block !important;
    position: relative !important;
    width: 100% !important;
    max-width: 100% !important;
    flex: 0 0 100% !important;
    z-index: 1 !important;
    pointer-events: auto !important
}

.editor-only-root .editor-container {
    height: 100% !important;
    width: 100% !important
}

.editor-only-root .vue-repl,
.editor-only-root .split-pane {
    width: 100% !important;
    height: 100% !important
}
</style>