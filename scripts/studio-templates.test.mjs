import test from 'node:test'
import assert from 'node:assert/strict'
import * as Vue from 'vue'
import { compilePreview } from '../src/views/vueStudio/component/previewCompiler.js'
import { createComponentSource } from '../src/views/vueStudio/component/templates.js'

const renderer = Vue.createRenderer({
  createElement: tag => ({ tag, children: [] }), createText: text => ({ text }), createComment: text => ({ text: '' }),
  setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.text = text; node.children = [] },
  insert(node, parent, anchor) { node.parent = parent; const index = parent.children.indexOf(anchor); index < 0 ? parent.children.push(node) : parent.children.splice(index, 0, node) },
  remove(node) { const siblings = node.parent?.children || []; const index = siblings.indexOf(node); if (index >= 0) siblings.splice(index, 1) },
  patchProp(node, key, _old, value) { node[key] = value }, parentNode: node => node.parent,
  nextSibling(node) { return node.parent?.children[node.parent.children.indexOf(node) + 1] }, setScopeId() {}
})
const textContent = node => (node.text || '') + (node.children || []).map(textContent).join('')

async function template(kind, model = false) {
  const compiled = await compilePreview(createComponentSource(kind, model), 'template-' + kind)
  return new Function('Vue', 'Modules', 'RuntimeModules', compiled.componentFactory)(Vue, {}, {})
}

test('default JavaScript component renders its default and explicit prop', async () => {
  const component = await template('vue')
  for (const [props, expected] of [[{}, 'Vue 组件'], [{ title: 'updated' }, 'updated']]) {
    const root = { children: [] }, app = renderer.createApp(component, props)
    app.mount(root)
    assert.match(textContent(root), new RegExp(expected))
    app.unmount()
  }
})

test('combined model template shares designer rules and writable FormCreate refs', async () => {
  const component = await template('form', true)
  const studioForm = { rules: Vue.ref([{ type: 'input', field: 'subject' }]), options: Vue.ref({ submitBtn: false }), formData: Vue.ref({ subject: 'initial' }), formApi: Vue.ref() }
  const api = { setValue() {}, validate() {} }
  const app = renderer.createApp(component, { model: { pageTitle: 'Sample form' } })
  app.provide('studioForm', studioForm)
  app.component('form-create', {
    props: ['rule', 'option', 'modelValue'],
    emits: ['update:modelValue', 'update:api'],
    setup(props, { emit }) {
      assert.equal(props.rule, studioForm.rules.value)
      assert.equal(props.option, studioForm.options.value)
      emit('update:api', api)
      emit('update:modelValue', { subject: 'edited' })
      return () => Vue.h('span', props.modelValue.subject)
    }
  })
  const root = { children: [] }
  app.mount(root)
  await Vue.nextTick()
  assert.match(textContent(root), /Sample form/)
  assert.deepEqual(studioForm.formData.value, { subject: 'edited' })
  assert.equal(Vue.toRaw(studioForm.formApi.value), api)
  app.unmount()
})

test('custom field forwards modelValue updates and preserves FormCreate injection', async () => {
  const component = await template('field')
  const injected = { field: 'subject', api: {} }
  let updated
  const app = renderer.createApp(component, { modelValue: 'initial', formCreateInject: injected, 'onUpdate:modelValue': value => { updated = value } })
  app.component('el-input', {
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      assert.equal(props.modelValue, 'initial')
      assert.equal(props.placeholder, '请输入')
      emit('update:modelValue', 'edited')
      return () => Vue.h('input', { value: props.modelValue })
    }
  })
  app.mount({ children: [] })
  assert.equal(updated, 'edited')
  assert.equal(component.props.formCreateInject.type, Object)
  app.unmount()
})
