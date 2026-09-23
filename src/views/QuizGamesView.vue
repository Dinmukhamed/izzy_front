<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { Copy, ExternalLink, FileText, MonitorPlay, Play, Plus, RefreshCw, Settings2, Users } from 'lucide-vue-next'
import { createSession, getQuizErrorMessage, getSessions, getTemplates } from '@/services/quizApi'
import { getStoredAdminToken, setStoredAdminToken } from '@/services/quizSocket'
import type { QuizSessionSummary, QuizStatus, QuizTemplate } from '@/types/quiz'

const adminToken = ref('')
const templates = ref<QuizTemplate[]>([])
const sessions = ref<QuizSessionSummary[]>([])
const selectedTemplateId = ref('')
const selectedSessionCode = ref('')
const showFinished = ref(false)
const qrDataUrl = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const copiedValue = ref('')
let sessionsRefreshTimer: number | undefined

const statusLabels: Record<QuizStatus, string> = {
  lobby_open:'Лобби открыто',lobby_locked:'Лобби закрыто',in_progress:'Игра идёт',countdown:'Обратный отсчёт',question_open:'Идёт вопрос',question_closed:'Ответы закрыты',show_answer:'Показываем ответ',leaderboard:'Рейтинг',paused:'Пауза',finished:'Завершена',
}
const activeTemplates = computed(() => templates.value.filter((template) => template.status === 'active'))
const selectedTemplate = computed(() => activeTemplates.value.find((template) => template.id === selectedTemplateId.value) || null)
const visibleSessions = computed(() => sessions.value.filter((session) => showFinished.value || session.status !== 'finished'))
const selectedSession = computed(() =>
  sessions.value.find((session) => session.code === selectedSessionCode.value) || visibleSessions.value[0] || null,
)
const joinLink = computed(() => selectedSession.value ? `/quiz/join?code=${selectedSession.value.code}` : '')
const absoluteJoinLink = computed(() => `${window.location.origin}${joinLink.value}`)
const controlLink = computed(() => selectedSession.value ? `/quiz/${selectedSession.value.code}/control` : '')
const hostLink = computed(() => selectedSession.value ? `/quiz/${selectedSession.value.code}/host` : '')

async function loadData() {
  if (!adminToken.value.trim()) { errorMessage.value = 'Введите admin token'; return }
  isLoading.value = true; errorMessage.value = ''; successMessage.value = ''
  setStoredAdminToken(adminToken.value.trim())
  try {
    const [loadedTemplates, loadedSessions] = await Promise.all([
      getTemplates(adminToken.value.trim()), getSessions(adminToken.value.trim()),
    ])
    templates.value = loadedTemplates
    sessions.value = loadedSessions
    if (!activeTemplates.value.some((template) => template.id === selectedTemplateId.value)) selectedTemplateId.value = activeTemplates.value[0]?.id || ''
    const storedCode = window.localStorage.getItem('izzy-last-session') || ''
    if (!sessions.value.some((session) => session.code === selectedSessionCode.value)) {
      selectedSessionCode.value = sessions.value.find((session) => session.code === storedCode)?.code || visibleSessions.value[0]?.code || sessions.value[0]?.code || ''
    }
  } catch (error) {
    errorMessage.value = getQuizErrorMessage(error, 'Не удалось загрузить live-игры')
  } finally { isLoading.value = false }
}

async function createLiveGame() {
  if (!selectedTemplate.value) return
  isLoading.value = true; errorMessage.value = ''; successMessage.value = ''
  try {
    const created = await createSession(selectedTemplate.value.id, adminToken.value.trim())
    await loadData()
    selectedSessionCode.value = created.code
    window.localStorage.setItem('izzy-last-session', created.code)
    successMessage.value = `Игра ${created.code} создана и сохранена`
  } catch (error) {
    errorMessage.value = getQuizErrorMessage(error, 'Не удалось создать игру')
  } finally { isLoading.value = false }
}

async function refreshSessions() {
  if (!adminToken.value.trim()) return
  try { sessions.value = await getSessions(adminToken.value.trim()) } catch { /* full refresh shows errors */ }
}

function selectSession(session: QuizSessionSummary) {
  selectedSessionCode.value = session.code
  window.localStorage.setItem('izzy-last-session', session.code)
}

async function generateQr() {
  if (!absoluteJoinLink.value) { qrDataUrl.value = ''; return }
  qrDataUrl.value = await QRCode.toDataURL(absoluteJoinLink.value, { errorCorrectionLevel:'M', margin:1, width:360, color:{dark:'#070b1d',light:'#ffffff'} })
}

async function copyText(value: string, label: string) {
  await navigator.clipboard.writeText(value); copiedValue.value = label
  window.setTimeout(() => { if (copiedValue.value === label) copiedValue.value = '' }, 1600)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value))
}

function questionCountLabel(count: number) {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} вопросов`
  if (last === 1) return `${count} вопрос`
  if (last >= 2 && last <= 4) return `${count} вопроса`
  return `${count} вопросов`
}

function playerCountLabel(count: number) {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} игроков`
  if (last === 1) return `${count} игрок`
  if (last >= 2 && last <= 4) return `${count} игрока`
  return `${count} игроков`
}

watch(() => selectedSession.value?.code, () => void generateQr(), { immediate:true })
onMounted(() => {
  adminToken.value = getStoredAdminToken() || (import.meta.env.DEV ? 'dev-admin-token' : '')
  if (adminToken.value) void loadData()
  sessionsRefreshTimer = window.setInterval(() => { void refreshSessions() }, 5_000)
})
onBeforeUnmount(() => { if (sessionsRefreshTimer) window.clearInterval(sessionsRefreshTimer) })
</script>

<template>
  <main class="games-page"><section class="games-shell">
    <header class="topbar"><div class="brand"><img src="/logo_trans.png" alt="Izzy Quiz" /><div><p>Izzy Quiz Admin</p><h1>Live games</h1></div></div><a class="nav-link" href="/quiz/templates">Шаблоны</a></header>

    <section class="connection-panel"><label><span>Admin token</span><input v-model="adminToken" type="password" placeholder="dev-admin-token" @keyup.enter="loadData" /></label><button type="button" :disabled="isLoading" @click="loadData"><RefreshCw :size="18" />{{ isLoading ? 'Обновляем…' : 'Обновить' }}</button></section>
    <p v-if="errorMessage" class="message error">{{ errorMessage }}</p><p v-if="successMessage" class="message success">{{ successMessage }}</p>

    <section v-if="selectedSession" class="live-stage panel">
      <div class="live-heading"><div><span class="eyebrow">Выбранная игра</span><h2>{{ selectedSession.templateTitle }}</h2><p>{{ statusLabels[selectedSession.status] }} · {{ playerCountLabel(selectedSession.playerCount) }} · вопрос {{ (selectedSession.currentQuestionIndex ?? -1) + 1 }} / {{ selectedSession.questionCount }}</p></div><span :class="['status-pill',selectedSession.status]">{{ statusLabels[selectedSession.status] }}</span></div>
      <div class="code-stage"><span>Код для игроков</span><strong>{{ selectedSession.code }}</strong><button type="button" @click="copyText(selectedSession.code,'code')"><Copy :size="18" />{{ copiedValue === 'code' ? 'Скопировано' : 'Копировать код' }}</button></div>
      <div class="live-tools">
        <div class="qr-wrap"><img v-if="qrDataUrl" :src="qrDataUrl" alt="QR-код входа" /><p>{{ absoluteJoinLink }}</p></div>
        <div class="launch-actions">
          <a class="primary-link" :href="controlLink"><Settings2 /><span><small>Ведущий</small>Управлять игрой</span></a>
          <a :href="hostLink" target="_blank" rel="noreferrer"><MonitorPlay /><span><small>Экран в зале</small>Открыть Host screen</span><ExternalLink :size="18" /></a>
          <a :href="joinLink" target="_blank" rel="noreferrer"><Users /><span><small>Проверка телефона</small>Войти как игрок</span><ExternalLink :size="18" /></a>
          <button type="button" @click="copyText(absoluteJoinLink,'join')"><Copy :size="18" />{{ copiedValue === 'join' ? 'Ссылка скопирована' : 'Скопировать ссылку входа' }}</button>
        </div>
      </div>
    </section>

    <section class="workspace-grid">
      <article class="create-card panel"><div><span class="eyebrow">Новая игра</span><h2>Создать лобби</h2><p>Выберите активный шаблон. Игра сразу сохранится в базе.</p></div><label><span>Шаблон</span><select v-model="selectedTemplateId"><option v-for="template in activeTemplates" :key="template.id" :value="template.id">{{ template.title }} · {{ questionCountLabel(template.questions.length) }}</option></select></label><div v-if="selectedTemplate" class="template-info"><FileText /><div><strong>{{ selectedTemplate.title }}</strong><span>{{ questionCountLabel(selectedTemplate.questions.length) }}</span></div></div><button class="create-button" type="button" :disabled="!selectedTemplate || isLoading" @click="createLiveGame"><Plus :size="21" />Создать live-игру</button></article>

      <article class="sessions-card panel"><header><div><span class="eyebrow">Сохранённые сессии</span><h2>Продолжить игру</h2></div><label class="finished-toggle"><input v-model="showFinished" type="checkbox" />Показывать завершённые</label></header><div v-if="visibleSessions.length" class="sessions-list"><button v-for="session in visibleSessions" :key="session.id" type="button" :class="{selected:session.code === selectedSession?.code}" @click="selectSession(session)"><span class="session-code">{{ session.code }}</span><span class="session-copy"><strong>{{ session.templateTitle }}</strong><small>{{ statusLabels[session.status] }} · {{ playerCountLabel(session.playerCount) }} · {{ formatDate(session.updatedAt) }}</small></span><Play :size="18" /></button></div><div v-else class="empty-state"><strong>Live-игр пока нет</strong><p>Создайте первую игру из активного шаблона.</p></div></article>
    </section>
  </section></main>
</template>

<style scoped>
.games-page{min-height:100vh;background:radial-gradient(circle at 10% 10%,rgba(103,232,249,.12),transparent 28%),linear-gradient(135deg,#070b1d,#132640 58%,#231038);color:#fff;padding:clamp(16px,3vw,36px)}.games-shell{width:min(100%,1200px);margin:auto}.topbar,.brand,.nav-link,.connection-panel button,.live-heading,.code-stage,.live-tools,.launch-actions a,.launch-actions button,.template-info,.create-button,.sessions-card header,.sessions-list button,.finished-toggle{display:flex;align-items:center}.topbar{justify-content:space-between;gap:16px;margin-bottom:18px}.brand{gap:13px}.brand img{width:58px;height:58px;border-radius:17px;background:rgba(255,255,255,.1);padding:7px}.brand p,.eyebrow,label>span,.code-stage>span{color:#67e8f9;font-size:11px;font-weight:950;letter-spacing:.18em;text-transform:uppercase}.brand h1{font-size:clamp(31px,5vw,56px);line-height:.95;font-weight:950;text-transform:uppercase}.nav-link{min-height:44px;justify-content:center;border:1px solid rgba(255,255,255,.13);border-radius:13px;background:rgba(11,17,40,.85);padding:0 16px;color:#fff;font-weight:900}.panel,.connection-panel{border:1px solid rgba(255,255,255,.12);border-radius:21px;background:rgba(11,17,40,.86);box-shadow:0 24px 70px rgba(0,0,0,.24)}.connection-panel{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;margin-bottom:14px;padding:13px}.connection-panel label{display:grid;gap:6px}.connection-panel input,select{width:100%;min-height:48px;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:#070b1d;padding:0 13px;color:#fff;font-size:15px;font-weight:800}.connection-panel button,.create-button{justify-content:center;gap:8px;border-radius:12px;background:#67e8f9;padding:0 17px;color:#061022;font-weight:950}.message{margin-bottom:13px;border-radius:12px;padding:11px 13px;font-weight:850}.message.error{background:rgba(127,29,29,.75);color:#fecaca}.message.success{background:rgba(6,78,59,.7);color:#a7f3d0}.live-stage{margin-bottom:16px;padding:clamp(20px,3vw,30px)}.live-heading{justify-content:space-between;gap:18px}.live-heading h2,.create-card h2,.sessions-card h2{margin-top:5px;font-size:clamp(25px,3vw,38px);line-height:1;font-weight:950}.live-heading p,.create-card>div>p{margin-top:7px;color:#94a3b8;font-weight:750}.status-pill{border-radius:999px;background:rgba(103,232,249,.12);padding:8px 11px;color:#67e8f9;font-size:10px;font-weight:950;text-transform:uppercase}.status-pill.finished{color:#cbd5e1;background:rgba(148,163,184,.12)}.code-stage{min-height:210px;flex-direction:column;justify-content:center;margin-top:18px;border-radius:20px;background:linear-gradient(135deg,rgba(217,70,239,.18),rgba(103,232,249,.13));text-align:center}.code-stage strong{font-size:clamp(78px,14vw,180px);line-height:.9;letter-spacing:.1em;font-weight:950}.code-stage button{display:flex;align-items:center;gap:7px;margin-top:17px;border-radius:11px;background:rgba(255,255,255,.11);padding:11px 14px;color:#fff;font-weight:900}.live-tools{align-items:stretch;gap:18px;margin-top:18px}.qr-wrap{width:min(34%,300px);display:grid;justify-items:center;align-content:start;gap:8px}.qr-wrap img{width:100%;border-radius:18px;background:#fff;padding:9px}.qr-wrap p{max-width:100%;color:#94a3b8;font-size:11px;text-align:center;overflow-wrap:anywhere}.launch-actions{flex:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.launch-actions a,.launch-actions button{min-width:0;gap:11px;border:1px solid rgba(255,255,255,.12);border-radius:15px;background:rgba(255,255,255,.06);padding:15px;color:#fff;text-align:left;font-weight:900}.launch-actions .primary-link{border-color:transparent;background:#67e8f9;color:#061022}.launch-actions span{min-width:0;display:grid;gap:3px}.launch-actions small{opacity:.64;font-size:10px;text-transform:uppercase}.launch-actions a>svg:last-child{margin-left:auto}.workspace-grid{display:grid;grid-template-columns:minmax(300px,.72fr) minmax(0,1.28fr);gap:16px}.create-card,.sessions-card{padding:22px}.create-card{display:grid;align-content:start;gap:17px}.create-card label{display:grid;gap:7px}.template-info{gap:10px;border-radius:13px;background:rgba(255,255,255,.06);padding:13px}.template-info div{display:grid;gap:4px}.template-info span{color:#94a3b8;font-size:12px}.create-button{min-height:50px}.sessions-card header{justify-content:space-between;gap:14px}.finished-toggle{gap:7px;color:#94a3b8;font-size:11px;font-weight:800}.finished-toggle input{accent-color:#67e8f9}.sessions-list{display:grid;gap:8px;margin-top:17px}.sessions-list button{display:grid;grid-template-columns:90px minmax(0,1fr) auto;gap:12px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.045);padding:12px;color:#fff;text-align:left}.sessions-list button.selected{border-color:rgba(103,232,249,.7);background:rgba(103,232,249,.1)}.session-code{color:#67e8f9;font-size:17px;font-weight:950;letter-spacing:.08em}.session-copy{min-width:0;display:grid;gap:4px}.session-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.session-copy small{color:#94a3b8}.empty-state{margin-top:17px;border:1px dashed rgba(255,255,255,.15);border-radius:14px;padding:28px;text-align:center}.empty-state p{margin-top:5px;color:#94a3b8}@media(max-width:850px){.workspace-grid{grid-template-columns:1fr}.live-tools{align-items:center;flex-direction:column}.qr-wrap{width:min(100%,270px)}.launch-actions{width:100%}}@media(max-width:560px){.games-page{padding:11px}.topbar{align-items:flex-start}.brand h1{font-size:27px}.nav-link{font-size:11px}.connection-panel{grid-template-columns:1fr}.code-stage{min-height:160px}.code-stage strong{font-size:18vw}.launch-actions{grid-template-columns:1fr}.sessions-card header{align-items:flex-start;flex-direction:column}.sessions-list button{grid-template-columns:78px minmax(0,1fr)}}
</style>
