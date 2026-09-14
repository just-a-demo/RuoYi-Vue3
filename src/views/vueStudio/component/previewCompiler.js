import { compileScript, compileStyle, compileTemplate, parse } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'
import ts from 'typescript'

const runtimeModules = new Set(['vue', 'vue-router', 'pinia', 'element-plus', '@form-create/element-ui'])
const componentModule = /^@lc\/([A-Za-z][A-Za-z0-9_-]*)$/

export function projectImports(source) {
  const { descriptor } = parse(source)
  const names = new Set()
  for (const block of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
    const file = ts.createSourceFile('Component.ts', block.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue
      const name = statement.moduleSpecifier.text
      allowedModule(name)
      if (!runtimeModules.has(name) && !componentModule.test(name)) names.add(name)
    }
  }
  return [...names]
}

function allowedModule(name) {
  if (!runtimeModules.has(name) && !componentModule.test(name) && !/^(?:@\/|~\/|\.?\.?\/|@?[\w-])[\w@./-]*$/.test(name)) {
    throw new Error('请使用项目组件路径或已安装的 npm 包名')
  }
}

function rejectDynamicImports(file) {
  function visit(node) {
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(file) === 'require')) {
      throw new Error('不支持动态 import 或 require，请使用允许的静态模块导入')
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
}

function moduleFactory(code, defaultExport) {
  let runtimeName = '__vsRuntime'
  while (code.includes(runtimeName)) runtimeName += '_'
  const file = ts.createSourceFile('Preview.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const edits = []
  rejectDynamicImports(file)
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const moduleName = statement.moduleSpecifier.text
      allowedModule(moduleName)
      const runtime = moduleName === 'vue' ? runtimeName : componentModule.test(moduleName)
        ? 'Modules[' + JSON.stringify(moduleName.slice(4)) + ']'
        : 'RuntimeModules[' + JSON.stringify(moduleName) + ']'
      const clause = statement.importClause
      const bindings = clause?.namedBindings
      const lines = []
      if (clause?.name) lines.push('const ' + clause.name.text + ' = (' + runtime + '.default || ' + runtime + ');')
      if (bindings && ts.isNamespaceImport(bindings)) lines.push('const ' + bindings.name.text + ' = ' + runtime + ';')
      if (bindings && ts.isNamedImports(bindings)) {
        lines.push('const { ' + bindings.elements.map(item => (item.propertyName?.text || item.name.text) + ': ' + item.name.text).join(', ') + ' } = ' + runtime + ';')
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

// Remove comments and quoted contents before checking executable preprocessor directives.
function styleCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, text => text.replace(/[^\r\n]/g, ' '))
}

let lessCompiler
async function getLessCompiler() {
  if (!lessCompiler) {
    // The environment-free core has no filesystem, HTTP loader, or browser DOM startup.
    const module = await import('less/lib/less/index.js')
    lessCompiler = module.default({}, [])
    lessCompiler.PluginLoader = class {
      evalPlugin() { throw new Error('Less 不允许执行插件') }
      loadPlugin() { throw new Error('Less 不允许加载插件') }
    }
  }
  return lessCompiler
}

export async function preprocessStyle(source, language = 'css') {
  const lang = language.toLowerCase()
  if (!['css', 'less', 'scss', 'sass'].includes(lang)) throw new Error('不支持样式语言：' + language)
  const code = styleCode(source)
  if (/@(?:import|plugin|forward)\b/i.test(code)) throw new Error('样式不允许导入文件、网络资源或插件，请将样式写在当前区块')
  if (lang === 'css') return source
  if (lang === 'less') {
    if (code.includes('`') || /\b(?:data-uri|image-size|image-width|image-height)\s*\(/i.test(code)) throw new Error('Less 不允许执行 JavaScript 或读取文件')
    const less = await getLessCompiler()
    const result = await less.render(source, { javascriptEnabled: false, disablePluginRule: true, plugins: [], math: 'parens-division' })
    if (/@import\b/i.test(styleCode(result.css))) throw new Error('样式不允许导入文件或网络资源')
    return result.css
  }
  for (const directive of code.matchAll(/@use\b/gi)) {
    const target = source.slice(directive.index + directive[0].length).match(/^\s*(["'])(sass:[\w-]+)\1/)
    if (!target || target[2] === 'sass:meta') throw new Error('Sass 仅允许不读取外部资源的 sass: 内置模块')
  }
  if (/\bload-css\s*\(/i.test(code)) throw new Error('Sass 不允许读取样式文件')
  const sass = await import('sass')
  const result = sass.compileString(source, {
    syntax: lang === 'sass' ? 'indented' : 'scss',
    style: 'expanded',
    loadPaths: [],
    importers: [{ canonicalize() { throw new Error('Sass 不允许导入文件或网络资源，仅支持 sass: 内置模块') }, load() { return null } }],
    logger: { warn() {}, debug() {} }
  })
  if (/@import\b/i.test(styleCode(result.css))) throw new Error('样式不允许导入文件或网络资源')
  return result.css
}

export async function compilePreview(source, sessionId = 'preview') {
  componentDependencies(source)
  if (new TextEncoder().encode(source).length > 1024 * 1024) throw new Error('源码不能超过 1 MB')
  let hash = 2166136261
  for (const char of sessionId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  const id = 'data-v-' + (hash >>> 0).toString(16)
  const parsed = parse(source, { filename: 'Preview.vue' })
  if (parsed.errors.length) throw new Error(String(parsed.errors[0].message || parsed.errors[0]))
  const descriptor = parsed.descriptor
  for (const block of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
    if (!block.lang || block.lang === 'js') block.lang = 'ts'
  }
  if (!descriptor.template) throw new Error('组件必须包含 template')
  for (const script of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
    if (script.lang && !['js', 'ts'].includes(script.lang)) throw new Error('脚本仅支持 JavaScript 和 TypeScript')
  }
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
  const styles = []
  for (const [index, style] of descriptor.styles.entries()) {
    try {
      const source = await preprocessStyle(style.content, style.lang || 'css')
      const result = compileStyle({ id, filename: 'Preview.vue', source, scoped: style.scoped })
      if (result.errors.length) throw result.errors[0]
      styles.push(result.code)
    } catch (error) {
      const relativeLine = error.span?.start?.line != null ? error.span.start.line + 1 : error.line || 1
      const line = style.loc.start.line + relativeLine - 1
      const message = `第 ${index + 1} 个 style (${style.lang || 'css'})，第 ${line} 行：${error.message || String(error)}`
      throw Object.assign(new Error(message), { line, column: error.span?.start?.column != null ? error.span.start.column + 1 : error.column || 1 })
    }
  }
  const hasFormOutlet = node => Boolean(node && (
    (node.type === 1 && node.tag.replace(/-/g, '').toLowerCase() === 'formcreate') ||
    node.children?.some(hasFormOutlet) || node.branches?.some(hasFormOutlet)
  ))
  return { componentFactory, renderFactory, hasFormOutlet: hasFormOutlet(descriptor.template.ast), css: styles.join('\n'), scopeId: descriptor.styles.some(style => style.scoped) ? id : null }
}

function scriptFile(block) {
  const isTs = true
  return ts.createSourceFile('Component.' + (isTs ? 'ts' : 'js'), block.content, ts.ScriptTarget.Latest, true, isTs ? ts.ScriptKind.TS : ts.ScriptKind.JS)
}

function propertyName(node) {
  return node && (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) ? node.text : null
}

function staticValue(node) {
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text)
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return staticValue(node.expression)
  if (ts.isArrayLiteralExpression(node)) {
    const values = node.elements.map(staticValue)
    return values.some(value => value === undefined) ? undefined : values
  }
  if (ts.isObjectLiteralExpression(node)) {
    const result = {}
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop) || propertyName(prop.name) === null) return undefined
      const value = staticValue(prop.initializer)
      if (value === undefined) return undefined
      Object.defineProperty(result, propertyName(prop.name), { value, enumerable: true, writable: true, configurable: true })
    }
    return result
  }
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return staticValue(node.body)
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && node.body && ts.isBlock(node.body)) {
    if (node.body.statements.length === 1 && ts.isReturnStatement(node.body.statements[0])) return staticValue(node.body.statements[0].expression)
  }
  return undefined
}

function valueType(node) {
  if (!node) return 'json'
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return valueType(node.expression)
  if (ts.isParenthesizedTypeNode(node)) return valueType(node.type)
  if (ts.isLiteralTypeNode(node)) return valueType(node.literal)
  const names = { [ts.SyntaxKind.StringKeyword]: 'string', [ts.SyntaxKind.NumberKeyword]: 'number', [ts.SyntaxKind.BooleanKeyword]: 'boolean', [ts.SyntaxKind.TrueKeyword]: 'boolean', [ts.SyntaxKind.FalseKeyword]: 'boolean' }
  if (names[node.kind]) return names[node.kind]
  if (ts.isIdentifier(node)) return { String: 'string', Number: 'number', Boolean: 'boolean' }[node.text] || 'json'
  if (ts.isStringLiteral(node)) return 'string'
  if (ts.isNumericLiteral(node)) return 'number'
  if (ts.isUnionTypeNode(node)) {
    const types = new Set(node.types.filter(type => type.kind !== ts.SyntaxKind.UndefinedKeyword && !(ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword)).map(valueType))
    return types.size === 1 ? [...types][0] : 'json'
  }
  return 'json'
}

export function extractPropSuggestions(source) {
  const { descriptor } = parse(source)
  const props = new Map()
  for (const block of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
    const file = scriptFile(block)
    const declarations = new Map()
    for (const statement of file.statements) {
      if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) declarations.set(statement.name.text, statement)
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration.initializer)
      }
    }
    function add(key, type = 'json', required = false, defaultValue) {
      if (!key) return
      const hasDefault = defaultValue !== undefined
      props.set(key, { key, type, value: hasDefault ? type === 'json' ? JSON.stringify(defaultValue) : String(defaultValue) : '', enabled: false, required, ...(hasDefault ? { default: defaultValue } : {}) })
    }
    function typeProps(node, seen = new Set()) {
      if (!node) return
      if (ts.isTypeReferenceNode(node)) {
        const name = node.typeName.getText(file)
        if (seen.has(name)) return
        seen.add(name)
        return typeProps(declarations.get(name), seen)
      }
      if (ts.isTypeAliasDeclaration(node)) return typeProps(node.type, seen)
      if (ts.isIntersectionTypeNode(node)) return node.types.forEach(type => typeProps(type, new Set(seen)))
      if (ts.isInterfaceDeclaration(node)) for (const clause of node.heritageClauses || []) for (const type of clause.types) typeProps(declarations.get(type.expression.getText(file)), seen)
      for (const member of node.members || []) if (ts.isPropertySignature(member)) add(propertyName(member.name), valueType(member.type), !member.questionToken)
    }
    function runtimeProps(node, seen = new Set()) {
      if (!node) return
      if (ts.isIdentifier(node)) {
        if (seen.has(node.text)) return
        seen.add(node.text)
        return runtimeProps(declarations.get(node.text), seen)
      }
      if (ts.isArrayLiteralExpression(node)) return node.elements.forEach(item => { if (ts.isStringLiteral(item)) add(item.text) })
      if (!ts.isObjectLiteralExpression(node)) return
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        let definition = prop.initializer
        if (ts.isIdentifier(definition) && declarations.has(definition.text)) definition = declarations.get(definition.text)
        if (definition && ts.isObjectLiteralExpression(definition)) {
          const options = new Map(definition.properties.filter(item => ts.isPropertyAssignment(item) || ts.isMethodDeclaration(item)).map(item => [propertyName(item.name), ts.isMethodDeclaration(item) ? item : item.initializer]))
          add(propertyName(prop.name), valueType(options.get('type')), staticValue(options.get('required')) === true, staticValue(options.get('default')))
        } else add(propertyName(prop.name), valueType(definition))
      }
    }
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(file) === 'defineProps') {
        if (node.typeArguments?.length) typeProps(node.typeArguments[0])
        else runtimeProps(node.arguments[0])
        const parent = node.parent
        if (ts.isCallExpression(parent) && parent.expression.getText(file) === 'withDefaults' && parent.arguments[1] && ts.isObjectLiteralExpression(parent.arguments[1])) {
          for (const prop of parent.arguments[1].properties) if (ts.isPropertyAssignment(prop)) {
            const key = propertyName(prop.name), current = props.get(key), value = staticValue(prop.initializer)
            if (current && value !== undefined) add(key, current.type, current.required, value)
          }
        }
      }
      if (ts.isExportAssignment(node)) {
        const options = ts.isCallExpression(node.expression) ? node.expression.arguments[0] : node.expression
        if (options && ts.isObjectLiteralExpression(options)) {
          const declaration = options.properties.find(item => ts.isPropertyAssignment(item) && propertyName(item.name) === 'props')
          if (declaration) runtimeProps(declaration.initializer)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
  return [...props.values()]
}

export function componentDependencies(source) {
  const { descriptor, errors } = parse(source)
  if (errors.length) throw new Error(String(errors[0].message || errors[0]))
  const dependencies = new Set()
  for (const script of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
    const file = scriptFile(script)
    rejectDynamicImports(file)
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      const name = statement.moduleSpecifier.text
      allowedModule(name)
      if (componentModule.test(name) && !statement.importClause?.isTypeOnly) dependencies.add(name.slice(4))
    }
  }
  return [...dependencies]
}

export function formComponentDependencies(rules) {
  if (typeof rules === 'string') rules = rules.trim() ? JSON.parse(rules) : []
  if (rules == null) return []
  if (!Array.isArray(rules)) throw new Error('FormCreate 规则必须是数组')
  const dependencies = new Set()
  function visit(list) {
    for (const rule of list || []) {
      if (!rule || typeof rule !== 'object') continue
      const match = typeof rule.type === 'string' && /^lc-([A-Za-z][A-Za-z0-9_-]*)$/.exec(rule.type)
      if (match) dependencies.add(match[1])
      if (Array.isArray(rule.children)) visit(rule.children)
      for (const control of Array.isArray(rule.control) ? rule.control : []) if (Array.isArray(control.rule)) visit(control.rule)
    }
  }
  visit(rules)
  return [...dependencies]
}
