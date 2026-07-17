<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Check, Clock3, Crown, Send, Trophy, X } from 'lucide-vue-next'
import { getPlayerState } from '@/services/quizApi'
import { createQuizSocket, type QuizSocketAck } from '@/services/quizSocket'
import type { PlayerQuizState, QuizAnswer } from '@/types/quiz'

const RESULT_DURATION_MS = 3_000

const route = useRoute()
const code = String(route.params.code || '').toUpperCase()
const playerId = ref(String(route.query.playerId || window.localStorage.getItem(`izzy-player:${code}`) || ''))
const state = ref<PlayerQuizState | null>(null)
const selectedOptionId = ref('')
const answeredQuestionId = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)
const revealStage = ref<'result' | 'leaderboard'>('result')
const now = ref(Date.now())
const socket = createQuizSocket()
let clockTimer: ReturnType<typeof setInterval> | undefined
let revealTimer: ReturnType<typeof setTimeout> | undefined

const currentPlayer = computed(() => state.value?.players.find((player) => player.id === playerId.value))
const currentAnswer = computed(() => {
  if (!state.value?.currentQuestion) return null

  return state.value.answers.find(
    (answer) => answer.playerId === playerId.value && answer.questionId === state.value?.currentQuestion?.id,
  )
})
const isRevealMode = computed(() => state.value?.status === 'show_answer' || state.value?.status === 'finished')
const hasAnswered = computed(
  () =>
    isSubmitting.value ||
    answeredQuestionId.value === state.value?.currentQuestion?.id ||
    Boolean(currentAnswer.value),
)
const canAnswer = computed(
  () => Boolean(state.value?.currentQuestion) && state.value?.status === 'question_open' && !hasAnswered.value,
)
const remainingMs = computed(() => {
  if (!state.value?.questionStartedAt || !state.value.currentQuestion || state.value.status !== 'question_open') return 0

  const endsAt = new Date(state.value.questionStartedAt).getTime() + state.value.currentQuestion.durationMs
  return Math.max(0, endsAt - now.value)
})
const remainingSeconds = computed(() => Math.ceil(remainingMs.value / 1000))
const timerProgress = computed(() => {
  const duration = state.value?.currentQuestion?.durationMs || 1
  return Math.max(0, Math.min(100, (remainingMs.value / duration) * 100))
})
const sortedPlayers = computed(() =>
  [...(state.value?.players || [])].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
)
const currentRank = computed(() => sortedPlayers.value.findIndex((player) => player.id === playerId.value) + 1)
const leaderboardPlayers = computed(() => {
  const leaders = sortedPlayers.value.slice(0, 5).map((player, index) => ({ player, rank: index + 1 }))
  const currentIndex = sortedPlayers.value.findIndex((player) => player.id === playerId.value)

  if (currentIndex >= 5) leaders.push({ player: sortedPlayers.value[currentIndex], rank: currentIndex + 1 })
  return leaders
})
const correctOptionText = computed(
  () =>
    state.value?.currentQuestion?.options.find(
      (option) => option.id === state.value?.currentQuestion?.correctOptionId,
    )?.text || '',
)
const resultKind = computed<'correct' | 'wrong' | 'missed'>(() => {
  if (!currentAnswer.value) return 'missed'
  return currentAnswer.value.isCorrect ? 'correct' : 'wrong'
})
const waitingTitle = computed(() => {
  if (!state.value) return 'Подключаемся…'
  if (state.value.status === 'finished') return 'Игра завершена'
  if (state.value.status === 'lobby_locked') return 'Игра скоро начнется'
  return 'Ждем старта'
})

const submitAnswer = (optionId: string) => {
  if (!canAnswer.value || !playerId.value) return

  selectedOptionId.value = optionId
  isSubmitting.value = true
  errorMessage.value = ''
  socket.emit('player:answer', { code, playerId: playerId.value, optionId }, (response: QuizSocketAck<QuizAnswer>) => {
    if (!response.ok) {
      errorMessage.value = response.error
      selectedOptionId.value = ''
      isSubmitting.value = false
      return
    }

    answeredQuestionId.value = response.data.questionId
    isSubmitting.value = false
  })
}

const scheduleLeaderboard = () => {
  if (revealTimer) clearTimeout(revealTimer)
  revealStage.value = 'result'
  revealTimer = setTimeout(() => {
    revealStage.value = 'leaderboard'
  }, RESULT_DURATION_MS)
}

onMounted(async () => {
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 250)

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
  if (clockTimer) clearInterval(clockTimer)
  if (revealTimer) clearTimeout(revealTimer)
  socket.disconnect()
})

watch(
  () => state.value?.currentQuestion?.id,
  () => {
    selectedOptionId.value = ''
    answeredQuestionId.value = ''
    isSubmitting.value = false
    revealStage.value = 'result'
    if (revealTimer) clearTimeout(revealTimer)
  },
)

watch(
  () => state.value?.status,
  (status, previousStatus) => {
    if ((status === 'show_answer' || status === 'finished') && status !== previousStatus) scheduleLeaderboard()
  },
  { immediate: true },
)
</script>

<template>
  <main class="player-page">
    <section class="phone-shell">
      <header class="compact-header">
        <div class="brand-lockup">
          <img src="/logo_trans.png" alt="Izzy Quiz" />
          <div>
            <span>Izzy Quiz</span>
            <strong>{{ code }}</strong>
          </div>
        </div>
        <div v-if="currentPlayer" class="player-summary">
          <span>{{ currentPlayer.name }}</span>
          <strong>{{ currentPlayer.score }}</strong>
        </div>
      </header>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <section v-if="state?.currentQuestion && state.status === 'question_open'" class="game-screen question-screen">
        <div class="round-line">
          <span>Вопрос {{ (state.currentQuestionIndex || 0) + 1 }} / {{ state.questionCount }}</span>
          <strong :class="{ urgent: remainingSeconds <= 5 }"><Clock3 :size="16" /> {{ remainingSeconds }}</strong>
        </div>
        <div class="timer-track"><span :style="{ width: `${timerProgress}%` }" /></div>

        <div class="question-copy">
          <h1>{{ state.currentQuestion.text }}</h1>
          <p v-if="hasAnswered"><Send :size="17" /> Ответ принят — ждем остальных</p>
          <p v-else>Выбери один вариант</p>
        </div>

        <div class="option-grid">
          <button
            v-for="(option, index) in state.currentQuestion.options"
            :key="option.id"
            type="button"
            :disabled="!canAnswer"
            :class="{ selected: selectedOptionId === option.id }"
            @click="submitAnswer(option.id)"
          >
            <span>{{ index + 1 }}</span>
            <strong>{{ option.text }}</strong>
          </button>
        </div>
      </section>

      <section
        v-else-if="state?.currentQuestion && isRevealMode && revealStage === 'result'"
        class="game-screen result-screen"
        :class="`is-${resultKind}`"
      >
        <div class="result-icon">
          <Check v-if="resultKind === 'correct'" />
          <X v-else />
        </div>
        <span class="eyebrow">Результат вопроса</span>
        <h1>{{ resultKind === 'correct' ? 'Верно!' : resultKind === 'wrong' ? 'Не угадал' : 'Время вышло' }}</h1>
        <p class="correct-answer">Правильный ответ: <strong>{{ correctOptionText }}</strong></p>

        <div class="result-stats">
          <div>
            <span>За вопрос</span>
            <strong>+{{ currentAnswer?.score || 0 }}</strong>
          </div>
          <div>
            <span>Всего</span>
            <strong>{{ currentPlayer?.score || 0 }}</strong>
          </div>
          <div>
            <span>Место</span>
            <strong>#{{ currentRank || '—' }}</strong>
          </div>
        </div>
      </section>

      <section
        v-else-if="state?.currentQuestion && isRevealMode"
        class="game-screen leaderboard-screen"
      >
        <div class="leaderboard-heading">
          <div class="trophy-icon"><Trophy /></div>
          <div>
            <span class="eyebrow">После вопроса {{ (state.currentQuestionIndex || 0) + 1 }}</span>
            <h1>Таблица лидеров</h1>
          </div>
        </div>

        <ol class="leaderboard-list">
          <li
            v-for="entry in leaderboardPlayers"
            :key="entry.player.id"
            :class="{ current: entry.player.id === playerId, separated: entry.rank > 5 }"
          >
            <span class="rank"><Crown v-if="entry.rank === 1" :size="19" />{{ entry.rank }}</span>
            <strong>{{ entry.player.name }}<small v-if="entry.player.id === playerId">Это ты</small></strong>
            <span class="score">{{ entry.player.score }}</span>
          </li>
        </ol>

        <p class="host-note">Следующий вопрос запускает ведущий</p>
      </section>

      <section v-else-if="state?.currentQuestion" class="game-screen waiting-screen">
        <div class="waiting-pulse"><Clock3 /></div>
        <span class="eyebrow">Ответы закрыты</span>
        <h1>Считаем результаты</h1>
      </section>

      <section v-else class="game-screen waiting-screen">
        <div class="waiting-pulse"><Trophy /></div>
        <span class="eyebrow">Комната {{ code }}</span>
        <h1>{{ waitingTitle }}</h1>
        <p>Оставайся здесь — все появится автоматически.</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.player-page {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(circle at 85% 8%, rgba(103, 232, 249, 0.16), transparent 28%),
    radial-gradient(circle at 10% 95%, rgba(217, 70, 239, 0.14), transparent 32%),
    #070b1d;
  color: #fff;
  padding: max(10px, env(safe-area-inset-top)) 12px max(10px, env(safe-area-inset-bottom));
}

.phone-shell {
  width: min(100%, 560px);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.compact-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
}

.brand-lockup,
.player-summary,
.round-line,
.question-copy p,
.leaderboard-heading {
  display: flex;
  align-items: center;
}

.brand-lockup {
  min-width: 0;
  gap: 8px;
}

.brand-lockup img {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  padding: 5px;
}

.brand-lockup div,
.player-summary {
  display: grid;
}

.brand-lockup span,
.player-summary span {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.brand-lockup strong {
  font-size: 17px;
  line-height: 1;
  letter-spacing: 0.14em;
}

.player-summary {
  min-width: 0;
  justify-items: end;
  line-height: 1.05;
}

.player-summary span {
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-summary strong {
  color: #67e8f9;
  font-size: 18px;
}

.game-screen {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  background: rgba(11, 17, 40, 0.82);
  padding: clamp(14px, 3.8vw, 20px);
}

.question-screen {
  display: grid;
  grid-template-rows: auto auto minmax(84px, 0.72fr) minmax(0, 2fr);
  gap: 10px;
}

.round-line {
  justify-content: space-between;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.round-line strong {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #67e8f9;
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}

.round-line strong.urgent {
  color: #fb7185;
}

.timer-track {
  height: 6px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.1);
}

.timer-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #d946ef, #67e8f9);
  transition: width 0.25s linear;
}

.question-copy {
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.question-copy h1 {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  font-size: clamp(22px, 6.4vw, 36px);
  line-height: 1.04;
  font-weight: 950;
}

.question-copy p {
  gap: 6px;
  margin-top: 7px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 800;
}

.question-copy p:has(svg) {
  color: #67e8f9;
}

.option-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.option-grid button {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  border: 2px solid transparent;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  padding: clamp(10px, 3vw, 15px);
  color: #07101f;
  text-align: left;
}

.option-grid button > span {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border-radius: 9px;
  background: #dbeafe;
  color: #172554;
  font-size: 13px;
  font-weight: 950;
}

.option-grid button strong {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  font-size: clamp(15px, 4.3vw, 22px);
  line-height: 1.06;
  font-weight: 950;
}

.option-grid button.selected {
  border-color: #67e8f9;
  background: #cffafe;
  transform: scale(0.98);
}

.option-grid button.selected > span {
  background: #0891b2;
  color: #fff;
}

.option-grid button:disabled:not(.selected) {
  opacity: 0.48;
}

.result-screen,
.waiting-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.result-icon,
.waiting-pulse,
.trophy-icon {
  display: grid;
  place-items: center;
  border-radius: 50%;
}

.result-icon {
  width: clamp(74px, 21vw, 106px);
  height: clamp(74px, 21vw, 106px);
  margin-bottom: 16px;
  background: #fb7185;
  box-shadow: 0 0 0 11px rgba(251, 113, 133, 0.12);
}

.result-icon svg {
  width: 55%;
  height: 55%;
  stroke-width: 3.4;
}

.is-correct .result-icon {
  background: #4ade80;
  color: #052e16;
  box-shadow: 0 0 0 11px rgba(74, 222, 128, 0.12);
}

.eyebrow {
  color: #67e8f9;
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.17em;
  text-transform: uppercase;
}

.result-screen h1,
.waiting-screen h1,
.leaderboard-heading h1 {
  margin-top: 7px;
  font-size: clamp(34px, 10vw, 52px);
  line-height: 0.98;
  font-weight: 950;
}

.correct-answer {
  max-width: 420px;
  margin-top: 17px;
  color: #cbd5e1;
  font-size: clamp(15px, 4vw, 19px);
  line-height: 1.25;
}

.correct-answer strong {
  color: #fff;
}

.result-stats {
  width: min(100%, 420px);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: clamp(22px, 6vh, 42px);
}

.result-stats div {
  display: grid;
  gap: 5px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.07);
  padding: 13px 7px;
}

.result-stats span {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
}

.result-stats strong {
  font-size: clamp(19px, 5.3vw, 27px);
}

.leaderboard-screen {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
}

.leaderboard-heading {
  gap: 12px;
}

.trophy-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  background: #facc15;
  color: #422006;
}

.leaderboard-heading h1 {
  margin-top: 3px;
  font-size: clamp(25px, 7vw, 38px);
}

.leaderboard-list {
  min-height: 0;
  display: grid;
  align-content: center;
  gap: 7px;
  list-style: none;
}

.leaderboard-list li {
  min-height: 0;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  border: 1px solid transparent;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.07);
  padding: clamp(8px, 1.8vh, 13px) 12px;
}

.leaderboard-list li.current {
  border-color: rgba(103, 232, 249, 0.7);
  background: rgba(103, 232, 249, 0.13);
}

.leaderboard-list li.separated {
  margin-top: 5px;
  border-style: dashed;
}

.rank {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #94a3b8;
  font-size: 15px;
  font-weight: 950;
}

.rank svg {
  color: #facc15;
}

.leaderboard-list li > strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: clamp(15px, 4vw, 19px);
}

.leaderboard-list small {
  margin-left: 7px;
  color: #67e8f9;
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.score {
  color: #67e8f9;
  font-size: clamp(16px, 4.5vw, 21px);
  font-weight: 950;
}

.host-note {
  color: #94a3b8;
  text-align: center;
  font-size: 11px;
  font-weight: 800;
}

.waiting-pulse {
  width: 76px;
  height: 76px;
  margin-bottom: 19px;
  background: rgba(103, 232, 249, 0.14);
  color: #67e8f9;
  animation: pulse 1.8s ease-in-out infinite;
}

.waiting-screen p {
  max-width: 310px;
  margin-top: 16px;
  color: #94a3b8;
  font-size: 15px;
  font-weight: 750;
}

.error-text {
  z-index: 2;
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 11px;
  background: rgba(127, 29, 29, 0.92);
  padding: 8px 11px;
  color: #fecaca;
  font-size: 12px;
  font-weight: 800;
}

@keyframes pulse {
  50% { transform: scale(1.08); background: rgba(103, 232, 249, 0.24); }
}

@media (max-height: 680px) {
  .question-screen { grid-template-rows: auto auto minmax(70px, 0.62fr) minmax(0, 2fr); }
  .game-screen { border-radius: 19px; padding: 12px; }
  .option-grid button { border-radius: 14px; }
  .result-icon { margin-bottom: 10px; }
  .correct-answer { margin-top: 11px; }
  .result-stats { margin-top: 18px; }
  .leaderboard-list { gap: 5px; }
  .leaderboard-list li { padding-block: 7px; }
}
</style>
