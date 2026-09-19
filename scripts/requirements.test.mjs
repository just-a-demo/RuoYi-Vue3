import test from 'node:test'
import assert from 'node:assert/strict'
import { syncFields, listColumns } from '../src/views/business/formModel/fields.js'
import { previewQuery } from '../src/views/business/formModel/listConfig.js'
import { compilePreview, componentDependencies } from '../src/views/vueStudio/component/previewCompiler.js'

test('nested and conditional fields synchronize without retaining deleted fields', () => {
  const fields = syncFields([{ type: 'input', field: 'title', title: '名称' }, { children: [{ field: 'count', type: 'number' }], control: [{ rule: [{ field: 'extra' }] }] }], [{ field: 'title', approvalMap: 'widget1', visible: false }, { field: 'deleted' }])
  assert.deepEqual(fields.map(field => field.field), ['title', 'count', 'extra'])
  assert.equal(fields[0].approvalMap, 'widget1'); assert.equal(fields[0].visible, false)
  assert.throws(() => syncFields([{ field: 'duplicate' }, { children: [{ field: 'duplicate' }] }]), /重复/)
})
test('list visibility, order, sorting and filters use model fields', () => {
  const fields = [{ field: 'a', valueType: 'text', title: 'A', order: 2, visible: true, sortable: true, filter: true }, { field: 'b', title: 'B', order: 1, visible: true }, { field: 'c', visible: false }]
  assert.deepEqual(listColumns(fields).map(c => c.field), ['b', 'a'])
  assert.equal(listColumns(fields)[1].sort, false) // Server owns sorting; VTable shows only the control.
  assert.equal(listColumns(fields)[1].showSort, true)
  assert.deepEqual(previewQuery([{ id: 1, values: { a: 'one' } }, { id: 2, values: { a: 'two' } }], fields, { conditions: [{ field: 'a', operator: 'contains', value: 'ONE' }], relation: 'and', pageNum: 1, pageSize: 20, sort: null }).rows.map(r => r.id), [1])
})
test('compiler permits published component imports and rejects invalid or external code', async () => {
  const source = '<template><Child /></template><script setup>import Child from "@lc/child"</script>'
  assert.deepEqual(componentDependencies(source), ['child'])
  const compiled = await compilePreview(source, 'test')
  const child = { name: 'Child' }
  const component = new Function('Vue', 'Modules', compiled.componentFactory)({}, { child })
  assert.ok(component)
  await assert.rejects(() => compilePreview('<template><div></template>', 'test'))
  await assert.rejects(() => compilePreview('<template><div/></template><script setup>import x from "https://example.com/x.js"</script>', 'test'), /只允许/)
  await assert.rejects(() => compilePreview('<template><div/></template><script setup>import("other")</script>', 'test'), /动态/)
})
