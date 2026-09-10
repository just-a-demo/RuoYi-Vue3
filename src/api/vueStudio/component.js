import request from '@/utils/request'

export function listComponents(query) {
  return request({ url: '/vueStudio/component/list', method: 'get', params: query })
}

export function getComponent(id) {
  return request({ url: `/vueStudio/component/${id}`, method: 'get' })
}

export function addComponent(data) {
  return request({ url: '/vueStudio/component', method: 'post', data })
}

export function updateComponent(data) {
  return request({ url: '/vueStudio/component', method: 'put', data })
}

export function deleteComponents(ids) {
  return request({ url: `/vueStudio/component/${ids}`, method: 'delete' })
}

export function checkComponent(data) {
  return request({ url: '/vueStudio/component/check', method: 'post', data })
}

export function getCompletions(scope) {
  return request({ url: '/vueStudio/component/completions', method: 'get', params: { scope } })
}

export function exportComponents(query) {
  return request({ url: '/vueStudio/component/export', method: 'post', params: query, responseType: 'blob' })
}
