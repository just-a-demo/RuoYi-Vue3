<template>
  <div class="app-container">
    <template v-if="!editing">
      <el-form inline @submit.prevent="search">
        <el-form-item label="模型名称"><el-input v-model="query.modelName" clearable @keyup.enter="search" /></el-form-item>
        <el-form-item label="模型标识"><el-input v-model="query.modelKey" clearable @keyup.enter="search" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="query.status" clearable style="width:120px"><el-option label="启用" value="0" /><el-option label="停用" value="1" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" icon="Search" @click="search">查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
      <el-button v-hasPermi="['business:formModel:add']" type="primary" plain icon="Plus" @click="edit()">新增模型</el-button>
      <el-table v-loading="loading" :data="rows" class="model-list">
        <el-table-column label="模型名称" prop="modelName" /><el-table-column label="模型标识" prop="modelKey" /><el-table-column label="飞书应用" prop="feishuAppName" />
        <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === '0' ? 'success' : 'info'">{{ row.status === '0' ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="发布路由" prop="routePath" />
        <el-table-column label="操作" width="160"><template #default="{ row }"><el-button v-hasPermi="['business:formModel:edit']" link type="primary" @click="edit(row)">编辑</el-button><el-button v-hasPermi="['business:formModel:remove']" link type="danger" @click="remove(row)">删除</el-button></template></el-table-column>
      </el-table>
      <pagination v-show="total > 0" v-model:page="query.pageNum" v-model:limit="query.pageSize" :total="total" @pagination="load" />
    </template>
    <div v-else v-loading="initializing" class="model-editor">
      <div class="model-toolbar-back">
        <el-button @click="back">返回列表</el-button>
        <strong :title="model.modelName || '新增模型'">{{ model.modelName || '新增模型' }}</strong>
      </div>
      <div class="model-toolbar-actions">
        <el-button :disabled="!initialized" @click="previewCode">预览模型</el-button>
        <el-button type="primary" :loading="saving" :disabled="!initialized" @click="save">保存模型</el-button>
        <el-button v-hasPermi="['business:formModel:edit']" type="success" :loading="publishing" :disabled="!model.id || saving || !initialized" @click="publish">发布模型</el-button>
      </div>
      <el-alert v-if="approvalError" class="model-approval-warning" type="warning" :closable="false" show-icon title="暂未读取到关联的飞书审批定义，已保存的模型和字段映射仍保留。">
        <template #default>{{ approvalError }}<el-button link type="primary" :loading="approvalLoading" @click="refreshApproval">重试读取</el-button></template>
      </el-alert>
      <el-tabs v-model="tab" :before-leave="beforeTabLeave" class="model-tabs">
        <el-tab-pane label="基本信息" name="basic">
          <el-form label-width="120px" class="basic-form">
            <el-form-item label="模型名称" required><el-input v-model="model.modelName" maxlength="100" /></el-form-item>
            <el-form-item label="模型标识" required><el-input v-model="model.modelKey" maxlength="100" placeholder="字母开头，字母、数字或下划线" /></el-form-item>
            <el-form-item label="模型说明"><el-input v-model="model.description" type="textarea" maxlength="500" /></el-form-item>
            <el-form-item label="状态"><el-radio-group v-model="model.status"><el-radio value="0">启用</el-radio><el-radio value="1">停用</el-radio></el-radio-group></el-form-item>
            <el-form-item label="飞书应用"><el-select v-model="model.feishuAppId" clearable filterable placeholder="请选择飞书应用" style="width:100%" @change="changeFeishuApp"><el-option v-for="app in feishuApps" :key="app.id" :label="`${app.appName}（${app.appId}）`" :value="app.id" /></el-select></el-form-item>
            <el-form-item label="飞书审批流"><el-input v-model="approvalInput" :disabled="!model.feishuAppId" placeholder="输入 Approval Code 查询审批定义"><template #append><el-button :loading="approvalLoading" :disabled="!model.feishuAppId" @click="associate">查询并关联</el-button></template></el-input></el-form-item>
            <el-form-item v-if="model.approvalCode" label="当前关联"><el-tag>{{ approval?.name || model.approvalCode }}</el-tag><el-button link type="danger" @click="clearApproval">取消关联</el-button></el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="表单设计" name="design"><StudioDesigner ref="designer" v-model:rules="model.formRules" v-model:options="model.formOptions" height="650px" /></el-tab-pane>
        <el-tab-pane label="代码编写" name="code">
          <div class="model-code-editor"><MonacoSfcEditor v-if="tab === 'code'" v-model="model.modelCode" :component-key="'form-model-' + (model.id || 'new')" @save="save" /></div>
        </el-tab-pane>
        <el-tab-pane label="模型字段" name="fields">
          <el-alert v-if="!model.approvalCode" title="请先在基本信息中关联飞书审批流，再配置字段映射。" type="info" :closable="false" />
          <el-table :data="fields"><el-table-column label="字段名称" prop="title" /><el-table-column label="字段标识" prop="field" /><el-table-column label="字段类型" prop="type" />
            <el-table-column label="飞书审批字段"><template #default="{ row }"><el-select v-model="row.approvalMap" clearable filterable :disabled="!approval" placeholder="选择映射字段"><el-option v-for="field in approval?.fields || []" :key="field.id" :label="`${field.name}（${field.type}）`" :value="field.id" /></el-select></template></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="列表设计" name="list">
          <ListDesigner v-if="tab === 'list'" :fields="fields" :config="listConfig" />
        </el-tab-pane>
      </el-tabs>
    </div>
    <PreviewDialog ref="codePreview" />
  </div>
</template>
<script setup name="FormModel">
import { ref, reactive, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { isRetainedTabNavigation } from '@/utils/tabNavigation'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listModels, getModel, saveModel, deleteModel, getApproval, publishModel } from '@/api/business/formModel'
import { listFeishuCatalog } from '@/api/business/feishuConfig'
import { syncFields } from './fields'
import ListDesigner from './ListDesigner.vue'
import { normalizeListConfig, validateListConfig } from './listConfig'
import MonacoSfcEditor from '@/components/MonacoSfcEditor/index.vue'
import StudioDesigner from '@/components/StudioDesigner/index.vue'
import { createComponentSource } from '@/views/vueStudio/component/templates'
import PreviewDialog from '@/views/vueStudio/component/PreviewDialog.vue'
import usePermissionStore from '@/store/modules/permission'
import router from '@/router'
const rows = ref([]), total = ref(0), loading = ref(false), saving = ref(false), editing = ref(false), tab = ref('basic')
const query = reactive({ pageNum: 1, pageSize: 10, modelName: '', modelKey: '', status: '' })
const listConfig = ref(normalizeListConfig())
const model = ref({}), fields = ref([]), designer = ref(), approval = ref(null), approvalInput = ref(''), approvalLoading = ref(false), feishuApps = ref([])
const publishing = ref(false), codePreview = ref()
const initialized = ref(false), initializing = ref(false)
const approvalError = ref('')
const currentRoute = useRoute()
let baseline = '', approvalRequest = 0
async function load() { loading.value = true; try { const result = await listModels(query); rows.value = result.rows; total.value = result.total } finally { loading.value = false } }
async function loadFeishuApps() { const result = await listFeishuCatalog(); feishuApps.value = result.data || [] }
function search() { query.pageNum = 1; load() }
function reset() { Object.assign(query, { modelName: '', modelKey: '', status: '' }); search() }
function syncRouteInfo() {
  const modelKey = (model.value.modelKey || '').trim()
  const modelName = (model.value.modelName || '').trim()
  model.value.routePath = modelKey ? `/business/${modelKey}` : ''
  model.value.routeName = modelKey
  model.value.pageTitle = modelName
}
function snapshot() {
  return JSON.stringify({ ...model.value, fieldConfig: JSON.stringify(fields.value), listConfig: JSON.stringify(listConfig.value) })
}
async function capture() {
  syncRouteInfo()
  if (designer.value) {
    Object.assign(model.value, await designer.value.capture())
  }
  fields.value = syncFields(JSON.parse(model.value.formRules || '[]'), fields.value)
  model.value.fieldConfig = JSON.stringify(fields.value)
  model.value.listConfig = JSON.stringify(listConfig.value)
  return snapshot()
}
async function edit(row) {
  ++approvalRequest
  approvalError.value = ''; approvalLoading.value = false
  initialized.value = false
  initializing.value = true
  try {
  const data = row ? (await getModel(row.id)).data : { modelName: '', modelKey: '', description: '', status: '0', routePath: '', routeName: '', pageTitle: '', approvalCode: '', feishuAppId: null, formRules: '[]', formOptions: '{}', modelCode: createComponentSource('form', true), codeMode: 'integrated', fieldConfig: '[]' }
  model.value = { ...data, codeMode: data.codeMode || 'integrated', formRules: data.formRules || '[]', formOptions: data.formOptions || '{}' }
  fields.value = syncFields(JSON.parse(model.value.formRules), JSON.parse(data.fieldConfig || '[]'))
  listConfig.value = normalizeListConfig(data.listConfig, fields.value)
  approval.value = null; approvalInput.value = data.approvalCode || ''; tab.value = 'basic'; editing.value = true
  await nextTick()
  await designer.value.setValue({ formRules: model.value.formRules, formOptions: model.value.formOptions })
  baseline = await capture()
  initialized.value = true
  initializing.value = false
  if (data.approvalCode) void refreshApproval()
  } finally { initializing.value = false }
}
async function beforeTabLeave() { try { await capture(); return true } catch (error) { ElMessage.error(error.message); return false } }
async function save() {
  if (saving.value || !initialized.value) return
  saving.value = true
  try {
    await capture()
    validateListConfig(listConfig.value, fields.value)
    const saved = JSON.parse(JSON.stringify(model.value))
    const result = await saveModel(saved)
    if (!saved.id) { model.value.id = result.data; saved.id = result.data }
    baseline = JSON.stringify(saved)
    ElMessage.success('模型已保存')
  } catch (error) { ElMessage.error(error.message || '保存失败') } finally { saving.value = false }
}
async function getFormConfig() {
  await capture()
  return { formRules: model.value.formRules, formOptions: model.value.formOptions, codeMode: model.value.codeMode }
}
async function previewCode() {
  const formConfig = await getFormConfig()
  codePreview.value.open({ source: model.value.modelCode, getSource: () => model.value.modelCode, componentId: 'form-model-' + (model.value.id || 'new'), sourceKind: 'current', ...formConfig, getFormConfig, initialRoute: { query: { ...currentRoute.query }, params: { ...currentRoute.params } }, initialProps: { model: { modelName: model.value.modelName, pageTitle: model.value.pageTitle }, fields: fields.value, formData: {} } })
}
async function publish() {
  if (publishing.value || saving.value || !initialized.value) return
  publishing.value = true
  try {
    if (await capture() !== baseline) return ElMessage.warning('请先保存模型，再发布')
    await publishModel(model.value.id)
    ElMessage.success('模型已发布，业务菜单已生成')
    const routes = await usePermissionStore().generateRoutes()
    routes.forEach(route => router.addRoute(route))
  } finally { publishing.value = false }
}
async function refreshApproval() {
  if (!model.value.approvalCode || approvalLoading.value) return
  const request = ++approvalRequest
  approvalLoading.value = true
  try {
    const result = await getApproval(model.value.approvalCode, model.value.feishuAppId, true)
    if (request !== approvalRequest || !editing.value) return
    approval.value = result.data
    approvalError.value = ''
  } catch (error) {
    if (request !== approvalRequest || !editing.value) return
    approvalError.value = error?.message || (typeof error === 'string' ? error : '飞书审批读取失败，请重试')
  } finally { if (request === approvalRequest) approvalLoading.value = false }
}
async function associate() {
  const code = approvalInput.value.trim()
  if (!model.value.feishuAppId) return ElMessage.warning('请先选择飞书应用')
  if (!code) return ElMessage.warning('请输入审批定义Code')
  const request = ++approvalRequest
  approvalLoading.value = true
  try {
    const result = await getApproval(code, model.value.feishuAppId)
    if (request !== approvalRequest || !editing.value) return
    if (model.value.approvalCode !== code) fields.value.forEach(field => { field.approvalMap = '' })
    model.value.approvalCode = code; approval.value = result.data; approvalError.value = ''
  } finally { if (request === approvalRequest) approvalLoading.value = false }
}
function changeFeishuApp() { clearApproval() }
function clearApproval() { ++approvalRequest; approvalLoading.value = false; approvalError.value = ''; model.value.approvalCode = ''; approvalInput.value = ''; approval.value = null; fields.value.forEach(field => { field.approvalMap = '' }) }
async function mayLeave() {
  if (!editing.value || !initialized.value) return true
  let changed = true
  try { changed = await capture() !== baseline } catch { /* 无效设计也需要防止静默丢弃。 */ }
  if (!changed) return true
  try { await ElMessageBox.confirm('模型尚未保存，确定离开？', '提示'); return true } catch { return false }
}
async function back() { if (await mayLeave()) { ++approvalRequest; editing.value = false; load() } }
async function remove(row) { try { await ElMessageBox.confirm(`确定删除模型“${row.modelName}”及其发布菜单？`, '提示') } catch { return }; await deleteModel(row.id); ElMessage.success('删除成功'); load() }
function beforeUnload(event) { if (editing.value && initialized.value && snapshot() !== baseline) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave((to, from) => isRetainedTabNavigation(to, from, currentRoute) || mayLeave())
onMounted(() => { load(); loadFeishuApps(); window.addEventListener('beforeunload', beforeUnload) })
onBeforeUnmount(() => { ++approvalRequest; window.removeEventListener('beforeunload', beforeUnload) })
</script>
<style scoped>
.model-list { margin-top: 16px; }.basic-form { max-width: 800px; }.model-code-editor { height: 600px; }
.model-editor { display: grid; grid-template-columns: minmax(200px, 1fr) minmax(0, max-content) minmax(200px, 1fr); column-gap: 16px; align-items: center; }
.model-toolbar-back { grid-area: 1 / 1; display: flex; align-items: center; gap: 12px; min-width: 0; }
.model-toolbar-back strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-toolbar-actions { grid-area: 1 / 3; display: flex; justify-content: flex-end; gap: 12px; white-space: nowrap; }
.model-toolbar-actions .el-button + .el-button { margin-left: 0; }
/* Keep the original tabs/panes and lifecycle; only place the header in the shared row. */
.model-tabs { display: contents; }
.model-tabs > :deep(.el-tabs__header) { grid-area: 1 / 2; min-width: 0; margin: 0; }
.model-approval-warning { grid-column: 1 / -1; grid-row: 2; margin-top: 12px; }
.model-tabs > :deep(.el-tabs__content) { grid-column: 1 / -1; grid-row: 3; min-width: 0; margin-top: 16px; }
@media (max-width: 1000px) {
  .model-editor { grid-template-columns: auto minmax(0, 1fr) auto; column-gap: 12px; }
  .model-toolbar-back strong { display: none; }
  .model-tabs > :deep(.el-tabs__header) { justify-content: center; }
}
</style>
