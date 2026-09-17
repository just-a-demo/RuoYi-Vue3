import { MAX_BYTES, normalizeComponent, prepareImport } from './component-package.mjs'
let input = ''
let inputBytes = 0
// Decode across stream chunks so a split Chinese/emoji character is not corrupted.
process.stdin.setEncoding('utf8')
try {
  for await (const chunk of process.stdin) {
    inputBytes += Buffer.byteLength(chunk)
    if (inputBytes > MAX_BYTES + 1024 * 1024) throw new Error('导入导出请求过大')
    input += chunk
  }
  const request = JSON.parse(input)
  let result
  if (request.operation === 'analyze') {
    if (!Array.isArray(request.components) || request.components.length > 100) throw new Error('一次最多分析100个组件')
    result = { components: request.components.map(item => normalizeComponent(item)) }
  } else if (request.operation === 'package') {
    result = prepareImport(request.package, request.choices)
  } else throw new Error('未知组件包操作')
  process.stdout.write(JSON.stringify(result))
} catch (error) {
  process.stdout.write(JSON.stringify({ error: String(error.message || error).slice(0, 2000) }))
  process.exitCode = 1
}
