import { compileScript, compileStyle, compileTemplate, parse } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
import ts from 'typescript'

function moduleFactory(code, defaultExport) {
  let runtimeName = '__vsRuntime'
  while (code.includes(runtimeName)) runtimeName += '_'
  const file = ts.createSourceFile('Preview.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const edits = []
  function visit(node) {
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(file) === 'require')) {
      throw new Error('预览不支持动态 import 或 require，请使用静态 vue 导入')
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.moduleSpecifier.text !== 'vue') throw new Error('预览目前只允许导入 vue')
      const clause = statement.importClause
      const bindings = clause?.namedBindings
      const lines = []
      if (clause?.name) lines.push('const ' + clause.name.text + ' = ' + runtimeName + ';')
      if (bindings && ts.isNamespaceImport(bindings)) lines.push('const ' + bindings.name.text + ' = ' + runtimeName + ';')
      if (bindings && ts.isNamedImports(bindings)) {
        lines.push('const { ' + bindings.elements.map(item => (item.propertyName?.text || item.name.text) + ': ' + item.name.text).join(', ') + ' } = ' + runtimeName + ';')
      }
      edits.push({ start: statement.getStart(file), end: statement.end, text: lines.join('\n') })
    } else if (ts.isExportAssignment(statement)) {
      edits.push({ start: statement.getStart(file), end: statement.expression.getStart(file), text: 'const __component = ' })
    } else if (statement.modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'render' && !defaultExport) {
        const modifier = statement.modifiers.find(item => item.kind === ts.SyntaxKind.ExportKeyword)
        edits.push({ start: modifier.getStart(file), end: modifier.end, text: '' })
      } else throw new Error('预览暂不支持组件脚本中的具名导出')
    } else if (ts.isExportDeclaration(statement)) throw new Error('预览不支持重新导出模块')
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end)
  return 'return (function(' + runtimeName + '){\n' + code + '\nreturn ' + (defaultExport ? '__component' : 'render') + '\n})(Vue)'
}

export function compilePreview(source, sessionId) {
  if (new TextEncoder().encode(source).length > 1024 * 1024) throw new Error('源码不能超过 1 MB')
  const id = 'data-v-' + sessionId.replace(/[^a-z0-9]/gi, '').slice(-8)
  const parsed = parse(source, { filename: 'Preview.vue' })
  if (parsed.errors.length) throw new Error(String(parsed.errors[0].message || parsed.errors[0]))
  const descriptor = parsed.descriptor
  if (!descriptor.template) throw new Error('组件必须包含 template')
  const inline = Boolean(descriptor.scriptSetup)
  let componentFactory = 'return {}'
  let bindings
  if (descriptor.script || descriptor.scriptSetup) {
    const script = compileScript(descriptor, { id, inlineTemplate: inline, templateOptions: { compilerOptions: { isTS: descriptor.scriptSetup?.lang === 'ts' } } })
    bindings = script.bindings
    const result = ts.transpileModule(script.content, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
      reportDiagnostics: true
    })
    const errors = (result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error)
    if (errors.length) throw new Error(ts.flattenDiagnosticMessageText(errors[0].messageText, '\n'))
    componentFactory = moduleFactory(result.outputText, true)
  }
  let renderFactory = null
  if (!inline) {
    const template = compileTemplate({
      id, filename: 'Preview.vue', source: descriptor.template.content,
      scoped: descriptor.styles.some(style => style.scoped),
      compilerOptions: { mode: 'module', bindingMetadata: bindings }
    })
    if (template.errors.length) throw new Error(String(template.errors[0].message || template.errors[0]))
    renderFactory = moduleFactory(template.code, false)
  }
  const css = descriptor.styles.map(style => {
    if (style.lang && style.lang !== 'css') throw new Error('预览暂不支持 style lang="' + style.lang + '"，请使用 CSS')
    const result = compileStyle({ id, filename: 'Preview.vue', source: style.content, scoped: style.scoped })
    if (result.errors.length) throw new Error(String(result.errors[0].message || result.errors[0]))
    return result.code
  }).join('\n')
  return { componentFactory, renderFactory, css, scopeId: descriptor.styles.some(style => style.scoped) ? id : null }
}

export function extractPropSuggestions(source) {
  const match = source.match(/defineProps\s*<\s*\{([\s\S]*?)\}\s*>/) || source.match(/defineProps\s*\(\s*\{([\s\S]*?)\}\s*\)/)
  if (!match) return []
  return [...match[1].matchAll(/([A-Za-z_$][\w$]*)\??\s*:\s*(string|String|number|Number|boolean|Boolean)?/g)].map(item => ({
    key: item[1], type: item[2]?.toLowerCase() || 'json', value: '', enabled: false
  }))
}
