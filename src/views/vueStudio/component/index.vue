<template>
  <div class="app-container">
    <el-form ref="queryRef" :model="queryParams" :inline="true">
      <el-form-item label="组件名称" prop="componentName"><el-input v-model="queryParams.componentName" placeholder="请输入组件名称" clearable @keyup.enter="handleQuery" /></el-form-item>
      <el-form-item label="组件标识" prop="componentKey"><el-input v-model="queryParams.componentKey" placeholder="请输入组件标识" clearable @keyup.enter="handleQuery" /></el-form-item>
      <el-form-item label="状态" prop="status"><el-select v-model="queryParams.status" placeholder="全部" clearable style="width: 120px"><el-option v-for="item in sys_normal_disable" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
      <el-form-item label="更新时间"><el-date-picker v-model="dateRange" value-format="YYYY-MM-DD" type="daterange" range-separator="-" start-placeholder="开始日期" end-placeholder="结束日期" /></el-form-item>
      <el-form-item><el-button type="primary" icon="Search" @click="handleQuery">查询</el-button><el-button icon="Refresh" @click="resetQuery">重置</el-button></el-form-item>
    </el-form>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5"><el-button type="primary" plain icon="Plus" v-hasPermi="['vueStudio:component:add']" @click="openAdd">新增</el-button></el-col>
      <el-col :span="1.5"><el-button type="warning" plain icon="Download" v-hasPermi="['vueStudio:component:export']" @click="handleExport">导出</el-button></el-col>
      <right-toolbar :search="false" @queryTable="loadList" />
    </el-row>

    <el-table v-loading="loading" :data="rows">
      <el-table-column label="组件名称" prop="componentName" min-width="150" show-overflow-tooltip />
      <el-table-column label="组件标识" prop="componentKey" min-width="150" show-overflow-tooltip />
      <el-table-column label="说明" prop="description" min-width="180" show-overflow-tooltip />
      <el-table-column label="状态" align="center" width="90"><template #default="scope"><dict-tag :options="sys_normal_disable" :value="scope.row.status" /></template></el-table-column>
      <el-table-column label="版本" align="center" width="80"><template #default="scope">v{{ scope.row.versionNo }}</template></el-table-column>
      <el-table-column label="诊断" align="center" width="140"><template #default="scope"><el-tag v-if="scope.row.errorCount" type="danger">{{ scope.row.errorCount }} 错误</el-tag><el-tag v-if="scope.row.warningCount" type="warning" class="ml5">{{ scope.row.warningCount }} 警告</el-tag><el-tag v-if="!scope.row.errorCount && !scope.row.warningCount" type="success">通过</el-tag></template></el-table-column>
      <el-table-column label="更新人" prop="updateBy" width="110"><template #default="scope">{{ scope.row.updateBy || scope.row.createBy }}</template></el-table-column>
      <el-table-column label="更新时间" prop="updateTime" width="165"><template #default="scope">{{ parseTime(scope.row.updateTime || scope.row.createTime) }}</template></el-table-column>
      <el-table-column label="操作" fixed="right" width="390" class-name="small-padding">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" v-hasPermi="['vueStudio:component:edit']" @click="openEdit(scope.row)">编辑信息</el-button>
          <el-button link type="primary" icon="EditPen" v-hasPermi="['vueStudio:component:edit']" @click="editCode(scope.row)">编辑代码</el-button>
          <el-button link type="primary" icon="VideoPlay" v-hasPermi="['vueStudio:component:preview']" @click="preview(scope.row)">预览</el-button>
          <el-button link type="primary" icon="CopyDocument" v-hasPermi="['vueStudio:component:add']" @click="copyComponent(scope.row)">复制新建</el-button>
          <el-button link type="danger" icon="Delete" v-hasPermi="['vueStudio:component:remove']" @click="remove(scope.row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <pagination v-show="total > 0" :total="total" v-model:page="queryParams.pageNum" v-model:limit="queryParams.pageSize" @pagination="loadList" />

    <el-dialog v-model="metaVisible" :title="metaTitle" width="620px" append-to-body>
      <el-form ref="metaRef" :model="form" :rules="rules" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="组件名称" prop="componentName"><el-input v-model="form.componentName" maxlength="100" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="组件标识" prop="componentKey"><el-input v-model="form.componentKey" maxlength="100" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="说明" prop="description"><el-input v-model="form.description" type="textarea" maxlength="500" show-word-limit /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="状态" prop="status"><el-radio-group v-model="form.status"><el-radio v-for="item in sys_normal_disable" :key="item.value" :value="item.value">{{ item.label }}</el-radio></el-radio-group></el-form-item></el-col>
        </el-row>
      </el-form>
      <el-alert title="预览参数仅在预览弹窗的当前会话中维护，不写入组件基本信息。" type="info" :closable="false" />
      <template #footer><el-button @click="metaVisible = false">取消</el-button><el-button type="primary" :loading="submitting" @click="submitMeta">{{ form.id ? '保存' : '保存并编辑代码' }}</el-button></template>
    </el-dialog>
    <component :is="PreviewDialog" v-if="PreviewDialog" ref="previewRef" />
  </div>
</template>

<script setup name="VueStudioComponent">
import { getCurrentInstance, nextTick, reactive, ref, toRefs, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { addComponent, deleteComponents, getComponent, listComponents, updateComponent } from '@/api/vueStudio/component'

const PreviewDialog = shallowRef()
const { proxy } = getCurrentInstance()
const router = useRouter()
const { sys_normal_disable } = proxy.useDict('sys_normal_disable')
const loading = ref(false)
const submitting = ref(false)
const rows = ref([])
const total = ref(0)
const dateRange = ref([])
const metaVisible = ref(false)
const metaTitle = ref('新增组件')
const previewRef = ref()
let previewLoading = false
const defaultSource = `<template>\n  <section class="component-card">\n    <h3>{{ title }}</h3>\n  </section>\n</template>\n\n<script setup lang="ts">\nwithDefaults(defineProps<{ title?: string }>(), { title: 'Vue 组件' })\n<\/script>\n\n<style scoped>\n.component-card { padding: 16px; }\n</style>\n`
const data = reactive({
  queryParams: { pageNum: 1, pageSize: 10, componentName: undefined, componentKey: undefined, status: undefined },
  form: {},
  rules: {
    componentName: [{ required: true, message: '组件名称不能为空', trigger: 'blur' }],
    componentKey: [{ required: true, message: '组件标识不能为空', trigger: 'blur' }, { pattern: /^[A-Za-z][A-Za-z0-9_-]*$/, message: '须以字母开头，只能包含字母、数字、_、-' }],
    status: [{ required: true, message: '请选择状态', trigger: 'change' }]
  }
})
const { queryParams, form, rules } = toRefs(data)

async function loadList() {
  loading.value = true
  try {
    const response = await listComponents(proxy.addDateRange(queryParams.value, dateRange.value))
    rows.value = response.rows
    total.value = response.total
  } finally { loading.value = false }
}

function resetForm() {
  form.value = { id: undefined, componentName: '', componentKey: '', description: '', status: '0', sourceCode: defaultSource }
  proxy.resetForm('metaRef')
}
function openAdd() { resetForm(); metaTitle.value = '新增组件'; metaVisible.value = true }
async function openEdit(row) {
  resetForm()
  const response = await getComponent(row.id)
  const item = response.data
  form.value = { id: item.id, componentName: item.componentName, componentKey: item.componentKey, description: item.description, status: item.status }
  metaTitle.value = '编辑组件基本信息'
  metaVisible.value = true
}
async function copyComponent(row) {
  const response = await getComponent(row.id)
  resetForm()
  form.value = { ...form.value, componentName: `${response.data.componentName} 副本`, componentKey: `${response.data.componentKey}Copy`, sourceCode: response.data.sourceCode }
  metaTitle.value = '复制新建组件'
  metaVisible.value = true
}
async function submitMeta() {
  await proxy.$refs.metaRef.validate()
  submitting.value = true
  try {
    if (form.value.id) {
      await updateComponent(form.value)
      proxy.$modal.msgSuccess('基本信息已保存')
      metaVisible.value = false
      loadList()
    } else {
      const response = await addComponent(form.value)
      metaVisible.value = false
      router.push(`/vue-studio/editor/${response.data}`)
    }
  } finally { submitting.value = false }
}
function editCode(row) { router.push(`/vue-studio/editor/${row.id}`) }
async function preview(row) {
  if (previewLoading) return
  previewLoading = true
  try {
    const [response, module] = await Promise.all([getComponent(row.id), import('./PreviewDialog.vue')])
    PreviewDialog.value = module.default
    await nextTick()
    previewRef.value.open({ source: response.data.sourceCode, componentId: row.id, sourceKind: 'saved' })
  } finally { previewLoading = false }
}
async function remove(row) {
  await proxy.$modal.confirm(`是否确认删除组件“${row.componentName}”？`)
  await deleteComponents(row.id)
  proxy.$modal.msgSuccess('删除成功')
  loadList()
}
function handleQuery() { queryParams.value.pageNum = 1; loadList() }
function resetQuery() { dateRange.value = []; proxy.resetForm('queryRef'); handleQuery() }
function handleExport() { proxy.download('/vueStudio/component/export', proxy.addDateRange({ ...queryParams.value }, dateRange.value), `vue_components_${Date.now()}.xlsx`) }

loadList()
</script>
