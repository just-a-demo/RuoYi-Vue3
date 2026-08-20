import { cp, mkdir, copyFile, rm, writeFile, readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve, join, relative, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'public/vendor')
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

// 1) 运行时 / 编译器 / shims / typescript（本地化，替代 cdn.jsdelivr.net）
const files = [
  ['node_modules/vue/dist/vue.runtime.esm-browser.js', 'vue/vue.runtime.esm-browser.js'],
  ['node_modules/vue/dist/vue.runtime.esm-browser.prod.js', 'vue/vue.runtime.esm-browser.prod.js'],
  ['node_modules/@vue/server-renderer/dist/server-renderer.esm-browser.js', 'vue/server-renderer.esm-browser.js'],
  ['node_modules/@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js', 'vue/compiler-sfc.esm-browser.js'],
  ['node_modules/es-module-shims/dist/es-module-shims.wasm.js', 'es-module-shims/es-module-shims.wasm.js'],
  ['node_modules/typescript/lib/typescript.js', 'typescript/typescript.js'],
]
for (const [from, to] of files) {
  const target = resolve(out, to)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(resolve(root, from), target)
}
await cp(resolve(root, 'node_modules/typescript/lib'), resolve(out, 'typescript/lib'), { recursive: true })

// 2) 类型定义本地镜像（替代 Monaco/Volar 自动类型获取走的 unpkg.com）
// 从入口包的 types 入口出发，仅沿相对导入图收集裸依赖，避免子入口拖入无关大包（如 typescript/postcss）。
const typesOut = resolve(out, 'types')
const rootPackages = ['vue']
const visited = new Set()

const toPosix = p => p.split('\\').join('/')
const stripDot = p => toPosix(p).replace(/^\.\//, '')
const pkgNameOf = s => (s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0])
// 类型声明扩展名：.d.ts / .d.mts / .d.cts（现代包用 exports 的 import 条件指向 .d.mts）
const isDts = name => /\.d\.[mc]?ts$/.test(name)

// 复制包内全部 .d.ts/.d.mts/.d.cts，保证 TS 解析时不缺文件
async function collectDtsFiles(pkgDir) {
  const result = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        await walk(join(dir, entry.name))
      } else if (isDts(entry.name)) {
        result.push(posix.normalize(toPosix(relative(pkgDir, join(dir, entry.name)))))
      }
    }
  }
  await walk(pkgDir)
  return result
}

// 从 package.json 解析类型入口（types/typings，或 exports 的 types 条件）
function findTypesInExports(v) {
  if (!v) return undefined
  if (typeof v === 'string') return isDts(v) ? v : undefined
  if (v.types) return findTypesInExports(v.types)
  for (const k of ['import', 'require', 'node', 'default']) {
    const r = findTypesInExports(v[k])
    if (r) return r
  }
  return undefined
}
function resolveTypesEntry(pkgDir, pkgJson) {
  const candidates = [pkgJson.types, pkgJson.typings]
  if (pkgJson.exports) candidates.push(findTypesInExports(pkgJson.exports['.'] ?? pkgJson.exports))
  candidates.push('index.d.ts')
  for (const c of candidates) {
    if (!c) continue
    const rel = stripDot(c)
    if (existsSync(join(pkgDir, rel))) return posix.normalize(rel)
  }
  return undefined
}

// 解析相对导入到实际存在的 .d.ts 文件
function resolveRelative(pkgDir, fromRel, spec) {
  const baseRel = posix.normalize(posix.join(posix.dirname(fromRel), spec))
  const cands = [
    baseRel,
    baseRel + '.d.ts', baseRel + '.d.mts', baseRel + '.d.cts',
    baseRel.replace(/\.m?js$/, '.d.ts'), baseRel.replace(/\.m?js$/, '.d.mts'),
    posix.join(baseRel, 'index.d.ts'),
  ]
  for (const c of cands) if (isDts(c) && existsSync(join(pkgDir, c))) return c
  return undefined
}

// 逐行解析，仅匹配真实的 import/export ... from '...' 与 import('...')，避免注释/字符串误报
function parseSpecifiers(code) {
  const bare = new Set()
  const rel = new Set()
  const add = s => { if (s.startsWith('.')) rel.add(s); else if (!s.startsWith('/')) bare.add(s) }
  const fromRe = /^\s*(?:import|export)\b.*?\bfrom\s*['"]([^'"]+)['"]/
  const sideRe = /^\s*import\s*['"]([^'"]+)['"]/
  const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const line of code.split(/\r?\n/)) {
    const f = fromRe.exec(line) || sideRe.exec(line)
    if (f) add(f[1])
    let d
    while ((d = dynRe.exec(line))) add(d[1])
  }
  return { bare, rel }
}

async function mirrorPackage(pkgName) {
  if (visited.has(pkgName)) return
  visited.add(pkgName)
  const pkgDir = resolve(root, 'node_modules', pkgName)
  if (!existsSync(pkgDir) || !existsSync(join(pkgDir, 'package.json'))) return
  const pkgJson = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'))
  const destDir = resolve(typesOut, pkgName)
  await mkdir(destDir, { recursive: true })
  await copyFile(join(pkgDir, 'package.json'), join(destDir, 'package.json'))

  const dtsFiles = await collectDtsFiles(pkgDir)
  const metaFiles = [{ path: '/package.json', type: 'file' }]
  for (const rel of dtsFiles) {
    const target = join(destDir, rel)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(pkgDir, rel), target)
    metaFiles.push({ path: '/' + rel, type: 'file' })
  }

  // unpkg 兼容响应：目录树（meta）与最新版本（latest）
  await writeFile(join(destDir, '__meta.json'), JSON.stringify({ package: pkgName, version: pkgJson.version, files: metaFiles }))
  await writeFile(join(destDir, '__latest.json'), JSON.stringify({ version: pkgJson.version }))

  // 依赖递归：仅沿 types 入口的相对导入图收集裸依赖
  const deps = new Set()
  const entry = resolveTypesEntry(pkgDir, pkgJson)
  if (entry) {
    const seen = new Set()
    const queue = [entry]
    while (queue.length) {
      const fileRel = queue.shift()
      if (seen.has(fileRel)) continue
      seen.add(fileRel)
      const abs = join(pkgDir, fileRel)
      if (!existsSync(abs)) continue
      const { bare, rel } = parseSpecifiers(await readFile(abs, 'utf8'))
      for (const b of bare) deps.add(pkgNameOf(b))
      for (const r of rel) {
        const resolved = resolveRelative(pkgDir, fileRel, r)
        if (resolved) queue.push(resolved)
      }
    }
  }

  for (const dep of deps) await mirrorPackage(dep)
}

for (const p of rootPackages) await mirrorPackage(p)

// TypeScript 默认库(lib.*.d.ts)也走 ATA(/node_modules/typescript/lib/...)，而非通过 .d.ts 导入发现，需单独镜像。
async function mirrorTypescriptLibs() {
  const pkgName = 'typescript'
  if (visited.has(pkgName)) return
  visited.add(pkgName)
  const pkgDir = resolve(root, 'node_modules', pkgName)
  if (!existsSync(pkgDir)) return
  const pkgJson = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'))
  const destDir = resolve(typesOut, pkgName)
  await mkdir(join(destDir, 'lib'), { recursive: true })
  await copyFile(join(pkgDir, 'package.json'), join(destDir, 'package.json'))
  const metaFiles = [{ path: '/package.json', type: 'file' }]
  const libDir = join(pkgDir, 'lib')
  for (const name of await readdir(libDir)) {
    if (name.startsWith('lib') && name.endsWith('.d.ts')) {
      await copyFile(join(libDir, name), join(destDir, 'lib', name))
      metaFiles.push({ path: '/lib/' + name, type: 'file' })
    }
  }
  await writeFile(join(destDir, '__meta.json'), JSON.stringify({ package: pkgName, version: pkgJson.version, files: metaFiles }))
  await writeFile(join(destDir, '__latest.json'), JSON.stringify({ version: pkgJson.version }))
}
await mirrorTypescriptLibs()

console.log('[prepare-local-repl] types mirror:', [...visited].join(', '))
