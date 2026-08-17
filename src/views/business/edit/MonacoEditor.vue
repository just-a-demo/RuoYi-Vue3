<template>
    <div ref="editorRef" class="monaco-editor-box"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as monaco from 'monaco-editor'

// 配置 worker（Vite ESM 写法）
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
    getWorker(_, label) {
        if (label === 'json') return new jsonWorker()
        if (label === 'typescript' || label === 'javascript') return new tsWorker()
        return new editorWorker()
    }
}

const props = defineProps({
    modelValue: { type: String, default: '' },
    language: { type: String, default: 'javascript' }
})
const emit = defineEmits(['update:modelValue'])

const editorRef = ref(null)
let editor = null
let completionDisposable = null

onMounted(() => {
    editor = monaco.editor.create(editorRef.value, {
        value: props.modelValue,
        language: props.language,
        theme: 'vs-dark',
        fontSize: 14,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 2
    })

    // 双向绑定
    editor.onDidChangeModelContent(() => {
        emit('update:modelValue', editor.getValue())
    })

    // 注册自定义补全
    registerCustomCompletion()
})

// ✅ 自定义补全核心
function registerCustomCompletion() {
    completionDisposable = monaco.languages.registerCompletionItemProvider('javascript', {
        // 触发字符：输入 . 或字母时触发
        triggerCharacters: ['.', ...'abcdefghijklmnopqrstuvwxyz'],
        provideCompletionItems(model, position) {
            // 计算当前单词的替换范围
            const word = model.getWordUntilPosition(position)
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            }

            const suggestions = [
                {
                    label: 'console.log',
                    kind: monaco.languages.CompletionItemKind.Function,
                    insertText: 'console.log($1)',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: '打印日志',
                    range
                },
                {
                    label: 'ref',
                    kind: monaco.languages.CompletionItemKind.Function,
                    insertText: 'const ${1:name} = ref(${2:value})',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'Vue3 响应式变量',
                    range
                },
                {
                    label: 'onMounted',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: 'onMounted(() => {\n\t$0\n})',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'Vue3 生命周期',
                    range
                }
            ]
            return { suggestions }
        }
    })
}

// 外部值变化时同步
watch(() => props.modelValue, (val) => {
    if (editor && val !== editor.getValue()) {
        editor.setValue(val)
    }
})

onBeforeUnmount(() => {
    completionDisposable?.dispose()
    editor?.dispose()
})
</script>

<style scoped>
.monaco-editor-box {
    width: 100%;
    height: 500px;
    border: 1px solid #333;
}
</style>