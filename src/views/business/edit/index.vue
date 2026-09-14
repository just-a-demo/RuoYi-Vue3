<template>
  <div class="app-container">
    <el-result icon="warning" title="旧 REPL 编辑器已停用" sub-title="请从独立的“Vue 组件工作室”进入 Monaco 编辑器。">
      <template #extra>
        <el-button type="primary" @click="$router.push('/dev/edit')">前往 Vue 组件工作室</el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup name="LegacyEditorRetired">
// 仅保留旧菜单的安全退役提示；这里没有编辑、编译或运行链路。
</script>
