export const TOOLBAR_TYPE = 'lc-FormTopToolbar'

// The toolbar is an action, not a business field. Normalize old designer rules too.
export function normalizeToolbarRules(rules) {
  const toolbars = [], fields = []
  for (const rule of rules) {
    if (rule?.type !== TOOLBAR_TYPE) { fields.push(rule); continue }
    const toolbar = { ...rule, col: { ...rule.col, span: 24 }, wrap: false }
    for (const key of ['field', 'title', 'value', 'validate', '$required']) delete toolbar[key]
    toolbars.push(toolbar)
  }
  return [...toolbars, ...fields]
}

export function toolbarDesignerRule() {
  return { type: TOOLBAR_TYPE, props: {}, col: { span: 24 }, wrap: false }
}
