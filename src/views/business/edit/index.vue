<template>
    <MonacoEditor v-model="code" language="javascript" />
</template>

<script setup>
import { ref } from 'vue'
import MonacoEditor from './MonacoEditor.vue'
const code = ref(`console.log("hello")`)
</script>