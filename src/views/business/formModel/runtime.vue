<template>
  <div class="app-container" v-loading="loading">
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="model">
      <h2>{{ model.pageTitle }}</h2>
      <el-button type="primary" icon="Plus" @click="openForm()">新增</el-button>
      <el-button icon="Refresh" @click="loadRecords">刷新</el-button>
      <p>共 {{ records.length }} 条记录，双击数据行编辑。</p>
      <ModelTable :fields="fields" :records="tableRecords" @edit="editRow" />
      <el-dialog v-model="dialog" :title="recordId ? '编辑记录' : '新增记录'" width="80%" destroy-on-close :close-on-click-modal="false" :show-close="!saving" :close-on-press-escape="!saving" @opened="runComponent">
        <PreviewSandbox v-if="dialog" ref="sandbox" :source="model.modelCode?.trim() || '<template><span /></template>'" :component-id="'form-model-' + model.id" />
        <template #footer>
          <el-button @click="dialog = false" :disabled="saving">取消</el-button>
          <el-button type="primary" :loading="saving" :disabled="running || !ready" @click="save">保存</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>
<script setup name="PublishedFormModel">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getPublishedModel, getModelRecords, saveModelRecord } from '@/api/business/formModel'
import PreviewSandbox from '@/views/vueStudio/component/PreviewSandbox.vue'
import ModelTable from './ModelTable.vue'
const route = useRoute()
const loading = ref(false), error = ref(''), model = ref(), fields = ref([])
const formData = ref({}), sandbox = ref(), records = ref([]), dialog = ref(false), saving = ref(false), recordId = ref(), running = ref(false), ready = ref(false)
const tableRecords = computed(() => records.value.map(record => record.values))
let generation = 0
let formGeneration = 0
async function loadRecords() {
  const id = model.value?.id
  if (!id) return
  const { data } = await getModelRecords(id)
  if (model.value?.id === id) records.value = data
}
function openForm(record) {
  ++formGeneration
  recordId.value = record?.id
  formData.value = record ? JSON.parse(JSON.stringify(record.values)) : {}
  ready.value = false
  dialog.value = true
}
function editRow(values) {
  const record = records.value.find(item => item.values === values)
  if (record) openForm(record)
}
async function runComponent() {
  if (!sandbox.value || !model.value) return
  const request = formGeneration
  running.value = true
  ready.value = false
  try {
    await sandbox.value.run(JSON.parse(JSON.stringify({ model: { id: model.value.id, modelName: model.value.modelName, pageTitle: model.value.pageTitle }, fields: fields.value, formData: formData.value })), {
      formRules: model.value.formRules || '[]', formOptions: model.value.formOptions || '{}', codeMode: model.value.codeMode || 'legacy',
      route: { query: { ...route.query }, params: { ...route.params } }, formData: JSON.parse(JSON.stringify(formData.value))
    })
    if (request === formGeneration && dialog.value) ready.value = true
  } catch (failure) { ElMessage.error(failure.message || '表单运行失败') }
  finally { if (request === formGeneration) running.value = false }
}
async function save() {
  if (!sandbox.value || saving.value || !ready.value) return
  const modelId = model.value.id, savedRecordId = recordId.value
  saving.value = true
  try {
    const values = await sandbox.value.validateAndGetData()
    await saveModelRecord(modelId, savedRecordId, values)
    if (model.value?.id !== modelId) return
    ElMessage.success('保存成功'); dialog.value = false
    await loadRecords()
  } catch (failure) { if (failure?.message) ElMessage.error(failure.message) }
  finally { saving.value = false }
}
watch(() => route.query.modelId, async id => {
  const request = ++generation
  ++formGeneration
  model.value = null; error.value = ''; records.value = []; dialog.value = false; sandbox.value?.dispose()
  if (!/^\d+$/.test(String(id || ''))) { error.value = '菜单缺少有效模型标识'; return }
  loading.value = true
  try {
    const { data } = await getPublishedModel(id)
    if (request !== generation) return
    model.value = data; fields.value = JSON.parse(data.fieldConfig)
    await loadRecords()
  } catch (failure) { if (request === generation) error.value = failure.message || '模型加载失败' }
  finally { if (request === generation) loading.value = false }
}, { immediate: true })
onBeforeUnmount(() => { ++generation })
</script>
