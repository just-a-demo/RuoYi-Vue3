<template>
  <div class="studio-frame" :style="{ height }">
    <div v-if="status === 'building'" class="loading">正在准备运行环境…</div>
    <iframe v-if="url" ref="frame" :src="url" sandbox="allow-scripts" referrerpolicy="no-referrer" :title="title" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
  </div>
</template>
<script setup>
import { ref, nextTick, onBeforeUnmount } from 'vue'
import runtime from 'virtual:studio-runtime'
const props = defineProps({ componentId: { type: [String, Number], required: true }, height: { type: String, default: '650px' }, title: { type: String, default: '组件运行容器' }, timeout: { type: Number, default: 15000 }, submitHandler: Function })
const emit = defineEmits(['status', 'console', 'design-change', 'form-change'])
const frame = ref(), url = ref(''), error = ref(''), status = ref('idle')
let session, payload, ready, resolveReady, rejectReady, timer, booted, counter = 0
const pending = new Map()
const setStatus = value => { status.value = value; emit('status', value) }
function post(message) { frame.value?.contentWindow.postMessage({ ...message, sessionId: session, componentId: String(props.componentId) }, '*') }
function onMessage(event) {
  if (event.source !== frame.value?.contentWindow || event.origin !== 'null') return
  const value = event.data || {}
  if (value.sessionId !== session || value.componentId !== String(props.componentId)) return
  if (value.type === 'studio:boot' && !booted) { booted = true; post({ ...payload, type: 'studio:run' }) }
  else if (value.type === 'studio:ready') { clearTimeout(timer); setStatus('ready'); resolveReady?.(); rejectReady = null }
  else if (value.type === 'studio:error') { clearTimeout(timer); error.value = value.message; setStatus('error'); rejectReady?.(new Error(value.message)) }
  else if (value.type === 'studio:reply') {
    const request = pending.get(value.requestId)
    if (request) { clearTimeout(request.timer); pending.delete(value.requestId); value.error ? request.reject(new Error(value.error)) : request.resolve(value.value) }
  } else if (value.type === 'studio:console') emit('console', { level: value.level, args: (value.args || []).slice(0, 20) })
  else if (value.type === 'studio:design-change') emit('design-change', value.value)
  else if (value.type === 'studio:form-change') emit('form-change', value.value)
  else if (value.type === 'studio:submit') handleSubmit(value)
}
let submission
async function handleSubmit(message) {
  const activeSession = session
  try {
    if (!submission) {
      submission = Promise.resolve().then(() => props.submitHandler ? props.submitHandler() : { success: true, preview: true })
      const active = submission
      active.finally(() => { if (submission === active) submission = null }).catch(() => {})
    }
    const result = await submission
    if (!result?.success) throw new Error(result?.message || '表单未能提交，请稍后重试')
    if (session === activeSession) post({ type: 'studio:submit-result', requestId: message.requestId, value: { preview: Boolean(result.preview) } })
  } catch (failure) {
    if (session === activeSession) post({ type: 'studio:submit-result', requestId: message.requestId, error: failure.message || '提交失败' })
  }
}
async function start(value) {
  dispose()
  session = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)
  payload = value; booted = false; error.value = ''; setStatus('building')
  const config = JSON.stringify({ sessionId: session, componentId: String(props.componentId), parentOrigin: location.origin }).replace(/</g, '\\u003c')
  const script = runtime.script.replace(/<\/script/gi, '<\\/script')
  const css = runtime.css.replace(/<\/style/gi, '<\\/style')
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>${css}</style><style>html,body,#app{margin:0;min-height:100%;font-family:Arial,sans-serif}*{box-sizing:border-box}</style><style id="component-style"></style></head><body><div id="app"></div><script>window.__STUDIO_FRAME__=${config};${script}<\/script></body></html>`
  ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  // Attach the listener before creating the frame; a cached runtime may boot immediately.
  window.addEventListener('message', onMessage)
  url.value = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  timer = setTimeout(() => {
    error.value = '运行环境初始化超时，请重试'; setStatus('error'); rejectReady?.(new Error(error.value))
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = ''
  }, props.timeout)
  await nextTick()
  return ready
}
async function request(action, value) {
  if (!ready) throw new Error('请先运行组件')
  await ready
  const requestId = ++counter
  return new Promise((resolve, reject) => {
    const requestTimer = setTimeout(() => { pending.delete(requestId); reject(new Error('运行容器响应超时')) }, props.timeout)
    pending.set(requestId, { resolve, reject, timer: requestTimer })
    post({ type: 'studio:request', action, value, requestId })
  })
}
function dispose() {
  clearTimeout(timer); window.removeEventListener('message', onMessage)
  if (status.value === 'building') rejectReady?.(new Error('运行容器已关闭'))
  resolveReady = null; rejectReady = null
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('运行容器已关闭')) }
  pending.clear(); submission = null
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''; payload = null; session = null; ready = null; setStatus('idle')
}
onBeforeUnmount(dispose)
defineExpose({ start, request, dispose })
</script>
<style scoped>
.studio-frame{position:relative;width:100%;min-height:300px}.studio-frame iframe{display:block;width:100%;height:100%;min-height:300px;border:0;background:white}.loading{position:absolute;inset:0;display:grid;place-items:center}.el-alert{position:absolute;bottom:8px;left:8px;width:calc(100% - 16px)}
</style>
