<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import QRCode from 'qrcode'
import { Lock, Play, SkipForward, Square, Trophy, Unlock } from 'lucide-vue-next'
import { getHostState } from '@/services/quizApi'
import { createQuizSocket, getStoredAdminToken, setStoredAdminToken, type QuizSocketAck } from '@/services/quizSocket'
import type { HostQuizState } from '@/types/quiz'

const route = useRoute()
const code = String(route.params.code || '').toUpperCase()
const adminToken = ref(getStoredAdminToken())
const state = ref<HostQuizState | null>(null)
const errorMessage = ref('')
const now = ref(Date.now())
const qrDataUrl = ref('')
const questionAnimationKey = ref(0)
let clockTimer: number | undefined
const socket = createQuizSocket()

const sortedPlayers = computed(() =>
  [...(state.value?.players || [])].sort((first, second) => second.score - first.score),
)
const currentQuestionNumber = computed(() =>
  state.value?.currentQuestionIndex === null || state.value?.currentQuestionIndex === undefined
    ? 0
    : state.value.currentQuestionIndex + 1,
)
const answersForCurrentQuestion = computed(() => {
  if (!state.value?.currentQuestion) return []

  return state.value.answers.filter((answer) => answer.questionId === state.value?.currentQuestion?.id)
})
const joinUrl = computed(() => `${window.location.origin}/quiz/join?code=${code}`)
const currentQuestion = computed(() => state.value?.currentQuestion || null)
const remainingSeconds = computed(() => {
  if (!state.value?.questionStartedAt || !currentQuestion.value || state.value.status !== 'question_open') return 0

  const endsAt = new Date(state.value.questionStartedAt).getTime() + currentQuestion.value.durationMs

  return Math.max(0, Math.ceil((endsAt - now.value) / 1000))
})
const timerProgress = computed(() => {
  if (!currentQuestion.value || state.value?.status !== 'question_open') return 0

  return Math.max(0, Math.min(100, (remainingSeconds.value / (currentQuestion.value.durationMs / 1000)) * 100))
})
const isAnswerMode = computed(() => state.value?.status === 'show_answer')

const connectHost = async () => {
  if (!adminToken.value.trim()) {
    errorMessage.value = 'Введи admin token'
    return
  }

  errorMessage.value = ''
  setStoredAdminToken(adminToken.value.trim())

  try {
    state.value = await getHostState(code, adminToken.value.trim())
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Не получилось открыть игру'
  }

  socket.emit('host:join', { code, token: adminToken.value.trim() }, (response: QuizSocketAck<HostQuizState>) => {
    if (!response.ok) {
      errorMessage.value = response.error
      return
    }

    state.value = response.data
  })
}

const hostAction = (event: string) => {
  errorMessage.value = ''
  socket.emit(event, { code, token: adminToken.value.trim() }, (response: QuizSocketAck) => {
    if (!response.ok) errorMessage.value = response.error
  })
}

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 250)

  socket.on('host:state', (nextState: HostQuizState) => {
    state.value = nextState
  })

  if (adminToken.value) void connectHost()
  void generateQr()
})

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  socket.disconnect()
})

watch(
  () => state.value?.currentQuestion?.id,
  () => {
    questionAnimationKey.value += 1
  },
)

const generateQr = async () => {
  qrDataUrl.value = await QRCode.toDataURL(joinUrl.value, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 260,
    color: {
      dark: '#070b1d',
      light: '#ffffff',
    },
  })
}
</script>

<template>
  <main class="host-page">
    <header class="host-header">
      <div class="brand">
        <img src="/logo_trans.png" alt="Izzy Quiz" />
        <div>
          <p>Izzy Quiz Live</p>
          <h1>{{ state?.template.title || 'Host screen' }}</h1>
        </div>
      </div>

      <div class="code-box">
        <span>Код игры</span>
        <strong>{{ code }}</strong>
      </div>
    </header>

    <section v-if="!state" class="connect-panel">
      <label>
        <span>Admin token</span>
        <input v-model="adminToken" type="password" placeholder="dev-admin-token" @keyup.enter="connectHost" />
      </label>
      <button type="button" @click="connectHost">Подключить host</button>
      <p v-if="errorMessage">{{ errorMessage }}</p>
    </section>

    <template v-else>
      <section class="controls">
        <button type="button" @click="hostAction('host:open-lobby')">
          <Unlock :size="20" />
          Открыть вход
        </button>
        <button type="button" @click="hostAction('host:lock-lobby')">
          <Lock :size="20" />
          Закрыть вход
        </button>
        <button type="button" @click="hostAction('host:start')">
          <Play :size="20" />
          Старт
        </button>
        <button type="button" @click="hostAction('host:next-question')">
          <SkipForward :size="20" />
          Вопрос
        </button>
        <button type="button" @click="hostAction('host:close-question')">
          <Square :size="20" />
          Стоп
        </button>
        <button type="button" @click="hostAction('host:show-answer')">
          <Trophy :size="20" />
          Ответ
        </button>
      </section>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <section class="host-grid">
        <article class="stage-card" :key="questionAnimationKey">
          <div class="stage-topline">
            <span>{{ isAnswerMode ? 'Ответ' : state.status }}</span>
            <strong>{{ currentQuestionNumber }} / {{ state.questionCount }}</strong>
          </div>

          <div v-if="state.status === 'question_open'" class="timer-row">
            <strong>{{ remainingSeconds }}</strong>
            <div>
              <span :style="{ width: `${timerProgress}%` }" />
            </div>
          </div>

          <template v-if="state.currentQuestion">
            <p class="question-transition">Вопрос {{ currentQuestionNumber }}</p>
            <h2>{{ state.currentQuestion.text }}</h2>

            <img
              v-if="state.currentQuestion.media?.type === 'image'"
              :src="state.currentQuestion.media.url"
              alt=""
              class="question-media"
            />
            <audio
              v-if="state.currentQuestion.media?.type === 'audio'"
              :src="state.currentQuestion.media.url"
              controls
              class="w-full"
            />

            <div class="answers-grid">
              <div
                v-for="(option, index) in state.currentQuestion.options"
                :key="option.id"
                class="answer-tile"
                :class="{
                  correct: state.status === 'show_answer' && option.id === state.currentQuestion.correctOptionId,
                  dimmed: state.status === 'show_answer' && option.id !== state.currentQuestion.correctOptionId,
                }"
              >
                <span>{{ index + 1 }}</span>
                {{ option.text }}
              </div>
            </div>
          </template>

          <div v-else class="waiting-state">
            <span>{{ state.players.length }}</span>
            <p>игроков в комнате ожидания</p>
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR для входа игроков" class="host-qr" />
            <small>{{ joinUrl }}</small>
          </div>
        </article>

        <aside class="score-card">
          <div class="score-header">
            <span>Ответили: {{ answersForCurrentQuestion.length }}</span>
            <strong>{{ state.players.length }} игроков</strong>
          </div>

          <ol>
            <li v-for="(player, index) in sortedPlayers" :key="player.id">
              <span class="rank-place">{{ index + 1 }}</span>
              <span :class="{ offline: !player.connected }">{{ player.name }}</span>
              <strong>{{ player.score }}</strong>
            </li>
          </ol>
        </aside>
      </section>
    </template>
  </main>
</template>

<style scoped>
.host-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #070b1d, #132640 58%, #231038);
  color: white;
  padding: clamp(18px, 3vw, 36px);
}

.host-header,
.controls,
.host-grid,
.brand,
.code-box,
.stage-topline,
.score-header,
.answer-tile,
.score-card li {
  display: flex;
}

.host-header {
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.brand {
  align-items: center;
  gap: 14px;
}

.brand img {
  width: 62px;
  height: 62px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  padding: 8px;
}

.brand p,
.code-box span,
.stage-topline span,
.score-header span {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.brand h1 {
  font-size: clamp(28px, 4vw, 58px);
  font-weight: 950;
  line-height: 0.95;
}

.code-box {
  min-width: 180px;
  flex-direction: column;
  align-items: center;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.1);
  padding: 14px 20px;
}

.code-box strong {
  font-size: 40px;
  letter-spacing: 0.1em;
}

.connect-panel,
.stage-card,
.score-card,
.controls {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 24px;
  background: rgba(11, 17, 40, 0.82);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.28);
}

.connect-panel {
  display: grid;
  gap: 14px;
  max-width: 520px;
  margin: 80px auto 0;
  padding: 28px;
}

.connect-panel label {
  display: grid;
  gap: 8px;
}

.connect-panel span {
  color: #67e8f9;
  font-weight: 900;
  text-transform: uppercase;
}

.connect-panel input {
  min-height: 54px;
  border-radius: 14px;
  background: #070b1d;
  padding: 0 16px;
  color: white;
  font-weight: 850;
}

.connect-panel button,
.controls button {
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  background: #67e8f9;
  color: #061022;
  font-weight: 950;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.controls {
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 28px;
  padding: 14px;
}

.controls button {
  flex: 1 1 150px;
}

.host-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
  gap: 18px;
  margin-top: 18px;
}

.stage-card,
.score-card {
  padding: clamp(22px, 3vw, 38px);
}

.stage-card {
  animation: question-enter 0.55s ease both;
}

.stage-topline,
.score-header {
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.stage-topline strong,
.score-header strong {
  color: #cbd5e1;
  font-weight: 950;
}

.stage-card h2 {
  margin-top: 26px;
  font-size: clamp(38px, 5vw, 82px);
  line-height: 0.98;
  font-weight: 950;
}

.question-transition {
  margin-top: 24px;
  color: #f0abfc;
  font-size: 14px;
  font-weight: 950;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.timer-row {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  margin-top: 22px;
}

.timer-row strong {
  display: grid;
  height: 62px;
  place-items: center;
  border-radius: 18px;
  background: rgba(103, 232, 249, 0.16);
  color: #67e8f9;
  font-size: 34px;
  font-weight: 950;
}

.timer-row div {
  height: 16px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
}

.timer-row span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #67e8f9, #f0abfc);
  transition: width 0.25s linear;
}

.question-media {
  width: 100%;
  max-height: 32vh;
  object-fit: contain;
  margin-top: 24px;
  border-radius: 20px;
}

.answers-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 32px;
}

.answer-tile {
  align-items: center;
  gap: 16px;
  min-height: 92px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  padding: 18px;
  font-size: clamp(18px, 2vw, 28px);
  font-weight: 900;
}

.answer-tile span {
  display: grid;
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  place-items: center;
  border-radius: 14px;
  background: rgba(103, 232, 249, 0.18);
  color: #67e8f9;
}

.answer-tile.correct {
  border-color: rgba(74, 222, 128, 0.7);
  background: rgba(74, 222, 128, 0.18);
}

.answer-tile.dimmed {
  opacity: 0.42;
}

.waiting-state {
  min-height: 52vh;
  display: grid;
  place-content: center;
  text-align: center;
  color: #cbd5e1;
  font-size: 28px;
  font-weight: 900;
}

.waiting-state span {
  font-size: clamp(90px, 12vw, 180px);
  line-height: 0.9;
  color: white;
}

.host-qr {
  width: min(260px, 70vw);
  margin: 22px auto 0;
  border-radius: 22px;
  background: white;
  padding: 12px;
}

.waiting-state small {
  display: block;
  max-width: 100%;
  margin-top: 12px;
  color: #67e8f9;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.score-card ol {
  display: grid;
  gap: 10px;
  margin-top: 22px;
}

.score-card li {
  align-items: center;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  padding: 14px 16px;
  font-size: 18px;
  font-weight: 900;
}

.rank-place {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 12px;
  background: rgba(103, 232, 249, 0.16);
  color: #67e8f9;
}

.score-card li strong {
  color: #67e8f9;
}

.offline {
  opacity: 0.45;
}

.error-text {
  margin-top: 14px;
  border-radius: 14px;
  background: rgba(248, 113, 113, 0.14);
  padding: 12px 14px;
  color: #fecaca;
  font-weight: 800;
}

@media (max-width: 980px) {
  .host-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .host-header {
    align-items: stretch;
    flex-direction: column;
  }

  .answers-grid {
    grid-template-columns: 1fr;
  }
}

@keyframes question-enter {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
