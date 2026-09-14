export function parseParameterRows(rows) {
  const values = Object.create(null)
  for (const row of rows) {
    if (row.enabled === false || !row.key) continue
    if (Object.hasOwn(values, row.key)) throw new Error(`参数 Key 重复：${row.key}`)
    if (!/^[A-Za-z_$][\w$]*$/.test(row.key) || ['__proto__', 'prototype', 'constructor'].includes(row.key)) throw new Error(`无效的参数 Key：${row.key}`)
    if (row.type === 'number') {
      if (!String(row.value).trim() || !Number.isFinite(Number(row.value))) throw new Error(`${row.key} 必须是有效数字`)
      values[row.key] = Number(row.value)
    } else if (row.type === 'boolean') {
      if (!['true', 'false'].includes(String(row.value).toLowerCase())) throw new Error(`${row.key} 必须是 true 或 false`)
      values[row.key] = String(row.value).toLowerCase() === 'true'
    } else if (row.type === 'json') {
      try { values[row.key] = JSON.parse(row.value) } catch { throw new Error(`${row.key} 不是有效 JSON`) }
    } else values[row.key] = String(row.value)
  }
  return values
}
export function parseRouteRows(query, params) {
  const result = { query: parseParameterRows(query), params: parseParameterRows(params) }
  for (const [group, values] of Object.entries(result)) {
    for (const [key, value] of Object.entries(values)) {
      if (group === 'params' && !/^[A-Za-z_]\w*$/.test(key)) throw new Error(`路由参数名称无效：${key}`)
      const normalize = item => {
        if (item === null && group === 'query') return null
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return String(item)
        throw new Error(`${group}.${key} 应为字符串或字符串数组`)
      }
      values[key] = Array.isArray(value) ? value.map(normalize) : normalize(value)
    }
  }
  return result
}
export function parameterRows(values) {
  return Object.entries(values || {}).map(([key, value], index) => ({
    id: key + '-' + index, key, enabled: true,
    type: ['string', 'number', 'boolean'].includes(typeof value) ? typeof value : 'json',
    value: typeof value === 'string' ? value : JSON.stringify(value)
  }))
}
