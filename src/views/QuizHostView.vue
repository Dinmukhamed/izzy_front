<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import QRCode from 'qrcode'
import { Check, Clock3, Crown, Pause, Trophy, Users, WifiOff } from 'lucide-vue-next'
import { getPlayerState } from '@/services/quizApi'
import { createQuizSocket, type QuizSocketAck } from '@/services/quizSocket'
import type { PlayerQuizState } from '@/types/quiz'

const route = useRoute()
const code = String(route.params.code || '').toUpperCase()
const state = ref<PlayerQuizState | null>(null)
const errorMessage = ref('')
const qrDataUrl = ref('')
const now = ref(Date.now())
const serverOffsetMs = ref(0)
const isConnected = ref(false)
const socket = createQuizSocket()
let clockTimer: number | undefined

const joinUrl = computed(() => `${window.location.origin}/quiz/join?code=${code}`)
const sortedPlayers = computed(() =>
  [...(state.value?.players || [])].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
)
const leaders = computed(() => sortedPlayers.value.slice(0, 5))
const podium = computed(() => sortedPlayers.value.slice(0, 3))
const currentQuestionNumber = computed(() =>
  state.value?.currentQuestionIndex === null || state.value?.currentQuestionIndex === undefined
    ? 0
    : state.value.currentQuestionIndex + 1,
)
const remainingMs = computed(() => {
  if (!state.value?.phaseEndsAt) return 0
  const rawRemaining = new Date(state.value.phaseEndsAt).getTime() - (now.value + serverOffsetMs.value)
  return Math.max(0, Math.min(rawRemaining, phaseDurationMs(state.value.status)))
})
const remainingSeconds = computed(() => Math.max(0, Math.ceil((remainingMs.value - 100) / 1000)))
const countdownNumber = computed(() => Math.max(1, remainingSeconds.value))
const timerProgress = computed(() => Math.max(0, Math.min(100, (remainingMs.value / 20_000) * 100)))
const answeredCount = computed(() => state.value?.answeredPlayerIds.length || 0)
const correctOption = computed(() =>
  state.value?.currentQuestion?.options.find(
    (option) => option.id === state.value?.currentQuestion?.correctOptionId,
  ),
)
const latestPlayers = computed(() => [...(state.value?.players || [])].slice(-10).reverse())

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

async function loadState() {
  try {
    applyState(await getPlayerState(code))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Не получилось открыть экран игры'
  }
}

function joinDisplayRoom() {
  socket.emit('display:join-room', { code }, (response: QuizSocketAck<PlayerQuizState>) => {
    if (!response.ok) {
      errorMessage.value = response.error
      return
    }
    errorMessage.value = ''
    applyState(response.data)
  })
}

async function generateQr() {
  qrDataUrl.value = await QRCode.toDataURL(joinUrl.value, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 420,
    color: { dark: '#070b1d', light: '#ffffff' },
  })
}

onMounted(() => {
  clockTimer = window.setInterval(() => { now.value = Date.now() }, 100)
  socket.on('connect', () => {
    isConnected.value = true
    joinDisplayRoom()
  })
  socket.on('disconnect', () => { isConnected.value = false })
  socket.on('session:state', applyState)
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
  <main class="display-page">
    <header class="display-header">
      <div class="brand">
        <img src="/logo_trans.png" alt="Izzy Quiz" />
        <div>
          <span>Izzy Quiz Live</span>
          <strong>{{ state?.templateTitle || 'Host screen' }}</strong>
        </div>
      </div>
      <div class="header-meta">
        <span v-if="!isConnected" class="connection-warning"><WifiOff :size="17" /> Переподключение</span>
        <div class="compact-code"><span>Код</span><strong>{{ code }}</strong></div>
      </div>
    </header>

    <section v-if="errorMessage && !state" class="center-state error-state">
      <WifiOff :size="64" />
      <h1>Нет связи с игрой</h1>
      <p>{{ errorMessage }}</p>
    </section>

    <template v-else-if="state">
      <section v-if="state.status === 'lobby_open' || state.status === 'lobby_locked'" class="lobby-layout">
        <div class="lobby-copy">
          <span class="eyebrow">Подключайтесь к игре</span>
          <h1>{{ code }}</h1>
          <p>Наведите камеру телефона на QR-код</p>
          <div class="player-count"><Users /><strong>{{ state.players.length }}</strong><span>уже в игре</span></div>
          <div v-if="latestPlayers.length" class="player-chips">
            <span v-for="player in latestPlayers" :key="player.id">{{ player.name }}</span>
          </div>
        </div>
        <div class="qr-panel">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR-код для входа" />
          <strong>{{ joinUrl }}</strong>
          <span v-if="state.status === 'lobby_locked'">Вход временно закрыт</span>
        </div>
      </section>

      <section v-else-if="state.status === 'countdown'" class="center-state countdown-state">
        <span class="eyebrow">Вопрос {{ currentQuestionNumber }} из {{ state.questionCount }}</span>
        <div :key="countdownNumber" class="countdown-number">{{ countdownNumber }}</div>
        <h1>Приготовьтесь</h1>
      </section>

      <section v-else-if="state.status === 'question_open' && state.currentQuestion" class="question-stage">
        <div class="stage-meta">
          <span>Вопрос {{ currentQuestionNumber }} / {{ state.questionCount }}</span>
          <span><Users :size="19" /> Ответили {{ answeredCount }} / {{ state.players.length }}</span>
        </div>
        <div class="question-main">
          <h1>{{ state.currentQuestion.text }}</h1>
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
          />
        </div>
        <div class="host-timer">
          <strong :class="{ urgent: remainingSeconds <= 5 }"><Clock3 />{{ remainingSeconds }}</strong>
          <div><span :style="{ width: `${timerProgress}%` }" /></div>
        </div>
      </section>

      <section v-else-if="state.status === 'show_answer' && state.currentQuestion" class="answer-stage center-state">
        <div class="answer-icon"><Check /></div>
        <span class="eyebrow">Правильный ответ</span>
        <p>{{ state.currentQuestion.text }}</p>
        <h1>{{ correctOption?.text }}</h1>
        <small>Рейтинг появится через {{ remainingSeconds }} сек.</small>
      </section>

      <section v-else-if="state.status === 'leaderboard'" class="leaderboard-stage">
        <div class="leaderboard-title">
          <div class="trophy"><Trophy /></div>
          <div><span class="eyebrow">После вопроса {{ currentQuestionNumber }}</span><h1>Лидеры игры</h1></div>
          <strong>Дальше через {{ remainingSeconds }}</strong>
        </div>
        <ol>
          <li v-for="(player, index) in leaders" :key="player.id" :class="`place-${index + 1}`">
            <span><Crown v-if="index === 0" />{{ index + 1 }}</span>
            <strong>{{ player.name }}</strong>
            <b>{{ player.score }}</b>
          </li>
        </ol>
      </section>

      <section v-else-if="state.status === 'finished'" class="final-stage">
        <div class="confetti" aria-hidden="true"><i v-for="index in 24" :key="index" /></div>
        <span class="eyebrow">Игра завершена</span>
        <h1>Победители</h1>
        <div class="podium">
          <article v-if="podium[1]" class="podium-place second"><span>2</span><strong>{{ podium[1].name }}</strong><b>{{ podium[1].score }}</b></article>
          <article v-if="podium[0]" class="podium-place first"><Crown /><span>1</span><strong>{{ podium[0].name }}</strong><b>{{ podium[0].score }}</b></article>
          <article v-if="podium[2]" class="podium-place third"><span>3</span><strong>{{ podium[2].name }}</strong><b>{{ podium[2].score }}</b></article>
        </div>
      </section>

      <section v-else-if="state.status === 'paused'" class="center-state paused-state">
        <Pause />
        <span class="eyebrow">Пауза</span>
        <h1>Скоро продолжим</h1>
      </section>

      <section v-else class="center-state"><h1>Подготавливаем следующий этап…</h1></section>
    </template>
  </main>
</template>

<style scoped>
.display-page { height: 100vh; height: 100dvh; overflow: hidden; display: grid; grid-template-rows: auto minmax(0,1fr); gap: clamp(10px,1.8vh,20px); background: radial-gradient(circle at 8% 8%,rgba(103,232,249,.14),transparent 26%),radial-gradient(circle at 92% 92%,rgba(217,70,239,.14),transparent 28%),#070b1d; color:#fff; padding:clamp(16px,2.6vw,36px); }
.display-header,.brand,.header-meta,.compact-code,.stage-meta,.host-timer,.player-count,.leaderboard-title,.leaderboard-stage li { display:flex; align-items:center; }
.display-header { min-width:0; justify-content:space-between; gap:24px; }
.brand { min-width:0; gap:13px; }.brand img{width:clamp(44px,5vw,68px);height:clamp(44px,5vw,68px);padding:7px;border-radius:18px;background:rgba(255,255,255,.1)}
.brand div{min-width:0;display:grid;gap:3px}.brand span,.eyebrow,.compact-code span{color:#67e8f9;font-size:clamp(9px,1vw,13px);font-weight:950;letter-spacing:.2em;text-transform:uppercase}.brand strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(24px,3.5vw,52px);line-height:1;font-weight:950}
.header-meta{gap:12px}.connection-warning{display:flex;align-items:center;gap:7px;color:#fda4af;font-weight:900}.compact-code{gap:12px;border:1px solid rgba(255,255,255,.12);border-radius:17px;background:rgba(255,255,255,.08);padding:10px 16px}.compact-code{flex-direction:column;gap:2px}.compact-code strong{font-size:clamp(24px,3vw,42px);line-height:1;letter-spacing:.12em}
.lobby-layout{min-height:0;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);gap:clamp(18px,3vw,42px);border:1px solid rgba(255,255,255,.12);border-radius:30px;background:rgba(11,17,40,.82);padding:clamp(24px,4vw,58px)}
.lobby-copy{min-width:0;display:flex;flex-direction:column;justify-content:center}.lobby-copy h1{margin-top:1vh;font-size:clamp(86px,14vw,210px);line-height:.86;letter-spacing:.07em;font-weight:950}.lobby-copy>p{margin-top:2vh;color:#cbd5e1;font-size:clamp(18px,2.3vw,34px);font-weight:800}.player-count{gap:12px;margin-top:3vh}.player-count svg{color:#67e8f9}.player-count strong{font-size:clamp(30px,4vw,58px)}.player-count span{color:#94a3b8;font-size:clamp(16px,1.6vw,24px);font-weight:850}.player-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:2vh}.player-chips span{border-radius:999px;background:rgba(255,255,255,.08);padding:8px 13px;font-weight:850}
.qr-panel{min-height:0;display:grid;align-content:center;justify-items:center;gap:12px;text-align:center}.qr-panel img{width:min(34vw,42vh,410px);border-radius:24px;background:#fff;padding:12px}.qr-panel strong{max-width:100%;color:#67e8f9;font-size:clamp(12px,1.2vw,17px);overflow-wrap:anywhere}.qr-panel span{color:#fda4af;font-weight:900}
.center-state,.question-stage,.leaderboard-stage,.final-stage{min-height:0;border:1px solid rgba(255,255,255,.12);border-radius:30px;background:rgba(11,17,40,.82);box-shadow:0 30px 90px rgba(0,0,0,.25)}.center-state{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4vw}.center-state h1{font-size:clamp(48px,7vw,110px);line-height:.95;font-weight:950}.center-state p{margin-top:18px;color:#cbd5e1;font-size:clamp(17px,2vw,28px)}
.countdown-number{font-size:clamp(150px,25vw,360px);line-height:.78;font-weight:950;animation:countdown .8s ease both}.countdown-state h1{margin-top:3vh;font-size:clamp(36px,5vw,74px)}
.question-stage{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:2vh;padding:clamp(24px,3vw,48px)}.stage-meta{justify-content:space-between;color:#94a3b8;font-size:clamp(14px,1.5vw,22px);font-weight:900;text-transform:uppercase}.stage-meta span{display:flex;align-items:center;gap:8px}.question-main{min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2vh;text-align:center}.question-main h1{max-width:1500px;font-size:clamp(48px,6.4vw,108px);line-height:.98;font-weight:950}.question-media{max-width:80%;max-height:38vh;object-fit:contain;border-radius:22px}.question-main audio{width:min(100%,760px)}
.host-timer{gap:18px}.host-timer>strong{display:flex;align-items:center;justify-content:center;gap:8px;min-width:108px;color:#67e8f9;font-size:clamp(30px,4vw,56px);font-variant-numeric:tabular-nums}.host-timer>strong.urgent{color:#fb7185}.host-timer>div{height:18px;flex:1;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.1)}.host-timer>div span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#d946ef,#67e8f9);transition:width .1s linear}
.answer-icon{display:grid;width:clamp(76px,8vw,122px);height:clamp(76px,8vw,122px);place-items:center;border-radius:50%;background:#4ade80;color:#052e16;box-shadow:0 0 0 16px rgba(74,222,128,.1)}.answer-icon svg{width:55%;height:55%;stroke-width:4}.answer-stage p{max-width:1200px;margin-top:3vh}.answer-stage h1{max-width:1400px;margin-top:2vh;color:#4ade80}.answer-stage small{margin-top:3vh;color:#94a3b8;font-size:18px;font-weight:850}
.leaderboard-stage{display:grid;grid-template-rows:auto minmax(0,1fr);gap:2vh;padding:clamp(24px,3vw,46px)}.leaderboard-title{gap:16px}.leaderboard-title>strong{margin-left:auto;color:#94a3b8}.leaderboard-title h1{font-size:clamp(38px,5vw,72px);line-height:1;font-weight:950}.trophy{display:grid;width:64px;height:64px;place-items:center;border-radius:20px;background:#facc15;color:#422006}.leaderboard-stage ol{min-height:0;display:grid;align-content:center;gap:1.2vh}.leaderboard-stage li{display:grid;grid-template-columns:70px minmax(0,1fr) auto;gap:18px;border-radius:18px;background:rgba(255,255,255,.07);padding:clamp(12px,1.5vh,20px) 22px}.leaderboard-stage li>span{display:flex;align-items:center;gap:7px;color:#94a3b8;font-size:clamp(20px,2.2vw,32px);font-weight:950}.leaderboard-stage li>strong{font-size:clamp(24px,2.8vw,40px)}.leaderboard-stage li>b{color:#67e8f9;font-size:clamp(24px,2.8vw,40px)}.leaderboard-stage .place-1{border:1px solid rgba(250,204,21,.55);background:rgba(250,204,21,.1)}.place-1 svg{color:#facc15}
.final-stage{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3vh 4vw}.final-stage>h1{margin-top:1vh;font-size:clamp(54px,7vw,100px);line-height:.9;font-weight:950}.podium{z-index:1;width:min(100%,1200px);min-height:0;display:flex;align-items:flex-end;justify-content:center;gap:clamp(12px,2vw,28px);margin-top:4vh}.podium-place{width:30%;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;border-radius:24px 24px 10px 10px;background:rgba(255,255,255,.09);padding:24px 15px;text-align:center;animation:podium-in .7s ease both}.podium-place.first{min-height:38vh;border:2px solid rgba(250,204,21,.7);background:linear-gradient(180deg,rgba(250,204,21,.22),rgba(255,255,255,.08));animation-delay:.8s}.podium-place.second{min-height:29vh;animation-delay:.35s}.podium-place.third{min-height:23vh;animation-delay:.1s}.podium-place>span{font-size:clamp(36px,5vw,72px);font-weight:950}.podium-place>strong{max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:clamp(22px,2.5vw,38px)}.podium-place>b{margin-top:10px;color:#67e8f9;font-size:clamp(20px,2vw,32px)}.podium-place>svg{color:#facc15;width:50px;height:50px}.confetti{position:absolute;inset:0;pointer-events:none}.confetti i{position:absolute;top:-10%;width:10px;height:22px;background:#67e8f9;animation:fall 4s linear infinite}.confetti i:nth-child(3n){background:#facc15}.confetti i:nth-child(3n+1){background:#d946ef}.confetti i:nth-child(odd){transform:rotate(25deg)}.confetti i:nth-child(1){left:4%;animation-delay:.2s}.confetti i:nth-child(2){left:9%;animation-delay:1.3s}.confetti i:nth-child(3){left:14%;animation-delay:2.1s}.confetti i:nth-child(4){left:19%;animation-delay:.8s}.confetti i:nth-child(5){left:24%;animation-delay:2.8s}.confetti i:nth-child(6){left:29%;animation-delay:1.8s}.confetti i:nth-child(7){left:34%;animation-delay:.4s}.confetti i:nth-child(8){left:39%;animation-delay:2.4s}.confetti i:nth-child(9){left:44%;animation-delay:1.1s}.confetti i:nth-child(10){left:49%;animation-delay:3.1s}.confetti i:nth-child(11){left:54%;animation-delay:.6s}.confetti i:nth-child(12){left:59%;animation-delay:2s}.confetti i:nth-child(13){left:64%;animation-delay:1.5s}.confetti i:nth-child(14){left:69%;animation-delay:2.6s}.confetti i:nth-child(15){left:74%;animation-delay:.9s}.confetti i:nth-child(16){left:79%;animation-delay:3.3s}.confetti i:nth-child(17){left:84%;animation-delay:1.7s}.confetti i:nth-child(18){left:89%;animation-delay:.3s}.confetti i:nth-child(19){left:94%;animation-delay:2.2s}
.paused-state>svg{width:100px;height:100px;margin-bottom:24px;color:#67e8f9}.error-state{color:#fda4af}.error-state h1{margin-top:20px}
@keyframes countdown{from{opacity:0;transform:scale(1.45)}to{opacity:1;transform:scale(1)}}@keyframes podium-in{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}@keyframes fall{to{transform:translateY(120vh) rotate(540deg)}}
@media(max-width:800px){.lobby-layout{grid-template-columns:1fr 290px}.lobby-copy h1{font-size:12vw}.player-chips{display:none}.question-main h1{font-size:7vw}.display-page{padding:14px}.brand strong{max-width:55vw}}
</style>
