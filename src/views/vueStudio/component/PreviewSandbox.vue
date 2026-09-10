<template>
  <div class="sandbox-wrap" :class="background" :style="canvasStyle">
    <div v-if="status === 'idle'" class="placeholder">尚未运行</div>
    <div v-else-if="status === 'building'" class="placeholder"><el-icon class="is-loading"><Loading /></el-icon> 正在创建隔离沙箱…</div>
    <iframe v-if="frameUrl" ref="frameRef" :src="frameUrl" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Vue 组件隔离预览" />
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="error" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import vueRuntime from 'vue/dist/vue.global.prod.js?raw'
import { compilePreview } from './previewCompiler'

const props = defineProps({
  source: { type: String, default: '' }, componentId: { type: [String, Number], required: true },
  width: { type: Number, default: 1280 }, height: { type: Number, default: 720 },
  background: { type: String, default: 'light' }, timeout: { type: Number, default: 5000 },
  showConsole: { type: Boolean, default: false }
})
const emit = defineEmits(['console', 'status'])
const frameRef = ref()
const frameUrl = ref('')
const status = ref('idle')
const error = ref('')
const canvasStyle = computed(() => ({ '--canvas-width': `${props.width}px`, '--canvas-height': `${props.height}px` }))
let objectUrl
let sessionId
let timeoutId
let pendingPayload
let generation = 0
let booted = false

function createSessionId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
}

function sandboxDocument() {
  const runtime = vueRuntime.replace(/<\/script/gi, '<\\/script')
  const parentOrigin = JSON.stringify(window.location.origin)
  const expectedSession = JSON.stringify(sessionId)
  const expectedComponent = JSON.stringify(String(props.componentId))
  const colors = props.background === 'dark' ? 'background:#1e1e1e;color:#eee' : 'background:#fff;color:#303133'
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body,#app{margin:0;min-height:100%;font-family:Arial,sans-serif}body{${colors}}*{box-sizing:border-box}</style><style id="component-style"></style></head><body><div id="app"></div><script>${runtime}<\/script><script>
  'use strict';
  const EXPECTED_ORIGIN=${parentOrigin};
  const SESSION=${expectedSession},COMPONENT=${expectedComponent};let hasRun=false,failed=false;
  const send=(type,payload={})=>parent.postMessage({...payload,type,sessionId:SESSION,componentId:COMPONENT},EXPECTED_ORIGIN);
  const originalConsole={};['log','info','warn','error'].forEach(level=>{originalConsole[level]=console[level];console[level]=(...args)=>{originalConsole[level](...args);send('vs:console',{level,args:args.map(value=>{try{return typeof value==='string'?value:JSON.stringify(value)}catch(_error){return String(value)}})})}});
  addEventListener('error',event=>send('vs:error',{message:event.message||'运行错误'}));
  addEventListener('unhandledrejection',event=>send('vs:error',{message:String(event.reason?.message||event.reason||'Promise rejection')}));
  addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==EXPECTED_ORIGIN)return;
    const msg=event.data||{};
    if(hasRun||msg.type!=='vs:run'||msg.sessionId!==SESSION||msg.componentId!==COMPONENT)return;
    hasRun=true;
    try{
      document.getElementById('component-style').textContent=msg.css||'';
      const component=(new Function('Vue',msg.componentFactory))(Vue);
      if(msg.renderFactory)component.render=(new Function('Vue',msg.renderFactory))(Vue);
      if(msg.scopeId)component.__scopeId=msg.scopeId;
      const app=Vue.createApp(component,msg.props||{});
      app.config.errorHandler=error=>{failed=true;send('vs:error',{message:error?.message||String(error)})};
      app.config.warnHandler=message=>send('vs:console',{level:'warn',args:[String(message)]});
      app.mount('#app');
      if(!failed)send('vs:ready');
    }catch(runError){send('vs:error',{message:runError?.message||String(runError)})}
  });
  send('vs:boot');
  <\/script></body></html>`
}

function onMessage(event) {
  if (event.source !== frameRef.value?.contentWindow || event.origin !== 'null') return
  const message = event.data || {}
  if (message.sessionId !== sessionId || message.componentId !== String(props.componentId)) return
  if (message.type === 'vs:boot') {
    if (booted) return
    booted = true
    // Sandboxed documents without allow-same-origin have an opaque origin, so targetOrigin must be '*'.
    // Security is bound by the exact contentWindow plus the per-run session/component identifiers.
    frameRef.value.contentWindow.postMessage({ type: 'vs:run', sessionId, componentId: String(props.componentId), ...pendingPayload }, '*')
    return
  }
  if (message.type === 'vs:ready') {
    clearTimeout(timeoutId); status.value = 'ready'; emit('status', 'ready')
  } else if (message.type === 'vs:error') {
    clearTimeout(timeoutId); error.value = message.message; status.value = 'error'; emit('status', 'error')
  } else if (message.type === 'vs:console' && props.showConsole && ['log', 'info', 'warn', 'error'].includes(message.level) && Array.isArray(message.args)) {
    emit('console', { level: message.level, args: message.args.slice(0, 20).map(item => String(item).slice(0, 4000)) })
  }
}

async function run(values) {
  disposeFrame()
  const current = generation
  await nextTick()
  if (current !== generation) return
  error.value = ''
  status.value = 'building'
  emit('status', 'building')
  sessionId = createSessionId()
  try {
    const compiled = compilePreview(props.source, sessionId)
    pendingPayload = { ...compiled, props: values }
    const blob = new Blob([sandboxDocument()], { type: 'text/html' })
    objectUrl = URL.createObjectURL(blob)
    frameUrl.value = objectUrl
    window.addEventListener('message', onMessage)
    await nextTick()
    if (current !== generation) return
    timeoutId = window.setTimeout(() => {
      error.value = `预览运行超过 ${props.timeout} ms，已销毁沙箱`
      status.value = 'error'
      emit('status', 'error')
      disposeFrame(false)
    }, props.timeout)
  } catch (compileError) {
    error.value = compileError.message || String(compileError)
    status.value = 'error'
    emit('status', 'error')
  }
}

function disposeFrame(resetStatus = true) {
  generation += 1
  booted = false
  clearTimeout(timeoutId)
  window.removeEventListener('message', onMessage)
  frameUrl.value = ''
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = undefined
  sessionId = undefined
  pendingPayload = undefined
  if (resetStatus) status.value = 'idle'
}

defineExpose({ run, dispose: disposeFrame })
onBeforeUnmount(() => disposeFrame())
</script>

<style scoped>
.sandbox-wrap { position: relative; width: 100%; min-height: 360px; overflow: auto; border: 1px solid var(--el-border-color); background: #f4f6f8; }
.sandbox-wrap.dark { background: #1e1e1e; }
iframe { display: block; width: min(100%, var(--canvas-width)); height: min(65vh, var(--canvas-height)); min-height: 360px; margin: auto; border: 0; background: white; }
.placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: var(--el-text-color-secondary); }
.error { position: absolute; left: 16px; right: 16px; bottom: 16px; z-index: 2; }
</style>
