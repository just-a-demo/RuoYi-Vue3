<template>
  <div class="shared-list">
    <div class="list-actions">
      <el-button v-for="button in buttons" :key="button.key" :type="button.key === 'create' ? 'primary' : 'default'" :disabled="loading || (button.key === 'edit' && !selected)" @click="act(button.key)">{{ button.label }}</el-button>
      <span class="selection-note">{{ selected ? `已选中记录 #${selected.id}` : '单击数据行选择记录' }}</span>
    </div>
    <div class="list-filters">
      <div class="filter-heading"><strong>条件查询</strong><el-radio-group v-model="relation" size="small"><el-radio-button value="and">全部满足 AND</el-radio-button><el-radio-button value="or">任意满足 OR</el-radio-button></el-radio-group><el-button text type="primary" :disabled="draft.length >= 20 || !fields.length" @click="addCondition">＋ 添加条件</el-button></div>
      <div v-for="(condition, index) in draft" :key="index" class="condition-row">
        <el-select v-model="condition.field" filterable placeholder="选择字段" aria-label="查询字段" @change="changeField(condition)"><el-option v-for="field in fields" :key="field.field" :value="field.field" :label="`${field.title} (${field.field})`" /></el-select>
        <el-select v-model="condition.operator" aria-label="查询运算符" @change="condition.value = undefined"><el-option v-for="operator in operators(fieldOf(condition))" :key="operator" :value="operator" :label="OPERATORS[operator]" /></el-select>
        <template v-if="!['empty', 'notEmpty'].includes(condition.operator)">
          <el-select v-if="['enum', 'array', 'boolean'].includes(fieldOf(condition)?.valueType)" v-model="condition.value" :multiple="['in', 'notIn', 'any', 'all'].includes(condition.operator)" clearable placeholder="选择查询值" aria-label="查询值"><el-option v-for="option in valueOptions(condition)" :key="String(option.value) + typeof option.value" :label="option.label" :value="option.value" /></el-select>
          <div v-else-if="condition.operator === 'between'" class="range-values">
            <template v-for="part in [0, 1]" :key="part"><span v-if="part">至</span>
              <el-input-number v-if="fieldOf(condition)?.valueType === 'number'" :model-value="condition.value?.[part]" :controls="false" :placeholder="part ? '上限' : '下限'" @update:model-value="setRange(condition, part, $event)" />
              <el-date-picker v-else :model-value="condition.value?.[part]" :type="fieldOf(condition)?.valueType === 'datetime' ? 'datetime' : 'date'" :value-format="fieldOf(condition)?.valueType === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'" :placeholder="part ? '结束日期' : '开始日期'" @update:model-value="setRange(condition, part, $event)" />
            </template>
          </div>
          <el-input-number v-else-if="fieldOf(condition)?.valueType === 'number'" v-model="condition.value" :controls="false" placeholder="输入数值（支持0）" />
          <el-date-picker v-else-if="['date', 'datetime'].includes(fieldOf(condition)?.valueType)" v-model="condition.value" :type="fieldOf(condition).valueType" :value-format="fieldOf(condition).valueType === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'" placeholder="选择日期" />
          <el-input v-else v-model="condition.value" maxlength="500" clearable placeholder="输入查询值" @keyup.enter="search" />
        </template>
        <span v-else class="no-value">不需要查询值</span>
        <el-button text type="danger" @click="draft.splice(index, 1)">移除</el-button>
      </div>
      <div class="filter-footer"><el-button type="primary" :loading="loading" @click="search">查询</el-button><el-button :disabled="loading" @click="reset">重置</el-button><span class="selection-note">条件修改后点击查询才会生效</span><span v-if="fields.some(f => ['date', 'datetime'].includes(f.valueType))" class="selection-note">日期按保存值匹配；Z结尾的ISO时间和Unix时间戳按UTC处理</span></div>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div class="result-heading"><span>共 {{ total }} 条{{ preview ? '模拟' : '' }}记录</span><span class="selection-note">{{ applied.sort ? `${fields.find(f => f.field === applied.sort.field)?.title || applied.sort.field} ${applied.sort.order === 'asc' ? '升序' : '降序'}` : '记录ID倒序' }} · 点击列头排序图标切换</span></div>
    <el-alert v-if="!fields.some(f => f.visible)" title="当前列表没有可见字段，请在列表设计中开启字段显示。" type="info" :closable="false" />
    <div v-loading="loading" class="table-wrap"><div ref="container" class="model-table" /><el-empty v-if="!loading && !rows.length && !error" class="empty-overlay" description="暂无符合条件的记录" :image-size="65" /></div>
    <el-pagination v-model:current-page="pageNum" v-model:page-size="pageSize" :total="total" :page-sizes="[10,20,50,100]" layout="total, sizes, prev, pager, next, jumper" :disabled="loading" @current-change="reload" @size-change="changePageSize" />
  </div>
</template>
<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { ListTable } from '@visactor/vtable'
import { listColumns } from './fields'
import { OPERATORS, operators, normalizeListConfig, defaultConditions, validateConditions, clone, previewQuery, sampleRecords } from './listConfig'
const props = defineProps({ fields: { type: Array, default: () => [] }, config: { type: Object, default: () => ({}) }, loader: Function, preview: Boolean })
const emit = defineEmits(['edit', 'create'])
const config = computed(() => normalizeListConfig(props.config, props.fields))
const buttons = computed(() => config.value.buttons.filter(b => b.visible).slice().sort((a,b) => a.order - b.order))
const container = ref(), selected = ref(), draft = ref([]), relation = ref('and'), applied = ref({ conditions: [], relation: 'and', sort: null })
const rows = ref([]), total = ref(0), loading = ref(false), error = ref(''), pageNum = ref(1), pageSize = ref(20)
let table, observer, generation = 0, mounted = false, correcting = false
const fieldOf = c => props.fields.find(f => f.field === c.field)
function valueOptions(c) { const f = fieldOf(c); return f?.valueType === 'boolean' ? [{ label: '是', value: f.trueValue }, { label: '否', value: f.falseValue }] : f?.options || [] }
function changeField(c) { c.operator = operators(fieldOf(c))[0]; c.value = undefined }
function setRange(c, i, v) { const values = Array.isArray(c.value) ? c.value.slice() : [undefined, undefined]; values[i] = v; c.value = values }
function addCondition() { const field = props.fields[0]; draft.value.push({ field: field.field, operator: operators(field)[0], value: undefined }) }
function act(key) {
  if (key === 'refresh') return reload()
  if (props.preview) return ElMessage.info(key === 'create' ? '预览：新增记录（不会写入数据）' : `预览：修改模拟记录 #${selected.value?.id}`)
  if (key === 'create') emit('create')
  else if (selected.value) emit('edit', clone(selected.value))
}
function search() {
  try { applied.value = { ...applied.value, relation: relation.value, conditions: validateConditions(draft.value, props.fields) }; pageNum.value = 1; reload() }
  catch (failure) { ElMessage.warning(failure.message) }
}
function reset() {
  draft.value = defaultConditions(config.value); relation.value = config.value.filters.relation
  // Blank convenience rows are not active filters until the user submits them.
  applied.value = { conditions: [], relation: relation.value, sort: clone(config.value.table.defaultSort) }
  pageNum.value = 1; pageSize.value = config.value.table.pageSize; reload()
}
function changePageSize() { pageNum.value = 1; reload() }
async function reload() {
  if (!mounted || correcting) return
  const request = ++generation
  selected.value = null; loading.value = true; error.value = ''
  try {
    const query = clone({ ...applied.value, pageNum: pageNum.value, pageSize: pageSize.value })
    const result = props.loader ? await props.loader(query) : previewQuery(sampleRecords(props.fields), props.fields, query)
    if (request !== generation) return
    rows.value = result.rows; total.value = result.total
    correcting = true; pageNum.value = result.pageNum; await nextTick(); correcting = false
    render()
  } catch (failure) {
    if (request === generation) { error.value = failure?.message || '列表查询失败，请重试'; rows.value = []; total.value = 0; render() }
  } finally { if (request === generation) loading.value = false }
}
function render() {
  if (!container.value) return
  const options = { columns: listColumns(props.fields, config.value.table.defaultWidth), records: rows.value, widthMode: 'standard', defaultRowHeight: 40, sortState: clone(applied.value.sort) || undefined, select: { highlightMode: 'row', disableHeaderSelect: true }, theme: { headerStyle: { bgColor: '#f5f7fa', color: '#303133', fontWeight: 'bold', borderColor: '#e4e7ed' }, bodyStyle: { color: '#606266', borderColor: '#ebeef5' }, selectionStyle: { cellBgColor: '#ecf5ff', cellBorderColor: '#409eff' } } }
  if (table) table.updateOption(options)
  else {
    table = new ListTable(container.value, options)
    table.on('sort_click', ({ field }) => {
      if (!loading.value) {
        const current = applied.value.sort?.field === field ? applied.value.sort.order : null
        applied.value.sort = current === 'desc' ? null : { field, order: current === 'asc' ? 'desc' : 'asc' }
        pageNum.value = 1; reload()
      }
      return false // Installed VTable supports cancellation: never sort only the current server page.
    })
    table.on('click_cell', ({ col, row }) => { if (!loading.value && !table.isHeader(col, row)) selected.value = table.getCellOriginRecord(col, row) })
    table.on('dblclick_cell', ({ col, row }) => {
      if (!loading.value && !table.isHeader(col, row) && buttons.value.some(b => b.key === 'edit')) {
        selected.value = table.getCellOriginRecord(col, row)
        if (selected.value) act('edit')
      }
    })
  }
}
watch(() => [props.fields, props.config], () => { if (mounted) reset() }, { deep: true, flush: 'post' })
onMounted(async () => { await nextTick(); mounted = true; reset(); observer = new ResizeObserver(() => table?.resize()); observer.observe(container.value) })
onBeforeUnmount(() => { ++generation; mounted = false; observer?.disconnect(); table?.release() })
defineExpose({ reload })
</script>
<style scoped>
.shared-list { margin-top:16px; }.list-actions,.filter-heading,.filter-footer,.result-heading { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.list-actions { margin-bottom:16px; }.list-actions .el-button+.el-button { margin-left:0; }.selection-note { color:var(--el-text-color-secondary); font-size:12px; }.list-filters { padding:16px; background:var(--el-fill-color-lighter); border-radius:6px; }.condition-row { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin:12px 0; }.condition-row>.el-select { width:200px; }.condition-row>.el-input { width:250px; }.range-values { display:flex; align-items:center; gap:8px; }.range-values :deep(.el-input) { width:170px; }.no-value { color:#909399; width:250px; }.filter-footer { margin-top:12px; }.result-heading { justify-content:space-between; margin:16px 0 10px; }.table-wrap { position:relative; }.model-table { height:420px; width:100%; }.empty-overlay { position:absolute; top:80px; left:0; right:0; pointer-events:none; }.el-pagination { margin-top:16px; justify-content:flex-end; }
</style>
