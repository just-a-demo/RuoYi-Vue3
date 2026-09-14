let references = 0
let languageDisposables = []

export const vueTokens = {
  defaultToken: '', tokenPostfix: '.vue', ignoreCase: true,
  tokenizer: {
    root: [
      [/(<)(template)(?=[\s>]|$)/, ['delimiter', { token: 'tag', next: '@templateTag' }]],
      [/(<)(script)(?=[\s>]|$)/, ['delimiter', { token: 'tag', next: '@scriptTag.typescript' }]],
      [/(<)(style)(?=[\s>]|$)/, ['delimiter', { token: 'tag', next: '@styleTag.css' }]],
      [/<!--/, 'comment', '@comment'],
      [/(<\/)([\w.-]+)(\s*)(>)/, ['delimiter', 'tag', '', 'delimiter']],
      [/(<)([\w.-]+)/, ['delimiter', 'tag']],
      [/[^<]+/, '']
    ],
    attributes: [
      [/\s+/, ''],
      [/[\w:@#.-]+/, 'attribute.name'], [/=/, 'delimiter'],
      [/"[^"]*"|'[^']*'/, 'attribute.value']
    ],
    templateTag: [
      [/\/>/, 'delimiter', '@pop'],
      [/>/, { token: 'delimiter', switchTo: '@template' }],
      { include: '@attributes' }
    ],
    template: [
      [/(<\/)(template)(\s*)(>)/, ['delimiter', 'tag', '', { token: 'delimiter', next: '@pop' }]],
      [/(<)(template)(?=[\s>]|$)/, ['delimiter', { token: 'tag', next: '@templateTag' }]],
      [/{{/, { token: 'delimiter.bracket', next: '@interpolation' }],
      [/<!--/, 'comment', '@comment'],
      [/(<\/?)([\w.-]+)/, ['delimiter', { token: 'tag', next: '@htmlTag' }]],
      [/[^<{]+/, '']
    ],
    htmlTag: [[/\/?>/, 'delimiter', '@pop'], { include: '@attributes' }],
    interpolation: [[/}}/, { token: 'delimiter.bracket', next: '@pop' }], { include: '@js' }],
    scriptTag: [
      [/(lang)(\s*=\s*)("ts"|'ts')/, ['attribute.name', 'delimiter', { token: 'attribute.value', switchTo: '@scriptTag.typescript' }]],
      [/(lang)(\s*=\s*)("js"|'js')/, ['attribute.name', 'delimiter', { token: 'attribute.value', switchTo: '@scriptTag.typescript' }]],
      [/>/, { token: 'delimiter', next: '@scriptEmbedded', nextEmbedded: '$S2' }],
      [/(<\/)(script)(\s*)(>)/, ['delimiter', 'tag', '', { token: 'delimiter', next: '@pop' }]],
      { include: '@attributes' }
    ],
    scriptEmbedded: [[/<\/script\s*>/, { token: '@rematch', next: '@pop', nextEmbedded: '@pop' }], [/[^<]+/, '']],
    styleTag: [
      [/(lang)(\s*=\s*)("less"|'less')/, ['attribute.name', 'delimiter', { token: 'attribute.value', switchTo: '@styleTag.less' }]],
      [/(lang)(\s*=\s*)("(?:scss|sass)"|'(?:scss|sass)')/, ['attribute.name', 'delimiter', { token: 'attribute.value', switchTo: '@styleTag.scss' }]],
      [/(lang)(\s*=\s*)("css"|'css')/, ['attribute.name', 'delimiter', { token: 'attribute.value', switchTo: '@styleTag.css' }]],
      [/>/, { token: 'delimiter', next: '@styleEmbedded', nextEmbedded: '$S2' }],
      [/(<\/)(style)(\s*)(>)/, ['delimiter', 'tag', '', { token: 'delimiter', next: '@pop' }]],
      { include: '@attributes' }
    ],
    styleEmbedded: [[/<\/style\s*>/, { token: '@rematch', next: '@pop', nextEmbedded: '@pop' }], [/[^<]+/, '']],
    js: [
      [/\/\*/, 'comment', '@jsComment'], [/\/\/.*$/, 'comment'],
      [/\b(?:const|let|var|function|return|if|else|for|while|import|from|export|default|interface|type|extends|as|new|true|false|null|undefined|async|await)\b/, 'keyword'],
      [/\b(?:defineProps|defineEmits|defineExpose|withDefaults|ref|reactive|computed|watch)\b/, 'predefined'],
      [/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/, 'string'],
      [/\b\d+(?:\.\d+)?\b/, 'number'], [/[{}()[\]]/, '@brackets'], [/[A-Za-z_$][\w$]*/, 'identifier']
    ],
    comment: [[/-->/, 'comment', '@pop'], [/./, 'comment']],
    jsComment: [[/\*\//, 'comment', '@pop'], [/./, 'comment']]
  }
}

export function acquireVueLanguage(monaco) {
  references += 1
  if (references === 1) {
    if (!monaco.languages.getLanguages().some(item => item.id === 'vue')) {
      monaco.languages.register({ id: 'vue', extensions: ['.vue'], aliases: ['Vue', 'vue'] })
    }
    languageDisposables = [
      monaco.languages.setLanguageConfiguration('vue', {
        comments: { blockComment: ['<!--', '-->'] },
        brackets: [['<', '>'], ['{', '}'], ['[', ']'], ['(', ')']],
        autoClosingPairs: [
          { open: '<', close: '>' }, { open: '{', close: '}' }, { open: '[', close: ']' },
          { open: '(', close: ')' }, { open: '"', close: '"' }, { open: "'", close: "'" }, { open: '`', close: '`' }
        ],
        surroundingPairs: [
          { open: '"', close: '"' }, { open: "'", close: "'" }, { open: '`', close: '`' },
          { open: '(', close: ')' }, { open: '[', close: ']' }, { open: '{', close: '}' }
        ],
        folding: { markers: { start: /^\s*<!--\s*#?region\b.*-->/, end: /^\s*<!--\s*#?endregion\b.*-->/ } }
      }),
      monaco.languages.setMonarchTokensProvider('vue', vueTokens)
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
