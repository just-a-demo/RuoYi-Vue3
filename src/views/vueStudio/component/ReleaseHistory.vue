<template>
  <el-drawer v-model="visible" title="发布历史" size="80%" append-to-body>
    <el-table v-loading="loading" :data="versions" highlight-current-row @row-click="select">
      <el-table-column label="发布版本" width="100"><template #default="{ row }">v{{ row.releaseNo }}</template></el-table-column>
      <el-table-column label="发布日志" prop="releaseNotes" min-width="240" />
      <el-table-column label="发布人" prop="createBy" width="110" />
      <el-table-column label="发布时间" prop="createTime" width="180" />
    </el-table>
    <template v-if="snapshot">
      <el-divider>v{{ snapshot.releaseNo }} 发布快照</el-divider>
      <el-tabs v-model="tab">
        <el-tab-pane label="Vue 源码" name="source"><el-input :model-value="snapshot.sourceCode" type="textarea" :rows="22" readonly /></el-tab-pane>
        <el-tab-pane label="设计规则" name="rules"><el-input :model-value="snapshot.formRules" type="textarea" :rows="22" readonly /></el-tab-pane>
        <el-tab-pane label="表单配置" name="options"><el-input :model-value="snapshot.formOptions" type="textarea" :rows="22" readonly /></el-tab-pane>
      </el-tabs>
    </template>
    <el-empty v-else-if="!loading && !versions.length" description="暂无发布版本" />
  </el-drawer>
</template>
<script setup>
import { ref } from 'vue'
import { getComponentVersions, getComponentVersion } from '@/api/vueStudio/component'
const visible = ref(false), loading = ref(false), versions = ref([]), snapshot = ref(), tab = ref('source')
let componentId, generation = 0
async function open(id) {
  const current = ++generation
  componentId = id; visible.value = true; loading.value = true; snapshot.value = null; versions.value = []
  try {
    const result = await getComponentVersions(id)
    if (current === generation) versions.value = result.data
  } finally { if (current === generation) loading.value = false }
}
async function select(row) {
  const current = ++generation
  const result = await getComponentVersion(componentId, row.id)
  if (current === generation) { snapshot.value = result.data; tab.value = 'source' }
}
defineExpose({ open })
</script>
