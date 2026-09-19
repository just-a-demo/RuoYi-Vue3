export const ACTIONS = [{ key: 'create', label: '新增' }, { key: 'edit', label: '修改' }, { key: 'refresh', label: '刷新' }]
export const OPERATORS = {
  contains: '包含', notContains: '不包含', startsWith: '开头是', eq: '等于', ne: '不等于',
  gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于', between: '区间',
  in: '属于', notIn: '不属于', any: '包含任意项', all: '包含全部项', empty: '为空', notEmpty: '不为空'
}
const BY_TYPE = {
  text: ['contains', 'notContains', 'eq', 'ne', 'startsWith'], number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'],
  date: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'], datetime: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'],
  boolean: ['eq', 'ne'], enum: ['eq', 'ne', 'in', 'notIn'], array: ['any', 'all'], complex: []
}
export const clone = value => JSON.parse(JSON.stringify(value))
export function fieldMeta(rule) {
  const props = rule.props || {}, type = String(rule.type || '').toLowerCase()
  let valueType = 'complex'
  const options = (Array.isArray(rule.options) ? rule.options : []).filter(o => o && ['string', 'number', 'boolean'].includes(typeof o.value)).map(o => ({ label: String(o.label ?? o.value), value: o.value }))
  if (['input', 'textarea', 'password', 'text'].includes(type)) valueType = props.type === 'number' ? 'number' : 'text'
  if (['inputnumber', 'rate', 'slider'].includes(type)) valueType = props.range ? 'complex' : 'number'
  if (['datepicker', 'date', 'datetimepicker'].includes(type)) valueType = String(props.type || '').includes('range') ? 'complex' : String(props.type || type).includes('datetime') ? 'datetime' : 'date'
  if (['switch'].includes(type)) valueType = 'boolean'
  if (['radio', 'select', 'checkbox'].includes(type)) valueType = type === 'checkbox' || props.multiple ? 'array' : 'enum'
  if (['enum', 'array'].includes(valueType) && !options.length) valueType = 'complex'
  if (['date', 'datetime'].includes(valueType) && !['', 'YYYY-MM-DD', 'yyyy-MM-dd', 'YYYY-MM-DD HH:mm:ss', 'yyyy-MM-dd HH:mm:ss', 'x', 'X'].includes(props.valueFormat || '')) valueType = 'complex'
  return { valueType, options, trueValue: props.activeValue ?? true, falseValue: props.inactiveValue ?? false, dateFormat: props.valueFormat || '' }
}
export function operators(field) { return [...(BY_TYPE[field?.valueType] || []), 'empty', 'notEmpty'] }
export function sortable(field) { return !['complex', 'array'].includes(field.valueType) }
export function normalizeListConfig(raw = {}, fields = []) {
  const value = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
  return {
    version: 1,
    buttons: ACTIONS.map((action, index) => {
      const button = value.buttons?.find(b => b.key === action.key)
      return { key: action.key, label: button?.label ?? action.label, visible: button?.visible ?? true, order: button?.order ?? index + 1 }
    }),
    filters: { relation: value.filters?.relation || 'and', defaults: value.filters?.defaults || fields.filter(f => f.filter).map(f => ({ field: f.field, operator: operators(f)[0] })) },
    table: { defaultWidth: value.table?.defaultWidth ?? 160, pageSize: value.table?.pageSize ?? 20, defaultSort: value.table?.defaultSort || null }
  }
}
export function validateListConfig(config, fields) {
  if (!Number.isInteger(config.table.defaultWidth) || config.table.defaultWidth < 60 || config.table.defaultWidth > 1200) throw Error('默认列宽应为60—1200像素')
  if (![10, 20, 50, 100].includes(config.table.pageSize)) throw Error('每页条数无效')
  if (!['and', 'or'].includes(config.filters.relation)) throw Error('查询关系无效')
  for (const button of config.buttons) if (!button.label?.trim() || button.label.length > 20 || !Number.isInteger(button.order) || button.order < 1 || button.order > 99) throw Error('按钮名称或顺序无效')
  for (const f of fields) if (f.width != null && (!Number.isInteger(f.width) || f.width < 60 || f.width > 1200)) throw Error(`${f.title}的列宽应为60—1200像素`)
  if (config.filters.defaults.length > 20) throw Error('最多配置20个常用条件')
  for (const c of config.filters.defaults) {
    const field = fields.find(f => f.field === c.field)
    if (!field || !operators(field).includes(c.operator)) throw Error('常用筛选字段或运算符已失效，请重新配置')
  }
  const sort = config.table.defaultSort
  if (sort?.field) {
    const field = fields.find(f => f.field === sort.field)
    if (!field || !field.sortable || !sortable(field) || !['asc', 'desc'].includes(sort.order)) throw Error('默认排序字段已失效或未开启排序')
  }
}
export function validateConditions(conditions, fields) {
  if (conditions.length > 20) throw Error('最多添加20个条件')
  for (const [index, c] of conditions.entries()) {
    const f = fields.find(f => f.field === c.field), prefix = `第${index + 1}个条件：`
    if (!f || !operators(f).includes(c.operator)) throw Error(prefix + '请选择有效字段和条件')
    if (['empty', 'notEmpty'].includes(c.operator)) continue
    const values = ['between', 'in', 'notIn', 'any', 'all'].includes(c.operator) ? c.value : [c.value]
    if (!Array.isArray(values) || !values.length || values.length > 100 || (c.operator === 'between' && values.length !== 2)) throw Error(prefix + '请填写查询值')
    for (const v of values) {
      if (v == null || v === '') throw Error(prefix + '请填写查询值')
      if (f.valueType === 'number' && (typeof v !== 'number' || !Number.isFinite(v) || !/^-?\d+(\.\d+)?$/.test(String(v)))) throw Error(prefix + '请输入有效数值')
      if (['date', 'datetime'].includes(f.valueType)) {
        const pattern = f.valueType === 'date' ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
        const d = typeof v === 'string' ? new Date(v.replace(' ', 'T') + (f.valueType === 'date' ? 'T00:00:00Z' : 'Z')) : new Date(NaN)
        if (!pattern.test(v) || Number.isNaN(d.getTime()) || d.toISOString().replace('T', ' ').slice(0, v.length) !== v) throw Error(prefix + '请选择有效日期')
      }
      if (['enum', 'array'].includes(f.valueType) && !f.options.some(o => o.value === v)) throw Error(prefix + '选项已失效')
      if (f.valueType === 'boolean' && v !== f.trueValue && v !== f.falseValue) throw Error(prefix + '请选择是或否')
      if (f.valueType === 'text' && (typeof v !== 'string' || v.length > 500)) throw Error(prefix + '文本不能超过500字')
    }
    if (c.operator === 'between' && values[0] > values[1]) throw Error(prefix + '区间起始值不能大于结束值')
  }
  return clone(conditions)
}
export function defaultConditions(config) { return config.filters.defaults.map(c => ({ ...c, value: undefined })) }
export function displayValue(value, field) {
  if (value == null) return ''
  if (['date', 'datetime'].includes(field.valueType)) return comparable(value, field) ?? ''
  if (field.valueType === 'boolean') return value === field.trueValue ? '是' : value === field.falseValue ? '否' : String(value)
  if (field.options?.length) return (Array.isArray(value) ? value : [value]).map(v => field.options.find(o => o.value === v)?.label ?? String(v)).join('、')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
function comparable(value, field) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null
  if (field.valueType === 'number') return /^-?\d+(\.\d+)?$/.test(String(value)) ? Number(value) : null
  if (['date', 'datetime'].includes(field.valueType)) {
    if (['x', 'X'].includes(field.dateFormat)) {
      const d = new Date(Number(value) * (field.dateFormat === 'X' ? 1000 : 1))
      if (Number.isNaN(d.getTime())) return null
      const pad = n => String(n).padStart(2, '0')
      value = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
    }
    return String(value).replace('T', ' ').slice(0, field.valueType === 'date' ? 10 : 19)
  }
  return typeof value === 'string' && field.valueType === 'text' ? value.toLowerCase() : value
}
export function matchesCondition(record, c, field) {
  const raw = record[field.field], v = comparable(raw, field)
  const empty = raw == null || raw === '' || (typeof raw === 'object' && Object.keys(raw).length === 0)
  if (c.operator === 'empty') return empty
  if (c.operator === 'notEmpty') return !empty
  if (empty || v == null) return false
  const x = c.value, scalar = typeof x === 'string' && field.valueType === 'text' ? x.toLowerCase() : x
  switch (c.operator) {
    case 'contains': return String(v).includes(scalar)
    case 'notContains': return !String(v).includes(scalar)
    case 'startsWith': return String(v).startsWith(scalar)
    case 'eq': return v === (field.valueType === 'enum' ? comparable(x, field) : scalar)
    case 'ne': return v !== (field.valueType === 'enum' ? comparable(x, field) : scalar)
    case 'gt': return v > x
    case 'gte': return v >= x
    case 'lt': return v < x
    case 'lte': return v <= x
    case 'between': return v >= x[0] && v <= x[1]
    case 'in': return x.includes(raw)
    case 'notIn': return !x.includes(raw)
    case 'any': return Array.isArray(raw) && x.some(item => raw.includes(item))
    case 'all': return Array.isArray(raw) && x.every(item => raw.includes(item))
    default: return false
  }
}
export function previewQuery(records, fields, query) {
  validateConditions(query.conditions, fields)
  const matched = records.filter(record => !query.conditions.length || query.conditions[query.relation === 'or' ? 'some' : 'every'](c => matchesCondition(record.values, c, fields.find(f => f.field === c.field))))
  const sort = query.sort, field = fields.find(f => f.field === sort?.field)
  matched.sort((a, b) => {
    if (field) {
      const x = comparable(a.values[field.field], field), y = comparable(b.values[field.field], field)
      if (x == null || y == null) { if (x !== y) return x == null ? 1 : -1 }
      else if (x !== y) return (x < y ? -1 : 1) * (sort.order === 'asc' ? 1 : -1)
    }
    return Number(b.id) - Number(a.id)
  })
  const pageNum = Math.max(1, Math.min(query.pageNum, Math.ceil(matched.length / query.pageSize) || 1))
  return { rows: matched.slice((pageNum - 1) * query.pageSize, pageNum * query.pageSize), total: matched.length, pageNum, pageSize: query.pageSize }
}
export function sampleRecords(fields) {
  return Array.from({ length: 25 }, (_, index) => ({ id: index + 1, values: Object.fromEntries(fields.map(f => [f.field,
    f.valueType === 'number' ? index * 100 : f.valueType === 'boolean' ? index % 2 ? f.trueValue : f.falseValue :
    ['date', 'datetime'].includes(f.valueType) && ['x', 'X'].includes(f.dateFormat) ? Date.UTC(2026, 8, index + 1, 12) / (f.dateFormat === 'X' ? 1000 : 1) :
    f.valueType === 'date' ? `2026-09-${String(index + 1).padStart(2, '0')}` : f.valueType === 'datetime' ? `2026-09-${String(index + 1).padStart(2, '0')} 12:00:00` :
    f.valueType === 'enum' ? f.options[index % f.options.length]?.value : f.valueType === 'array' ? [f.options[index % f.options.length]?.value] :
    f.valueType === 'complex' ? null : `${f.title} 示例${index + 1}`])) }))
}
