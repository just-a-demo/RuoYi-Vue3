import request from '@/utils/request'
export const listModels = params => request({ url: '/magic/web/requirements/business/formModel/list', params })
export const getModel = id => request({ url: `/magic/web/requirements/business/formModel/${id}` })
export const saveModel = data => request({ url: '/magic/web/requirements/business/formModel', method: data.id ? 'put' : 'post', data, timeout: 120000 })
export const deleteModel = id => request({ url: `/magic/web/requirements/business/formModel/${id}`, method: 'delete' })
export const getApproval = (code, appId, silentError = false) => request({ url: `/magic/web/requirements/business/formModel/approval/${encodeURIComponent(code)}`, params: { appId }, timeout: 45000, silentError })

export const publishModel = id => request({ url: `/magic/web/requirements/business/formModel/${id}/publish`, method: 'post', timeout: 120000 })
export const getPublishedModel = id => request({ url: `/magic/web/requirements/business/formModel/runtime/${id}` })
export const getModelRecords = (id, query) => request({ url: `/magic/web/requirements/business/formModel/runtime/${id}/records${query ? '/query' : ''}`, method: query ? 'post' : 'get', data: query, headers: { repeatSubmit: false } })
export const saveModelRecord = (id, recordId, data) => request({ url: `/magic/web/requirements/business/formModel/runtime/${id}/records${recordId ? '/' + recordId : ''}`, method: recordId ? 'put' : 'post', data })
