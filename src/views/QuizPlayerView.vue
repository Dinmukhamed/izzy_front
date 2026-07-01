<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Send } from 'lucide-vue-next'
import { getPlayerState } from '@/services/quizApi'
import { createQuizSocket, type QuizSocketAck } from '@/services/quizSocket'
import type { PlayerQuizState, QuizAnswer } from '@/types/quiz'

const route = useRoute()
const code = String(route.params.code || '').toUpperCase()
const playerId = ref(String(route.query.playerId || window.localStorage.getItem(`izzy-player:${code}`) || ''))
const state = ref<PlayerQuizState | null>(null)
const selectedOptionId = ref('')
const answeredQuestionId = ref('')
const errorMessage = ref('')
const socket = createQuizSocket()

const currentPlayer = computed(() => state.value?.players.find((player) => player.id === playerId.value))
const currentAnswer = computed(() => {
  if (!state.value?.currentQuestion) return null

  return state.value.answers.find(
    (answer) => answer.playerId === playerId.value && answer.questionId === state.value?.currentQuestion?.id,
  )
})
const isRevealMode = computed(() => state.value?.status === 'show_answer' || state.value?.status === 'finished')
const canAnswer = computed(
  () =>
    Boolean(state.value?.currentQuestion) &&
    state.value?.status === 'question_open' &&
    answeredQuestionId.value !== state.value?.currentQuestion?.id,
)

const submitAnswer = (optionId: string) => {
  if (!canAnswer.value || !playerId.value) return

  selectedOptionId.value = optionId
  socket.emit('player:answer', { code, playerId: playerId.value, optionId }, (response: QuizSocketAck<QuizAnswer>) => {
    if (!response.ok) {
      errorMessage.value = response.error
      selectedOptionId.value = ''
      return
    }

    answeredQuestionId.value = response.data.questionId
  })
}

onMounted(async () => {
  try {
    state.value = await getPlayerState(code)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Не получилось открыть игру'
  }

  socket.on('session:state', (nextState: PlayerQuizState) => {
    state.value = nextState
  })

  if (playerId.value) {
    socket.emit('player:join-room', { code, playerId: playerId.value }, (response: QuizSocketAck<PlayerQuizState>) => {
      if (!response.ok) errorMessage.value = response.error
      else state.value = response.data
    })
  }
})

onBeforeUnmount(() => {
  socket.disconnect()
})

watch(
  () => state.value?.currentQuestion?.id,
  () => {
    selectedOptionId.value = ''
  },
)
</script>

<template>
  <main class="player-page">
    <section class="phone-shell">
      <header>
        <img src="/logo_trans.png" alt="Izzy Quiz" />
        <div>
          <p>Izzy Quiz Live</p>
          <h1>{{ code }}</h1>
        </div>
      </header>

      <div v-if="currentPlayer" class="player-line">
        <span>{{ currentPlayer.name }}</span>
        <strong>{{ currentPlayer.score }} очков</strong>
      </div>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <template v-if="state?.currentQuestion">
        <section class="question-card">
          <span>Вопрос {{ (state.currentQuestionIndex || 0) + 1 }} / {{ state.questionCount }}</span>
          <h2>{{ state.currentQuestion.text }}</h2>
        </section>

        <section class="option-grid">
          <button
            v-for="(option, index) in state.currentQuestion.options"
            :key="option.id"
            type="button"
            :disabled="!canAnswer"
            :class="{
              selected: selectedOptionId === option.id,
              correct: isRevealMode && option.id === state.currentQuestion.correctOptionId,
              wrong: isRevealMode && currentAnswer?.optionId === option.id && !currentAnswer?.isCorrect,
              muted: isRevealMode && option.id !== state.currentQuestion.correctOptionId && currentAnswer?.optionId !== option.id,
            }"
            @click="submitAnswer(option.id)"
          >
            <span>{{ index + 1 }}</span>
            {{ option.text }}
          </button>
        </section>

        <div v-if="isRevealMode" class="result-card" :class="{ success: currentAnswer?.isCorrect }">
          <strong>{{ currentAnswer?.isCorrect ? 'Верно' : 'Ответ показан' }}</strong>
          <p v-if="currentAnswer">
            +{{ currentAnswer.score }} очков
            <span v-if="currentAnswer.elapsedMs">за {{ (currentAnswer.elapsedMs / 1000).toFixed(1) }} сек.</span>
          </p>
          <p v-else>Ты не успел ответить на этот вопрос.</p>
        </div>

        <div v-else-if="!canAnswer" class="status-card">
          <Send :size="24" />
          <p>{{ answeredQuestionId === state.currentQuestion.id ? 'Ответ принят' : 'Ждем следующий вопрос' }}</p>
        </div>
      </template>

      <section v-else class="waiting-card">
        <span>{{ state?.status || 'loading' }}</span>
        <h2>Ждем старта</h2>
        <p>Оставайся на этой странице, вопросы появятся автоматически.</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.player-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #070b1d, #172b46 62%, #2c123b);
  color: white;
  padding: 16px;
}

.phone-shell {
  width: min(100%, 560px);
  min-height: calc(100vh - 32px);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

header,
.player-line,
.status-card {
  display: flex;
  align-items: center;
}

header {
  justify-content: space-between;
  gap: 14px;
}

header img {
  width: 58px;
  height: 58px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  padding: 8px;
}

header p,
.question-card span,
.waiting-card span {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

header h1 {
  text-align: right;
  font-size: 34px;
  font-weight: 950;
  letter-spacing: 0.12em;
}

.player-line,
.question-card,
.waiting-card,
.status-card,
.result-card {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 22px;
  background: rgba(11, 17, 40, 0.82);
  padding: 18px;
}

.player-line {
  justify-content: space-between;
  font-weight: 950;
}

.player-line strong {
  color: #67e8f9;
}

.question-card h2,
.waiting-card h2 {
  margin-top: 12px;
  font-size: clamp(30px, 9vw, 52px);
  line-height: 0.98;
  font-weight: 950;
}

.option-grid {
  display: grid;
  gap: 12px;
}

.option-grid button {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 82px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.96);
  padding: 16px;
  color: #061022;
  text-align: left;
  font-size: clamp(18px, 5vw, 26px);
  font-weight: 950;
}

.option-grid button span {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  place-items: center;
  border-radius: 14px;
  background: #67e8f9;
}

.option-grid button.selected {
  background: #67e8f9;
}

.option-grid button.correct {
  background: #4ade80;
  color: #052e16;
}

.option-grid button.wrong {
  background: #fb7185;
  color: #450a0a;
}

.option-grid button.muted {
  opacity: 0.42;
}

.option-grid button:disabled {
  opacity: 0.58;
}

.option-grid button.correct:disabled,
.option-grid button.wrong:disabled {
  opacity: 1;
}

.status-card {
  justify-content: center;
  gap: 10px;
  color: #cbd5e1;
  font-size: 20px;
  font-weight: 900;
}

.result-card {
  display: grid;
  gap: 8px;
  border-color: rgba(251, 113, 133, 0.4);
}

.result-card.success {
  border-color: rgba(74, 222, 128, 0.55);
}

.result-card strong {
  font-size: 30px;
  font-weight: 950;
}

.result-card p {
  color: #cbd5e1;
  font-size: 18px;
  font-weight: 850;
}

.result-card span {
  color: #67e8f9;
}

.waiting-card {
  margin-top: auto;
  margin-bottom: auto;
  text-align: center;
}

.waiting-card p {
  margin-top: 14px;
  color: #cbd5e1;
  font-size: 18px;
  font-weight: 800;
}

.error-text {
  border-radius: 14px;
  background: rgba(248, 113, 113, 0.14);
  padding: 12px 14px;
  color: #fecaca;
  font-weight: 800;
}
</style>
