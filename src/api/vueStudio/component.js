import request from '@/utils/request'

export function listComponents(query) {
  return request({ url: '/magic/web/requirements/vueStudio/component/list', method: 'get', params: query })
}

export function getComponent(id) {
  return request({ url: `/magic/web/requirements/vueStudio/component/${id}`, method: 'get' })
}

export function addComponent(data) {
  return request({ url: '/magic/web/requirements/vueStudio/component', method: 'post', data, timeout: 120000 })
}

export function updateComponent(data) {
  return request({ url: '/magic/web/requirements/vueStudio/component', method: 'put', data, timeout: 120000 })
}

export function deleteComponents(ids) {
  return request({ url: `/magic/web/requirements/vueStudio/component/${ids}`, method: 'delete' })
}

export function checkComponent(data) {
  return request({ url: '/magic/web/requirements/vueStudio/component/check', method: 'post', data, timeout: 120000 })
}

export function getCompletions(scope) {
  return request({ url: '/magic/web/requirements/vueStudio/component/completions', method: 'get', params: { scope } })
}

export function exportComponents(query) {
  return request({ url: '/magic/web/requirements/vueStudio/component/export', method: 'post', params: query, responseType: 'blob' })
}

export const publishComponent = (id, versionNo, releaseNotes) => request({ url: `/magic/web/requirements/vueStudio/component/${id}/publish`, method: "post", data: { versionNo, releaseNotes }, timeout: 120000 })
export const getComponentVersions = id => request({ url: `/magic/web/requirements/vueStudio/component/${id}/versions` })
export const getComponentVersion = (id, releaseId) => request({ url: `/magic/web/requirements/vueStudio/component/${id}/versions/${releaseId}` })
export const compileComponentImports = sourceCode => request({ url: '/magic/web/requirements/vueStudio/component/imports', method: 'post', data: { sourceCode }, timeout: 120000 })
export const getPublishedComponent = (key, target = 'vue') => request({ url: `/magic/web/requirements/vueStudio/component/runtime/${encodeURIComponent(key)}`, params: { target } })
export const getComponentCatalog = (target = 'formCreate') => request({ url: '/magic/web/requirements/vueStudio/component/catalog', params: { target } })

// Do not put large source packages in the repeat-submit sessionStorage cache.
const packageRequest = (action, data) => request({ url: `/magic/web/requirements/vueStudio/component/package/${action}`, method: 'post', data, timeout: 120000, headers: { repeatSubmit: false } })
export const exportComponentPackage = ids => packageRequest('export', { ids })
export const previewComponentPackage = componentPackage => packageRequest('preview', { package: componentPackage })
export const importComponentPackage = (componentPackage, choices) => packageRequest('import', { package: componentPackage, choices })
