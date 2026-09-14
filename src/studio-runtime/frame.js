import * as Vue from 'vue'
import * as VueRouter from 'vue-router'
import * as Pinia from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementExports from 'element-plus'
import locale from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import FcDesigner from '@form-create/designer'

const formCreate = FcDesigner.formCreate
const { h, ref, reactive, provide, watch, nextTick } = Vue
const config = window.__STUDIO_FRAME__
// Opaque frames cannot access browser storage. Keep designer history local to this frame.
for (const name of ['localStorage', 'sessionStorage']) {
  try { window[name].getItem('studio') } catch {
    const entries = new Map()
    Object.defineProperty(window, name, { configurable: true, value: {
      get length() { return entries.size },
      key: index => [...entries.keys()][index] ?? null,
      getItem: key => entries.get(String(key)) ?? null,
      setItem: (key, value) => { entries.set(String(key), String(value)) },
      removeItem: key => { entries.delete(String(key)) },
      clear: () => { entries.clear() }
    } })
  }
}
const RuntimeModules = { 'vue-router': VueRouter, pinia: Pinia, 'element-plus': ElementExports, '@form-create/element-ui': formCreate }
let app, router, context, designer, componentProps, currentMode, poll, lastDesign, customField
const send = (type, values = {}) => parent.postMessage({ ...values, type, sessionId: config.sessionId, componentId: config.componentId }, config.parentOrigin)
const plain = value => JSON.parse(JSON.stringify(value))
const stringify = value => { try { return typeof value === 'string' ? value : JSON.stringify(value) } catch { return String(value) } }
for (const level of ['log', 'info', 'warn', 'error']) {
  const original = console[level]
  console[level] = (...args) => { original(...args); send('studio:console', { level, args: args.map(stringify) }) }
}
addEventListener('error', event => send('studio:error', { message: event.message }))
addEventListener('unhandledrejection', event => send('studio:error', { message: event.reason?.message || String(event.reason) }))

function createForm(config = {}, values = {}) {
  return {
    rules: ref(formCreate.parseJson(config.formRules || '[]')),
    options: ref(formCreate.parseJson(config.formOptions || '{}')),
    formData: ref(plain(values || {})), formApi: ref()
  }
}
function renderForm(form) {
  return h(formCreate, {
    rule: form.rules.value, option: form.options.value,
    modelValue: form.formData.value, 'onUpdate:modelValue': value => { form.formData.value = value },
    api: form.formApi.value, 'onUpdate:api': value => { form.formApi.value = value }
  })
}
function renderContent(component, values, slots, item, form) {
  const content = h(component, values, slots)
  const showDesign = !item.hasFormOutlet && item.codeMode === 'legacy'
  return showDesign ? h('div', [content, renderForm(form)]) : content
}
function evaluate(item, modules, ownForm = true) {
  const imports = item.moduleBundle ? new Function('__studioVue', '__studioRouter', '__studioElement', '__studioFormCreate', '__studioPinia', item.moduleBundle.code + '\nreturn StudioImports.default || StudioImports;')(Vue, VueRouter, ElementExports, formCreate, Pinia) : {}
  const runtimeModules = { ...RuntimeModules, ...imports }
  const component = new Function('Vue', 'Modules', 'RuntimeModules', item.componentFactory)(Vue, modules, runtimeModules)
  if (item.renderFactory) component.render = new Function('Vue', 'Modules', 'RuntimeModules', item.renderFactory)(Vue, modules, runtimeModules)
  if (item.scopeId) component.__scopeId = item.scopeId
  // Composite components own their designed form; ordinary custom fields inherit the enclosing form.
  if (!ownForm || !item.formRules || item.formRules === '[]') return component
  return {
    props: component.props, inheritAttrs: false,
    setup(props, { attrs, slots }) {
      const form = createForm(item, props.modelValue && typeof props.modelValue === 'object' ? props.modelValue : {})
      provide('studioForm', form)
      return () => renderContent(component, { ...attrs, ...props }, slots, item, form)
    }
  }
}

async function applyRoute(value = {}) {
  const params = value.params || {}, query = value.query || {}
  const keys = Object.keys(params)
  if (keys.some(key => !/^[A-Za-z_]\w*$/.test(key))) throw new Error('路由参数名称必须是字母、数字或下划线')
  const path = '/preview' + keys.map(key => '/:' + key + (Array.isArray(params[key]) ? '*' : '?')).join('')
  if (router.hasRoute('studio-preview')) router.removeRoute('studio-preview')
  router.addRoute({ name: 'studio-preview', path, component: { render: () => null } })
  await router.replace({ name: 'studio-preview', params, query })
}
function setProps(values) {
  for (const key of Object.keys(componentProps)) if (!(key in values)) delete componentProps[key]
  Object.assign(componentProps, values)
  if (values.formData && typeof values.formData === 'object' && !Array.isArray(values.formData)) {
    context.formData.value = plain(values.formData)
  }
  if (customField && context.formApi.value) {
    const rule = context.formApi.value.getRule('previewValue')
    rule.props = { ...values }
    delete rule.props.modelValue; delete rule.props.formCreateInject
    context.formApi.value.setValue('previewValue', 'modelValue' in values ? values.modelValue : undefined)
  }
}
const JsonProperty = {
  props: ['modelValue'], emits: ['update:modelValue'],
  setup(props, { emit }) {
    const text = ref(JSON.stringify(props.modelValue ?? null, null, 2)), error = ref('')
    watch(() => props.modelValue, value => { text.value = JSON.stringify(value ?? null, null, 2) }, { deep: true })
    return () => h('div', [h(ElementExports.ElInput, {
      modelValue: text.value, type: 'textarea', autosize: { minRows: 2, maxRows: 8 },
      'onUpdate:modelValue': value => { text.value = value },
      onChange: value => { try { emit('update:modelValue', JSON.parse(value)); error.value = '' } catch { error.value = '请输入有效 JSON' } }
    }), error.value ? h('small', { style: 'color:#f56c6c' }, error.value) : null])
  }
}
function propertyRules(schema) {
  return (schema || []).filter(item => !['modelValue', 'formCreateInject'].includes(item.key)).map(item => ({
    type: ({ string: 'input', number: 'inputNumber', boolean: 'switch' })[item.type] || 'studio-json-property',
    field: item.key, title: item.key
  }))
}
function captureDesign() {
  if (!designer.value) throw new Error('设计器尚未准备完成')
  return { formRules: designer.value.getJson(), formOptions: designer.value.getOptionsJson() }
}
async function setDesign(value) {
  designer.value.setRule(formCreate.parseJson(value.formRules || '[]'))
  designer.value.setOption(formCreate.parseJson(value.formOptions || '{}'))
  await nextTick()
  lastDesign = JSON.stringify(captureDesign())
}

async function boot(payload) {
  currentMode = payload.mode || 'preview'
  customField = Boolean(payload.customField)
  router = VueRouter.createRouter({ history: VueRouter.createMemoryHistory(), routes: [] })
  await applyRoute(payload.route)
  const modules = Object.create(null)
  for (const item of payload.modules || []) modules[item.key] = evaluate(item, modules)
  context = createForm(payload, payload.formData || payload.props?.formData || {})
  componentProps = reactive({ ...(payload.props || {}) })
  document.getElementById('component-style').textContent = payload.css || ''
  formCreate.component('studio-json-property', JsonProperty)
  for (const item of payload.modules || []) {
    if (item.publishTargets?.includes('formCreate')) formCreate.component('lc-' + item.key, modules[item.key])
  }
  designer = ref()
  const component = currentMode === 'designer' ? null : evaluate(payload, modules, customField)
  if (customField) {
    formCreate.component('lc-preview-current', component)
    const props = { ...componentProps }; delete props.modelValue; delete props.formCreateInject
    context.rules.value = [{ type: 'lc-preview-current', field: 'previewValue', title: '组件值', props }]
    context.formData.value = { previewValue: componentProps.modelValue }
  }
  const Root = {
    setup() {
      provide('studioForm', context)
      return () => {
        if (currentMode === 'designer') return h(FcDesigner, { ref: designer, height: payload.height || '650px', config: { showSaveBtn: false } })
        if (customField) return renderForm(context)
        const values = { ...componentProps }
        if (payload.codeMode) values.formData = context.formData.value
        return renderContent(component, values, undefined, payload, context)
      }
    }
  }
  app = Vue.createApp(Root)
  app.use(router); app.use(Pinia.createPinia()); app.use(ElementPlus, { locale }); app.use(FcDesigner); app.use(formCreate)
  for (const item of payload.modules || []) app.component('lc-' + item.key, modules[item.key])
  let mountError
  app.config.errorHandler = error => { mountError = error; send('studio:error', { message: error.message || String(error) }) }
  app.mount('#app')
  await nextTick()
  if (mountError) throw mountError
  if (currentMode === 'designer') {
    designer.value.addMenu({ name: 'studio-custom', title: '自定义组件' })
    for (const item of payload.modules || []) {
      if (!item.publishTargets?.includes('formCreate')) continue
      designer.value.addComponent({
        name: 'lc-' + item.key, label: item.name || item.key, menu: 'studio-custom', icon: 'icon-input', input: true,
        rule: () => ({ type: 'lc-' + item.key, field: 'field_' + Math.random().toString(36).slice(2), title: item.name || item.key, props: {} }),
        props: () => propertyRules(item.propsSchema)
      })
    }
    await setDesign(payload)
    poll = setInterval(() => {
      const value = captureDesign(), next = JSON.stringify(value)
      if (next !== lastDesign) { lastDesign = next; send('studio:design-change', { value }) }
    }, 300)
  }
  watch(context.formData, value => send('studio:form-change', { value: plain(value) }), { deep: true })
  if (payload.background === 'dark') { document.body.style.background = '#1e1e1e'; document.body.style.color = '#eee' }
  send('studio:ready')
}
let initialized = false
addEventListener('message', async event => {
  const message = event.data || {}
  if (event.source !== parent || event.origin !== config.parentOrigin || message.sessionId !== config.sessionId || message.componentId !== config.componentId) return
  try {
    if (message.type === 'studio:run') {
      if (initialized) return
      initialized = true
      await boot(message)
      return
    }
    if (!app || message.type !== 'studio:request') return
    let result
    if (message.action === 'apply') {
      await applyRoute(message.value.route)
      setProps(message.value.props || {})
      await nextTick()
    } else if (message.action === 'capture') result = captureDesign()
    else if (message.action === 'setDesign') await setDesign(message.value)
    else if (message.action === 'validate') {
      if (!context.formApi.value) throw new Error('组件尚未挂载 FormCreate 表单')
      try { await context.formApi.value.validate() } catch { throw new Error('请检查表单必填项和校验提示') }
      result = plain(context.formApi.value.formData())
    } else throw new Error('未知运行容器操作')
    send('studio:reply', { requestId: message.requestId, value: result })
  } catch (error) {
    if (message.requestId) send('studio:reply', { requestId: message.requestId, error: error.message || String(error) })
    else send('studio:error', { message: error.message || String(error) })
  }
})
addEventListener('beforeunload', () => { clearInterval(poll); app?.unmount() })
send('studio:boot')
