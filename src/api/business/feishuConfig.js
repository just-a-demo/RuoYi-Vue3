import request from '@/utils/request'

const baseUrl = '/magic/web/requirements/feishu/config'

export const listFeishuConfigs = params => request({ url: `${baseUrl}/list`, params })
export const listFeishuCatalog = () => request({ url: `${baseUrl}/catalog` })
export const addFeishuConfig = data => request({ url: baseUrl, method: 'post', data })
export const updateFeishuConfig = data => request({ url: baseUrl, method: 'put', data })
export const deleteFeishuConfig = id => request({ url: `${baseUrl}/${id}`, method: 'delete' })
