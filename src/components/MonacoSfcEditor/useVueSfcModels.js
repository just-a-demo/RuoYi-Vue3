import { parse } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js'

export function getSfcBlocks(source) {
  const { descriptor } = parse(source, { filename: 'Component.vue' })
  const convert = (block, name) => block && ({
    name, content: block.content, contentStart: block.loc.start.offset,
    startLine: block.loc.start.line, lang: block.lang,
    attributes: block.attrs, loc: block.loc
  })
  return {
    template: convert(descriptor.template, 'template'),
    script: convert(descriptor.scriptSetup || descriptor.script, 'script'),
    style: convert(descriptor.styles[0], 'style')
  }
}

export function getScopeAtOffset(source, offset) {
  const blocks = getSfcBlocks(source)
  return Object.keys(blocks).find(scope => {
    const block = blocks[scope]
    return block && offset >= block.contentStart && offset <= block.contentStart + block.content.length
  }) || 'global'
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
    const definitions = [['template', 'html', 'html'], ['script', 'typescript', 'ts'], ['style', 'css', 'css']]
    for (const [scope, language, extension] of definitions) {
      const value = virtualSource(source, blocks[scope], scope === 'script')
      let model = models.get(scope)
      if (!model) {
        model = monaco.editor.createModel(value, 'plaintext', monaco.Uri.parse(`inmemory://vue-studio/${safeKey}.${scope}.${extension}`))
        models.set(scope, model)
      } else if (model.getValue() !== value) model.setValue(value)
    }
    return { blocks, models }
  }
  return { update, dispose() { models.forEach(model => model.dispose()); models.clear() } }
}
