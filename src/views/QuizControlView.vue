<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import QRCode from 'qrcode'
import { ExternalLink, FastForward, Lock, Pause, Play, Square, Unlock, UserX, Users } from 'lucide-vue-next'
import { getHostState } from '@/services/quizApi'
import { createQuizSocket, getStoredAdminToken, type QuizSocketAck } from '@/services/quizSocket'
import type { HostQuizState, QuizPlayer, QuizStatus } from '@/types/quiz'

const route = useRoute()
const code = String(route.params.code || '').toUpperCase()
const token = ref(getStoredAdminToken() || (import.meta.env.DEV ? 'dev-admin-token' : ''))
const state = ref<HostQuizState | null>(null)
const errorMessage = ref('')
const isConnected = ref(false)
const isActionPending = ref(false)
const now = ref(Date.now())
const serverOffsetMs = ref(0)
const qrDataUrl = ref('')
const socket = createQuizSocket()
let clockTimer: number | undefined

const statusLabels: Record<QuizStatus, string> = {
  lobby_open: 'Лобби открыто', lobby_locked: 'Лобби закрыто', in_progress: 'Игра идёт',
  countdown: 'Обратный отсчёт', question_open: 'Идёт вопрос', question_closed: 'Ответы закрыты',
  show_answer: 'Показываем ответ', leaderboard: 'Таблица лидеров', paused: 'Пауза', finished: 'Игра завершена',
}
const timedStatuses: QuizStatus[] = ['countdown', 'question_open', 'show_answer', 'leaderboard']
const displayUrl = computed(() => `/quiz/${code}/host`)
const joinUrl = computed(() => `${window.location.origin}/quiz/join?code=${code}`)
const sortedPlayers = computed(() =>
  [...(state.value?.players || [])].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
)
const questionNumber = computed(() =>
  state.value?.currentQuestionIndex === null || state.value?.currentQuestionIndex === undefined
    ? 0
    : state.value.currentQuestionIndex + 1,
)
const remainingSeconds = computed(() => {
  if (!state.value?.phaseEndsAt) return null
  const rawRemaining = new Date(state.value.phaseEndsAt).getTime() - (now.value + serverOffsetMs.value)
  const remaining = Math.min(rawRemaining, phaseDurationMs(state.value.status))
  return Math.max(0, Math.ceil((remaining - 100) / 1000))
})
const primaryAction = computed(() => {
  if (!state.value) return null
  if (state.value.status === 'lobby_open' || state.value.status === 'lobby_locked') {
    return { event: 'host:start', label: 'Начать игру', icon: Play }
  }
  if (state.value.status === 'paused') return { event: 'host:resume', label: 'Продолжить', icon: Play }
  if (timedStatuses.includes(state.value.status)) return { event: 'host:pause', label: 'Пауза', icon: Pause }
  return null
})

function phaseDurationMs(status: QuizStatus) {
  if (status === 'countdown') return 3_000
  if (status === 'question_open') return 20_000
  if (status === 'show_answer') return 4_000
  if (status === 'leaderboard') return 6_000
  return Number.POSITIVE_INFINITY
}

function applyState(nextState: HostQuizState) {
  if (state.value && nextState.stateVersion < state.value.stateVersion) return
  state.value = nextState
  isActionPending.value = false
  serverOffsetMs.value = new Date(nextState.serverNow).getTime() - Date.now()
}

async function loadState() {
  try {
    applyState(await getHostState(code, token.value))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Не получилось загрузить игру'
  }
}

function joinHostRoom() {
  socket.emit('host:join', { code, token: token.value }, (response: QuizSocketAck<HostQuizState>) => {
    if (!response.ok) {
      errorMessage.value = response.error
      return
    }
    errorMessage.value = ''
  })
}

function playerCountLabel(count: number) {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} игроков`
  if (last === 1) return `${count} игрок`
  if (last >= 2 && last <= 4) return `${count} игрока`
  return `${count} игроков`
}

function runAction(event: string) {
  if (isActionPending.value) return
  isActionPending.value = true
  errorMessage.value = ''
  socket.emit(event, { code, token: token.value }, (response: QuizSocketAck<HostQuizState>) => {
    isActionPending.value = false
    if (!response.ok) {
      errorMessage.value = response.error
      return
    }
    applyState(response.data)
  })
}

function revokePlayer(player: QuizPlayer) {
  if (isActionPending.value || player.accessRevoked) return
  if (!window.confirm(`Отключить доступ игрока «${player.name}»? Вернуться с этого телефона уже не получится.`)) return
  isActionPending.value = true
  errorMessage.value = ''
  socket.emit(
    'host:revoke-player',
    { code, token: token.value, playerId: player.id },
    (response: QuizSocketAck<HostQuizState>) => {
      isActionPending.value = false
      if (!response.ok) {
        errorMessage.value = response.error
        return
      }
      applyState(response.data)
    },
  )
}

async function generateQr() {
  qrDataUrl.value = await QRCode.toDataURL(joinUrl.value, { margin: 1, width: 240 })
}

onMounted(() => {
  clockTimer = window.setInterval(() => { now.value = Date.now() }, 200)
  socket.on('connect', () => { isConnected.value = true; joinHostRoom() })
  socket.on('disconnect', () => { isConnected.value = false })
  socket.on('host:state', applyState)
  socket.connect()
  void loadState()
  void generateQr()
})

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  socket.disconnect()
})
</script>

<template>
  <main class="control-page">
    <section class="control-shell">
      <header class="topbar">
        <div><span>Пульт ведущего</span><h1>{{ state?.template.title || code }}</h1></div>
        <div class="top-actions">
          <span :class="['connection', { online: isConnected }]">{{ isConnected ? 'Онлайн' : 'Переподключение' }}</span>
          <a :href="displayUrl" target="_blank" rel="noreferrer">Открыть экран <ExternalLink :size="18" /></a>
        </div>
      </header>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

      <template v-if="state">
        <section class="status-card">
          <div><span>Код игры</span><strong>{{ code }}</strong></div>
          <div><span>Состояние</span><strong>{{ statusLabels[state.status] }}</strong></div>
          <div><span>Прогресс</span><strong>{{ questionNumber }} / {{ state.questionCount }}</strong></div>
          <div><span>Таймер</span><strong>{{ remainingSeconds === null ? '—' : `${remainingSeconds} сек.` }}</strong></div>
        </section>

        <section class="main-control panel">
          <div class="control-copy">
            <span class="eyebrow">Текущее действие</span>
            <h2 v-if="state.currentQuestion">{{ state.currentQuestion.text }}</h2>
            <h2 v-else>Игроки подключаются к лобби</h2>
            <p v-if="state.status === 'question_open'">Ответили {{ state.answeredPlayerIds.length }} из {{ state.players.length }}</p>
            <p v-else>Все дальнейшие этапы переключаются автоматически.</p>
          </div>

          <button
            v-if="primaryAction"
            class="primary-action"
            type="button"
            :disabled="isActionPending"
            @click="runAction(primaryAction.event)"
          >
            <component :is="primaryAction.icon" :size="30" />{{ primaryAction.label }}
          </button>

          <div class="secondary-actions">
            <button
              v-if="state.status === 'lobby_open'"
              type="button"
              @click="runAction('host:lock-lobby')"
            ><Lock :size="18" /> Закрыть вход</button>
            <button
              v-if="state.status === 'lobby_locked'"
              type="button"
              @click="runAction('host:open-lobby')"
            ><Unlock :size="18" /> Открыть вход</button>
            <button
              v-if="timedStatuses.includes(state.status)"
              type="button"
              @click="runAction('host:skip-phase')"
            ><FastForward :size="18" /> Пропустить этап</button>
            <button
              v-if="state.status !== 'finished' && !['lobby_open','lobby_locked'].includes(state.status)"
              class="danger"
              type="button"
              @click="runAction('host:finish')"
            ><Square :size="18" /> Завершить игру</button>
          </div>
        </section>

        <section class="control-grid">
          <article class="players-card panel">
            <header><div><span class="eyebrow">Участники</span><h2>{{ playerCountLabel(state.players.length) }}</h2></div><Users /></header>
            <ol>
              <li v-for="(player, index) in sortedPlayers" :key="player.id">
                <span>{{ index + 1 }}</span><strong :class="{ offline: !player.connected }">{{ player.name }}<small v-if="player.accessRevoked">Доступ отключён</small></strong><b>{{ player.score }}</b>
                <button type="button" :disabled="isActionPending || player.accessRevoked" :title="`Отключить доступ: ${player.name}`" @click="revokePlayer(player)"><UserX :size="17" /></button>
              </li>
            </ol>
          </article>

          <article class="join-card panel">
            <span class="eyebrow">Вход игроков</span>
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR-код входа" />
            <strong>{{ code }}</strong>
            <p>{{ joinUrl }}</p>
          </article>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.control-page{min-height:100vh;background:radial-gradient(circle at 8% 5%,rgba(103,232,249,.13),transparent 27%),radial-gradient(circle at 92% 10%,rgba(217,70,239,.12),transparent 28%),#070b1d;color:#fff;padding:clamp(16px,3vw,36px)}.control-shell{width:min(100%,1240px);margin:auto}.topbar,.top-actions,.status-card,.players-card header,.players-card li,.secondary-actions,.topbar a,.primary-action,.secondary-actions button{display:flex;align-items:center}.topbar{justify-content:space-between;gap:18px;margin-bottom:18px}.topbar>div:first-child>span,.eyebrow,.status-card span{color:#67e8f9;font-size:11px;font-weight:950;letter-spacing:.18em;text-transform:uppercase}.topbar h1{font-size:clamp(30px,4vw,54px);line-height:1;font-weight:950}.top-actions{gap:10px}.topbar a,.secondary-actions button{gap:8px;border:1px solid rgba(255,255,255,.13);border-radius:13px;background:rgba(255,255,255,.07);padding:13px 16px;color:#fff;font-weight:900}.connection{border-radius:999px;background:rgba(244,63,94,.12);padding:8px 11px;color:#fda4af;font-size:11px;font-weight:900;text-transform:uppercase}.connection.online{background:rgba(16,185,129,.13);color:#6ee7b7}.panel,.status-card{border:1px solid rgba(255,255,255,.12);border-radius:22px;background:rgba(11,17,40,.86);box-shadow:0 24px 70px rgba(0,0,0,.22)}.status-card{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;padding:16px}.status-card div{display:grid;gap:6px}.status-card strong{font-size:clamp(18px,2vw,28px)}.main-control{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;padding:clamp(20px,3vw,34px)}.control-copy h2{max-width:850px;margin-top:8px;font-size:clamp(26px,3.2vw,44px);line-height:1.05}.control-copy p{margin-top:10px;color:#94a3b8;font-weight:800}.primary-action{min-width:230px;justify-content:center;gap:10px;border-radius:17px;background:#67e8f9;padding:18px 24px;color:#061022;font-size:20px;font-weight:950;text-transform:uppercase}.secondary-actions{grid-column:1/-1;flex-wrap:wrap;gap:9px;padding-top:15px;border-top:1px solid rgba(255,255,255,.09)}.secondary-actions .danger{border-color:rgba(251,113,133,.3);color:#fecdd3;background:rgba(244,63,94,.1)}.control-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,.6fr);gap:16px;margin-top:16px}.players-card,.join-card{padding:22px}.players-card header{justify-content:space-between}.players-card h2{margin-top:4px;font-size:30px}.players-card ol{display:grid;gap:8px;margin-top:17px}.players-card li{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:11px;border-radius:13px;background:rgba(255,255,255,.06);padding:11px 13px}.players-card li>span{display:grid;width:32px;height:32px;place-items:center;border-radius:9px;background:rgba(103,232,249,.13);color:#67e8f9;font-weight:950}.players-card li>b{color:#67e8f9}.offline{opacity:.45}.join-card{display:grid;justify-items:center;align-content:start;gap:10px;text-align:center}.join-card img{width:min(100%,230px);margin-top:6px;border-radius:18px;background:#fff;padding:9px}.join-card>strong{font-size:40px;letter-spacing:.12em}.join-card p{max-width:100%;color:#94a3b8;font-size:12px;overflow-wrap:anywhere}.error{margin-bottom:14px;border-radius:13px;background:rgba(127,29,29,.75);padding:12px;color:#fecaca;font-weight:850}@media(max-width:800px){.topbar{align-items:flex-start;flex-direction:column}.status-card{grid-template-columns:repeat(2,1fr)}.main-control,.control-grid{grid-template-columns:1fr}.primary-action{width:100%}.top-actions{width:100%;justify-content:space-between}}
.players-card li{grid-template-columns:38px minmax(0,1fr) auto 32px}.players-card li>strong small{display:block;color:#fda4af;font-size:8px;text-transform:uppercase}.players-card li>button{display:grid;width:32px;height:32px;place-items:center;border-radius:9px;background:rgba(244,63,94,.11);color:#fda4af}.players-card li>button:disabled{opacity:.28}
</style>
