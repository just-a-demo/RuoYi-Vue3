<template>
  <div ref="pageRef" class="studio-editor" :style="{ '--layout-height': `${layoutHeight}px` }">
    <header class="editor-bar">
      <div class="bar-left">
        <el-button text icon="ArrowLeft" @click="back">返回</el-button>
        <strong>{{ component.componentName || '加载中…' }}</strong>
        <el-tag size="small">v{{ component.versionNo || 1 }}</el-tag>
        <span :class="dirty ? 'dirty' : 'saved'">{{ saving ? '保存中…' : dirty ? '● 未保存' : '已保存' }}</span>
      </div>
      <div class="bar-right">
        <el-button text icon="Warning" @click="problemsOpen = !problemsOpen">问题 {{ problems.length }}</el-button>
        <el-button icon="VideoPlay" v-hasPermi="['vueStudio:component:preview']" @click="preview">预览</el-button>
        <el-button type="primary" icon="DocumentChecked" :loading="saving" :disabled="readOnly" v-hasPermi="['vueStudio:component:edit']" @click="save">保存</el-button>
        <el-popover placement="bottom-end" :width="320" trigger="click">
          <template #reference><el-button icon="MoreFilled" circle aria-label="更多设置" /></template>
          <el-form label-width="90px" size="small">
            <el-form-item label="主题"><el-select v-model="theme"><el-option label="深色" value="vs-dark" /><el-option label="浅色" value="vs" /><el-option label="高对比" value="hc-black" /></el-select></el-form-item>
            <el-form-item label="字号"><el-input-number v-model="fontSize" :min="11" :max="28" /></el-form-item>
            <el-form-item label="自动换行"><el-switch v-model="wordWrap" /></el-form-item>
            <el-form-item label="缩略图"><el-switch v-model="minimap" /></el-form-item>
            <el-form-item label="只读"><el-switch v-model="readOnly" /></el-form-item>
            <el-form-item label="全屏"><el-button @click="toggleFullscreen">{{ isFullscreen ? '退出全屏' : '进入全屏' }}</el-button></el-form-item>
          </el-form>
          <el-divider>快捷键</el-divider>
          <div class="shortcut">Shift+Alt+F 格式化文档（也可在编辑器右键菜单执行）<br>Ctrl/Cmd+S 保存 · F8/Shift+F8 问题导航<br>Ctrl/Cmd+F 查找 · Ctrl/Cmd+H 替换 · Alt+↑/↓ 移动行</div>
        </el-popover>
      </div>
    </header>

    <main class="editor-workspace" :class="{ 'with-problems': problemsOpen }">
      <MonacoSfcEditor v-if="loaded"
        ref="editorRef" v-model="source" :component-key="route.params.id" :theme="theme" :font-size="fontSize"
        :word-wrap="wordWrap" :minimap="minimap" :read-only="readOnly" @change="onChange" @diagnostics="onDiagnostics"
        @save="save" @cursor="cursor = $event"
      />
      <ProblemPanel v-if="problemsOpen" :problems="problems" @close="problemsOpen = false" @select="editorRef.goToProblem($event)" />
    </main>

    <footer class="status-bar">
      <span>Ln {{ cursor.lineNumber }}, Col {{ cursor.column }}</span><span>Spaces: 2</span><span>UTF-8</span><span>Vue SFC</span>
      <button type="button" @click="problemsOpen = !problemsOpen"><b class="error-dot">×</b> {{ errorCount }}　<b class="warning-dot">△</b> {{ warningCount }}</button>
    </footer>
    <component :is="PreviewDialog" v-if="PreviewDialog" ref="previewRef" />
  </div>
</template>

<script setup name="VueStudioEditor">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { getComponent, updateComponent } from '@/api/vueStudio/component'
import MonacoSfcEditor from '@/components/MonacoSfcEditor/index.vue'
import ProblemPanel from '@/components/MonacoSfcEditor/ProblemPanel.vue'
import useSettingsStore from '@/store/modules/settings'

const PreviewDialog = shallowRef()
const { proxy } = getCurrentInstance()
const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const layoutHeight = computed(() => 50 + (settings.tagsView ? 34 : 0) + (settings.footerVisible ? 36 : 0))
const pageRef = ref()
const editorRef = ref()
const previewRef = ref()
const loaded = ref(false)
let leaveConfirmation
let previewLoading = false
const source = ref('')
const savedSource = ref('')
const component = reactive({})
const problems = ref([])
const problemsOpen = ref(false)
const saving = ref(false)
const readOnly = ref(false)
const theme = ref('vs-dark')
const fontSize = ref(14)
const wordWrap = ref(false)
const minimap = ref(true)
const isFullscreen = ref(false)
const cursor = ref({ lineNumber: 1, column: 1 })
const dirty = computed(() => source.value !== savedSource.value)
const errorCount = computed(() => problems.value.filter(item => item.severity === 8).length)
const warningCount = computed(() => problems.value.filter(item => item.severity === 4).length)

async function load() {
  const response = await getComponent(route.params.id)
  Object.assign(component, response.data)
  source.value = (response.data.sourceCode || '').replace(/\r\n?/g, '\n')
  savedSource.value = source.value
  loaded.value = true
}

function onChange() { /* dirty 由当前源码和已保存快照计算，不触发预览。 */ }
function onDiagnostics(items) { problems.value = items }

async function save() {
  if (!loaded.value || readOnly.value || saving.value || !dirty.value) return
  saving.value = true
  try {
    const snapshot = source.value
    if (new TextEncoder().encode(snapshot).length > 1024 * 1024) {
      proxy.$modal.msgError('源码不能超过 1 MB')
      return
    }
    await editorRef.value.check()
    if (snapshot !== source.value) {
      proxy.$modal.msgWarning('检查期间代码已改变，请重新保存')
      return
    }
    const currentErrors = editorRef.value.getProblems().filter(item => item.severity === 8)
    if (currentErrors.length) {
      await exitFullscreen()
      try { await proxy.$modal.confirm(`当前仍有 ${currentErrors.length} 个错误。是否作为草稿继续保存？`) }
      catch (_error) { problemsOpen.value = true; return }
    }
    await updateComponent({
      id: component.id, componentName: component.componentName, componentKey: component.componentKey,
      description: component.description, status: component.status, sourceCode: snapshot,
      errorCount: currentErrors.length, warningCount: editorRef.value.getProblems().filter(item => item.severity === 4).length
    })
    savedSource.value = snapshot
    component.versionNo = (component.versionNo || 1) + 1
    proxy.$modal.msgSuccess('源码已保存')
  } finally { saving.value = false }
}

async function preview() {
  if (!loaded.value || previewLoading) return
  previewLoading = true
  try {
    await exitFullscreen()
    PreviewDialog.value = (await import('./PreviewDialog.vue')).default
    await nextTick()
    previewRef.value.open({ source: source.value, componentId: component.id, sourceKind: 'current' })
  } finally { previewLoading = false }
}

async function confirmLeave() {
  if (!dirty.value) return true
  await exitFullscreen()
  if (!leaveConfirmation) {
    leaveConfirmation = proxy.$modal.confirm('当前代码尚未保存，确定离开编辑页吗？')
      .then(() => true, () => false).finally(() => { leaveConfirmation = undefined })
  }
  return leaveConfirmation
}
function back() { router.push('/vue-studio/components') }
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
async function exitFullscreen() {
  if (document.fullscreenElement === pageRef.value) await document.exitFullscreen()
}
async function toggleFullscreen() {
  if (!document.fullscreenElement) await pageRef.value.requestFullscreen()
  else await document.exitFullscreen()
}
function fullscreenChange() { isFullscreen.value = Boolean(document.fullscreenElement) }

onBeforeRouteLeave(async (_to, _from, next) => next(await confirmLeave()))
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  document.addEventListener('fullscreenchange', fullscreenChange)
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  document.removeEventListener('fullscreenchange', fullscreenChange)
})
</script>

<style scoped>
.studio-editor { position: relative; width: 100%; min-width: 0; height: calc(100dvh - var(--layout-height, 84px)); min-height: 300px; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) 24px; background: #1e1e1e; color: #ddd; }
.studio-editor:fullscreen { height: 100vh; }
.editor-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-height: 50px; padding: 8px 10px; background: #181818; border-bottom: 1px solid #333; }
.bar-left, .bar-right { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.bar-left strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dirty { color: #e6a23c; } .saved { color: #67c23a; }
.editor-workspace { min-width: 0; min-height: 0; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
.editor-workspace.with-problems { grid-template-rows: minmax(0, 1fr) auto; }
.status-bar { display: flex; align-items: center; gap: 18px; padding: 0 10px; background: #007acc; color: white; font-size: 12px; }
.status-bar button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; }
.error-dot { color: #ffd6d6; } .warning-dot { color: #ffe89b; }
.shortcut { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.8; }
</style>
