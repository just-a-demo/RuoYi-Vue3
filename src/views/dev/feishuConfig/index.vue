<template>
  <div class="app-container">
    <el-form :model="query" inline @submit.prevent="search">
      <el-form-item label="配置名称"><el-input v-model="query.appName" clearable placeholder="请输入配置名称" @keyup.enter="search" /></el-form-item>
      <el-form-item label="App ID"><el-input v-model="query.appId" clearable placeholder="请输入 App ID" @keyup.enter="search" /></el-form-item>
      <el-form-item label="状态"><el-select v-model="query.status" clearable style="width: 120px"><el-option label="启用" value="0" /><el-option label="停用" value="1" /></el-select></el-form-item>
      <el-form-item><el-button type="primary" icon="Search" @click="search">查询</el-button><el-button icon="Refresh" @click="resetQuery">重置</el-button></el-form-item>
    </el-form>

    <el-button v-hasPermi="['business:feishuConfig:add']" type="primary" plain icon="Plus" @click="openDialog()">新增配置</el-button>
    <el-table v-loading="loading" :data="rows" class="config-table">
      <el-table-column label="配置名称" prop="appName" min-width="150" />
      <el-table-column label="App ID" prop="appId" min-width="220" show-overflow-tooltip />
      <el-table-column label="Secret" width="110"><template #default="{ row }"><el-tag :type="row.secretConfigured ? 'success' : 'danger'">{{ row.secretConfigured ? '已配置' : '未配置' }}</el-tag></template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{ row }"><el-switch v-model="row.status" active-value="0" inactive-value="1" :disabled="!canEdit" @change="changeStatus(row)" /></template></el-table-column>
      <el-table-column label="备注" prop="remark" min-width="180" show-overflow-tooltip />
      <el-table-column label="更新时间" prop="updateTime" width="170"><template #default="{ row }">{{ parseTime(row.updateTime || row.createTime) }}</template></el-table-column>
      <el-table-column label="操作" width="150" fixed="right"><template #default="{ row }">
        <el-button v-hasPermi="['business:feishuConfig:edit']" link type="primary" icon="Edit" @click="openDialog(row)">修改</el-button>
        <el-button v-hasPermi="['business:feishuConfig:remove']" link type="danger" icon="Delete" @click="remove(row)">删除</el-button>
      </template></el-table-column>
    </el-table>
    <pagination v-show="total > 0" v-model:page="query.pageNum" v-model:limit="query.pageSize" :total="total" @pagination="load" />

    <el-dialog v-model="dialogVisible" :title="form.id ? '修改飞书配置' : '新增飞书配置'" width="560px" append-to-body @closed="formRef?.resetFields()">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="配置名称" prop="appName"><el-input v-model="form.appName" maxlength="100" placeholder="例如：采购审批应用" /></el-form-item>
        <el-form-item label="App ID" prop="appId"><el-input v-model="form.appId" maxlength="100" autocomplete="off" /></el-form-item>
        <el-form-item label="App Secret" prop="appSecret">
          <el-input v-model="form.appSecret" type="password" show-password maxlength="255" autocomplete="new-password" :placeholder="form.id ? '留空表示不修改' : '请输入 App Secret'" />
        </el-form-item>
        <el-form-item label="状态" prop="status"><el-radio-group v-model="form.status"><el-radio value="0">启用</el-radio><el-radio value="1">停用</el-radio></el-radio-group></el-form-item>
        <el-form-item label="备注" prop="remark"><el-input v-model="form.remark" type="textarea" maxlength="500" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submit">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup name="FeishuConfig">
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import useUserStore from '@/store/modules/user'
import { addFeishuConfig, deleteFeishuConfig, listFeishuConfigs, updateFeishuConfig } from '@/api/business/feishuConfig'

const rows = ref([]), total = ref(0), loading = ref(false), dialogVisible = ref(false), saving = ref(false), formRef = ref()
const query = reactive({ pageNum: 1, pageSize: 10, appName: '', appId: '', status: '' })
const form = reactive({ id: null, appName: '', appId: '', appSecret: '', status: '0', remark: '' })
const canEdit = computed(() => useUserStore().permissions.includes('*:*:*') || useUserStore().permissions.includes('business:feishuConfig:edit'))
const rules = {
  appName: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  appId: [{ required: true, message: '请输入 App ID', trigger: 'blur' }, { pattern: /^[A-Za-z0-9_-]{1,100}$/, message: 'App ID 格式无效', trigger: 'blur' }],
  appSecret: [{ validator: (_, value, callback) => (!form.id && !value) || (value && value.length < 8) ? callback(new Error('App Secret 至少8个字符')) : callback(), trigger: 'blur' }]
}

async function load() {
  loading.value = true
  try { const result = await listFeishuConfigs(query); rows.value = result.rows; total.value = result.total } finally { loading.value = false }
}
function search() { query.pageNum = 1; load() }
function resetQuery() { Object.assign(query, { pageNum: 1, appName: '', appId: '', status: '' }); load() }
function openDialog(row) {
  Object.assign(form, row ? { id: row.id, appName: row.appName, appId: row.appId, appSecret: '', status: row.status, remark: row.remark || '' } : { id: null, appName: '', appId: '', appSecret: '', status: '0', remark: '' })
  dialogVisible.value = true
}
async function submit() {
  if (!(await formRef.value.validate().catch(() => false))) return
  saving.value = true
  try {
    await (form.id ? updateFeishuConfig({ ...form }) : addFeishuConfig({ ...form }))
    ElMessage.success('保存成功')
    dialogVisible.value = false
    load()
  } finally { saving.value = false }
}
async function changeStatus(row) {
  const previous = row.status === '0' ? '1' : '0'
  try { await updateFeishuConfig({ ...row, appSecret: '' }); ElMessage.success(row.status === '0' ? '已启用' : '已停用') } catch { row.status = previous }
}
async function remove(row) {
  try { await ElMessageBox.confirm(`确定删除飞书配置“${row.appName}”？`, '提示') } catch { return }
  await deleteFeishuConfig(row.id)
  ElMessage.success('删除成功')
  load()
}
load()
</script>

<style scoped>
.config-table { margin-top: 16px; }
</style>
