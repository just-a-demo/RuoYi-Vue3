<template>
  <div>
    <el-form inline>
      <el-form-item v-for="field in fields.filter(item => item.filter)" :key="field.field" :label="field.title"><el-input v-model="filters[field.field]" clearable /></el-form-item>
    </el-form>
    <div ref="container" class="model-table" />
  </div>
</template>
<script setup>
import { reactive, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ListTable } from '@visactor/vtable'
import { listColumns, filterRecords } from './fields'
const props = defineProps({ fields: { type: Array, default: () => [] }, records: { type: Array, default: () => [] } })
const emit = defineEmits(['edit'])
const container = ref()
const filters = reactive({})
let table, observer
function render() {
  if (!container.value) return
  const options = { columns: listColumns(props.fields), records: filterRecords(props.records, props.fields, filters), widthMode: 'adaptive', defaultRowHeight: 40 }
  if (table) table.updateOption(options)
  else {
    table = new ListTable(container.value, options)
    table.on('dblclick_cell', ({ col, row }) => {
      if (!table.isHeader(col, row)) emit('edit', table.getCellOriginRecord(col, row))
    })
  }
}
watch(() => [props.fields, props.records, filters], render, { deep: true, flush: 'post' })
onMounted(async () => {
  await nextTick()
  render()
  observer = new ResizeObserver(() => table?.resize())
  observer.observe(container.value)
})
onBeforeUnmount(() => { observer?.disconnect(); table?.release() })
</script>
<style scoped>.model-table { height: 420px; width: 100%; }</style>
