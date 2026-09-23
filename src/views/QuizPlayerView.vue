<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, Clock3, Crown, Pause, Send, Trophy, WifiOff, X } from 'lucide-vue-next'
import { getPlayerState } from '@/services/quizApi'
import { createQuizSocket, type QuizSocketAck } from '@/services/quizSocket'
import type { PlayerQuizState, QuizAnswer } from '@/types/quiz'

const route = useRoute()
const router = useRouter()
const code = String(route.params.code || '').toUpperCase()
const playerId = ref(String(route.query.playerId || window.localStorage.getItem(`izzy-player:${code}`) || ''))
const state = ref<PlayerQuizState | null>(null)
const selectedOptionId = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)
const isConnected = ref(false)
const now = ref(Date.now())
const serverOffsetMs = ref(0)
const socket = createQuizSocket()
let clockTimer: number | undefined

const currentPlayer = computed(() => state.value?.players.find((player) => player.id === playerId.value))
const currentAnswer = computed(() => {
  if (!state.value?.currentQuestion) return null
  return state.value.answers.find(
    (answer) => answer.playerId === playerId.value && answer.questionId === state.value?.currentQuestion?.id,
  )
})
const hasAnswered = computed(() =>
  isSubmitting.value || Boolean(playerId.value && state.value?.answeredPlayerIds.includes(playerId.value)),
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
}

function returnToJoin() {
  window.localStorage.removeItem(`izzy-player:${code}`)
  void router.replace(`/quiz/join?code=${code}`)
}

async function loadState() {
  try {
    const nextState = await getPlayerState(code)
    applyState(nextState)
    if (!nextState.players.some((player) => player.id === playerId.value)) returnToJoin()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Не получилось открыть игру'
  }
}

function joinPlayerRoom() {
  socket.emit('player:join-room', { code, playerId: playerId.value }, (response: QuizSocketAck<PlayerQuizState>) => {
    if (!response.ok) {
      if (response.error === 'Player not found') returnToJoin()
      else errorMessage.value = response.error
      return
    }
    errorMessage.value = ''
    applyState(response.data)
  })
}

function submitAnswer(optionId: string) {
  if (!canAnswer.value || !playerId.value) return
  selectedOptionId.value = optionId
  isSubmitting.value = true
  errorMessage.value = ''
  socket.emit('player:answer', { code, playerId: playerId.value, optionId }, (response: QuizSocketAck<QuizAnswer>) => {
    isSubmitting.value = false
    if (!response.ok) {
      errorMessage.value = response.error === 'Time is up' ? 'Время вышло' : response.error
      return
    }
  })
}

onMounted(() => {
  if (!playerId.value) {
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
  () => { selectedOptionId.value = ''; isSubmitting.value = false },
)
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

      <section v-if="state?.status === 'question_open' && state.currentQuestion" class="game-screen question-screen">
        <div class="round-line"><span>Вопрос {{ (state.currentQuestionIndex || 0) + 1 }} / {{ state.questionCount }}</span><strong :class="{ urgent: remainingSeconds <= 5 }"><Clock3 :size="16" /> {{ remainingSeconds }}</strong></div>
        <div class="timer-track"><span :style="{ width: `${timerProgress}%` }" /></div>
        <div class="question-copy"><h1>{{ state.currentQuestion.text }}</h1><p v-if="hasAnswered"><Send :size="17" /> Ответ принят — ждём остальных</p><p v-else>Выбери один вариант</p></div>
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
      <section v-else class="game-screen center-screen waiting-screen"><div class="waiting-pulse"><Trophy /></div><span class="eyebrow">Комната {{ code }}</span><h1>{{ state?.status === 'lobby_locked' ? 'Игра скоро начнётся' : 'Ждём старта' }}</h1><p>Оставайся здесь — всё появится автоматически.</p></section>
    </section>
  </main>
</template>

<style scoped>
.player-page{height:100vh;height:100dvh;overflow:hidden;background:radial-gradient(circle at 85% 8%,rgba(103,232,249,.16),transparent 28%),radial-gradient(circle at 10% 95%,rgba(217,70,239,.14),transparent 32%),#070b1d;color:#fff;padding:max(9px,env(safe-area-inset-top)) 11px max(9px,env(safe-area-inset-bottom))}.phone-shell{width:min(100%,560px);height:100%;min-height:0;margin:auto;display:flex;flex-direction:column;gap:8px}.compact-header,.brand-lockup,.player-summary,.round-line,.question-copy p,.leaderboard-heading,.connection-note{display:flex;align-items:center}.compact-header{min-height:40px;justify-content:space-between;gap:10px}.brand-lockup{gap:7px}.brand-lockup img{width:36px;height:36px;border-radius:11px;background:rgba(255,255,255,.1);padding:5px}.brand-lockup div,.player-summary{display:grid}.brand-lockup span,.player-summary span{color:#94a3b8;font-size:9px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.brand-lockup strong{font-size:16px;letter-spacing:.13em}.player-summary{justify-items:end}.player-summary strong{color:#67e8f9;font-size:17px}.connection-note{justify-content:center;gap:6px;border-radius:9px;background:rgba(245,158,11,.13);padding:6px;color:#fde68a;font-size:11px;font-weight:850}.error-text{border-radius:9px;background:rgba(127,29,29,.9);padding:7px 10px;color:#fecaca;font-size:11px;font-weight:800}.game-screen{flex:1 1 0;min-height:0;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:23px;background:rgba(11,17,40,.82);padding:clamp(13px,3.6vw,19px)}.question-screen{display:grid;grid-template-rows:auto auto minmax(78px,.68fr) minmax(0,2fr);gap:9px}.round-line{justify-content:space-between;color:#94a3b8;font-size:11px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.round-line strong{display:flex;align-items:center;gap:5px;color:#67e8f9;font-size:16px;font-variant-numeric:tabular-nums}.round-line strong.urgent{color:#fb7185}.timer-track{height:6px;overflow:hidden;border-radius:99px;background:rgba(255,255,255,.1)}.timer-track span{display:block;height:100%;background:linear-gradient(90deg,#d946ef,#67e8f9);transition:width .1s linear}.question-copy{min-height:0;display:flex;flex-direction:column;justify-content:center}.question-copy h1{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:4;font-size:clamp(21px,6vw,35px);line-height:1.04;font-weight:950}.question-copy p{gap:5px;margin-top:6px;color:#94a3b8;font-size:11px;font-weight:800}.question-copy p:has(svg){color:#67e8f9}.option-grid{min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:8px}.option-grid button{min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;gap:7px;border:2px solid transparent;border-radius:17px;padding:clamp(9px,2.8vw,14px);color:#fff;text-align:left}.option-1{background:#b91c1c}.option-2{background:#1d4ed8}.option-3{background:#b45309}.option-4{background:#15803d}.option-grid button>span{display:grid;width:28px;height:28px;place-items:center;border-radius:8px;background:rgba(255,255,255,.2);font-weight:950}.option-grid button strong{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:4;font-size:clamp(15px,4.2vw,21px);line-height:1.06;font-weight:950}.option-grid button.selected{border-color:#fff;transform:scale(.97);box-shadow:0 0 0 3px rgba(103,232,249,.6)}.option-grid button:disabled:not(.selected){opacity:.4}.center-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.eyebrow{color:#67e8f9;font-size:10px;font-weight:950;letter-spacing:.15em;text-transform:uppercase}.center-screen h1,.leaderboard-heading h1,.final-screen h1{margin-top:6px;font-size:clamp(32px,9vw,50px);line-height:.98;font-weight:950}.countdown-number{font-size:clamp(130px,38vw,220px);line-height:.8;font-weight:950;animation:pop .7s ease}.result-icon,.waiting-pulse,.trophy-icon{display:grid;place-items:center;border-radius:50%}.result-icon{width:clamp(70px,20vw,100px);height:clamp(70px,20vw,100px);margin-bottom:14px;background:#fb7185;box-shadow:0 0 0 10px rgba(251,113,133,.12)}.result-icon svg{width:55%;height:55%;stroke-width:3.4}.is-correct .result-icon{background:#4ade80;color:#052e16}.correct-answer{max-width:420px;margin-top:14px;color:#cbd5e1;font-size:clamp(14px,3.8vw,18px)}.correct-answer strong{color:#fff}.result-stats{width:min(100%,420px);display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:clamp(19px,5vh,35px)}.result-stats div{display:grid;gap:4px;border-radius:14px;background:rgba(255,255,255,.07);padding:11px 6px}.result-stats span{color:#94a3b8;font-size:9px;font-weight:850;text-transform:uppercase}.result-stats strong{font-size:clamp(18px,5vw,25px)}.leaderboard-screen{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:12px}.leaderboard-heading{gap:10px}.trophy-icon{width:45px;height:45px;flex:0 0 45px;background:#facc15;color:#422006}.leaderboard-heading h1{font-size:clamp(24px,6.7vw,36px)}.leaderboard-list{min-height:0;display:grid;align-content:center;gap:6px}.leaderboard-list li{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:8px;border:1px solid transparent;border-radius:14px;background:rgba(255,255,255,.07);padding:clamp(7px,1.6vh,11px)}.leaderboard-list li.current{border-color:rgba(103,232,249,.7);background:rgba(103,232,249,.13)}.leaderboard-list li.separated{margin-top:4px;border-style:dashed}.rank{display:flex;align-items:center;gap:3px;color:#94a3b8;font-weight:950}.rank svg{color:#facc15}.leaderboard-list li>strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(14px,3.8vw,18px)}.leaderboard-list small{margin-left:6px;color:#67e8f9;font-size:8px;text-transform:uppercase}.score{color:#67e8f9;font-size:clamp(15px,4.2vw,20px);font-weight:950}.host-note{color:#94a3b8;text-align:center;font-size:10px;font-weight:800}.waiting-pulse{width:72px;height:72px;margin-bottom:17px;background:rgba(103,232,249,.14);color:#67e8f9;animation:pulse 1.8s infinite}.waiting-screen p{max-width:310px;margin-top:14px;color:#94a3b8;font-size:14px}.final-screen{display:flex;flex-direction:column;align-items:center;text-align:center}.final-trophy{width:62px;height:62px;color:#facc15}.personal-final{width:min(100%,330px);display:grid;gap:4px;margin-top:16px;border:1px solid rgba(103,232,249,.35);border-radius:17px;background:rgba(103,232,249,.1);padding:13px}.personal-final span{color:#94a3b8;font-size:10px;text-transform:uppercase}.personal-final strong{font-size:38px}.personal-final b{color:#67e8f9}.final-screen ol{width:100%;display:grid;gap:6px;margin-top:15px}.final-screen li{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:8px;border-radius:13px;background:rgba(255,255,255,.07);padding:9px 11px;text-align:left}.final-screen li>span{display:grid;width:30px;height:30px;place-items:center;border-radius:9px;background:#facc15;color:#422006;font-weight:950}.final-screen li>b{color:#67e8f9}@keyframes pulse{50%{transform:scale(1.08)}}@keyframes pop{from{opacity:0;transform:scale(1.4)}to{opacity:1;transform:scale(1)}}@media(max-height:680px){.game-screen{padding:11px;border-radius:18px}.question-screen{grid-template-rows:auto auto minmax(65px,.55fr) minmax(0,2fr)}.option-grid button{border-radius:13px}.result-stats{margin-top:15px}.leaderboard-list{gap:4px}.leaderboard-list li{padding-block:6px}}
</style>
