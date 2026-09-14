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
        <el-table-column label="模型名称" prop="modelName" /><el-table-column label="模型标识" prop="modelKey" />
        <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === '0' ? 'success' : 'info'">{{ row.status === '0' ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="发布路由" prop="routePath" />
        <el-table-column label="操作" width="160"><template #default="{ row }"><el-button v-hasPermi="['business:formModel:edit']" link type="primary" @click="edit(row)">编辑</el-button><el-button v-hasPermi="['business:formModel:remove']" link type="danger" @click="remove(row)">删除</el-button></template></el-table-column>
      </el-table>
      <pagination v-show="total > 0" v-model:page="query.pageNum" v-model:limit="query.pageSize" :total="total" @pagination="load" />
    </template>
    <div v-else v-loading="initializing">
      <div class="model-toolbar"><el-button @click="back">返回列表</el-button><strong>{{ model.modelName || '新增模型' }}</strong><el-button type="primary" :loading="saving" :disabled="!initialized" @click="save">保存模型</el-button><el-button v-hasPermi="['business:formModel:edit']" type="success" :loading="publishing" :disabled="!model.id || saving || !initialized" @click="publish">发布模型</el-button></div>
      <el-tabs v-model="tab" :before-leave="beforeTabLeave">
        <el-tab-pane label="基本信息" name="basic">
          <el-form label-width="120px" class="basic-form">
            <el-form-item label="模型名称" required><el-input v-model="model.modelName" maxlength="100" /></el-form-item>
            <el-form-item label="模型标识" required><el-input v-model="model.modelKey" maxlength="100" placeholder="字母开头，字母、数字或下划线" /></el-form-item>
            <el-form-item label="模型说明"><el-input v-model="model.description" type="textarea" maxlength="500" /></el-form-item>
            <el-form-item label="状态"><el-radio-group v-model="model.status"><el-radio value="0">启用</el-radio><el-radio value="1">停用</el-radio></el-radio-group></el-form-item>
            <el-form-item label="发布路由地址"><el-input v-model="model.routePath" placeholder="/business/purchase" maxlength="200" /></el-form-item>
            <el-form-item label="发布路由名称"><el-input v-model="model.routeName" placeholder="PurchaseList" maxlength="100" /></el-form-item>
            <el-form-item label="发布页面标题"><el-input v-model="model.pageTitle" maxlength="100" /></el-form-item>
            <el-form-item label="飞书审批流"><el-input v-model="approvalInput" placeholder="输入 Approval Code 查询审批定义"><template #append><el-button :loading="approvalLoading" @click="associate">查询并关联</el-button></template></el-input></el-form-item>
            <el-form-item v-if="model.approvalCode" label="当前关联"><el-tag>{{ approval?.name || model.approvalCode }}</el-tag><el-button link type="danger" @click="clearApproval">取消关联</el-button></el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="表单设计" name="design"><StudioDesigner ref="designer" v-model:rules="model.formRules" v-model:options="model.formOptions" height="650px" /></el-tab-pane>
        <el-tab-pane label="代码编写" name="code">
          <div class="code-toolbar"><el-button @click="previewCode">预览表单</el-button><el-select v-model="model.codeMode" style="width:180px"><el-option label="代码布局表单" value="integrated" /><el-option label="原有代码兼容模式" value="legacy" /></el-select><el-button @click="useFormTemplate">使用组合模板</el-button></div>
          <el-alert v-if="model.codeMode === 'legacy'" title="兼容模式会在自定义代码下方显示设计表单。改为代码布局后，请在 Template 中放置 form-create。" type="info" :closable="false" class="code-hint" />
          <el-alert v-else title="表单设计与代码共同保存。通过 inject('studioForm') 获取 rules、options、formData、formApi；在 Template 中编排 form-create 和其他组件。" type="info" :closable="false" class="code-hint" />
          <div class="model-code-editor"><MonacoSfcEditor v-if="tab === 'code'" v-model="model.modelCode" :component-key="'form-model-' + (model.id || 'new')" @save="save" /></div>
        </el-tab-pane>
        <el-tab-pane label="模型字段" name="fields">
          <el-alert v-if="!model.approvalCode" title="请先在基本信息中关联飞书审批流，再配置字段映射。" type="info" :closable="false" />
          <el-table :data="fields"><el-table-column label="字段名称" prop="title" /><el-table-column label="字段标识" prop="field" /><el-table-column label="字段类型" prop="type" />
            <el-table-column label="飞书审批字段"><template #default="{ row }"><el-select v-model="row.approvalMap" clearable filterable :disabled="!approval" placeholder="选择映射字段"><el-option v-for="field in approval?.fields || []" :key="field.id" :label="`${field.name}（${field.type}）`" :value="field.id" /></el-select></template></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="列表设计" name="list">
          <el-table :data="fields"><el-table-column label="字段名称" prop="title" /><el-table-column label="字段标识" prop="field" />
            <el-table-column label="显示"><template #default="{ row }"><el-checkbox v-model="row.visible" /></template></el-table-column>
            <el-table-column label="顺序" width="170"><template #default="{ row }"><el-input-number v-model="row.order" :min="1" :max="9999" /></template></el-table-column>
            <el-table-column label="允许排序"><template #default="{ row }"><el-checkbox v-model="row.sortable" /></template></el-table-column>
            <el-table-column label="作为筛选"><template #default="{ row }"><el-checkbox v-model="row.filter" /></template></el-table-column>
          </el-table>
          <el-divider>列表效果</el-divider>
          <ModelTable v-if="tab === 'list'" :fields="fields" />
        </el-tab-pane>
      </el-tabs>
    </div>
    <PreviewDialog ref="codePreview" />
  </div>
</template>
<script setup name="FormModel">
import { ref, reactive, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listModels, getModel, saveModel, deleteModel, getApproval, publishModel } from '@/api/business/formModel'
import { syncFields } from './fields'
import ModelTable from './ModelTable.vue'
import MonacoSfcEditor from '@/components/MonacoSfcEditor/index.vue'
import StudioDesigner from '@/components/StudioDesigner/index.vue'
import { createComponentSource } from '@/views/vueStudio/component/templates'
import PreviewDialog from '@/views/vueStudio/component/PreviewDialog.vue'
import usePermissionStore from '@/store/modules/permission'
import router from '@/router'
const rows = ref([]), total = ref(0), loading = ref(false), saving = ref(false), editing = ref(false), tab = ref('basic')
const query = reactive({ pageNum: 1, pageSize: 10, modelName: '', modelKey: '', status: '' })
const model = ref({}), fields = ref([]), designer = ref(), approval = ref(null), approvalInput = ref(''), approvalLoading = ref(false)
const publishing = ref(false), codePreview = ref()
const initialized = ref(false), initializing = ref(false)
const currentRoute = useRoute()
let baseline = '', approvalRequest = 0
async function load() { loading.value = true; try { const result = await listModels(query); rows.value = result.rows; total.value = result.total } finally { loading.value = false } }
function search() { query.pageNum = 1; load() }
function reset() { Object.assign(query, { modelName: '', modelKey: '', status: '' }); search() }
function snapshot() {
  return JSON.stringify({ ...model.value, fieldConfig: JSON.stringify(fields.value) })
}
async function capture() {
  if (designer.value) {
    Object.assign(model.value, await designer.value.capture())
  }
  fields.value = syncFields(JSON.parse(model.value.formRules || '[]'), fields.value)
  model.value.fieldConfig = JSON.stringify(fields.value)
  return snapshot()
}
async function edit(row) {
  initialized.value = false
  initializing.value = true
  try {
  const data = row ? (await getModel(row.id)).data : { modelName: '', modelKey: '', description: '', status: '0', routePath: '', routeName: '', pageTitle: '', approvalCode: '', formRules: '[]', formOptions: '{}', modelCode: createComponentSource('form', true), codeMode: 'integrated', fieldConfig: '[]' }
  model.value = { ...data, codeMode: data.codeMode || 'legacy', formRules: data.formRules || '[]', formOptions: data.formOptions || '{}' }
  fields.value = syncFields(JSON.parse(model.value.formRules), JSON.parse(data.fieldConfig || '[]'))
  approval.value = null; approvalInput.value = data.approvalCode || ''; tab.value = 'basic'; editing.value = true
  await nextTick()
  await designer.value.setValue({ formRules: model.value.formRules, formOptions: model.value.formOptions })
  baseline = await capture()
  initialized.value = true
  initializing.value = false
  if (data.approvalCode) {
    const request = ++approvalRequest
    try { const result = await getApproval(data.approvalCode); if (request === approvalRequest && editing.value) approval.value = result.data } catch { /* 请求层展示失败，保留原映射供重试。 */ }
  }
  } finally { initializing.value = false }
}
async function beforeTabLeave() { try { await capture(); return true } catch (error) { ElMessage.error(error.message); return false } }
async function save() {
  if (saving.value || !initialized.value) return
  saving.value = true
  try {
    await capture()
    const saved = JSON.parse(JSON.stringify(model.value))
    const result = await saveModel(saved)
    if (!saved.id) { model.value.id = result.data; saved.id = result.data }
    baseline = JSON.stringify(saved)
    ElMessage.success('模型已保存')
  } finally { saving.value = false }
}
async function getFormConfig() {
  await capture()
  return { formRules: model.value.formRules, formOptions: model.value.formOptions, codeMode: model.value.codeMode }
}
async function previewCode() {
  const formConfig = await getFormConfig()
  codePreview.value.open({ source: model.value.modelCode, getSource: () => model.value.modelCode, componentId: 'form-model-' + (model.value.id || 'new'), sourceKind: 'current', ...formConfig, getFormConfig, initialRoute: { query: { ...currentRoute.query }, params: { ...currentRoute.params } }, initialProps: { model: { modelName: model.value.modelName, pageTitle: model.value.pageTitle }, fields: fields.value, formData: {} } })
}
async function useFormTemplate() {
  try { await ElMessageBox.confirm('使用组合模板会替换当前代码，表单设计和已有业务数据会保留。确定替换吗？', '使用组合模板') } catch { return }
  model.value.modelCode = createComponentSource('form', true)
  model.value.codeMode = 'integrated'
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
async function associate() {
  const code = approvalInput.value.trim()
  if (!code) return ElMessage.warning('请输入审批定义Code')
  const request = ++approvalRequest
  approvalLoading.value = true
  try {
    const result = await getApproval(code)
    if (request !== approvalRequest || !editing.value) return
    if (model.value.approvalCode !== code) fields.value.forEach(field => { field.approvalMap = '' })
    model.value.approvalCode = code; approval.value = result.data
  } finally { if (request === approvalRequest) approvalLoading.value = false }
}
function clearApproval() { ++approvalRequest; approvalLoading.value = false; model.value.approvalCode = ''; approvalInput.value = ''; approval.value = null; fields.value.forEach(field => { field.approvalMap = '' }) }
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
onBeforeRouteLeave(mayLeave)
onMounted(() => { load(); window.addEventListener('beforeunload', beforeUnload) })
onBeforeUnmount(() => { ++approvalRequest; window.removeEventListener('beforeunload', beforeUnload) })
</script>
<style scoped>
.model-list { margin-top: 16px; }.model-toolbar { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }.model-toolbar strong { flex: 1; }.basic-form { max-width: 800px; }.model-code-editor { height: 600px; }.code-toolbar { display: flex; gap: 16px; align-items: center; margin-bottom: 12px; }.code-hint { margin-bottom: 12px; }
</style>
