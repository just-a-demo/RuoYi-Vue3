import test from 'node:test'
import assert from 'node:assert/strict'
import { parseParameterRows, parameterRows, parseRouteRows } from '../src/views/vueStudio/component/previewParameters.js'

test('explicit false, zero, empty strings and structured props survive parameter editing', () => {
  const values = { title: '', count: 0, active: false, object: { label: 'value' }, items: [1, 2], nullable: null }
  assert.deepEqual({ ...parseParameterRows(parameterRows(values)) }, values)
  const rows = parameterRows(values)
  rows[0].value = 'edited'
  assert.equal(parseParameterRows(rows).title, 'edited')
  rows[0].value = 'again'
  assert.equal(parseParameterRows(rows).title, 'again')
  rows[0].enabled = false
  assert.equal(Object.hasOwn(parseParameterRows(rows), 'title'), false)
})
test('invalid input is rejected before updating the preview', () => {
  assert.throws(() => parseParameterRows([{ key: 'count', type: 'number', value: '' }]), /count/)
  assert.throws(() => parseParameterRows([{ key: 'object', type: 'json', value: '{' }]), /object/)
  assert.throws(() => parseParameterRows([{ key: 'active', type: 'boolean', value: 'yes' }]), /active/)
  assert.throws(() => parseParameterRows([...parameterRows({ a: 1 }), ...parameterRows({ a: 2 })]), /重复/)
})
test('query and params use Vue Router-compatible strings and arrays', () => {
  const value = parseRouteRows(parameterRows({ count: 0, enabled: false, empty: null, tag: ['a', 'b'] }), parameterRows({ id: 15, section: ['one', 'two'] }))
  assert.deepEqual({ ...value.query }, { count: '0', enabled: 'false', empty: null, tag: ['a', 'b'] })
  assert.deepEqual({ ...value.params }, { id: '15', section: ['one', 'two'] })
  assert.throws(() => parseRouteRows([], parameterRows({ id: { nested: true } })), /params.id/)
})
