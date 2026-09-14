import { parse } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'

export function getSfcBlocks(source) {
  const { descriptor } = parse(source, { filename: 'Component.vue' })
  const convert = (block, name, index = 0) => block && ({
    name, index, content: block.content, contentStart: block.loc.start.offset,
    startLine: block.loc.start.line, lang: block.lang,
    attributes: block.attrs, loc: block.loc
  })
  const scripts = [descriptor.script, descriptor.scriptSetup].filter(Boolean).sort((a, b) => a.loc.start.offset - b.loc.start.offset).map((block, index) => convert(block, 'script', index))
  const styles = descriptor.styles.map((block, index) => convert(block, 'style', index))
  return { template: convert(descriptor.template, 'template'), script: scripts[0], style: styles[0], scripts, styles }
}

export function getBlockAtOffset(source, offset) {
  const blocks = getSfcBlocks(source)
  return [blocks.template, ...blocks.scripts, ...blocks.styles].filter(Boolean).find(block =>
    offset >= block.contentStart && offset <= block.contentStart + block.content.length)
}

export function getScopeAtOffset(source, offset) {
  return getBlockAtOffset(source, offset)?.name || 'global'
}

export function blockLanguage(block) {
  if (block?.name === 'script') return 'typescript'
  if (block?.name === 'style') return ['less', 'scss', 'sass'].includes(block.lang) ? block.lang : 'css'
  return 'html'
}

export function setBlockLanguage(source, name, language, index = 0) {
  const allowed = name === 'script' ? ['js', 'ts'] : ['css', 'less', 'scss', 'sass']
  if (!allowed.includes(language)) throw new Error('不支持的区块语言')
  const blocks = getSfcBlocks(source)
  const block = (name === 'script' ? blocks.scripts : blocks.styles)[index]
  const attribute = language === 'js' || language === 'css' ? '' : ` lang="${language}"`
  if (!block) return `${source.trimEnd()}\n\n<${name}${name === 'script' ? ' setup' : ' scoped'}${attribute}>\n\n</${name}>\n`
  const prefix = source.slice(0, block.contentStart)
  const start = prefix.lastIndexOf('<' + name)
  const tag = prefix.slice(start).replace(/\s+lang\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '')
  return source.slice(0, start) + tag.replace(/>$/, attribute + '>') + source.slice(block.contentStart)
}

// Preserve columns and offsets, including same-line blocks and Windows CRLF.
export function virtualSource(source, block, moduleScope = false) {
  if (!block) return ''
  return source.slice(0, block.contentStart).replace(/[^\r\n]/g, ' ') + block.content + (moduleScope ? '\nexport {}\n' : '')
}

export function createVirtualModels(monaco, key) {
  const models = new Map()
  const safeKey = String(key).replace(/[^\w-]/g, '-')
  function update(source) {
    const blocks = getSfcBlocks(source)
    const entries = [blocks.template, ...blocks.scripts, ...blocks.styles].filter(Boolean).map(block => {
      const scope = block.index ? `${block.name}:${block.index}` : block.name
      const language = blockLanguage(block)
      const extension = { javascript: 'js', typescript: 'ts' }[language] || language
      const value = virtualSource(source, block, block.name === 'script')
      const uri = monaco.Uri.parse(`inmemory://vue-studio/${safeKey}.${scope.replace(':', '-')}.${extension}`)
      let model = models.get(scope)
      if (model && model.uri.toString() !== uri.toString()) { model.dispose(); models.delete(scope); model = null }
      if (!model) {
        // Language services are explicitly managed so these mirrors do not register duplicate editor markers.
        model = monaco.editor.createModel(value, 'plaintext', uri)
        models.set(scope, model)
      } else if (model.getValue() !== value) model.setValue(value)
      return { block, model, language, scope }
    })
    for (const [scope, model] of models) if (!entries.some(entry => entry.scope === scope)) { model.dispose(); models.delete(scope) }
    return { blocks, models, entries }
  }
  return { update, dispose() { models.forEach(model => model.dispose()); models.clear() } }
}
