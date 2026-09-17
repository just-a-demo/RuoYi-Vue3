import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
const filename = 'src/views/business/formModel/index.vue'
const source = readFileSync(filename, 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'approval-check' })
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: 'approval-check', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, filename, id: 'data-v-approval-check', scoped: true }).errors, [])
const refreshSource = source.slice(source.indexOf('async function refreshApproval()'), source.indexOf('async function associate()'))
const model = { value: { approvalCode: 'TEST', feishuAppId: 1, formRules: '[{"field":"a"}]', fieldConfig: '[{"approvalMap":"original"}]' } }
const before = JSON.stringify(model.value)
const loading = { value: false }, approval = { value: null }, error = { value: '' }, editing = { value: true }
let api = async () => { throw new Error('mock timeout') }
const controller = new Function('getApproval', 'model', 'approvalLoading', 'approval', 'approvalError', 'editing', 'let approvalRequest = 0;\n' + refreshSource + '\nreturn { refreshApproval, cancel: () => ++approvalRequest }')((...args) => { assert.equal(args[2], true); return api(...args) }, model, loading, approval, error, editing)
await controller.refreshApproval()
assert.equal(error.value, 'mock timeout')
assert.equal(loading.value, false)
assert.equal(JSON.stringify(model.value), before)
api = async () => ({ data: { code: 'TEST', fields: [{ id: 'original' }] } })
await controller.refreshApproval()
assert.equal(error.value, '')
assert.equal(approval.value.code, 'TEST')
assert.equal(JSON.stringify(model.value), before)
let resolve
api = () => new Promise(done => { resolve = done })
const pending = controller.refreshApproval()
controller.cancel()
approval.value = null
resolve({ data: { code: 'STALE' } })
await pending
assert.equal(approval.value, null, 'Stale response must not replace another model/association')
// Exercise the real interceptor; only the transport/UI dependencies are mocked.
let success, failure, toastCount = 0, reloginCount = 0
const transport = { interceptors: { request: { use() {} }, response: { use(a, b) { success = a; failure = b } } } }
const axios = { defaults: { headers: {} }, create: () => transport }
const requestSource = readFileSync('src/utils/request.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace('import.meta.env.VITE_APP_BASE_API', "'/dev-api'").replace('export default service', '').replace(/\bexport /g, '')
const relogin = new Function('axios', 'ElMessage', 'ElNotification', 'ElMessageBox', 'errorCode', 'console', requestSource + '\nreturn isRelogin')(
  axios, () => toastCount++, { error: () => toastCount++ }, { confirm: () => { reloginCount++; return Promise.reject('cancel') } }, {}, { log() {} },
)
const response = (code, silentError) => ({ data: { code, msg: 'test failure' }, request: {}, config: { silentError } })
await assert.rejects(success(response(500, true)), /test failure/)
assert.equal(toastCount, 0)
await assert.rejects(success(response(500, false)), /test failure/)
assert.equal(toastCount, 1)
await assert.rejects(failure({ message: 'Network Error', config: { silentError: true } }))
assert.equal(toastCount, 1)
await assert.rejects(success(response(401, true)))
await Promise.resolve()
assert.equal(reloginCount, 1, 'Silent error must not suppress re-login')
relogin.show = false
await assert.rejects(failure({ response: { status: 401 }, config: { silentError: true } }))
assert.equal(reloginCount, 2)
console.log('PASS: SFC compilation; failed refresh retains model/mappings; retry succeeds; stale response ignored; opt-in toast suppression; default errors and both 401 paths preserved.')
