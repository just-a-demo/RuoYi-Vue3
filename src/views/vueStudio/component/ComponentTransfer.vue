<template>
  <el-col :span="1.5"><el-button v-hasPermi="['vueStudio:component:add', 'vueStudio:component:edit']" type="primary" plain icon="Upload" @click="openImport">导入组件包</el-button></el-col>
  <el-col :span="1.5"><el-button v-hasPermi="['vueStudio:component:export']" type="warning" plain icon="Download" :disabled="!selected.length" :loading="exporting" @click="exportPackage">导出组件包{{ selected.length ? `（${selected.length}）` : '' }}</el-button></el-col>
  <el-dialog v-model="visible" title="导入组件包 · JSON" width="980px" append-to-body :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" :before-close="closeDialog">
    <el-alert type="info" :closable="false" show-icon title="仅导入已保存的草稿内容及包内依赖，不包含发布历史，也不会自动发布。覆盖保留原标识、启停状态、已有发布用途和已发布版本。" />
    <div class="package-file">
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="readPackage" />
      <el-button :disabled="busy" icon="FolderOpened" @click="fileInput.click()">选择 JSON 文件</el-button>
      <span>{{ fileName || '最多20MB、100个组件（含依赖）' }}</span>
      <el-button v-if="packageData" :loading="previewing" :disabled="importing" @click="previewPackage">重新预览冲突</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" class="mb8" />
    <template v-if="items.length">
      <p>共 {{ items.length }} 个组件，其中 {{ items.filter(item => item.dependency).length }} 个为依赖组件。标识不区分大小写；有冲突时必须选择覆盖或重命名。</p>
      <el-alert type="warning" :closable="false" title="重命名会同步改写包内静态 @lc/ 引用与 FormCreate 自定义组件类型；不改写包外引用。项目文件、npm 包、接口和其他外部资源需在目标环境另行准备。源码只做结构校验，请导入后在编辑器检查，再按需发布。" class="mb8" />
      <el-table :data="items" max-height="350" border :row-key="row => row.sourceKey">
        <el-table-column label="包内组件" min-width="180"><template #default="{ row }"><strong>{{ row.componentName }}</strong><div>{{ row.sourceKey }} <el-tag v-if="row.dependency" size="small" type="info">依赖</el-tag></div></template></el-table-column>
        <el-table-column label="目标环境" min-width="160"><template #default="{ row }"><template v-if="row.existing"><el-tag type="warning" size="small">标识冲突</el-tag><div>{{ row.existing.componentKey }} · 草稿 v{{ row.existing.versionNo }}</div><small>{{ row.existing.publishedVersion ? `已发布 v${row.existing.publishedVersion}（保留）` : '未发布' }}</small></template><el-tag v-else type="success" size="small">可新增</el-tag></template></el-table-column>
        <el-table-column label="导入方式" width="165"><template #default="{ row }"><el-select v-model="row.action" placeholder="请选择" :disabled="busy" @change="changeAction(row)"><el-option v-if="!row.existing" label="新增草稿" value="create" /><el-option v-if="row.existing" label="覆盖草稿" value="overwrite" /><el-option label="重命名新增" value="rename" /></el-select></template></el-table-column>
        <el-table-column label="目标标识" min-width="190"><template #default="{ row }"><el-input v-model="row.targetKey" maxlength="100" :disabled="busy || row.action !== 'rename'" placeholder="字母开头，字母/数字/_" /></template></el-table-column>
      </el-table>
      <el-collapse v-if="externalImports.length" class="package-external"><el-collapse-item title="未打包的模块导入（请检查目标环境）" name="external"><el-tag v-for="name in externalImports" :key="name" class="mr5 mb8" type="info">{{ name }}</el-tag></el-collapse-item></el-collapse>
    </template>
    <template #footer><el-button :disabled="busy" @click="visible = false">取消</el-button><el-button type="primary" :loading="importing" :disabled="busy || !items.length" @click="commitImport">确认导入草稿</el-button></template>
  </el-dialog>
</template>

<script setup>
import { computed, getCurrentInstance, ref, shallowRef } from 'vue'
import { exportComponentPackage, previewComponentPackage, importComponentPackage } from '@/api/vueStudio/component'
const props = defineProps({ selected: { type: Array, default: () => [] } })
const emit = defineEmits(['imported'])
const { proxy } = getCurrentInstance()
const visible = ref(false), exporting = ref(false), previewing = ref(false), importing = ref(false)
const fileInput = ref(), fileName = ref(''), error = ref(''), items = ref([]), packageData = shallowRef()
const busy = computed(() => previewing.value || importing.value)
const externalImports = computed(() => [...new Set(items.value.flatMap(item => item.externalImports || []))].sort())
function closeDialog(done) { if (!busy.value) done() }
function openImport() {
  if (busy.value) return
  items.value = []; packageData.value = undefined; error.value = ''; fileName.value = ''; visible.value = true
  if (fileInput.value) fileInput.value.value = ''
}
async function exportPackage() {
  if (exporting.value || !props.selected.length) return
  exporting.value = true
  try {
    const response = await exportComponentPackage(props.selected.map(item => item.id))
    const blob = new Blob([JSON.stringify(response.data)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `vue_components_${Date.now()}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    proxy.$modal.msgSuccess(`已导出 ${response.data.components.length} 个组件（含依赖）。项目/npm 依赖和外部资源未打包。`)
  } finally { exporting.value = false }
}
async function readPackage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || busy.value) return
  items.value = []; packageData.value = undefined; error.value = ''; fileName.value = file.name
  if (file.size > 20 * 1024 * 1024) { error.value = '文件不能超过20MB'; return }
  previewing.value = true
  try { packageData.value = JSON.parse((await file.text()).replace(/^\uFEFF/, '')) }
  catch { error.value = '文件不是有效的 JSON，请选择“导出组件包”生成的文件'; return }
  finally { previewing.value = false }
  await previewPackage()
}
async function previewPackage() {
  if (!packageData.value || busy.value) return
  previewing.value = true; items.value = []; error.value = ''
  try {
    const response = await previewComponentPackage(packageData.value)
    items.value = response.data.items.map(item => ({ ...item, action: item.existing ? '' : 'create', targetKey: item.existing?.componentKey || item.sourceKey }))
  } catch (reason) { error.value = reason.message || '组件包预览失败' }
  finally { previewing.value = false }
}
function changeAction(row) {
  row.targetKey = row.action === 'rename' ? `${row.sourceKey.slice(0, 96)}Copy` : (row.existing?.componentKey || row.sourceKey)
  error.value = ''
}
async function commitImport() {
  if (busy.value) return
  error.value = ''
  const targets = new Set()
  for (const item of items.value) {
    if (!item.action) { error.value = `请选择 ${item.sourceKey} 的导入方式`; return }
    if (!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(item.targetKey)) { error.value = `${item.sourceKey} 的目标标识格式无效`; return }
    const key = item.targetKey.toLowerCase()
    if (targets.has(key)) { error.value = `目标标识重复：${item.targetKey}`; return }
    targets.add(key)
  }
  importing.value = true
  try {
    const overwrites = items.value.filter(item => item.action === 'overwrite').length
    try { await proxy.$modal.confirm(`将导入 ${items.value.length} 个组件${overwrites ? `，其中覆盖 ${overwrites} 个现有草稿` : ''}。已发布版本不变，是否继续？`) }
    catch { return }
    const choices = items.value.map(item => ({ sourceKey: item.sourceKey, targetKey: item.targetKey, action: item.action, existingId: item.existing?.id, expectedVersion: item.existing?.versionNo }))
    const response = await importComponentPackage(packageData.value, choices)
    visible.value = false; packageData.value = undefined; items.value = []
    proxy.$modal.msgSuccess(`已导入 ${response.data.count} 个组件草稿，请检查源码后按需发布`)
    emit('imported')
  } catch (reason) { error.value = (reason.message || '导入失败') + '；如目标环境已变化，请重新预览冲突。' }
  finally { importing.value = false }
}
</script>

<style scoped>
.package-file { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
.package-file span { overflow-wrap: anywhere; }
.package-external { margin-top: 12px; }
</style>
