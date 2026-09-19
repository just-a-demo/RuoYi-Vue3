import runtimeCore from '@vue/runtime-core/dist/runtime-core.d.ts?raw'
import runtimeDom from '@vue/runtime-dom/dist/runtime-dom.d.ts?raw'
import reactivity from '@vue/reactivity/dist/reactivity.d.ts?raw'
import shared from '@vue/shared/dist/shared.d.ts?raw'
import cssTypes from 'csstype/index.d.ts?raw'
import formCore from '@form-create/core/types/index.d.ts?raw'
import formCreate from '@form-create/element-ui/types/index.d.ts?raw'
import formConfig from '@form-create/element-ui/types/config.d.ts?raw'
import formMaker from '@form-create/element-ui/types/maker.d.ts?raw'
const routerTypes = import.meta.glob('../../../node_modules/vue-router/dist/*.d.mts', { query: '?raw', import: 'default', eager: true })

// Use the installed Vue declarations, not approximate stub APIs.
export function registerVueTypes(monaco) {
  const files = {
    '@vue/runtime-core': runtimeCore, '@vue/runtime-dom': runtimeDom,
    '@vue/reactivity': reactivity, '@vue/shared': shared, csstype: cssTypes,
    '@form-create/core': formCore,
    '@form-create/element-ui': formCreate,
    vue: `export * from '@vue/runtime-dom'
      export interface StudioForm {
        rules: import('vue').Ref<import('@form-create/element-ui').Rule[]>;
        options: import('vue').Ref<import('@form-create/element-ui').Options>;
        formData: import('vue').Ref<Record<string, any>>;
        formApi: import('vue').Ref<import('@form-create/element-ui').Api | undefined>;
        mode: import('vue').Ref<'view' | 'create' | 'edit'>;
        submit(): Promise<{ values: Record<string, any>; preview: boolean }>;
      }
      export declare const inject: ((key: 'studioForm') => StudioForm) & typeof import('@vue/runtime-dom').inject;
    `
  }
  const declarations = Object.fromEntries(Object.entries(files).map(([name, content]) => [`inmemory://vue-studio/node_modules/${name}/index.d.ts`, content]))
  declarations['inmemory://vue-studio/node_modules/@form-create/element-ui/config.d.ts'] = formConfig
  declarations['inmemory://vue-studio/node_modules/@form-create/element-ui/maker.d.ts'] = formMaker
  for (const [path, content] of Object.entries(routerTypes)) {
    const filename = path.split('/').pop()
    declarations[`inmemory://vue-studio/node_modules/vue-router/${filename === 'vue-router.d.mts' ? 'index.d.ts' : filename.replace('.d.mts', '.d.ts')}`] = content.replace(/\.mjs(["'])/g, '$1')
  }
  declarations['inmemory://vue-studio/studio-modules.d.ts'] = `declare module 'element-plus';
    declare module '*.vue' { const component: import('vue').Component; export default component; }
    declare module '*';
    declare module '@lc/*' { const component: import('vue').Component; export default component; }`
  declarations['inmemory://vue-studio/macros.d.ts'] = `
    declare const defineProps: typeof import('vue').defineProps
    declare const defineEmits: typeof import('vue').defineEmits
    declare const defineExpose: typeof import('vue').defineExpose
    declare const withDefaults: typeof import('vue').withDefaults
    declare const defineModel: typeof import('vue').defineModel
    declare const defineSlots: typeof import('vue').defineSlots
    declare const defineOptions: typeof import('vue').defineOptions
  `
  const disposables = [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]
    .flatMap(defaults => Object.entries(declarations).map(([path, content]) => defaults.addExtraLib(content, path)))
  return { dispose() { disposables.forEach(item => item.dispose()) } }
}
