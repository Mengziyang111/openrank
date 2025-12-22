<template>
  <div class="report">
    <h3>{{ report.summary.headline }}</h3>
    <p>Status: <strong>{{ report.summary.status }}</strong></p>
    <div class="keypoints">
      <h4>Key points</h4>
      <ul>
        <li v-for="(p, idx) in report.summary.key_points" :key="idx">{{ p }}</li>
      </ul>
    </div>
    <div class="charts">
      <h4>Charts</h4>
      <div v-for="(c, idx) in report.charts" :key="idx" class="chart">
        <strong>{{ c.title }}</strong>
        <!-- placeholder: render length/first datapoint -->
        <div>Points: {{ c.data.length }} · First: {{ c.data[0] ? c.data[0].value : 'n/a' }}</div>
      </div>
    </div>
    <div class="actions">
      <h4>Suggested Actions</h4>
      <ul>
        <li v-for="(a, idx) in report.actions" :key="idx">{{ a.action }} ({{ a.priority }})</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
defineProps({ report: Object })
</script>

<style scoped>
.report { border: 1px solid #ddd; padding: 1rem; border-radius: 6px }
.chart { margin-bottom: 0.5rem }
</style>