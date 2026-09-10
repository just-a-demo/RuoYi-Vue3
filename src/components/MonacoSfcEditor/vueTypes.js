import runtimeCore from '@vue/runtime-core/dist/runtime-core.d.ts?raw'
import runtimeDom from '@vue/runtime-dom/dist/runtime-dom.d.ts?raw'
import reactivity from '@vue/reactivity/dist/reactivity.d.ts?raw'
import shared from '@vue/shared/dist/shared.d.ts?raw'
import cssTypes from 'csstype/index.d.ts?raw'

// Use the installed Vue declarations, not approximate stub APIs.
export function registerVueTypes(monaco) {
  const files = {
    '@vue/runtime-core': runtimeCore, '@vue/runtime-dom': runtimeDom,
    '@vue/reactivity': reactivity, '@vue/shared': shared, csstype: cssTypes,
    vue: "export * from '@vue/runtime-dom'"
  }
  const disposables = Object.entries(files).map(([name, content]) => monaco.typescript.typescriptDefaults.addExtraLib(content, `inmemory://vue-studio/node_modules/${name}/index.d.ts`))
  disposables.push(monaco.typescript.typescriptDefaults.addExtraLib(`
    declare const defineProps: typeof import('vue').defineProps
    declare const defineEmits: typeof import('vue').defineEmits
    declare const defineExpose: typeof import('vue').defineExpose
    declare const withDefaults: typeof import('vue').withDefaults
    declare const defineModel: typeof import('vue').defineModel
    declare const defineSlots: typeof import('vue').defineSlots
    declare const defineOptions: typeof import('vue').defineOptions
  `, 'inmemory://vue-studio/macros.d.ts'))
  return { dispose() { disposables.forEach(item => item.dispose()) } }
}
