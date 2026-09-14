import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveMenuPath } from '../src/utils/menuPath.js'
import { createRouter, createMemoryHistory } from 'vue-router'

test('grouped model menu points to the registered absolute child route', () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/model-apps', children: [{ path: '/business/check', name: 'Check', component: {} }] }] })
  const childBase = resolveMenuPath('/model-apps', '/business/check')
  const link = { path: resolveMenuPath(childBase, ''), query: { modelId: 1 } }
  assert.equal(router.resolve(link).name, 'Check')
  assert.equal(router.resolve(link).fullPath, '/business/check?modelId=1')
})

test('existing relative menu paths and empty leaf paths retain their URLs', () => {
  assert.equal(resolveMenuPath('/dev', 'edit'), '/dev/edit')
  assert.equal(resolveMenuPath('/dev/edit', ''), '/dev/edit')
  assert.equal(resolveMenuPath('/system/', 'user'), '/system/user')
  assert.equal(resolveMenuPath('', '/index'), '/index')
})
