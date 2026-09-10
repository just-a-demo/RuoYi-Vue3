<template>
  <section class="problem-panel">
    <header>
      <strong>问题</strong>
      <el-radio-group v-model="filter" size="small">
        <el-radio-button value="all">全部 {{ problems.length }}</el-radio-button>
        <el-radio-button value="error">错误 {{ errorCount }}</el-radio-button>
        <el-radio-button value="warning">警告 {{ warningCount }}</el-radio-button>
      </el-radio-group>
      <el-button text icon="Close" @click="$emit('close')" />
    </header>
    <div class="problem-list">
      <button v-for="(item, index) in filtered" :key="`${item.source}-${item.code}-${index}`" type="button" @click="$emit('select', item)">
        <span :class="severityClass(item)">{{ isError(item) ? '●' : '▲' }}</span>
        <span class="message">{{ item.message }}</span>
        <span class="location">第 {{ item.startLineNumber }} 行，第 {{ item.startColumn }} 列</span>
        <code>{{ item.source }}{{ item.code ? `/${item.code}` : '' }}</code>
      </button>
      <el-empty v-if="!filtered.length" description="没有问题" :image-size="44" />
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import * as monaco from 'monaco-editor'

const props = defineProps({ problems: { type: Array, default: () => [] } })
defineEmits(['close', 'select'])
const filter = ref('all')
const isError = item => item.severity === monaco.MarkerSeverity.Error
const errorCount = computed(() => props.problems.filter(isError).length)
const warningCount = computed(() => props.problems.filter(item => item.severity === monaco.MarkerSeverity.Warning).length)
const filtered = computed(() => props.problems.filter(item => filter.value === 'all' || (filter.value === 'error' ? isError(item) : !isError(item))))
const severityClass = item => isError(item) ? 'error' : 'warning'
</script>

<style scoped>
.problem-panel { background: #181818; color: #d4d4d4; border-top: 1px solid #333; max-height: 210px; display: grid; grid-template-rows: 38px 1fr; }
header { display: grid; grid-template-columns: 1fr auto 36px; align-items: center; gap: 12px; padding: 0 12px; border-bottom: 1px solid #333; }
.problem-list { overflow: auto; }
.problem-list button { width: 100%; display: grid; grid-template-columns: 18px 1fr 180px 150px; gap: 8px; align-items: center; padding: 7px 14px; color: inherit; background: transparent; border: 0; border-bottom: 1px solid #252525; text-align: left; cursor: pointer; }
.problem-list button:hover { background: #2a2d2e; }
.error { color: #f14c4c; } .warning { color: #cca700; }
.location, code { color: #999; font-size: 12px; } code { text-align: right; }
</style>
