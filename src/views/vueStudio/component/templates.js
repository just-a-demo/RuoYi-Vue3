export const componentTemplates = [
  { value: 'vue', label: '普通 Vue 组件' },
  { value: 'form', label: 'FormCreate 与代码组合' },
  { value: 'field', label: 'FormCreate 自定义字段' }
]

export function createComponentSource(kind = 'form', model = false) {
  if (kind === 'field') return `<template>
  <el-input :model-value="modelValue" :placeholder="placeholder" @update:model-value="emit('update:modelValue', $event)" />
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '请输入' },
  formCreateInject: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
</style>
`
  if (kind === 'form') return `<template>
  <section class="component-card">
    <h3>${model ? "{{ model.pageTitle || model.modelName }}" : '自定义表单'}</h3>
    <form-create v-model="formData" v-model:api="formApi" :rule="rules" :option="options" />
    <!-- 可以在表单前后添加其他 Vue 组件。 -->
  </section>
</template>

<script setup>
import { inject } from 'vue'
${model ? "defineProps({ model: { type: Object, default: () => ({}) }, fields: { type: Array, default: () => [] } })\n" : ''}const { rules, options, formData, formApi } = inject('studioForm')
// 表单挂载后可调用 formApi.value.setValue('字段标识', '新值')、formApi.value.validate()。
</script>

<style scoped>
.component-card { padding: 16px; }
</style>
`
  return `<template>
  <section class="component-card">
    <h3>{{ title }}</h3>
  </section>
</template>

<script setup>
defineProps({ title: { type: String, default: 'Vue 组件' } })
</script>

<style scoped>
.component-card { padding: 16px; }
</style>
`
}

export function normalizePublishTargets(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { value = [] }
  }
  return Array.isArray(value) && value.includes('formCreate') ? ['vue', 'formCreate'] : ['vue']
}
