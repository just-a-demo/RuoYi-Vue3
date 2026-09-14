import { getPublishedComponent, getComponentCatalog } from '@/api/vueStudio/component'
import { loadProjectImports } from './imports'
import { compilePreview, componentDependencies, formComponentDependencies, extractPropSuggestions } from '@/views/vueStudio/component/previewCompiler'

export async function loadComponents(source = '', formRules = '[]', includeCatalog = false) {
  const modules = [], visited = new Map(), path = new Set()
  const catalog = includeCatalog ? (await getComponentCatalog()).data : []
  async function visit(key, target, entry) {
    if (path.has(key)) throw new Error('组件循环依赖：' + key)
    if (visited.has(key)) {
      if (!visited.get(key).publishTargets.includes(target)) throw new Error('组件未发布到 ' + target + '：' + key)
      return
    }
    path.add(key)
    const data = entry || (await getPublishedComponent(key, target)).data
    for (const child of componentDependencies(data.sourceCode)) await visit(child, 'vue')
    for (const child of formComponentDependencies(data.formRules)) await visit(child, 'formCreate')
    const item = { ...await compilePreview(data.sourceCode, 'component-' + key), key,
      name: data.componentName || data.name || key, formRules: data.formRules || '[]', formOptions: data.formOptions || '{}',
      publishTargets: typeof data.publishTargets === 'string' ? JSON.parse(data.publishTargets) : data.publishTargets || ['vue'],
      propsSchema: data.propsSchema || extractPropSuggestions(data.sourceCode) }
    item.moduleBundle = await loadProjectImports(data.sourceCode)
    item.css += '\n' + (item.moduleBundle?.css || '')
    modules.push(item); visited.set(key, item); path.delete(key)
  }
  if (source.trim()) for (const key of componentDependencies(source)) await visit(key, 'vue')
  for (const key of formComponentDependencies(formRules)) await visit(key, 'formCreate')
  for (const entry of catalog) await visit(entry.componentKey || entry.key, 'formCreate', entry)
  return modules
}
