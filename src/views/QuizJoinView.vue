<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight } from 'lucide-vue-next'
import { joinQuiz } from '@/services/quizApi'

const route = useRoute()
const router = useRouter()
const code = ref(String(route.query.code || route.params.code || '').toUpperCase())
const name = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

const canJoin = computed(() => code.value.trim().length >= 4 && name.value.trim().length >= 2)

const submit = async () => {
  if (!canJoin.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await joinQuiz(code.value.trim().toUpperCase(), name.value.trim())
    window.localStorage.setItem(`izzy-player:${response.state.code}`, response.player.id)
    await router.push(`/quiz/${response.state.code}/player?playerId=${response.player.id}`)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Не получилось войти в игру'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <main class="join-page">
    <section class="join-card">
      <img src="/logo_trans.png" alt="Izzy Quiz" />
      <p class="eyebrow">Izzy Quiz Live</p>
      <h1>Вход в игру</h1>

      <form class="join-form" @submit.prevent="submit">
        <label>
          <span>Код игры</span>
          <input v-model="code" type="text" inputmode="text" autocomplete="off" placeholder="ABC123" />
        </label>
        <label>
          <span>Имя игрока</span>
          <input v-model="name" type="text" autocomplete="name" placeholder="Например: Дима" />
        </label>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

        <button type="submit" :disabled="!canJoin || isLoading">
          {{ isLoading ? 'Входим...' : 'Войти' }}
          <ArrowRight :size="22" />
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.join-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 20% 15%, rgba(154, 71, 205, 0.46), transparent 34%),
    linear-gradient(135deg, #070b1d, #11223d);
  color: white;
  padding: 20px;
}

.join-card {
  width: min(100%, 460px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 26px;
  background: rgba(11, 17, 40, 0.88);
  padding: 30px;
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.34);
}

.join-card img {
  width: 74px;
  height: 74px;
  padding: 10px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.1);
}

.eyebrow,
label span {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.26em;
  text-transform: uppercase;
}

h1 {
  margin-top: 16px;
  font-size: clamp(42px, 11vw, 72px);
  line-height: 0.92;
  font-weight: 950;
  text-transform: uppercase;
}

.join-form,
label {
  display: grid;
  gap: 12px;
}

.join-form {
  margin-top: 28px;
  gap: 18px;
}

input {
  min-height: 58px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: #080d20;
  padding: 0 16px;
  color: white;
  font-size: 20px;
  font-weight: 850;
}

button {
  min-height: 62px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 16px;
  background: #67e8f9;
  color: #061022;
  font-weight: 950;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

button:disabled {
  opacity: 0.45;
}

.error-text {
  border-radius: 14px;
  background: rgba(248, 113, 113, 0.14);
  padding: 12px 14px;
  color: #fecaca;
  font-weight: 800;
}
</style>
