import assert from 'node:assert/strict'
import { createRenderer, defineComponent, h, nextTick, ref } from 'vue'
import { createRouter, createMemoryHistory, RouterView, useRoute } from 'vue-router'
import RouteCache from '../src/layout/components/RouteCache.js'
import { tabCacheKey } from '../src/utils/tabCache.js'

const node = type => ({ type, children: [], style: {}, parent: null })
let moves = 0
const renderer = createRenderer({
  createElement: node, createText: node, createComment: node,
  setText() {}, setElementText() {}, patchProp() {},
  parentNode: n => n.parent,
  nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1],
  insert(n, parent, anchor) {
    if (n.parent) { moves++; n.parent.children.splice(n.parent.children.indexOf(n), 1) }
    const i = parent.children.indexOf(anchor)
    parent.children.splice(i < 0 ? parent.children.length : i, 0, n); n.parent = parent
  },
  remove(n) { n.parent?.children.splice(n.parent.children.indexOf(n), 1); n.parent = null }
})
const instances = []
const Page = defineComponent({ name: 'DifferentFromRouteName', setup() {
  const route = useRoute(), value = ref('')
  instances.push({ route, value })
  return () => h('iframe', value.value)
}})
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/page/:id', name: 'Page', component: Page },
  { path: '/editor/:id', name: 'Editor', component: Page, meta: { keepMounted: true } },
  { path: '/fresh', component: Page, meta: { noCache: true } },
] })
const include = ref([])
const app = renderer.createApp({ setup: () => () => h(RouterView, null, {
  default: ({ Component, route }) => h(RouteCache, { view: Component, route, include: include.value })
}) })
app.use(router)
await router.push('/page/1'); await router.isReady()
include.value = [tabCacheKey({ path: '/page/1' })]
app.mount(node('root')); await nextTick()
async function visit(path) {
  if (path !== '/fresh') include.value = [...new Set([...include.value, tabCacheKey({ path })])]
  await router.push(path); await nextTick()
}
instances[0].value.value = 'unsaved'
await visit('/page/2')
assert.equal(instances[0].route.params.id, '1', 'inactive route stays isolated')
await visit('/page/1')
assert.equal(instances.length, 2, 'route/component name mismatch still caches')
assert.equal(instances[0].value.value, 'unsaved')
await visit('/editor/1')
const before = moves
await visit('/editor/2'); await visit('/editor/1')
assert.equal(moves, before, 'persistent iframe never moves on switching')
const count = instances.length
include.value = include.value.filter(k => k !== tabCacheKey({ path: '/editor/2' }))
await nextTick(); await visit('/editor/2')
assert.equal(instances.length, count + 1, 'closed page is recreated')
const refreshed = instances.length
include.value = include.value.filter(k => k !== tabCacheKey({ path: '/editor/2' }))
await nextTick()
await visit('/fresh'); await visit('/editor/2')
assert.equal(instances.length, refreshed + 2, 'refresh discards the active persistent page')
await visit('/fresh'); const fresh = instances.length
await visit('/page/1'); await visit('/fresh')
assert.equal(instances.length, fresh + 1, 'noCache is respected')
include.value = include.value.filter(k => k !== tabCacheKey({ path: '/page/1' }))
await nextTick(); const closed = instances.length
await visit('/page/1')
assert.equal(instances.length, closed + 1)
app.unmount()
console.log('PASS: tab state, route isolation, iframe attachment, close and noCache')
