import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function loadStore(logout) {
  const source = readFileSync(new URL('../src/store/modules/user.js', import.meta.url), 'utf8')
    .replaceAll('import.meta.env.VITE_APP_BASE_API', "''").replace(/^import .*\r?\n/gm, '').replace('export default useUserStore', 'globalThis.store = useUserStore')
  const context = vm.createContext({
    defineStore: (_, options) => ({ ...options.state(), ...options.actions }),
    getToken: () => 'expired', removeToken: () => { context.removed = true }, logout
  })
  vm.runInContext(source, context)
  return context
}

test('expired session is cleared locally without a logout request', () => {
  const context = loadStore(() => { throw new Error('must not call logout') })
  context.store.resetToken()
  assert.equal(context.store.token, '')
  assert.equal(context.store.roles.length, 0)
  assert.equal(context.removed, true)
})

test('logout failure still clears local authentication', async () => {
  const context = loadStore(() => Promise.reject(new Error('offline')))
  await assert.rejects(context.store.logOut(), /offline/)
  assert.equal(context.store.token, '')
  assert.equal(context.removed, true)
})

for (const httpStatus of [false, true]) {
  test(`concurrent ${httpStatus ? 'HTTP' : 'business'} 401 responses prompt once and preserve return URL`, async () => {
    const source = readFileSync(new URL('../src/utils/request.js', import.meta.url), 'utf8')
      .replace(/^import .*\r?\n/gm, '')
      .replaceAll('import.meta.env.VITE_APP_BASE_API', "''")
      .replaceAll('export ', '').replace('default service', '')
    let success, failure, confirmLogin, prompts = 0, resets = 0
    const service = { interceptors: {
      request: { use() {} },
      response: { use(ok, fail) { success = ok; failure = fail } }
    } }
    const location = { pathname: '/dev/FormDesign', search: '?name=a&status=1', hash: '#list' }
    vm.runInNewContext(source, {
      axios: { defaults: { headers: {} }, create: () => service }, location,
      useUserStore: () => ({ resetToken() { resets++ }, logOut() { throw Error('unexpected logout') } }),
      errorCode: {}, ElMessageBox: { confirm() {
        prompts++
        return new Promise(resolve => { confirmLogin = resolve })
      } }
    })
    const respond = () => httpStatus
      ? failure({ response: { status: 401 } })
      : success({ data: { code: 401 }, request: {} })
    await Promise.all([respond().catch(() => {}), respond().catch(() => {})])
    assert.equal(prompts, 1)
    confirmLogin()
    await Promise.resolve()
    assert.equal(resets, 1)
    assert.equal(location.href, '/login?redirect=' + encodeURIComponent('/dev/FormDesign?name=a&status=1#list'))
    await respond().catch(() => {})
    assert.equal(prompts, 1)
  })
}

