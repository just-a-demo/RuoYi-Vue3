<template>
  <div class="props-panel">
    <div v-for="(item, index) in modelValue" :key="item.id" class="prop-row">
      <el-checkbox v-model="item.enabled" aria-label="传入此参数" />
      <el-input v-model="item.key" placeholder="Key" />
      <el-select v-model="item.type">
        <el-option v-for="type in types" :key="type" :label="type" :value="type" />
      </el-select>
      <el-input v-model="item.value" placeholder="Value" />
      <el-button icon="Delete" circle @click="remove(index)" />
    </div>
    <el-button icon="Plus" @click="add">添加参数</el-button>
    <span class="hint">可从 defineProps 提取建议；修改参数不会自动运行。</span>
  </div>
</template>

<script setup>
const props = defineProps({ modelValue: { type: Array, required: true } })
const emit = defineEmits(['update:modelValue'])
const types = ['string', 'number', 'boolean', 'json']
function createRowId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
}
const add = () => emit('update:modelValue', [...props.modelValue, { id: createRowId(), key: '', type: 'string', value: '', enabled: true }])
const remove = index => emit('update:modelValue', props.modelValue.filter((_item, itemIndex) => itemIndex !== index))
</script>

<style scoped>
.prop-row { display: grid; grid-template-columns: 24px 1fr 130px 1.5fr 36px; gap: 8px; margin-bottom: 8px; }
.hint { margin-left: 12px; color: var(--el-text-color-secondary); font-size: 12px; }
</style>
