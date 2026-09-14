<template><PreviewSandbox v-if="source" ref="sandbox" :source="source" :component-id="componentKey" /><el-alert v-if="error" :title="error" type="error" :closable="false" /></template>
<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import PreviewSandbox from '@/views/vueStudio/component/PreviewSandbox.vue'
import { getPublishedComponent } from '@/api/vueStudio/component'
const props = defineProps({ componentKey: { type: String, required: true }, values: { type: Object, default: () => ({}) } })
const source = ref(''), error = ref(''), sandbox = ref()
const route = useRoute()
let generation = 0
let ready = false, applying = Promise.resolve()
const valuesSnapshot = () => JSON.parse(JSON.stringify(props.values))
const routeSnapshot = () => ({ query: { ...route.query }, params: { ...route.params } })
function applyValues() {
  if (!ready || !sandbox.value) return
  const request = generation
  applying = applying.catch(() => {}).then(async () => {
    if (!ready || request !== generation || !sandbox.value) return
    try { await sandbox.value.applyParameters(valuesSnapshot(), routeSnapshot()) }
    catch (failure) { if (request === generation) error.value = failure.message || '组件参数更新失败' }
  })
  return applying
}
watch(() => props.componentKey, async key => {
  const request = ++generation
  ready = false
  source.value = ''; error.value = ''; sandbox.value?.dispose()
  try {
    const { data } = await getPublishedComponent(key)
    if (request !== generation) return
    source.value = data.sourceCode
    await nextTick()
    if (request !== generation) return
    await sandbox.value.run(valuesSnapshot(), { formRules: data.formRules || '[]', formOptions: data.formOptions || '{}', route: routeSnapshot() })
    if (request !== generation) return
    ready = true
    await applyValues()
  } catch (failure) { if (request === generation) error.value = failure.message || '组件加载失败' }
}, { immediate: true })
watch(() => [props.values, route.query, route.params], applyValues, { deep: true })
onBeforeUnmount(() => { ++generation; ready = false })
</script>
