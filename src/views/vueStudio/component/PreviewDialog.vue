<template>
  <el-drawer v-model="drawerVisible" title="预览参数" size="min(640px, 95vw)" :z-index="3100" append-to-body>
    <el-tabs v-model="parameterTab">
      <el-tab-pane label="Props" name="props"><PreviewPropsPanel v-model="propRows" /></el-tab-pane>
      <el-tab-pane label="Route Query" name="query"><PreviewPropsPanel v-model="queryRows" /></el-tab-pane>
      <el-tab-pane label="Route Params" name="params"><PreviewPropsPanel v-model="paramsRows" /></el-tab-pane>
    </el-tabs>
    <el-divider />
    <el-checkbox v-if="canCustomField" v-model="customField">放入 FormCreate 中预览自定义组件</el-checkbox>
    <el-collapse><el-collapse-item title="画布与控制台">
      <el-form label-width="90px">
        <el-form-item label="画布"><el-select v-model="device" @change="applyDevice"><el-option label="桌面" value="1280x720" /><el-option label="平板" value="768x1024" /><el-option label="手机" value="390x844" /></el-select></el-form-item>
        <el-form-item label="控制台"><el-switch v-model="showConsole" /></el-form-item>
        <el-form-item label="背景"><el-radio-group v-model="background"><el-radio-button value="light">浅色</el-radio-button><el-radio-button value="dark">深色</el-radio-button></el-radio-group></el-form-item>
        <el-form-item label="超时"><el-input-number v-model="timeout" :min="1000" :max="30000" :step="1000" /></el-form-item>
        <el-form-item><el-button @click="rebuild">重建沙箱</el-button></el-form-item>
      </el-form>
    </el-collapse-item></el-collapse>
    <template #footer><el-button @click="drawerVisible = false">关闭</el-button><el-button v-if="runStatus === 'ready'" :loading="applying" @click="apply">应用参数</el-button><el-button type="primary" :loading="running" :disabled="applying" @click="run">运行代码</el-button></template>
  </el-drawer>
  <el-dialog v-model="visible" title="组件预览" width="min(1200px, 96vw)" append-to-body destroy-on-close @close="closeSandbox">
    <div class="preview-head"><el-text>代码来源：{{ sourceKind === 'current' ? '当前编辑内容' : '最近保存版本' }}</el-text><el-tag>{{ statusText }}</el-tag></div>
    <PreviewSandbox ref="sandbox" :source="source" :component-id="componentId" :width="width" :height="height" :background="background" :timeout="timeout" :show-console="showConsole" @status="runStatus = $event" @console="onConsole" />
    <el-scrollbar v-if="showConsole" max-height="140px" class="console"><div v-for="(line, index) in consoleLines" :key="index">[{{ line.level }}] {{ line.args.join(' ') }}</div></el-scrollbar>
    <template #footer><el-button @click="drawerVisible = true">设置参数</el-button><el-button :disabled="runStatus !== 'ready'" :loading="applying" @click="apply">应用参数</el-button><el-button type="primary" :loading="running" :disabled="applying" @click="run">重新运行代码</el-button><el-button @click="visible = false">关闭</el-button></template>
  </el-dialog>
</template>
<script setup>
import { computed, ref, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import PreviewPropsPanel from './PreviewPropsPanel.vue'
import PreviewSandbox from './PreviewSandbox.vue'
import { extractPropSuggestions } from './previewCompiler'
import { parseParameterRows, parseRouteRows, parameterRows } from './previewParameters'
const currentRoute = useRoute()
const drawerVisible = ref(false), visible = ref(false), parameterTab = ref('props'), propRows = ref([]), queryRows = ref([]), paramsRows = ref([])
const source = ref(''), componentId = ref('draft'), sourceKind = ref('current'), sandbox = ref(), runStatus = ref('idle'), running = ref(false)
const applying = ref(false)
const canCustomField = ref(false), customField = ref(false), device = ref('1280x720'), width = ref(1280), height = ref(720), showConsole = ref(false), consoleLines = ref([])
const background = ref('light'), timeout = ref(15000)
let settings = {}, activeCustomField = false
const statusText = computed(() => ({ idle: '尚未运行', building: '正在运行', ready: '运行完成', error: '运行失败' }[runStatus.value]))
function open(options) {
  closeSandbox(); settings = options; source.value = options.source || ''; componentId.value = options.componentId || 'draft'; sourceKind.value = options.sourceKind || 'saved'
  canCustomField.value = Boolean(options.customField); customField.value = false
  const initial = parameterRows(options.initialProps)
  try { propRows.value = extractPropSuggestions(source.value).map((item, index) => ({ ...item, id: item.key + '-' + index })) } catch { propRows.value = [] }
  for (const item of initial) { const index = propRows.value.findIndex(row => row.key === item.key); if (index >= 0) propRows.value[index] = item; else propRows.value.push(item) }
  const route = options.initialRoute || currentRoute
  queryRows.value = parameterRows(route.query); paramsRows.value = parameterRows(route.params)
  consoleLines.value = []; parameterTab.value = 'props'; drawerVisible.value = true
}
async function run() {
  if (running.value || applying.value) return
  running.value = true
  try {
    const values = parseParameterRows(propRows.value), route = parseRouteRows(queryRows.value, paramsRows.value)
    const form = settings.getFormConfig ? await settings.getFormConfig() : settings
    if (settings.getSource) source.value = settings.getSource()
    activeCustomField = customField.value
    visible.value = true; drawerVisible.value = false; consoleLines.value = []
    await nextTick()
    await sandbox.value.run(values, { formRules: form?.formRules || '[]', formOptions: form?.formOptions || '{}', codeMode: form?.codeMode, customField: activeCustomField, route, background: background.value })
  } catch (error) { ElMessage.error(error.message) }
  finally { running.value = false }
}
async function apply() {
  if (applying.value || running.value || runStatus.value !== 'ready') return
  applying.value = true
  try {
    if (customField.value !== activeCustomField) return ElMessage.warning('预览方式已改变，请点击运行代码')
    await sandbox.value.applyParameters(parseParameterRows(propRows.value), parseRouteRows(queryRows.value, paramsRows.value))
    drawerVisible.value = false; ElMessage.success('参数已应用')
  } catch (error) { ElMessage.error(error.message) }
  finally { applying.value = false }
}
function applyDevice(value) { [width.value, height.value] = value.split('x').map(Number) }
function onConsole(line) { consoleLines.value.push(line); if (consoleLines.value.length > 200) consoleLines.value.shift() }
function closeSandbox() { sandbox.value?.dispose(); runStatus.value = 'idle' }
function rebuild() { closeSandbox(); consoleLines.value = []; ElMessage.success('沙箱已清理，请重新运行代码') }
defineExpose({ open })
</script>
<style scoped>
.preview-head{display:flex;justify-content:space-between;margin-bottom:12px}.console{padding:8px 12px;background:#1e1e1e;color:#eee;font:12px/1.6 monospace}
</style>
