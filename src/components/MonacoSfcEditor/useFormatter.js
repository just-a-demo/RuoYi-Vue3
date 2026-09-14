import prettier from 'prettier/standalone'
import htmlPlugin from 'prettier/plugins/html'
import babelPlugin from 'prettier/plugins/babel'
import typescriptPlugin from 'prettier/plugins/typescript'
import estreePlugin from 'prettier/plugins/estree'
import postcssPlugin from 'prettier/plugins/postcss'
import { getSfcBlocks } from './useVueSfcModels'

export function registerSfcFormatter(monaco, onError) {
  return monaco.languages.registerDocumentFormattingEditProvider('vue', {
    async provideDocumentFormattingEdits(model, options, token) {
      const original = model.getValue()
      const version = model.getVersionId()
      try {
        let formatted = await prettier.format(original, {
          parser: 'vue',
          plugins: [htmlPlugin, babelPlugin, typescriptPlugin, estreePlugin, postcssPlugin],
          tabWidth: options.tabSize || 2,
          useTabs: !options.insertSpaces,
          singleQuote: true,
          semi: false,
          embeddedLanguageFormatting: 'off'
        })
        const { scripts, styles } = getSfcBlocks(formatted)
        for (const block of [...scripts, ...styles].sort((a, b) => b.contentStart - a.contentStart)) {
          if (block.lang === 'sass') continue
          const parser = block.name === 'script' ? 'typescript' : block.lang || 'css'
          const content = await prettier.format(block.content, { parser, plugins: [typescriptPlugin, estreePlugin, postcssPlugin], tabWidth: options.tabSize || 2, singleQuote: true, semi: false })
          formatted = formatted.slice(0, block.contentStart) + '\n' + content + formatted.slice(block.contentStart + block.content.length)
        }
        if (token.isCancellationRequested || model.isDisposed() || model.getVersionId() !== version || formatted === original) return []
        return [{ range: model.getFullModelRange(), text: formatted }]
      } catch (error) {
        onError(error)
        return []
      }
    }
  })
}
