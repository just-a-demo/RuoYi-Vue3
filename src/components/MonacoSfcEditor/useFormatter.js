import prettier from 'prettier/standalone'
import htmlPlugin from 'prettier/plugins/html'
import babelPlugin from 'prettier/plugins/babel'
import typescriptPlugin from 'prettier/plugins/typescript'
import estreePlugin from 'prettier/plugins/estree'
import postcssPlugin from 'prettier/plugins/postcss'

export function registerSfcFormatter(monaco, onError) {
  return monaco.languages.registerDocumentFormattingEditProvider('vue', {
    async provideDocumentFormattingEdits(model, options, token) {
      const original = model.getValue()
      const version = model.getVersionId()
      try {
        const formatted = await prettier.format(original, {
          parser: 'vue',
          plugins: [htmlPlugin, babelPlugin, typescriptPlugin, estreePlugin, postcssPlugin],
          tabWidth: options.tabSize || 2,
          useTabs: !options.insertSpaces,
          singleQuote: true,
          semi: false
        })
        if (token.isCancellationRequested || model.isDisposed() || model.getVersionId() !== version || formatted === original) return []
        return [{ range: model.getFullModelRange(), text: formatted }]
      } catch (error) {
        onError(error)
        return []
      }
    }
  })
}
