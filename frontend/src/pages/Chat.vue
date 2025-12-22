<template>
  <div class="chat-page">
    <h2>OpenSage Demo — Project Health</h2>
    <div>
      <input v-model="repo" placeholder="owner/repo (e.g. apache/superset)" />
      <button @click="send">Run Demo</button>
    </div>
    <div v-if="loading">Loading...</div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="report">
      <ReportViewer :report="report" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ReportViewer from '../components/ReportViewer.vue'

const repo = ref('apache/superset')
const loading = ref(false)
const error = ref('')
const report = ref(null)

async function send() {
  error.value = ''
  loading.value = true
  try {
    const res = await fetch('/api/demo/project_health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '项目近3个月健康如何？', repo: repo.value })
    })
    if (!res.ok) {
      throw new Error(await res.text())
    }
    report.value = await res.json()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.chat-page { padding: 1rem }
.error { color: red }
</style>