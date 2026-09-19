<template>
  <div class="sandbox-wrap" :class="background" :style="{ maxWidth: width + 'px' }">
    <div v-if="status === 'idle'" class="placeholder">尚未运行</div>
    <StudioFrame ref="frame" :component-id="componentId" :height="height + 'px'" :timeout="timeout" :submit-handler="submitHandler" title="Vue 组件隔离预览" @status="setStatus" @console="onConsole" @form-change="$emit('form-change', $event)" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
  </div>
</template>
<script setup>
import { ref, nextTick, onBeforeUnmount } from 'vue'
import StudioFrame from '@/components/StudioFrame/index.vue'
import { compilePreview } from './previewCompiler'
import { loadComponents } from '@/studio-runtime/loadComponents'
import { loadProjectImports } from '@/studio-runtime/imports'
const props = defineProps({ source: { type: String, default: '' }, componentId: { type: [String, Number], required: true }, width: { type: Number, default: 1280 }, height: { type: Number, default: 650 }, background: { type: String, default: 'light' }, timeout: { type: Number, default: 15000 }, showConsole: { type: Boolean, default: false }, submitHandler: Function })
const emit = defineEmits(['status', 'console', 'form-change'])
const frame = ref(), status = ref('idle'), error = ref('')
let generation = 0
function setStatus(value) { status.value = value; emit('status', value) }
function onConsole(value) { if (props.showConsole) emit('console', value) }
async function run(values = {}, options = {}) {
  const current = ++generation
  frame.value?.dispose(); error.value = ''; setStatus('building')
  try {
    const source = props.source?.trim() ? props.source : '<template><div /></template>'
    const compiled = await compilePreview(source, 'preview-' + props.componentId)
    compiled.moduleBundle = await loadProjectImports(source)
    const modules = await loadComponents(source, options.formRules || '[]')
    if (current !== generation) return
    await nextTick()
    await frame.value.start({ ...compiled, ...options, props: values, modules, css: modules.map(item => item.css).join('\n') + '\n' + compiled.css + '\n' + (compiled.moduleBundle?.css || '') })
  } catch (failure) {
    if (current !== generation) return
    error.value = failure.message || String(failure); setStatus('error'); throw failure
  }
}
const applyParameters = (values, route) => frame.value.request('apply', { props: values, route })
const validateAndGetData = options => frame.value.request('validate', options)
function dispose() { ++generation; frame.value?.dispose(); setStatus('idle') }
onBeforeUnmount(dispose)
defineExpose({ run, applyParameters, validateAndGetData, dispose })
</script>
<style scoped>
.sandbox-wrap{position:relative;width:100%;min-height:360px;overflow:auto;border:1px solid var(--el-border-color);margin:auto}.placeholder{padding:12px;color:var(--el-text-color-secondary)}.dark{background:#1e1e1e}.el-alert{position:absolute;bottom:8px;left:8px;width:calc(100% - 16px)}
</style>
