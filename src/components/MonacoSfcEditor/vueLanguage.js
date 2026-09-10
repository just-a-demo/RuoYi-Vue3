let references = 0
let languageDisposables = []

export function acquireVueLanguage(monaco) {
  references += 1
  if (references === 1) {
    // Monaco 0.56 register() returns void. Register the language identifier once.
    if (!monaco.languages.getLanguages().some(item => item.id === 'vue')) {
      monaco.languages.register({ id: 'vue', extensions: ['.vue'], aliases: ['Vue', 'vue'] })
    }
    languageDisposables = [
      monaco.languages.setLanguageConfiguration('vue', {
        comments: { blockComment: ['<!--', '-->'] },
        brackets: [['<', '>'], ['{', '}'], ['[', ']'], ['(', ')']],
        autoClosingPairs: [
          { open: '<', close: '>' }, { open: '{', close: '}' }, { open: '[', close: ']' },
          { open: '(', close: ')' }, { open: '"', close: '"' }, { open: "'", close: "'" },
          { open: '`', close: '`' }
        ],
        surroundingPairs: [
          { open: '"', close: '"' }, { open: "'", close: "'" }, { open: '`', close: '`' },
          { open: '(', close: ')' }, { open: '[', close: ']' }, { open: '{', close: '}' }
        ],
        folding: { markers: { start: /^\s*<!--\s*#?region\b.*-->/, end: /^\s*<!--\s*#?endregion\b.*-->/ } }
      }),
      monaco.languages.setMonarchTokensProvider('vue', {
        defaultToken: '',
        tokenPostfix: '.vue',
        ignoreCase: true,
        tokenizer: {
          root: [
            [/(<)(template)(\s*)(>)/, ['delimiter', 'tag', '', { token: 'delimiter', next: '@template' }]],
            [/(<)(script)(\s+setup)?(\s+lang=(?:"ts"|'ts'))?(\s*)(>)/, ['delimiter', 'tag', 'attribute.name', 'attribute.value', '', { token: 'delimiter', next: '@script' }]],
            [/(<)(style)(\s+scoped)?([^>]*)(>)/, ['delimiter', 'tag', 'attribute.name', 'attribute.value', { token: 'delimiter', next: '@style' }]],
            [/<!--/, 'comment', '@comment'],
            [/<\/?[\w-]+/, 'tag'], [/\s+[\w-]+(?==)/, 'attribute.name'], [/=/, 'delimiter'],
            [/"[^"]*"|'[^']*'/, 'attribute.value'], [/[^<]+/, '']
          ],
          template: [
            [/<\/template\s*>/, { token: 'delimiter', next: '@pop' }],
            [/{{/, { token: 'delimiter.bracket', next: '@interpolation' }],
            [/<!--/, 'comment', '@comment'],
            [/<\/?[\w.-]+/, 'tag'], [/\s+(?:v-[\w:-]+|[:@#][\w:-]+)(?==|\s|>)/, 'attribute.name'],
            [/\s+[\w-]+(?==)/, 'attribute.name'], [/=/, 'delimiter'], [/"[^"]*"|'[^']*'/, 'attribute.value']
          ],
          interpolation: [[/}}/, { token: 'delimiter.bracket', next: '@pop' }], { include: '@js' }],
          script: [[/<\/script\s*>/, { token: 'delimiter', next: '@pop' }], { include: '@js' }],
          style: [
            [/<\/style\s*>/, { token: 'delimiter', next: '@pop' }],
            [/\/\*/, 'comment', '@cssComment'], [/[.#]?[\w-]+(?=\s*\{)/, 'tag'],
            [/[\w-]+(?=\s*:)/, 'attribute.name'], [/#[0-9a-f]{3,8}\b/i, 'number.hex'], [/\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?/, 'number']
          ],
          js: [
            [/\/\*/, 'comment', '@jsComment'], [/\/\/.*$/, 'comment'],
            [/\b(?:const|let|var|function|return|if|else|for|while|import|from|export|default|interface|type|extends|as|new|true|false|null|undefined|async|await)\b/, 'keyword'],
            [/\b(?:defineProps|defineEmits|defineExpose|withDefaults|ref|reactive|computed|watch)\b/, 'predefined'],
            [/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/, 'string'],
            [/\b\d+(?:\.\d+)?\b/, 'number'], [/[{}()[\]]/, '@brackets'], [/[A-Za-z_$][\w$]*/, 'identifier']
          ],
          comment: [[/-->/, 'comment', '@pop'], [/./, 'comment']],
          jsComment: [[/\*\//, 'comment', '@pop'], [/./, 'comment']],
          cssComment: [[/\*\//, 'comment', '@pop'], [/./, 'comment']]
        }
      })
    ]
  }

  let released = false
  return () => {
    if (released) return
    released = true
    references -= 1
    if (references === 0) {
      languageDisposables.forEach(item => item.dispose())
      languageDisposables = []
    }
  }
}
