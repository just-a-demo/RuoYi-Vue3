<template>
  <div class="list-designer">
    <main class="list-canvas">
      <div class="canvas-heading">
        <div><strong>列表视图</strong><span class="preview-badge">模拟数据</span></div>
        <div class="canvas-tools"><el-button link :icon="Setting" @click="openPicker('columns')">字段设置</el-button><el-button link :icon="Filter" :type="showFilters ? 'primary' : 'default'" :aria-pressed="showFilters" @click="showFilters = !showFilters">筛选</el-button></div>
      </div>
      <ModelTable class="canvas-table" :class="{ 'show-filters': showFilters }" :fields="fields" :config="config" preview />
      <div class="canvas-note">预览不写入业务记录 · 配置保存并发布后生效</div>
    </main>

    <aside class="view-settings" aria-label="视图设计配置">
      <el-tabs v-model="settingsTab" stretch>
        <el-tab-pane label="视图配置" name="config">
          <div class="settings-body">
            <h3 class="settings-title">列表数据设置</h3>
            <details open class="settings-group query-settings">
              <summary><span>查询条件 <small>{{ config.filters.defaults.length }}</small></span><el-button link :icon="Plus" aria-label="设置查询条件" @click.stop.prevent="openPicker('query')" /></summary>
              <div class="group-content">
                <div v-for="(condition, index) in config.filters.defaults" :key="index" class="side-field" :data-field="condition.field">
                  <span class="field-label" :title="condition.field">{{ fieldTitle(condition.field) }}</span>
                  <span class="item-actions">
                    <el-popover trigger="click" width="250" placement="left" :persistent="false">
                      <template #reference><el-button link :icon="Setting" :aria-label="`设置查询条件${index + 1}`" /></template>
                      <div class="popover-label">{{ fieldTitle(condition.field) }} · 默认条件</div>
                      <el-select v-model="condition.operator" size="small" :aria-label="`查询条件${index + 1}运算符`"><el-option v-for="operator in operators(fieldOf(condition.field))" :key="operator" :value="operator" :label="OPERATORS[operator]" /></el-select>
                      <el-button link type="primary" class="duplicate-condition" :disabled="config.filters.defaults.length >= 20" @click="duplicateCondition(index)">添加同字段条件</el-button>
                    </el-popover>
                    <el-button link :icon="Close" :aria-label="`移除查询条件${index + 1}`" @click="config.filters.defaults.splice(index, 1)" />
                  </span>
                </div>
                <p v-if="!config.filters.defaults.length" class="empty-setting">点击 ＋ 选择查询字段</p>
                <div class="relation-setting"><span>条件关系</span><el-radio-group v-model="config.filters.relation" size="small"><el-radio-button value="and">全部</el-radio-button><el-radio-button value="or">任意</el-radio-button></el-radio-group></div>
              </div>
            </details>

            <details open class="settings-group column-settings">
              <summary><span>展示字段 <small>{{ visibleFields.length }}</small></span><el-button link :icon="Plus" aria-label="设置展示字段" @click.stop.prevent="openPicker('columns')" /></summary>
              <div class="group-content">
                <div v-for="field in visibleFields" :key="field.field" class="side-field">
                  <button class="field-label field-link" :title="`${field.field} · 点击设置列属性`" @click="editField(field)">{{ field.title }}</button>
                  <el-button class="item-actions" link :icon="Close" :aria-label="`隐藏${field.title}列`" @click="field.visible = false" />
                </div>
                <p v-if="!visibleFields.length" class="empty-setting">点击 ＋ 选择展示字段</p>
              </div>
            </details>

            <details open class="settings-group sort-settings">
              <summary><span>排序字段</span><el-button link :icon="Plus" aria-label="设置排序字段" @click.stop.prevent="openPicker('sort')" /></summary>
              <div class="group-content">
                <div v-if="config.table.defaultSort" class="side-field sort-row"><span class="field-label" :title="config.table.defaultSort.field">{{ fieldTitle(config.table.defaultSort.field) }}</span><el-select v-model="config.table.defaultSort.order" size="small" aria-label="默认排序方向"><el-option label="升序" value="asc" /><el-option label="降序" value="desc" /></el-select><el-button link :icon="Close" aria-label="取消默认排序" @click="config.table.defaultSort = null" /></div>
                <p v-else class="empty-setting">记录 ID 倒序</p>
              </div>
            </details>

            <details open class="settings-group action-settings">
              <summary><span>列表操作</span></summary>
              <div class="group-content">
                <div v-for="button in orderedButtons" :key="button.key" class="side-field action-row">
                  <el-checkbox v-model="button.visible" :aria-label="`显示${actionLabel(button.key)}按钮`">{{ button.label }}</el-checkbox>
                  <el-popover trigger="click" width="260" placement="left" :persistent="false">
                    <template #reference><el-button class="item-actions" link :icon="Setting" :aria-label="`设置${actionLabel(button.key)}按钮`" /></template>
                    <el-form label-width="48px" size="small" class="button-properties"><el-form-item label="名称"><el-input v-model="button.label" maxlength="20" :aria-label="`${actionLabel(button.key)}按钮名称`" /></el-form-item><el-form-item label="顺序"><el-input-number v-model="button.order" :min="1" :max="99" :controls="false" :aria-label="`${actionLabel(button.key)}按钮顺序`" /></el-form-item></el-form>
                  </el-popover>
                </div>
              </div>
            </details>

            <details open class="settings-group paging-settings">
              <summary><span>分页设置</span></summary>
              <div class="group-content property-line"><span>每页显示</span><el-select v-model="config.table.pageSize" size="small" aria-label="每页条数"><el-option v-for="size in [10,20,50,100]" :key="size" :value="size" :label="`${size} 条`" /></el-select></div>
            </details>
          </div>
        </el-tab-pane>
        <el-tab-pane label="视图属性" name="properties">
          <div class="settings-body">
            <h3 class="settings-title">列表属性</h3>
            <div class="property-line"><span>默认列宽</span><el-input-number v-model="config.table.defaultWidth" size="small" :min="60" :max="1200" :controls="false" aria-label="默认列宽" /><span class="unit">px</span></div>
            <el-divider />
            <h3 class="settings-title">字段属性</h3>
            <el-select v-model="activeFieldKey" size="small" filterable placeholder="选择字段" aria-label="编辑字段属性"><el-option v-for="field in fields" :key="field.field" :label="`${field.title} (${field.field})`" :value="field.field" /></el-select>
            <template v-if="activeField">
              <p class="field-id">{{ activeField.field }}</p>
              <div class="property-line"><span>列宽</span><el-input-number v-model="activeField.width" size="small" :min="60" :max="1200" :controls="false" placeholder="默认" aria-label="单列宽度" /><span class="unit">px</span></div>
              <div class="property-line"><span>显示字段</span><el-switch v-model="activeField.visible" size="small" aria-label="显示当前字段" /></div>
              <div class="property-line"><span>允许排序</span><el-switch :model-value="Boolean(activeField.sortable)" :disabled="!sortable(activeField)" size="small" aria-label="允许当前字段排序" @change="setSortable" /></div>
              <p class="property-hint">列宽留空时使用默认值。数组、复杂字段不支持排序；展示顺序在“展示字段”弹窗中调整。</p>
            </template>
          </div>
        </el-tab-pane>
      </el-tabs>
    </aside>
    <FieldPicker v-model="pickerOpen" :title="pickerTitle" :fields="pickerFields" :selected="pickerSelection" :max="pickerMode === 'query' ? 20 : pickerMode === 'sort' ? 1 : Infinity" :hint="pickerHint" @confirm="applySelection" />
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { Plus, Close, Setting, Filter } from '@element-plus/icons-vue'
import { ACTIONS, OPERATORS, operators, sortable } from './listConfig'
import ModelTable from './ModelTable.vue'
import FieldPicker from './FieldPicker.vue'
const props = defineProps({ fields: { type: Array, required: true }, config: { type: Object, required: true } })
const settingsTab = ref('config'), showFilters = ref(false), activeFieldKey = ref('')
const pickerOpen = ref(false), pickerMode = ref('query')
const orderedButtons = computed(() => props.config.buttons.slice().sort((a, b) => a.order - b.order))
const visibleFields = computed(() => props.fields.filter(f => f.visible).slice().sort((a, b) => a.order - b.order))
const fieldOf = key => props.fields.find(f => f.field === key)
const fieldTitle = key => fieldOf(key)?.title || key
const actionLabel = key => ACTIONS.find(action => action.key === key)?.label
const activeField = computed(() => fieldOf(activeFieldKey.value))
const pickerTitle = computed(() => ({ query: '设置查询条件', columns: '设置展示字段', sort: '设置排序字段' })[pickerMode.value])
const pickerFields = computed(() => pickerMode.value === 'sort' ? props.fields.filter(sortable) : props.fields)
const pickerSelection = computed(() => pickerMode.value === 'query' ? props.config.filters.defaults : pickerMode.value === 'columns' ? visibleFields.value.map(f => ({ field: f.field })) : props.config.table.defaultSort ? [props.config.table.defaultSort] : [])
const pickerHint = computed(() => ({ query: '可选择全部表单字段，包含列表中隐藏的字段。', columns: '右侧顺序即列表展示顺序。', sort: '单字段默认排序；选中后同时开启该字段排序。' })[pickerMode.value])
function openPicker(mode) { pickerMode.value = mode; pickerOpen.value = true }
function editField(field) { activeFieldKey.value = field.field; settingsTab.value = 'properties' }
function duplicateCondition(index) { if (props.config.filters.defaults.length < 20) props.config.filters.defaults.splice(index + 1, 0, { ...props.config.filters.defaults[index] }) }
function setSortable(enabled) {
  activeField.value.sortable = enabled
  if (!enabled && props.config.table.defaultSort?.field === activeFieldKey.value) props.config.table.defaultSort = null
}
function applySelection(items) {
  if (pickerMode.value === 'query') {
    props.config.filters.defaults = items.map(item => ({ ...item, operator: operators(fieldOf(item.field)).includes(item.operator) ? item.operator : operators(fieldOf(item.field))[0] }))
  } else if (pickerMode.value === 'columns') {
    const selected = new Set(items.map(item => item.field))
    const ordered = [...items.map(item => fieldOf(item.field)), ...props.fields.filter(f => !selected.has(f.field)).slice().sort((a, b) => a.order - b.order)]
    ordered.forEach((field, index) => { field.visible = selected.has(field.field); field.order = index + 1 })
  } else {
    const item = items[0]
    props.config.table.defaultSort = item ? { field: item.field, order: item.order || 'asc' } : null
    if (item) fieldOf(item.field).sortable = true
  }
}
</script>
<style scoped>
.list-designer { display:grid; grid-template-columns:minmax(0,1fr) 286px; min-height:650px; border:1px solid var(--el-border-color-light); background:var(--el-fill-color-lighter); color:var(--el-text-color-primary); }
.list-canvas { min-width:0; padding:20px; }.canvas-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:16px; }.canvas-heading strong { font-size:14px; }.preview-badge { display:inline-block; margin-left:10px; padding:3px 7px; border-radius:3px; font-size:11px; color:var(--el-text-color-secondary); background:var(--el-fill-color); }.canvas-tools { display:flex; gap:16px; }.canvas-tools .el-button { margin:0; font-size:12px; }
.canvas-table { border:1px solid var(--el-border-color-light); background:var(--el-bg-color); padding:14px; margin-top:0; }.canvas-table:not(.show-filters) :deep(.list-filters) { display:none; }.canvas-table :deep(.result-heading),.canvas-table :deep(.list-actions .selection-note) { display:none; }.canvas-table :deep(.el-pagination) { flex-wrap:wrap; gap:6px; }.canvas-note { margin-top:14px; font-size:12px; color:var(--el-text-color-placeholder); }
.view-settings { min-width:0; background:var(--el-bg-color); border-left:1px solid var(--el-border-color-light); }.view-settings :deep(.el-tabs__header) { margin:0; padding:0 12px; }.view-settings :deep(.el-tabs__item) { font-size:13px; height:44px; }.view-settings :deep(.el-tabs__nav-wrap::after) { height:1px; }.settings-body { padding:16px; max-height:680px; overflow:auto; }.settings-title { font-size:13px; font-weight:600; margin:0 0 14px; }
.settings-group { padding:0 0 10px; }summary { display:flex; align-items:center; justify-content:space-between; gap:8px; list-style:none; cursor:pointer; font-size:12px; font-weight:600; min-height:30px; }summary::-webkit-details-marker { display:none; }summary>span { flex:1; }summary::before { content:'›'; color:var(--el-text-color-secondary); font-size:17px; transition:transform .15s; }details[open]>summary::before { transform:rotate(90deg); }summary small { font-size:11px; color:var(--el-text-color-placeholder); font-weight:400; padding-left:5px; }.settings-group summary>.el-button { color:var(--el-text-color-secondary); margin:0; }.group-content { margin-left:18px; }.query-settings .group-content,.column-settings .group-content { max-height:200px; overflow:auto; }
.side-field { display:flex; align-items:center; gap:5px; min-height:30px; font-size:12px; }.field-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.field-link { color:inherit; border:0; background:none; text-align:left; font-size:12px; padding:5px 0; cursor:pointer; }.field-link:hover { color:var(--el-color-primary); }.item-actions { display:flex; opacity:0; }.side-field:hover .item-actions,.side-field:focus-within .item-actions { opacity:1; }.side-field .el-button { margin:0; color:var(--el-text-color-secondary); padding:3px; }.action-row>.el-checkbox { flex:1; min-width:0; margin:0; height:30px; }.action-row :deep(.el-checkbox__label) { font-size:12px; overflow:hidden; text-overflow:ellipsis; }.empty-setting { font-size:12px; color:var(--el-text-color-placeholder); margin:6px 0 12px; }.relation-setting { display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:12px; color:var(--el-text-color-secondary); margin:10px 0 2px; }.sort-row>.el-select { width:76px; }
.property-line { display:flex; align-items:center; gap:8px; margin:14px 0; font-size:12px; }.property-line>span:first-child { flex:1; }.property-line>.el-select { width:95px; }.property-line>.el-input-number { width:100px; }.unit { color:var(--el-text-color-placeholder); }.property-hint,.field-id { color:var(--el-text-color-placeholder); font-size:12px; line-height:1.7; overflow-wrap:anywhere; }.popover-label { font-size:12px; margin-bottom:10px; }.duplicate-condition { margin-top:12px; font-size:12px; }.button-properties .el-form-item:last-child { margin-bottom:0; }
@media(max-width:760px) { .list-designer { grid-template-columns:minmax(0,1fr); }.list-canvas { padding:12px; }.view-settings { border-left:0; border-top:1px solid var(--el-border-color-light); }.settings-body { max-height:none; }.item-actions { opacity:1; }.canvas-table { padding:10px; } }
</style>
