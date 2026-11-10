<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, Clock3, Crown, Pause, Send, Trophy, WifiOff, X } from 'lucide-vue-next'
import { getAuthenticatedPlayerState, getQuizErrorMessage, isQuizUnauthorizedError } from '@/services/quizApi'
import { createQuizSocket, type QuizSocketAck } from '@/services/quizSocket'
import { preloadImages } from '@/services/imagePreloader'
import { vFitText } from '@/directives/fitText'
import type { AuthenticatedPlayerState, PlayerQuizState, QuizAnswerAck } from '@/types/quiz'

const route = useRoute()
const router = useRouter()
const code = String(route.params.code || '').toUpperCase()
const playerStorageKey = `izzy-player:${code}`
const tokenStorageKey = `izzy-player-token:${code}`
const pendingStorageKey = `izzy-pending-answer:${code}`
const playerId = ref(String(window.localStorage.getItem(playerStorageKey) || ''))
const playerToken = ref(String(window.localStorage.getItem(tokenStorageKey) || ''))
const state = ref<PlayerQuizState | null>(null)
const pendingAnswer = ref<PendingAnswer | null>(readPendingAnswer())
const selectedOptionId = ref(pendingAnswer.value?.optionId || '')
const confirmedQuestionId = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)
const isConnected = ref(false)
const brokenImageUrls = ref(new Set<string>())
const now = ref(Date.now())
const serverOffsetMs = ref(0)
const socket = createQuizSocket()
const playerQuestionFit = { min: 14, max: 35 }
let clockTimer: number | undefined
let preloadBatchKey = ''

const currentPlayer = computed(() => state.value?.players.find((player) => player.id === playerId.value))
const currentAnswer = computed(() => {
  if (!state.value?.currentQuestion) return null
  return state.value.answers.find(
    (answer) => answer.playerId === playerId.value && answer.questionId === state.value?.currentQuestion?.id,
  )
})
const hasAcceptedAnswer = computed(() => Boolean(
  state.value?.currentQuestion && playerId.value && (
    confirmedQuestionId.value === state.value.currentQuestion.id ||
    state.value.answeredPlayerIds.includes(playerId.value)
  ),
))
const hasAnswered = computed(() =>
  isSubmitting.value || Boolean(pendingAnswer.value) || hasAcceptedAnswer.value,
)
const remainingMs = computed(() => {
  if (!state.value?.phaseEndsAt) return 0
  const rawRemaining = new Date(state.value.phaseEndsAt).getTime() - (now.value + serverOffsetMs.value)
  return Math.max(0, Math.min(rawRemaining, phaseDurationMs(state.value.status)))
})
const remainingSeconds = computed(() => Math.max(0, Math.ceil((remainingMs.value - 100) / 1000)))
const timerProgress = computed(() => Math.max(0, Math.min(100, (remainingMs.value / 20_000) * 100)))
const canAnswer = computed(() =>
  Boolean(state.value?.currentQuestion) &&
  state.value?.status === 'question_open' &&
  remainingMs.value > 0 &&
  isConnected.value &&
  !hasAnswered.value,
)
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
const finalTopThree = computed(() => sortedPlayers.value.slice(0, 3))
const correctOptionText = computed(() =>
  state.value?.currentQuestion?.options.find(
    (option) => option.id === state.value?.currentQuestion?.correctOptionId,
  )?.text || '',
)
const resultKind = computed<'correct' | 'wrong' | 'missed'>(() => {
  if (!currentAnswer.value) return 'missed'
  return currentAnswer.value.isCorrect ? 'correct' : 'wrong'
})
const currentQuestionImageUrl = computed(() =>
  state.value?.currentQuestion?.media?.type === 'image' ? state.value.currentQuestion.media.url : '',
)

function phaseDurationMs(status: PlayerQuizState['status']) {
  if (status === 'countdown') return 3_000
  if (status === 'question_open') return 20_000
  if (status === 'show_answer') return 4_000
  if (status === 'leaderboard') return 6_000
  return Number.POSITIVE_INFINITY
}

function applyState(nextState: PlayerQuizState) {
  if (state.value && nextState.stateVersion < state.value.stateVersion) return
  state.value = nextState
  serverOffsetMs.value = new Date(nextState.serverNow).getTime() - Date.now()
  startImagePreload(nextState)

  const questionId = nextState.currentQuestion?.id
  if (questionId && playerId.value && nextState.answeredPlayerIds.includes(playerId.value)) {
    confirmedQuestionId.value = questionId
    clearPendingAnswer()
  } else if (pendingAnswer.value && pendingAnswer.value.questionId !== questionId) {
    clearPendingAnswer()
  } else if (pendingAnswer.value && nextState.status !== 'question_open') {
    clearPendingAnswer()
  }
}

function startImagePreload(nextState: PlayerQuizState) {
  const currentImageUrl = nextState.currentQuestion?.media?.type === 'image'
    ? nextState.currentQuestion.media.url
    : ''
  const urls = Array.from(new Set([...(nextState.preloadImageUrls || []), currentImageUrl].filter(Boolean)))
  const batchKey = urls.slice().sort().join('|')
  if (batchKey === preloadBatchKey) return
  preloadBatchKey = batchKey

  void preloadImages(urls)
}

function markImageBroken(url: string) {
  brokenImageUrls.value = new Set(brokenImageUrls.value).add(url)
}

function markImageLoaded(url: string) {
  const nextBrokenUrls = new Set(brokenImageUrls.value)
  nextBrokenUrls.delete(url)
  brokenImageUrls.value = nextBrokenUrls
}

function applyAuthenticatedState(payload: AuthenticatedPlayerState) {
  playerId.value = payload.player.id
  window.localStorage.setItem(playerStorageKey, payload.player.id)
  applyState(payload.state)
}

function returnToJoin() {
  window.localStorage.removeItem(playerStorageKey)
  window.localStorage.removeItem(tokenStorageKey)
  window.localStorage.removeItem(pendingStorageKey)
  void router.replace(`/quiz/join?code=${code}`)
}

async function loadState() {
  try {
    const payload = await getAuthenticatedPlayerState(code, playerToken.value)
    applyAuthenticatedState(payload)
  } catch (error) {
    if (isQuizUnauthorizedError(error)) returnToJoin()
    errorMessage.value = getQuizErrorMessage(error, 'Не получилось открыть игру')
  }
}

function joinPlayerRoom() {
  socket.emit('player:join-room', { code, playerToken: playerToken.value }, (response: QuizSocketAck<AuthenticatedPlayerState>) => {
    if (!response.ok) {
      if (response.error === 'Player session is invalid') returnToJoin()
      else errorMessage.value = response.error
      return
    }
    errorMessage.value = ''
    applyAuthenticatedState(response.data)
    if (pendingAnswer.value && !hasAcceptedAnswer.value) sendPendingAnswer()
  })
}

function submitAnswer(optionId: string) {
  if (!canAnswer.value || !playerId.value) return
  selectedOptionId.value = optionId
  pendingAnswer.value = {
    questionId: state.value!.currentQuestion!.id,
    optionId,
    requestId: createRequestId(),
  }
  persistPendingAnswer()
  sendPendingAnswer()
}

function sendPendingAnswer() {
  const pending = pendingAnswer.value
  if (!pending || isSubmitting.value) return
  if (!socket.connected) {
    errorMessage.value = 'Нет связи. Ответ отправится после переподключения.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''
  socket.timeout(5_000).emit(
    'player:answer',
    {
      code,
      playerToken: playerToken.value,
      optionId: pending.optionId,
      requestId: pending.requestId,
    },
    (timeoutError: Error | null, response?: QuizSocketAck<QuizAnswerAck>) => {
      isSubmitting.value = false
      if (timeoutError || !response) {
        errorMessage.value = 'Не получили подтверждение. Проверяем ответ…'
        void reconcileAnswer()
        return
      }
      if (!response.ok) {
        if (response.error === 'Player session is invalid') returnToJoin()
        errorMessage.value = response.error === 'Time is up' ? 'Время вышло' : response.error
        void reconcileAnswer()
        return
      }
      confirmedQuestionId.value = response.data.answer.questionId
      clearPendingAnswer()
      errorMessage.value = ''
    },
  )
}

async function reconcileAnswer() {
  try {
    const payload = await getAuthenticatedPlayerState(code, playerToken.value)
    applyAuthenticatedState(payload)
  } catch (error) {
    if (isQuizUnauthorizedError(error)) returnToJoin()
    errorMessage.value = getQuizErrorMessage(error, 'Не удалось проверить ответ. Нажми «Повторить».')
  }
}

function retryPendingAnswer() {
  sendPendingAnswer()
}

function persistPendingAnswer() {
  if (!pendingAnswer.value) return
  window.localStorage.setItem(pendingStorageKey, JSON.stringify(pendingAnswer.value))
}

function clearPendingAnswer() {
  pendingAnswer.value = null
  isSubmitting.value = false
  window.localStorage.removeItem(pendingStorageKey)
}

onMounted(() => {
  if (!playerToken.value) {
    returnToJoin()
    return
  }

  clockTimer = window.setInterval(() => { now.value = Date.now() }, 100)
  socket.on('connect', () => { isConnected.value = true; joinPlayerRoom() })
  socket.on('disconnect', () => { isConnected.value = false })
  socket.on('session:state', applyState)
  socket.connect()
  void loadState()
})

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  socket.disconnect()
})

watch(
  () => state.value?.currentQuestion?.id,
  (questionId, previousQuestionId) => {
    if (questionId === previousQuestionId) return
    confirmedQuestionId.value = ''
    if (!pendingAnswer.value || pendingAnswer.value.questionId !== questionId) {
      clearPendingAnswer()
      selectedOptionId.value = ''
    }
  },
)

type PendingAnswer = {
  questionId: string
  optionId: string
  requestId: string
}

function readPendingAnswer(): PendingAnswer | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(pendingStorageKey) || 'null') as Partial<PendingAnswer> | null
    if (!parsed?.questionId || !parsed.optionId || !parsed.requestId) return null
    return parsed as PendingAnswer
  } catch {
    return null
  }
}

function createRequestId() {
  if (typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID()
  const bytes = window.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
</script>

<template>
  <main class="player-page">
    <section class="phone-shell">
      <header class="compact-header">
        <div class="brand-lockup"><img src="/logo_trans.png" alt="Izzy Quiz" /><div><span>Izzy Quiz</span><strong>{{ code }}</strong></div></div>
        <div v-if="currentPlayer" class="player-summary"><span>{{ currentPlayer.name }}</span><strong>{{ currentPlayer.score }}</strong></div>
      </header>

      <p v-if="!isConnected" class="connection-note"><WifiOff :size="15" /> Переподключаемся…</p>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <section
        v-if="state?.status === 'question_open' && state.currentQuestion"
        class="game-screen question-screen"
        :class="{ 'has-image': currentQuestionImageUrl }"
      >
        <div class="round-line"><span>Вопрос {{ (state.currentQuestionIndex || 0) + 1 }} / {{ state.questionCount }}</span><strong :class="{ urgent: remainingSeconds <= 5 }"><Clock3 :size="16" /> {{ remainingSeconds }}</strong></div>
        <div class="timer-track"><span :style="{ width: `${timerProgress}%` }" /></div>
        <div class="question-copy">
          <div class="question-text-box">
            <h1 v-fit-text="playerQuestionFit">{{ state.currentQuestion.text }}</h1>
          </div>
          <p v-if="hasAcceptedAnswer"><Send :size="17" /> Ответ принят — ждём остальных</p>
          <p v-else-if="isSubmitting"><Send :size="17" /> Отправляем ответ…</p>
          <div v-else-if="pendingAnswer" class="answer-retry">
            <span>Подтверждение не получено</span>
            <button type="button" @click="retryPendingAnswer">Повторить</button>
          </div>
          <p v-else>Выбери один вариант</p>
        </div>
        <div v-if="currentQuestionImageUrl" class="player-question-media">
          <img
            v-if="!brokenImageUrls.has(currentQuestionImageUrl)"
            :src="currentQuestionImageUrl"
            :alt="state.currentQuestion.text"
            @load="markImageLoaded(currentQuestionImageUrl)"
            @error="markImageBroken(currentQuestionImageUrl)"
          />
          <span v-else>Не удалось загрузить изображение</span>
        </div>
        <div class="option-grid">
          <button v-for="(option,index) in state.currentQuestion.options" :key="option.id" type="button" :disabled="!canAnswer" :class="[`option-${index + 1}`, { selected: selectedOptionId === option.id }]" @click="submitAnswer(option.id)">
            <span>{{ ['A','B','C','D'][index] }}</span><strong>{{ option.text }}</strong>
          </button>
        </div>
      </section>

      <section v-else-if="state?.status === 'countdown'" class="game-screen center-screen countdown-screen">
        <span class="eyebrow">Вопрос {{ (state.currentQuestionIndex || 0) + 1 }} из {{ state.questionCount }}</span>
        <strong :key="remainingSeconds" class="countdown-number">{{ Math.max(1, remainingSeconds) }}</strong>
        <h1>Приготовься</h1>
      </section>

      <section v-else-if="state?.status === 'show_answer' && state.currentQuestion" class="game-screen center-screen result-screen" :class="`is-${resultKind}`">
        <div class="result-icon"><Check v-if="resultKind === 'correct'" /><X v-else /></div>
        <span class="eyebrow">Результат вопроса</span>
        <h1>{{ resultKind === 'correct' ? 'Верно!' : resultKind === 'wrong' ? 'Не угадал' : 'Время вышло' }}</h1>
        <p class="correct-answer">Правильный ответ: <strong>{{ correctOptionText }}</strong></p>
        <div class="result-stats"><div><span>За вопрос</span><strong>+{{ currentAnswer?.score || 0 }}</strong></div><div><span>Всего</span><strong>{{ currentPlayer?.score || 0 }}</strong></div><div><span>Место</span><strong>#{{ currentRank || '—' }}</strong></div></div>
      </section>

      <section v-else-if="state?.status === 'leaderboard'" class="game-screen leaderboard-screen">
        <div class="leaderboard-heading"><div class="trophy-icon"><Trophy /></div><div><span class="eyebrow">После вопроса {{ (state.currentQuestionIndex || 0) + 1 }}</span><h1>Таблица лидеров</h1></div></div>
        <ol class="leaderboard-list"><li v-for="entry in leaderboardPlayers" :key="entry.player.id" :class="{ current: entry.player.id === playerId, separated: entry.rank > 5 }"><span class="rank"><Crown v-if="entry.rank === 1" :size="19" />{{ entry.rank }}</span><strong>{{ entry.player.name }}<small v-if="entry.player.id === playerId">Это ты</small></strong><span class="score">{{ entry.player.score }}</span></li></ol>
        <p class="host-note">Следующий вопрос через {{ remainingSeconds }} сек.</p>
      </section>

      <section v-else-if="state?.status === 'finished'" class="game-screen final-screen">
        <Trophy class="final-trophy" />
        <span class="eyebrow">Игра завершена</span><h1>Финиш!</h1>
        <div class="personal-final"><span>Твоё место</span><strong>#{{ currentRank || '—' }}</strong><b>{{ currentPlayer?.score || 0 }} баллов</b></div>
        <ol><li v-for="(player,index) in finalTopThree" :key="player.id"><span>{{ index + 1 }}</span><strong>{{ player.name }}</strong><b>{{ player.score }}</b></li></ol>
      </section>

      <section v-else-if="state?.status === 'paused'" class="game-screen center-screen waiting-screen"><div class="waiting-pulse"><Pause /></div><span class="eyebrow">Пауза</span><h1>Скоро продолжим</h1></section>
      <section v-else class="game-screen center-screen waiting-screen">
        <div class="waiting-pulse"><Trophy /></div>
        <span class="eyebrow">Комната {{ code }}</span>
        <h1>{{ state?.status === 'lobby_locked' ? 'Игра скоро начнётся' : 'Ждём старта' }}</h1>
        <p>Оставайся здесь — всё появится автоматически.</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.question-screen.has-image{grid-template-rows:auto auto minmax(54px,.42fr) minmax(88px,1fr) minmax(0,1.65fr)}
.player-question-media{min-height:0;overflow:hidden;display:grid;place-items:center;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(0,0,0,.2)}
.player-question-media img{display:block;width:100%;height:100%;max-height:25dvh;object-fit:contain}
.player-question-media span{padding:12px;color:#fda4af;font-size:11px;font-weight:850;text-align:center}
.answer-retry{display:flex;align-items:center;gap:8px;margin-top:6px;color:#fde68a;font-size:11px;font-weight:850}.answer-retry button{border:1px solid rgba(253,230,138,.45);border-radius:8px;background:rgba(245,158,11,.15);padding:5px 8px;color:#fde68a;font-size:10px;font-weight:900}
@media(max-height:680px){.question-screen.has-image{grid-template-rows:auto auto minmax(44px,.34fr) minmax(72px,.8fr) minmax(0,1.7fr)}.player-question-media img{max-height:20dvh}.question-screen.has-image .option-grid button{padding:7px}.question-screen.has-image .option-grid button>span{width:23px;height:23px;font-size:12px}.question-screen.has-image .option-grid button strong{font-size:clamp(13px,3.7vw,18px)}}
</style>
