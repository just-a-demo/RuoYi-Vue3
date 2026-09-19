import { fieldMeta, displayValue, sortable } from './listConfig.js'
export function syncFields(rules, previous = []) {
  const old = new Map(previous.map(field => [field.field, field]))
  const fields = []
  const seen = new Set()
  function visit(nodes) {
    if (!Array.isArray(nodes)) return
    for (const rule of nodes) {
      if (!rule || typeof rule !== 'object') continue
      if (rule.field) {
        if (seen.has(rule.field)) throw new Error(`表单字段标识重复：${rule.field}`)
        seen.add(rule.field)
        fields.push({ visible: true, sortable: false, filter: false, order: fields.length + 1, approvalMap: '', ...old.get(rule.field), field: rule.field, title: String(rule.title || rule.field), type: rule.type || '', ...fieldMeta(rule) })
      }
      visit(rule.children)
      for (const control of rule.control || []) visit(control.rule)
    }
  }
  visit(rules)
  return fields
}
export function listColumns(fields, defaultWidth = 160) {
  return fields.filter(field => field.visible).slice().sort((a, b) => a.order - b.order).map(field => ({
    field: field.field, title: field.title, sort: false, showSort: Boolean(field.sortable) && sortable(field),
    width: field.width ?? defaultWidth, fieldFormat: record => displayValue(record.values?.[field.field], field)
  }))
}
