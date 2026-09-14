import { compilePreview, componentDependencies, extractPropSuggestions, formComponentDependencies, projectImports } from '../src/views/vueStudio/component/previewCompiler.js'
import { bundleStudioImports } from './bundle-studio-imports.mjs'
let input = ''
try {
  for await (const chunk of process.stdin) {
    input += chunk
    if (Buffer.byteLength(input) > 3 * 1048576) throw new Error('编译输入不能超过3MB')
  }
  const request = input.trimStart().startsWith('{') ? JSON.parse(input) : { source: input }
  if (typeof request.source !== 'string') throw new Error('源码必须是字符串')
  await compilePreview(request.source, 'publish-check')
  const moduleBundle = await bundleStudioImports(projectImports(request.source))
  process.stdout.write(JSON.stringify({ dependencies: componentDependencies(request.source), formDependencies: formComponentDependencies(request.formRules), props: extractPropSuggestions(request.source), moduleBundle }))
} catch (error) { process.stdout.write(JSON.stringify({ error: String(error.message).slice(0, 2000) })); process.exitCode = 1 }
