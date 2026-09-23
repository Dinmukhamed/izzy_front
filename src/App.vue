<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'

const applyDarkMode = () => {
  const telegram = (window as Window & {
    Telegram?: { WebApp?: { colorScheme?: string } }
  }).Telegram
  const prefersDark = telegram?.WebApp?.colorScheme
    ? telegram.WebApp.colorScheme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches
  const html = document.documentElement;

  if (prefersDark) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
}

onMounted(() => {
  applyDarkMode()
})
</script>

<template>
  <RouterView />
</template>

<style scoped></style>
