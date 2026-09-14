import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as Vue from 'vue'
import { compile as compileMonarch } from '../node_modules/monaco-editor/esm/vs/editor/standalone/common/monarch/monarchCompile.js'
import { MonarchTokenizer } from '../node_modules/monaco-editor/esm/vs/editor/standalone/common/monarch/monarchLexer.js'
import { vueTokens } from '../src/components/MonacoSfcEditor/vueLanguage.js'
import { blockLanguage, getBlockAtOffset, getSfcBlocks, setBlockLanguage } from '../src/components/MonacoSfcEditor/useVueSfcModels.js'
import { compilePreview, componentDependencies, extractPropSuggestions, formComponentDependencies, preprocessStyle } from '../src/views/vueStudio/component/previewCompiler.js'

const sfc = (script = '', styles = '') => `<template><div class="box">{{ props?.title }}</div></template><script setup>${script}</script>${styles}`

test('JS and TS factories use the provided runtime modules and component dependencies', async () => {
  for (const lang of ['js', 'ts']) {
    const source = `<template><div>{{ route.query.title }}</div></template><script lang="${lang}" setup>
      import { useRoute as getRoute } from 'vue-router'
      import { ElMessage } from 'element-plus'
      import formCreate from '@form-create/element-ui'
      import Child from '@lc/child'
      const route${lang === 'ts' ? ': ReturnType<typeof getRoute>' : ''} = getRoute()
      defineExpose({ route, ElMessage, formCreate, Child })
    </script>`
    const compiled = await compilePreview(source, lang)
    const route = { query: { title: 'route value' } }
    const component = new Function('Vue', 'Modules', 'RuntimeModules', compiled.componentFactory)(Vue, { child: { name: 'Child' } }, { 'vue-router': { useRoute: () => route }, 'element-plus': { ElMessage() {} }, '@form-create/element-ui': {} })
    assert.ok(component.setup)
    let exposed
    component.setup({}, { expose: value => { exposed = value } })
    assert.equal(exposed.route, route)
    assert.equal(exposed.Child.name, 'Child')
    assert.deepEqual(componentDependencies(source), ['child'])
  }
  await assert.rejects(compilePreview(sfc('import bad from "https://invalid.test/module.js"')), /只允许/)
  await assert.rejects(compilePreview(sfc('import("vue")')), /动态/)
})

test('CSS, Less, SCSS and indented Sass compile multiple blocks and apply scoped selectors', async () => {
  const source = sfc('const props = defineProps({ title: String })', `
    <style scoped>.box { padding: 2px }</style>
    <style lang="less" scoped>@color: red; .box { color: @color; .child { margin: 3px; } }</style>
    <style lang="scss" scoped>$color: blue; .box { background: $color; }</style>
    <style lang="sass" scoped>$size: 12px\n.box\n  font-size: $size</style>
    <style>.global { display: block }</style>`)
  const compiled = await compilePreview(source, 'all-styles')
  assert.match(compiled.css, /color: red/)
  assert.match(compiled.css, /background: blue/)
  assert.match(compiled.css, /font-size: 12px/)
  assert.match(compiled.css, /\.child\[data-v-/)
  assert.match(compiled.css, /\.global\s*\{/)
  assert.ok(compiled.scopeId)
  assert.match(await preprocessStyle('@use "sass:math"; .a { width: math.div(10px, 2) }', 'scss'), /5px/)
})

test('preprocessors cannot load files or networks, execute Less JavaScript, or load plugins', async () => {
  const fixtures = [
    ['css', '@import "https://example.com/style.css";'],
    ['less', '@import (inline) "./package.json";'],
    ['less', '@plugin "plugin.js";'],
    ['less', '.a { x: `1 + 2`; }'],
    ['less', '.a { x: data-uri("package.json"); }'],
    ['scss', '@use "./package.json";'],
    ['scss', '@use "https://example.com/file";'],
    ['scss', '@import "style";'],
    ['scss', '@use "sass:meta"; @include meta.load-css("./style");'],
    ['sass', '@forward "style"']
  ]
  for (const [language, source] of fixtures) await assert.rejects(preprocessStyle(source, language), /不允许|仅允许/, language)
})

test('style compilation errors retain the original block and source line', async () => {
  const source = '<template><div/></template>\n<style>\n.a {}\n</style>\n<style lang="scss">\n.box { color: $missing; }\n</style>'
  await assert.rejects(compilePreview(source), error => error.line === 6 && /第 2 个 style/.test(error.message))
})

test('AST props include JavaScript constructors, arrays and Options API defaults without executing code', () => {
  const props = extractPropSuggestions(sfc(`const props = defineProps({ title: { type: String, default: '名称' }, count: Number, enabled: Boolean, payload: { type: Object, default: () => ({ id: 1 }) } })`))
  assert.deepEqual(props.map(item => [item.key, item.type]), [['title', 'string'], ['count', 'number'], ['enabled', 'boolean'], ['payload', 'json']])
  assert.equal(props[0].default, '名称')
  assert.equal(props[3].value, '{"id":1}')
  const options = extractPropSuggestions('<template><div/></template><script>export default { props: { value: { type: String, required: true }, list: { type: Array, default() { return [1, 2] } }, unsafe: { default: () => { throw new Error("never execute") } } } }</script>')
  assert.equal(options[0].required, true)
  assert.deepEqual(options[1].default, [1, 2])
  assert.equal(options[2].default, undefined)
  assert.deepEqual(extractPropSuggestions(sfc('const props = defineProps(["first", "last"])')).map(item => item.key), ['first', 'last'])
})

test('AST props resolve local TS interfaces, unions, intersections and withDefaults', () => {
  const source = '<template><div/></template><script setup lang="ts">interface Base { title: string }; type Extra = { count?: number; active: boolean }; type Props = Base & Extra & { mode?: "one" | "two"; data: Record<string, unknown> }; withDefaults(defineProps<Props>(), { count: 0, active: false })</script>'
  const props = extractPropSuggestions(source)
  assert.deepEqual(props.map(item => [item.key, item.type]), [['title', 'string'], ['count', 'number'], ['active', 'boolean'], ['mode', 'string'], ['data', 'json']])
  assert.equal(props[1].default, 0)
  assert.equal(props[2].default, false)
  assert.ok(props.every(item => item.enabled === false))
})

test('FormCreate dependency discovery recurses children and conditional rules and accepts stored JSON', () => {
  const rules = [{ type: 'lc-first', children: [{ type: 'lc-child' }], control: [{ rule: [{ type: 'lc-first' }, { type: 'lc-conditional' }] }] }, { type: 'input' }]
  assert.deepEqual(formComponentDependencies(rules), ['first', 'child', 'conditional'])
  assert.deepEqual(formComponentDependencies(JSON.stringify(rules)), ['first', 'child', 'conditional'])
  assert.throws(() => formComponentDependencies('{}'), /数组/)
})

test('language selection changes only selected opening tags and preserves all code', () => {
  const source = '<template><div/></template>\r\n<script setup>\r\nconst x = 1\r\n</script>\r\n<style scoped>.first{color:red}</style>\r\n<style scoped lang="css">.second{color:blue}</style>'
  const updated = setBlockLanguage(setBlockLanguage(source, 'script', 'ts'), 'style', 'less', 1)
  assert.equal(getSfcBlocks(updated).scripts[0].lang, 'ts')
  assert.equal(getSfcBlocks(updated).styles[0].content, '.first{color:red}')
  assert.equal(getSfcBlocks(updated).styles[1].lang, 'less')
  assert.match(updated, /const x = 1\r\n/)
  assert.equal(blockLanguage(getBlockAtOffset(updated, updated.indexOf('.second'))), 'less')
  assert.equal(setBlockLanguage(updated, 'script', 'js').includes('lang="ts"'), false)
})

test('Monarch tokenizes opening and closing SFC tags consistently, with nested templates and reordered language attributes', () => {
  const languageService = { getLanguageIdByLanguageName: value => value, getLanguageIdByMimeType: () => null, isRegisteredLanguageId: () => false }
  const tokenizer = new MonarchTokenizer(languageService, {}, 'vue', compileMonarch('vue', vueTokens), { getValue: () => 10000, onDidChangeConfiguration: () => ({ dispose() {} }) })
  try {
    let state = tokenizer.getInitialState()
    const lines = ['<template>', '<template v-if="ok"><div/></template>', '</template>', '<script', 'lang="ts" setup>', 'const count: number = 1', '</script>', '<style scoped lang="less">', '@color: red;', '</style>']
    for (const line of lines) {
      const result = tokenizer.tokenize(line, true, state)
      state = result.endState
      if (/^<\/(template|script|style)>$/.test(line)) assert.equal(result.tokens.find(token => token.offset === 2)?.type, 'tag.vue', line)
      if (line.startsWith('const')) assert.equal(result.tokens[0].language, 'typescript')
      if (line.startsWith('@color')) assert.equal(result.tokens[0].language, 'less')
    }
    assert.equal(state.stack.state, 'root')
  } finally { tokenizer.dispose() }
})

test('Node publication check supports raw SFC and structured source/rules input', () => {
  const script = fileURLToPath(new URL('./check-component.mjs', import.meta.url))
  const source = sfc('const props = defineProps({ title: String })', '<style lang="less">@c: red; .box { color: @c; }</style>')
  for (const input of [source, JSON.stringify({ source, formRules: JSON.stringify([{ type: 'lc-sample' }]) })]) {
    const result = spawnSync(process.execPath, [script], { input, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr + result.stdout)
    const output = JSON.parse(result.stdout)
    assert.deepEqual(output.dependencies, [])
    assert.deepEqual(output.formDependencies, input === source ? [] : ['sample'])
    assert.equal(output.props[0].key, 'title')
  }
})
