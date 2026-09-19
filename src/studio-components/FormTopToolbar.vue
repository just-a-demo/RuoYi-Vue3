<template>
  <div class="form-toolbar" role="toolbar" aria-label="表单操作工具栏">
    <el-button-group class="toolbar-actions">
      <el-button type="primary" :disabled="blocked || editing" @click="startCreate">＋ 新增</el-button>
      <el-button :disabled="blocked || editing" @click="startEdit">✎ 修改</el-button>
      <el-button type="success" :disabled="blocked || !editing" :loading="submitting" @click="submit">提交</el-button>
      <el-button type="danger" plain :disabled="blocked || editing" @click="remove">删除</el-button>
      <el-button :disabled="blocked || !editing" @click="cancel">取消</el-button>
    </el-button-group>
  </div>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  formCreateInject: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['change', 'create', 'edit', 'submit', 'delete', 'cancel'])
const studio = inject('studioForm', null)
// FcDesigner supplies dragTool only inside its editing canvas, not its preview dialog.
const dragTool = inject('dragTool', null)
const mode = ref('view'), submitting = ref(false), snapshot = ref(null)
const editing = computed(() => mode.value !== 'view')
const api = computed(() => {
  const injected = props.formCreateInject?.api
  return (typeof injected === 'function' ? injected() : injected) || studio?.formApi.value
})
const blocked = computed(() => Boolean(dragTool) || props.disabled || submitting.value || !api.value)
const originalDisabled = new Map()
let alive = true
function fields() {
  // Defensive filtering for old rules that still contain a generated toolbar field.
  return (api.value?.fields() || []).filter(field => api.value.getRule(field)?.type !== 'lc-FormTopToolbar')
}
function setFormEditable(editable) {
  const form = api.value
  if (!form || dragTool) return
  for (const field of fields()) {
    if (!originalDisabled.has(field)) originalDisabled.set(field, Boolean(form.getRule(field)?.props?.disabled))
    form.disabled(editable ? originalDisabled.get(field) : true, field)
  }
}
function readFormData() {
  const values = api.value?.formData() || {}
  return JSON.parse(JSON.stringify(Object.fromEntries(fields().map(field => [field, values[field]]))))
}
function setMode(value) {
  mode.value = value
  if (studio?.formApi.value === api.value && studio.mode) studio.mode.value = value
  setFormEditable(value !== 'view'); emit('change', value)
}
function startCreate() {
  if (blocked.value || editing.value) return
  snapshot.value = readFormData()
  api.value.coverValue(Object.fromEntries(fields().map(field => [field, undefined])))
  api.value.clearValidateState?.()
  setMode('create'); emit('create', api.value)
}
function startEdit() {
  if (blocked.value || editing.value) return
  snapshot.value = readFormData()
  setMode('edit'); emit('edit', api.value)
}
function remove() {
  if (!blocked.value && !editing.value) emit('delete', { api: api.value, formData: readFormData() })
}
function cancel() {
  if (blocked.value || !editing.value) return
  if (snapshot.value) api.value.coverValue(snapshot.value)
  api.value.clearValidateState?.()
  snapshot.value = null; setMode('view'); emit('cancel', api.value)
}
async function submit() {
  if (blocked.value || !editing.value) return
  submitting.value = true
  try {
    // Preserve native validation, beforeSubmit, options.onSubmit and @submit handlers.
    const result = studio?.formApi.value === api.value && studio.submit
      ? await studio.submit()
      : { values: await api.value.submit() }
    if (!alive) return
    snapshot.value = null; setMode('view')
    emit('submit', { api: api.value, formData: result.values, preview: Boolean(result.preview) })
    if (result.preview) ElMessage.success('预览提交通过，未保存业务数据')
  } catch (error) {
    if (alive) ElMessage.error(error?.message || '请检查表单必填项和校验提示')
  } finally { submitting.value = false }
}
watch(api, async (value, previous) => {
  if (value === previous) return
  originalDisabled.clear()
  await nextTick()
  if (alive && value === api.value) setFormEditable(editing.value)
}, { immediate: true, flush: 'post' })
// Newly revealed conditional fields follow the current mode as well.
watch(() => fields().join('\u0000'), async () => {
  await nextTick()
  if (alive) setFormEditable(editing.value)
}, { flush: 'post' })
onBeforeUnmount(() => { alive = false })
</script>

<style scoped>
.form-toolbar {
  width: 100%; min-height: 52px; box-sizing: border-box; display: flex;
  align-items: center; justify-content: flex-end; padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter); border-radius: 6px;
  background: linear-gradient(180deg, var(--el-fill-color-extra-light), var(--el-bg-color));
}
.toolbar-actions { display: inline-flex; flex-shrink: 0; }
@media (max-width: 640px) {
  .toolbar-actions { width: 100%; flex-wrap: wrap; }
  .toolbar-actions :deep(.el-button) { flex: 1; }
}
</style>
