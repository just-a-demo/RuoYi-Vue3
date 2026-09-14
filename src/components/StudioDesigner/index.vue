<template><div class="studio-designer"><StudioFrame ref="frame" :component-id="id" :height="height" title="表单设计器" @design-change="changed" /><el-alert v-if="error" :title="error" type="error" :closable="false"><p>原有设计已保留，可以继续编辑代码。</p><el-button :loading="loading" @click="retry">重新加载设计器</el-button></el-alert></div></template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import StudioFrame from '@/components/StudioFrame/index.vue'
import { loadComponents } from '@/studio-runtime/loadComponents'
const props = defineProps({ rules: { type: String, default: '[]' }, options: { type: String, default: '{}' }, height: { type: String, default: '650px' } })
const emit = defineEmits(['update:rules', 'update:options'])
const frame = ref(), error = ref(''), id = 'designer-' + Math.random().toString(36).slice(2)
const loading = ref(false)
let initialized, alive = true, ready = false
function changed(value) { emit('update:rules', value.formRules); emit('update:options', value.formOptions) }
async function initialize() {
  const modules = await loadComponents('', props.rules, true)
  if (!alive) return
  await frame.value.start({ mode: 'designer', height: props.height === '100%' ? '100vh' : props.height, formRules: props.rules, formOptions: props.options, modules, css: modules.map(item => item.css).join('\n') })
  ready = true
}
function retry() {
  if (loading.value) return initialized
  loading.value = true; error.value = ''; ready = false
  initialized = initialize().catch(failure => { error.value = failure.message }).finally(() => { loading.value = false })
  return initialized
}
onMounted(retry)
async function capture() {
  await initialized
  if (!ready) return { formRules: props.rules, formOptions: props.options }
  const value = await frame.value.request('capture')
  changed(value)
  return value
}
async function setValue(value) {
  await initialized
  if (!ready) { changed(value); return value }
  await frame.value.request('setDesign', value)
  return capture()
}
onBeforeUnmount(() => { alive = false })
defineExpose({ capture, setValue })
</script>
<style scoped>.studio-designer { height: 100%; min-height: 0; overflow: auto; }</style>
