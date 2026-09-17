import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { FORMAT, validatePackage, prepareImport } from './component-package.mjs'
const make = (key, source = '<template><div /></template>') => ({ componentKey: key, componentName: key, sourceCode: source, publishTargets: ['vue'], formRules: [], formOptions: {} })
const a = make('A', `<script setup lang="ts">
// @lc/B must not change in a comment
import B from '@lc/B'
import { ref } from 'vue'
const label = '@lc/B'
</script><template><B />{{ label }}</template>`)
a.formRules = [{ type: 'input', children: [{ type: 'lc-B' }], control: [{ rule: [{ type: 'lc-B' }] }] }]
const b = make('B')
const pkg = { format: FORMAT, version: 1, roots: ['A'], components: [a, b] }
const normalized = validatePackage(pkg)
assert.deepEqual(normalized.components[0].dependencies, ['B'])
assert.deepEqual(normalized.components[0].formDependencies, ['B'])
assert.deepEqual(normalized.components[0].externalImports, ['vue'])
const renamed = prepareImport(pkg, [
  { sourceKey: 'A', action: 'rename', targetKey: 'B' },
  { sourceKey: 'B', action: 'rename', targetKey: 'A' },
])
assert.deepEqual(renamed.roots, ['B'])
assert.match(renamed.components[0].sourceCode, /import B from "@lc\/A"/)
assert.match(renamed.components[0].sourceCode, /\/\/ @lc\/B must not change/)
assert.match(renamed.components[0].sourceCode, /const label = '@lc\/B'/)
assert.equal(renamed.components[0].formRules[0].children[0].type, 'lc-A')
assert.equal(renamed.components[0].formRules[0].control[0].rule[0].type, 'lc-A')
assert.equal(a.formRules[0].children[0].type, 'lc-B', 'input must not be mutated')
const rejects = [
  () => validatePackage({ ...pkg, version: 2 }),
  () => validatePackage({ ...pkg, components: [a] }),
  () => validatePackage({ ...pkg, components: [a, b, make('b')] }),
  () => validatePackage({ ...pkg, roots: ['missing'] }),
  () => validatePackage({ ...pkg, components: [make('Bad-Key')] }),
  () => validatePackage({ ...pkg, components: [make('A', `<script setup>import('@lc/B')</script>`), b] }),
  () => validatePackage({ ...pkg, components: [make('A', `<script src="./a.js"></script><template><div /></template>`)] }),
  () => validatePackage({ ...pkg, components: [{ ...a, formOptions: '{"__proto__":{"x":1}}' }, b] }),
  () => prepareImport(pkg, []),
  () => prepareImport(pkg, [{ sourceKey: 'A', action: 'rename', targetKey: 'X' }, { sourceKey: 'B', action: 'rename', targetKey: 'x' }]),
  () => prepareImport(pkg, [{ sourceKey: 'A', action: 'overwrite', targetKey: 'X' }, { sourceKey: 'B', action: 'create', targetKey: 'B' }]),
  () => validatePackage({ ...pkg, components: [{ ...a, sourceCode: '字'.repeat(400000) }, b] }),
]
for (const reject of rejects) assert.throws(reject)
const bothScripts = make('A', `<script lang="ts">export { default as B } from '@lc/B'; export default {}</script><script setup lang="ts">import type { P } from '@lc/B'; type T = import('@lc/B').P;</script><template><div /></template>`)
const both = prepareImport({ ...pkg, components: [bothScripts, b] }, [{ sourceKey: 'A', action: 'create', targetKey: 'A' }, { sourceKey: 'B', action: 'rename', targetKey: 'NewB' }])
assert.equal((both.components[0].sourceCode.match(/@lc\/NewB/g) || []).length, 3)
const cli = spawnSync(process.execPath, ['scripts/component-package-cli.mjs'], { input: JSON.stringify({ operation: 'package', package: pkg }), encoding: 'utf8' })
assert.equal(cli.status, 0, cli.stderr)
assert.equal(JSON.parse(cli.stdout).components.length, 2)
const unicodeSource = '<template><div>' + '中文组件😀'.repeat(12000) + '</div></template>'
const unicodeCli = spawnSync(process.execPath, ['scripts/component-package-cli.mjs'], { input: JSON.stringify({ operation: 'package', package: { ...pkg, components: [make('A', unicodeSource)] } }), encoding: 'utf8' })
assert.equal(unicodeCli.status, 0, unicodeCli.stderr)
assert.equal(JSON.parse(unicodeCli.stdout).components[0].sourceCode, unicodeSource, 'Streaming UTF-8 source was corrupted')
for (const name of ['index.vue', 'ComponentTransfer.vue']) {
  const filename = 'src/views/vueStudio/component/' + name
  const { descriptor, errors } = parse(readFileSync(filename, 'utf8'), { filename })
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: name })
  const template = compileTemplate({ id: name, source: descriptor.template.content, filename, compilerOptions: { bindingMetadata: script.bindings } })
  assert.deepEqual(template.errors, [])
}
console.log('PASS: package round-trip, closure, simultaneous rename, static/type/export imports, comments/text, nested FormCreate, external imports, invalid inputs, CLI and Vue SFC compilation')
