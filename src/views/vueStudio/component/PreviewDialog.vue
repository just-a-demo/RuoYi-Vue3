<template>
  <el-dialog v-model="visible" title="组件预览" width="min(1100px, 96vw)" append-to-body destroy-on-close @close="closeSandbox">
    <div class="preview-head">
      <el-text type="info">代码来源：{{ sourceLabel }}。打开、修改参数或保存均不会自动运行。</el-text>
      <el-tag :type="runStatus === 'ready' ? 'success' : 'info'">{{ statusText }}</el-tag>
    </div>
    <PreviewSandbox
      ref="sandboxRef" :source="source" :component-id="componentId" :width="advanced.width" :height="advanced.height"
      :background="advanced.background" :timeout="advanced.timeout" :show-console="advanced.showConsole"
      @console="onConsole" @status="runStatus = $event"
    />
    <el-collapse v-model="openPanels" class="options">
      <el-collapse-item title="组件传值（默认收起）" name="props">
        <PreviewPropsPanel v-model="propRows" />
      </el-collapse-item>
      <el-collapse-item title="高级选项（默认收起）" name="advanced">
        <el-form :inline="true">
          <el-form-item label="画布">
            <el-select v-model="device" style="width: 190px" @change="applyDevice">
              <el-option label="桌面 1280 × 720" value="1280x720" />
              <el-option label="平板 768 × 1024" value="768x1024" />
              <el-option label="手机 390 × 844" value="390x844" />
            </el-select>
          </el-form-item>
          <el-form-item label="背景"><el-radio-group v-model="advanced.background"><el-radio-button value="light">浅色</el-radio-button><el-radio-button value="dark">深色</el-radio-button></el-radio-group></el-form-item>
          <el-form-item label="超时"><el-input-number v-model="advanced.timeout" :min="1000" :max="15000" :step="1000" /></el-form-item>
          <el-form-item><el-checkbox v-model="advanced.showConsole">显示控制台</el-checkbox></el-form-item>
          <el-form-item><el-button @click="rebuild">清空缓存 / 重建沙箱</el-button></el-form-item>
        </el-form>
        <el-scrollbar v-if="advanced.showConsole" max-height="120px" class="console">
          <div v-for="(item, index) in consoleLines" :key="index" :class="item.level">[{{ item.level }}] {{ item.args.join(' ') }}</div>
        </el-scrollbar>
      </el-collapse-item>
    </el-collapse>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" icon="VideoPlay" :loading="runStatus === 'building'" @click="run">{{ hasRun ? '重新预览' : '开始预览' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PreviewPropsPanel from './PreviewPropsPanel.vue'
import PreviewSandbox from './PreviewSandbox.vue'
import { extractPropSuggestions } from './previewCompiler'

const visible = ref(false)
const source = ref('')
const componentId = ref('draft')
const sourceKind = ref('saved')
const openPanels = ref([])
const propRows = ref([])
const sandboxRef = ref()
const runStatus = ref('idle')
const hasRun = ref(false)
const device = ref('1280x720')
const consoleLines = ref([])
const advanced = ref({ width: 1280, height: 720, background: 'light', timeout: 5000, showConsole: false })

function createRowId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
}

const sourceLabel = computed(() => sourceKind.value === 'current' ? '当前编辑内容' : '最近保存版本')
const statusText = computed(() => ({ idle: '尚未运行', building: '正在运行', ready: '运行完成', error: '运行失败' }[runStatus.value]))

function open(options) {
  sandboxRef.value?.dispose()
  device.value = '1280x720'
  advanced.value = { width: 1280, height: 720, background: 'light', timeout: 5000, showConsole: false }
  source.value = options.source || ''
  componentId.value = options.componentId || 'draft'
  sourceKind.value = options.sourceKind || 'saved'
  openPanels.value = []
  propRows.value = extractPropSuggestions(source.value).map(item => ({ ...item, id: createRowId() }))
  runStatus.value = 'idle'
  hasRun.value = false
  consoleLines.value = []
  visible.value = true
}

function parseProps() {
  const values = Object.create(null)
  for (const row of propRows.value) {
    if (row.enabled === false) continue
    if (!row.key) continue
    if (Object.hasOwn(values, row.key)) throw new Error(`参数 Key 重复：${row.key}`)
    if (!/^[A-Za-z_$][\w$]*$/.test(row.key)) throw new Error(`无效的参数 Key：${row.key}`)
    if (['__proto__', 'prototype', 'constructor'].includes(row.key)) throw new Error(`参数 Key 不允许使用：${row.key}`)
    if (row.type === 'number') {
      if (!String(row.value).trim()) throw new Error(`${row.key} 不能为空数字`)
      const value = Number(row.value)
      if (!Number.isFinite(value)) throw new Error(`${row.key} 必须是有效数字`)
      values[row.key] = value
    } else if (row.type === 'boolean') {
      if (!['true', 'false'].includes(String(row.value).toLowerCase())) throw new Error(`${row.key} 必须是 true 或 false`)
      values[row.key] = String(row.value).toLowerCase() === 'true'
    } else if (row.type === 'json') {
      try { values[row.key] = JSON.parse(row.value) } catch (_error) { throw new Error(`${row.key} 不是有效 JSON`) }
    } else values[row.key] = row.value
  }
  return values
}

async function run() {
  try {
    const values = parseProps()
    consoleLines.value = []
    hasRun.value = true
    runStatus.value = 'building'
    await nextTick()
    await sandboxRef.value.run(values)
  } catch (error) {
    ElMessage.error(error.message)
  }
}

function rebuild() {
  sandboxRef.value?.dispose()
  runStatus.value = 'idle'
  hasRun.value = false
  consoleLines.value = []
  ElMessage.success('临时沙箱已销毁')
}

function applyDevice(value) {
  const [width, height] = value.split('x').map(Number)
  advanced.value.width = width
  advanced.value.height = height
}

function onConsole(message) { consoleLines.value.push(message); if (consoleLines.value.length > 200) consoleLines.value.shift() }
function closeSandbox() { sandboxRef.value?.dispose(); source.value = ''; propRows.value = []; consoleLines.value = [] }

defineExpose({ open })
</script>

<style scoped>
.preview-head { display: flex; justify-content: space-between; margin-bottom: 10px; }
.options { margin-top: 12px; }
.console { padding: 8px 12px; color: #ddd; background: #1e1e1e; font: 12px/1.6 Consolas, monospace; }
.console .warn { color: #cca700; } .console .error { color: #f48771; }
</style>
