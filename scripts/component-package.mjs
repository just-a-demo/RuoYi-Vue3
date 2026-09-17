// Pure package validation and reference rewriting. Never evaluates component code.
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'

export const FORMAT = 'ruoyi-component-package'
export const MAX_BYTES = 20 * 1024 * 1024
const MAX_COMPONENTS = 100
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,99}$/
const lower = key => key.toLowerCase()
const bytes = text => Buffer.byteLength(text, 'utf8')
function check(ok, message) { if (!ok) throw new Error(message) }
function text(value, name, max, required = false) {
  check(typeof value === 'string' && value.length <= max && (!required || value.trim()), `${name}格式或长度无效`)
  return value
}
function safeJson(value, depth = 0) {
  check(depth <= 64, 'JSON 嵌套不能超过64层')
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    check(!['__proto__', 'prototype', 'constructor'].includes(key), 'JSON 含不安全属性：' + key)
    safeJson(child, depth + 1)
  }
}
function jsonField(value, isArray, name) {
  if (typeof value === 'string') { check(bytes(value) <= 1048576, name + '不能超过1MB'); value = JSON.parse(value) }
  check(value !== null && typeof value === 'object' && Array.isArray(value) === isArray, name + '格式错误')
  safeJson(value)
  check(bytes(JSON.stringify(value)) <= 1048576, name + '不能超过1MB')
  return structuredClone(value)
}
function scriptReferences(source, mapping) {
  const { descriptor, errors } = parse(source)
  check(!errors.length, '无法分析组件依赖：' + (errors[0]?.message || errors[0] || ''))
  check(![descriptor.template, descriptor.script, descriptor.scriptSetup, ...descriptor.styles].some(block => block?.src), '组件包不支持外置 src 区块，请先将内容合并到组件')
  const dependencies = new Set(), externalImports = new Set(), edits = []
  for (const block of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
    check(!block.lang || ['js', 'ts'].includes(block.lang), '仅支持 JS/TS 脚本')
    const file = ts.createSourceFile('Component.ts', block.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    check(!file.parseDiagnostics.length, '脚本语法错误，无法可靠分析或重命名依赖')
    function moduleReference(node) {
      if (!node || !ts.isStringLiteralLike(node)) return
      const name = node.text
      if (!name.startsWith('@lc/')) { externalImports.add(name); return }
      const key = name.slice(4)
      check(KEY.test(key), '依赖组件标识无效：' + name)
      dependencies.add(key)
      if (mapping) {
        const target = mapping.get(lower(key))
        check(target, '组件包缺少依赖：' + key)
        // Replace only module-specifier literals, not comments, UI text or variables.
        edits.push({ start: block.loc.start.offset + node.getStart(file), end: block.loc.start.offset + node.end, value: JSON.stringify('@lc/' + target) })
      }
    }
    function visit(node) {
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(file) === 'require')) {
        throw new Error('组件包不支持动态 import 或 require，请使用静态导入')
      }
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) moduleReference(node.moduleSpecifier)
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) moduleReference(node.argument.literal)
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end)
  return { source, dependencies: [...dependencies], externalImports: [...externalImports] }
}
function formReferences(rules, mapping) {
  const dependencies = new Set()
  function visit(list) {
    for (const rule of list) {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) continue
      if (typeof rule.type === 'string' && rule.type.startsWith('lc-')) {
        const key = rule.type.slice(3)
        check(KEY.test(key), 'FormCreate 依赖标识无效：' + rule.type)
        dependencies.add(key)
        if (mapping) { check(mapping.has(lower(key)), '组件包缺少表单依赖：' + key); rule.type = 'lc-' + mapping.get(lower(key)) }
      }
      if (Array.isArray(rule.children)) visit(rule.children)
      for (const control of Array.isArray(rule.control) ? rule.control : []) if (Array.isArray(control?.rule)) visit(control.rule)
    }
  }
  visit(rules)
  return [...dependencies]
}
export function normalizeComponent(input, mapping) {
  check(input && typeof input === 'object' && !Array.isArray(input), '组件内容必须是对象')
  const componentKey = text(input.componentKey, '组件标识', 100, true)
  check(KEY.test(componentKey), '组件标识须以字母开头，仅包含字母、数字、下划线')
  const sourceCode = text(input.sourceCode, '组件源码', 1048576)
  check(bytes(sourceCode) <= 1048576, '组件源码不能超过1MB')
  const formRules = jsonField(input.formRules ?? [], true, 'FormCreate规则')
  const formOptions = jsonField(input.formOptions ?? {}, false, 'FormCreate配置')
  const targets = typeof input.publishTargets === 'string' ? JSON.parse(input.publishTargets) : input.publishTargets
  check(Array.isArray(targets) && targets.includes('vue') && targets.every(value => ['vue', 'formCreate'].includes(value)), '发布用途无效，必须包含 vue')
  check(['0', '1'].includes(input.status ?? '0'), '组件状态无效')
  const scripts = scriptReferences(sourceCode, mapping)
  const formDependencies = formReferences(formRules, mapping)
  return {
    componentKey: mapping?.get(lower(componentKey)) || componentKey,
    componentName: text(input.componentName, '组件名称', 100, true),
    description: text(input.description ?? '', '说明', 500),
    usageScenarios: text(input.usageScenarios ?? '', '可用场景', 500),
    sourceCode: scripts.source, formRules, formOptions,
    publishTargets: [...new Set(targets)], status: input.status ?? '0',
    dependencies: scripts.dependencies, formDependencies, externalImports: scripts.externalImports,
  }
}
export function validatePackage(pkg) {
  check(pkg?.format === FORMAT && pkg.version === 1, '不是受支持的组件包（format/version 不匹配）')
  check(bytes(JSON.stringify(pkg)) <= MAX_BYTES, '组件包不能超过20MB')
  check(Array.isArray(pkg.components) && pkg.components.length > 0 && pkg.components.length <= MAX_COMPONENTS, '组件包必须包含1至100个组件')
  const components = pkg.components.map(item => normalizeComponent(item))
  const byKey = new Map()
  for (const item of components) { check(!byKey.has(lower(item.componentKey)), '组件包内标识重复：' + item.componentKey); byKey.set(lower(item.componentKey), item) }
  check(Array.isArray(pkg.roots) && pkg.roots.length > 0 && pkg.roots.every(key => typeof key === 'string' && byKey.has(lower(key))), '组件包根组件无效')
  for (const item of components) for (const dependency of [...item.dependencies, ...item.formDependencies]) {
    check(byKey.has(lower(dependency)), `${item.componentKey} 缺少依赖组件：${dependency}`)
  }
  return { format: FORMAT, version: 1, roots: [...new Set(pkg.roots.map(key => byKey.get(lower(key)).componentKey))], components }
}
export function prepareImport(pkg, choices) {
  const valid = validatePackage(pkg)
  if (choices == null) return valid
  check(Array.isArray(choices) && choices.length === valid.components.length, '请为每个组件选择导入方式')
  const sourceKeys = new Set(valid.components.map(item => lower(item.componentKey)))
  const mapping = new Map(), targetKeys = new Set(), plan = new Map()
  for (const choice of choices) {
    check(typeof choice?.sourceKey === 'string' && sourceKeys.has(lower(choice.sourceKey)) && !plan.has(lower(choice.sourceKey)), '导入方案的源标识无效或重复')
    check(['create', 'overwrite', 'rename'].includes(choice.action), '请选择新增、覆盖或重命名')
    check(typeof choice.targetKey === 'string' && KEY.test(choice.targetKey), '目标标识格式无效')
    if (choice.action !== 'rename') check(lower(choice.targetKey) === lower(choice.sourceKey), '只有重命名方式可以更改标识')
    check(!targetKeys.has(lower(choice.targetKey)), '多个组件使用了相同目标标识：' + choice.targetKey)
    targetKeys.add(lower(choice.targetKey)); mapping.set(lower(choice.sourceKey), choice.targetKey); plan.set(lower(choice.sourceKey), choice)
  }
  const components = valid.components.map(item => {
    const choice = plan.get(lower(item.componentKey))
    return { ...normalizeComponent(item, mapping), sourceKey: item.componentKey, action: choice.action, existingId: choice.existingId ?? null, expectedVersion: choice.expectedVersion ?? null }
  })
  // Re-analyse renamed sources/rules to ensure closure is preserved after simultaneous rename.
  const result = validatePackage({ ...valid, roots: valid.roots.map(key => mapping.get(lower(key))), components })
  return { ...result, components: result.components.map((item, index) => ({ ...item, sourceKey: components[index].sourceKey, action: components[index].action, existingId: components[index].existingId, expectedVersion: components[index].expectedVersion })) }
}
