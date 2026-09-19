<template>
  <el-dialog :model-value="modelValue" :title="title" width="min(900px, 94vw)" align-center append-to-body destroy-on-close :close-on-click-modal="false" class="list-field-picker" @update:model-value="emit('update:modelValue', $event)">
    <div class="picker-columns">
      <div class="available-column">
        <div class="picker-toolbar">
          <el-checkbox v-if="max !== 1" :model-value="allChecked" :indeterminate="someChecked && !allChecked" :disabled="!filteredFields.length" @change="toggleAll">{{ search ? '全选搜索结果' : '选择全部字段' }}</el-checkbox>
          <strong v-else>选择排序字段</strong>
          <el-input v-model="search" size="small" clearable :prefix-icon="Search" placeholder="搜索字段" aria-label="搜索可选字段" />
        </div>
        <div class="field-options">
          <h4>表单字段 <span>{{ filteredFields.length }}</span></h4>
          <div class="field-grid">
            <el-checkbox v-for="field in filteredFields" :key="field.field" :model-value="isSelected(field.field)" :disabled="max !== 1 && !isSelected(field.field) && entries.length >= max" :title="`${field.title} (${field.field})`" @change="toggle(field.field, $event)">{{ field.title }}</el-checkbox>
          </div>
          <p v-if="!filteredFields.length" class="empty-note">{{ fields.length ? '没有匹配的字段' : '暂无可选字段' }}</p>
        </div>
        <div class="picker-hint">{{ hint }}<span v-if="Number.isFinite(max)"> 最多 {{ max }} {{ max === 1 ? '个字段' : '项' }}。</span></div>
      </div>
      <div class="selected-column">
        <div class="selected-heading"><strong>已选字段：<b>{{ entries.length }}</b> 个</strong><el-button link type="primary" :disabled="!entries.length" @click="entries = []">清空</el-button></div>
        <el-input v-model="selectedSearch" size="small" clearable :prefix-icon="Search" placeholder="搜索已选字段" aria-label="搜索已选字段" />
        <Draggable v-model="entries" item-key="_key" handle=".drag-handle" :animation="150" :disabled="Boolean(selectedSearch)" class="selected-list" ghost-class="picker-ghost">
          <template #item="{ element, index }">
            <div v-show="matches(element.field, selectedSearch)" class="selected-field" :data-field="element.field">
              <span class="drag-handle" :class="{ disabled: selectedSearch }" title="拖动调整顺序" aria-hidden="true">⠿</span>
              <span class="selected-title" :title="element.field">{{ titleOf(element.field) }}</span>
              <span class="row-tools">
                <el-button link :icon="ArrowUp" :disabled="index === 0 || Boolean(selectedSearch)" :aria-label="`上移${titleOf(element.field)}`" @click="move(index, -1)" />
                <el-button link :icon="ArrowDown" :disabled="index === entries.length - 1 || Boolean(selectedSearch)" :aria-label="`下移${titleOf(element.field)}`" @click="move(index, 1)" />
              </span>
              <el-button link :icon="Close" :aria-label="`移除${titleOf(element.field)}`" @click="entries.splice(index, 1)" />
            </div>
          </template>
        </Draggable>
        <p v-if="!entries.length || !entries.some(e => matches(e.field, selectedSearch))" class="empty-note">{{ entries.length ? '没有匹配的已选字段' : '请从左侧选择字段' }}</p>
        <div class="picker-hint">{{ selectedSearch ? '清空搜索后可调整顺序' : '拖动或使用箭头调整顺序' }}</div>
      </div>
    </div>
    <template #footer><el-button @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" @click="confirm">确定</el-button></template>
  </el-dialog>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, ArrowUp, ArrowDown, Close } from '@element-plus/icons-vue'
import Draggable from 'vuedraggable'
import { clone } from './listConfig'
const props = defineProps({ modelValue: Boolean, title: String, fields: { type: Array, default: () => [] }, selected: { type: Array, default: () => [] }, max: { type: Number, default: Infinity }, hint: { type: String, default: '按勾选顺序添加字段。' } })
const emit = defineEmits(['update:modelValue', 'confirm'])
const entries = ref([]), search = ref(''), selectedSearch = ref('')
let key = 0
const titleOf = field => props.fields.find(f => f.field === field)?.title || field
const matches = (field, term) => `${titleOf(field)} ${field}`.toLowerCase().includes(term.trim().toLowerCase())
const filteredFields = computed(() => props.fields.filter(f => matches(f.field, search.value)))
const isSelected = field => entries.value.some(e => e.field === field)
const allChecked = computed(() => filteredFields.value.length > 0 && filteredFields.value.every(f => isSelected(f.field)))
const someChecked = computed(() => filteredFields.value.some(f => isSelected(f.field)))
watch(() => props.modelValue, open => {
  if (open) { entries.value = props.selected.map(item => ({ ...clone(item), _key: ++key })); search.value = ''; selectedSearch.value = '' }
}, { immediate: true })
function toggle(field, checked) {
  if (!checked) entries.value = entries.value.filter(e => e.field !== field)
  else if (!isSelected(field)) {
    if (props.max === 1) entries.value = [{ field, _key: ++key }]
    else if (entries.value.length < props.max) entries.value.push({ field, _key: ++key })
  }
}
function toggleAll(checked) {
  if (!checked) { const filtered = new Set(filteredFields.value.map(f => f.field)); entries.value = entries.value.filter(e => !filtered.has(e.field)); return }
  const missing = filteredFields.value.filter(f => !isSelected(f.field))
  if (entries.value.length + missing.length > props.max) return ElMessage.warning(`最多选择${props.max}项，请缩小范围或逐项选择`)
  missing.forEach(f => entries.value.push({ field: f.field, _key: ++key }))
}
function move(index, delta) { const [item] = entries.value.splice(index, 1); entries.value.splice(index + delta, 0, item) }
function confirm() {
  if (entries.value.length > props.max || entries.value.some(e => !props.fields.some(f => f.field === e.field))) return ElMessage.warning('已选字段发生变化，请重新选择')
  emit('confirm', entries.value.map(({ _key, ...item }) => item))
  emit('update:modelValue', false)
}
</script>
<style scoped>
.picker-columns { display:grid; grid-template-columns:minmax(0,1fr) 256px; border:1px solid var(--el-border-color); min-height:420px; color:var(--el-text-color-primary); }
.available-column,.selected-column { display:flex; flex-direction:column; min-width:0; padding:16px; }.selected-column { border-left:1px solid var(--el-border-color); }
.picker-toolbar,.selected-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:30px; margin-bottom:14px; font-size:13px; }.picker-toolbar>.el-input { width:190px; }.picker-toolbar .el-checkbox { margin:0; }.selected-heading b { color:var(--el-color-primary); }
.field-options { flex:1; overflow:auto; max-height:330px; }h4 { border-left:3px solid var(--el-color-primary); padding-left:8px; margin:18px 0 14px; font-size:13px; }h4 span { color:var(--el-text-color-placeholder); font-size:12px; font-weight:normal; margin-left:8px; }
.field-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px 14px; padding:0 4px; }.field-grid .el-checkbox { min-width:0; margin:0; }.field-grid :deep(.el-checkbox__label) { overflow:hidden; text-overflow:ellipsis; font-size:12px; }
.selected-list { max-height:290px; overflow:auto; margin-top:10px; }.selected-field { display:flex; align-items:center; gap:6px; min-height:34px; font-size:12px; }.selected-title { flex:1; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }.drag-handle { cursor:grab; color:var(--el-text-color-placeholder); font-size:18px; }.drag-handle.disabled { cursor:default; }.selected-field .el-button { margin:0; padding:2px; color:var(--el-text-color-secondary); }.row-tools { display:flex; visibility:hidden; }.selected-field:hover .row-tools,.selected-field:focus-within .row-tools { visibility:visible; }.picker-ghost { background:var(--el-color-primary-light-9); }
.empty-note { color:var(--el-text-color-placeholder); font-size:12px; text-align:center; padding:25px 0; }.picker-hint { color:var(--el-text-color-placeholder); font-size:12px; line-height:1.6; margin-top:auto; padding-top:16px; }
@media(max-width:680px) { .picker-columns { grid-template-columns:minmax(0,1fr); min-height:0; max-height:65vh; overflow:auto; }.selected-column { border-left:0; border-top:1px solid var(--el-border-color); }.field-options { max-height:190px; flex:auto; }.selected-list { max-height:160px; }.picker-toolbar { flex-wrap:wrap; }.picker-toolbar>.el-input { flex:1; min-width:130px; }.field-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.row-tools { visibility:visible; } }
</style>
