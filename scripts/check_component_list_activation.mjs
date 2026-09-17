import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

const filename = 'src/views/vueStudio/component/index.vue'
const source = fs.readFileSync(filename, 'utf8')
const { descriptor, errors } = parse(source)
assert.equal(errors.length, 0)
compileScript(descriptor, { id: 'list-activation-check' })
const setupSource = descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
let requests = 0
let serverRows = [{ id: 37, componentKey: 'bb' }]
const params = []
const proxy = { useDict: () => ({}), addDateRange: (query, range) => ({ ...query, dateRange: [...range] }) }
const context = vm.createContext({ ...Vue,
  getCurrentInstance: () => ({ proxy }), useRouter: () => ({}), useRoute: () => ({ query: {}, params: {} }),
  listComponents: async query => { requests++; params.push(JSON.parse(JSON.stringify(query))); return { rows: [...serverRows], total: serverRows.length } },
  ReleaseHistory: {}, createComponentSource: () => '', normalizePublishTargets: value => value,
})
const makeSetup = vm.runInContext('(function(){' + setupSource + ';return { rows, total, queryParams, dateRange };})', context)
const renderer = Vue.createRenderer({
  createElement: type => ({ type, children: [], parent: null }),
  createText: text => ({ text, parent: null }), createComment: text => ({ text, parent: null }),
  setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.text = text },
  parentNode: node => node.parent, nextSibling: () => null, patchProp: () => {},
  insert(node, parent) { if (node.parent) { const i = node.parent.children.indexOf(node); if (i >= 0) node.parent.children.splice(i, 1) } node.parent = parent; parent.children.push(node) },
  remove(node) { if (node.parent) { const i = node.parent.children.indexOf(node); if (i >= 0) node.parent.children.splice(i, 1) } node.parent = null },
})
let state
const List = Vue.defineComponent({ name: 'ListCheck', setup() { state = makeSetup(); return () => Vue.h('div') } })
const Other = Vue.defineComponent({ setup: () => () => Vue.h('span') })
const visible = Vue.ref(true)
const app = renderer.createApp({ setup: () => () => Vue.h(Vue.KeepAlive, null, { default: () => Vue.h(visible.value ? List : Other) }) })
app.mount({ children: [] })
const settle = async () => { await Vue.nextTick(); await Promise.resolve(); await Vue.nextTick() }
await settle()
assert.equal(requests, 1, 'Initial mount must not duplicate requests')
state.queryParams.value.pageNum = 2
state.queryParams.value.componentName = 'A'
state.dateRange.value = ['2026-09-01', '2026-09-17']
visible.value = false
await settle()
serverRows.push({ id: 41, componentKey: 'AA' })
assert.equal(requests, 1, 'Inactive list must not query')
visible.value = true
await settle()
assert.equal(requests, 2)
assert.equal(state.rows.value.length, 2)
assert.equal(state.rows.value[1].componentKey, 'AA')
assert.equal(params[1].pageNum, 2)
assert.equal(params[1].componentName, 'A')
assert.deepEqual(params[1].dateRange, ['2026-09-01', '2026-09-17'])
visible.value = false; await settle(); visible.value = true; await settle()
assert.equal(requests, 3, 'Every return must refresh')
app.unmount()
const nonCached = renderer.createApp(List)
nonCached.mount({ children: [] }); await settle()
assert.equal(requests, 4, 'Uncached mount must still load')
nonCached.unmount()
console.log('PASS: SFC compile; initial single request; no inactive query; refreshed AA on reactivation; filters/page/date preserved; repeated return; uncached mount.')
