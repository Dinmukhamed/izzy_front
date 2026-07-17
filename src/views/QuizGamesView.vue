<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import {
  Copy,
  ExternalLink,
  FileText,
  MonitorPlay,
  QrCode,
  RefreshCw,
  Rocket,
  RotateCcw,
  Users,
} from 'lucide-vue-next'
import { createSession, getQuizErrorMessage, getTemplates } from '@/services/quizApi'
import { getStoredAdminToken, setStoredAdminToken } from '@/services/quizSocket'
import type { CreateSessionResponse, QuizTemplate } from '@/types/quiz'

const adminToken = ref('')
const templates = ref<QuizTemplate[]>([])
const selectedTemplateId = ref('')
const createdSession = ref<CreateSessionResponse | null>(null)
const qrDataUrl = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const copiedValue = ref('')

const activeTemplates = computed(() => templates.value.filter((template) => template.status === 'active'))
const selectedTemplate = computed(
  () => activeTemplates.value.find((template) => template.id === selectedTemplateId.value) || null,
)
const hostLink = computed(() => (createdSession.value ? `/quiz/${createdSession.value.code}/host` : ''))
const joinLink = computed(() => (createdSession.value ? `/quiz/join?code=${createdSession.value.code}` : ''))
const absoluteHostLink = computed(() => `${window.location.origin}${hostLink.value}`)
const absoluteJoinLink = computed(() => `${window.location.origin}${joinLink.value}`)

const loadTemplates = async () => {
  if (!adminToken.value.trim()) {
    errorMessage.value = 'Enter the admin token first'
    return
  }

  errorMessage.value = ''
  setStoredAdminToken(adminToken.value.trim())

  try {
    templates.value = await getTemplates(adminToken.value.trim())
    if (!activeTemplates.value.some((template) => template.id === selectedTemplateId.value)) {
      selectedTemplateId.value = activeTemplates.value[0]?.id || ''
    }
  } catch (error) {
    errorMessage.value = getQuizErrorMessage(error, 'Could not load templates')
  }
}

const createLiveGame = async () => {
  if (!selectedTemplate.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    createdSession.value = await createSession(selectedTemplate.value.id, adminToken.value.trim())
    await generateQr()
  } catch (error) {
    errorMessage.value = getQuizErrorMessage(error, 'Could not create live game')
  } finally {
    isLoading.value = false
  }
}

const generateQr = async () => {
  if (!joinLink.value) return

  qrDataUrl.value = await QRCode.toDataURL(absoluteJoinLink.value, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 360,
    color: {
      dark: '#070b1d',
      light: '#ffffff',
    },
  })
}

const copyText = async (text: string, label: string) => {
  await navigator.clipboard.writeText(text)
  copiedValue.value = label
  window.setTimeout(() => {
    if (copiedValue.value === label) copiedValue.value = ''
  }, 1800)
}

const resetCreatedSession = () => {
  createdSession.value = null
  qrDataUrl.value = ''
  copiedValue.value = ''
}

watch(joinLink, () => {
  if (joinLink.value) void generateQr()
})

onMounted(() => {
  adminToken.value = getStoredAdminToken()
  if (adminToken.value) void loadTemplates()
})
</script>

<template>
  <main class="games-page">
    <section class="games-shell">
      <header class="topbar">
        <div class="brand">
          <img src="/logo_trans.png" alt="Izzy Quiz" />
          <div>
            <p>Izzy Quiz Admin</p>
            <h1>Live games</h1>
          </div>
        </div>
        <a class="nav-link" href="/quiz/templates">Templates</a>
      </header>

      <section class="token-panel">
        <label>
          <span>Admin token</span>
          <input
            v-model="adminToken"
            type="password"
            placeholder="dev-admin-token"
            @keyup.enter="loadTemplates"
          />
        </label>
        <button type="button" @click="loadTemplates">
          <RefreshCw :size="18" />
          Connect
        </button>
      </section>

      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>

      <section v-if="!createdSession" class="setup-panel panel">
        <div class="section-heading">
          <p class="eyebrow">Step 1</p>
          <h2>Create a live game</h2>
          <p>Select an active template. We will create a new lobby and generate a player code.</p>
        </div>

        <template v-if="activeTemplates.length">
          <label class="template-select">
            <span>Game template</span>
            <select v-model="selectedTemplateId">
              <option v-for="template in activeTemplates" :key="template.id" :value="template.id">
                {{ template.title }} · {{ template.questions.length }} questions
              </option>
            </select>
          </label>

          <div v-if="selectedTemplate" class="selected-template">
            <FileText :size="22" />
            <div>
              <strong>{{ selectedTemplate.title }}</strong>
              <span>{{ selectedTemplate.questions.length }} questions · active template</span>
            </div>
          </div>

          <button
            class="primary-button"
            type="button"
            :disabled="!selectedTemplate || isLoading"
            @click="createLiveGame"
          >
            <Rocket :size="22" />
            {{ isLoading ? 'Creating game...' : 'Create live game' }}
          </button>
        </template>

        <div v-else class="empty-state">
          <h3>No active templates</h3>
          <p>Create a template or change one to active before starting a live game.</p>
          <a href="/quiz/templates">Open templates</a>
        </div>
      </section>

      <section v-else class="live-panel panel">
        <header class="live-panel-header">
          <div>
            <p class="eyebrow">Live game ready</p>
            <h2>{{ selectedTemplate?.title }}</h2>
          </div>
          <button class="new-game-button" type="button" @click="resetCreatedSession">
            <RotateCcw :size="18" />
            New game
          </button>
        </header>

        <div class="code-stage">
          <span>Player game code</span>
          <strong>{{ createdSession.code }}</strong>
          <button type="button" @click="copyText(createdSession.code, 'code')">
            <Copy :size="18" />
            {{ copiedValue === 'code' ? 'Code copied' : 'Copy code' }}
          </button>
        </div>

        <div class="join-section">
          <div class="join-heading">
            <QrCode :size="24" />
            <div>
              <h3>Players join here</h3>
              <p>Show this QR code or share the player link.</p>
            </div>
          </div>

          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR for player join page" class="qr-code" />
          <p class="join-url">{{ absoluteJoinLink }}</p>
        </div>

        <div class="launch-actions">
          <a class="action-link action-link--primary" :href="hostLink" target="_blank" rel="noreferrer">
            <MonitorPlay :size="22" />
            <span>
              <small>Open on the main screen</small>
              Host screen
            </span>
            <ExternalLink :size="19" />
          </a>

          <a class="action-link" :href="joinLink" target="_blank" rel="noreferrer">
            <Users :size="22" />
            <span>
              <small>Test the player flow</small>
              Player join
            </span>
            <ExternalLink :size="19" />
          </a>

          <button class="copy-link-button" type="button" @click="copyText(absoluteHostLink, 'host')">
            <Copy :size="18" />
            {{ copiedValue === 'host' ? 'Host link copied' : 'Copy host link' }}
          </button>
          <button class="copy-link-button" type="button" @click="copyText(absoluteJoinLink, 'join')">
            <Copy :size="18" />
            {{ copiedValue === 'join' ? 'Player link copied' : 'Copy player link' }}
          </button>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.games-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at 10% 10%, rgba(103, 232, 249, 0.12), transparent 28%),
    linear-gradient(135deg, #070b1d, #132640 58%, #231038);
  color: white;
  padding: clamp(16px, 3vw, 36px);
}

.games-shell {
  width: min(100%, 1180px);
  margin: 0 auto;
}

.topbar,
.brand,
.token-panel button,
.nav-link,
.selected-template,
.primary-button,
.live-panel-header,
.new-game-button,
.code-stage button,
.join-heading,
.action-link,
.copy-link-button {
  display: flex;
  align-items: center;
}

.topbar {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.brand {
  gap: 14px;
}

.brand img {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  padding: 8px;
}

.brand p,
.eyebrow,
label > span,
.code-stage > span {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.brand h1 {
  font-size: clamp(34px, 5vw, 64px);
  line-height: 0.95;
  font-weight: 950;
  text-transform: uppercase;
}

.nav-link,
.token-panel,
.panel {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(11, 17, 40, 0.88);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.26);
}

.nav-link {
  min-height: 48px;
  justify-content: center;
  border-radius: 14px;
  padding: 0 18px;
  color: white;
  font-weight: 900;
  text-transform: uppercase;
}

.token-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  border-radius: 18px;
  padding: 14px;
  margin-bottom: 16px;
}

label {
  display: grid;
  gap: 8px;
}

input,
select {
  width: 100%;
  min-height: 50px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 13px;
  background: rgba(7, 11, 29, 0.92);
  padding: 0 14px;
  color: white;
  font-size: 16px;
  font-weight: 750;
  outline: none;
}

input:focus,
select:focus {
  border-color: rgba(103, 232, 249, 0.8);
  box-shadow: 0 0 0 3px rgba(103, 232, 249, 0.12);
}

button,
.nav-link,
.action-link {
  line-height: 1;
}

button :deep(svg),
.nav-link :deep(svg),
.action-link :deep(svg) {
  display: block;
  flex: 0 0 auto;
}

.token-panel button,
.primary-button,
.new-game-button,
.code-stage button,
.copy-link-button {
  min-height: 48px;
  justify-content: center;
  gap: 9px;
  border-radius: 13px;
  padding: 0 16px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.token-panel button,
.primary-button {
  background: #67e8f9;
  color: #061022;
}

.panel {
  border-radius: 24px;
  padding: clamp(22px, 4vw, 44px);
}

.section-heading {
  max-width: 760px;
}

.section-heading h2 {
  margin-top: 8px;
  font-size: clamp(36px, 5vw, 64px);
  line-height: 0.98;
  font-weight: 950;
}

.section-heading > p:last-child {
  margin-top: 14px;
  color: #cbd5e1;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.6;
}

.template-select {
  margin-top: 30px;
}

.template-select select {
  min-height: 62px;
  font-size: 18px;
  font-weight: 850;
}

.selected-template {
  gap: 14px;
  margin-top: 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  padding: 16px;
  color: #67e8f9;
}

.selected-template div {
  display: grid;
  gap: 5px;
}

.selected-template strong {
  color: white;
  font-size: 18px;
  font-weight: 900;
}

.selected-template span {
  color: #94a3b8;
  font-weight: 750;
}

.primary-button {
  width: 100%;
  min-height: 62px;
  margin-top: 18px;
  font-size: 15px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.empty-state {
  margin-top: 26px;
  border: 1px dashed rgba(255, 255, 255, 0.22);
  border-radius: 18px;
  padding: 24px;
}

.empty-state h3 {
  font-size: 28px;
  font-weight: 950;
}

.empty-state p {
  margin-top: 8px;
  color: #cbd5e1;
}

.empty-state a {
  display: inline-flex;
  margin-top: 18px;
  color: #67e8f9;
  font-weight: 900;
  text-transform: uppercase;
}

.live-panel {
  background:
    radial-gradient(circle at 50% 22%, rgba(103, 232, 249, 0.12), transparent 28%),
    rgba(11, 17, 40, 0.9);
}

.live-panel-header {
  justify-content: space-between;
  gap: 18px;
}

.live-panel-header h2 {
  margin-top: 7px;
  font-size: clamp(26px, 4vw, 46px);
  line-height: 1;
  font-weight: 950;
}

.new-game-button,
.code-stage button,
.copy-link-button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.code-stage {
  width: 100%;
  display: grid;
  place-items: center;
  margin-top: 28px;
  border: 1px solid rgba(103, 232, 249, 0.28);
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(103, 232, 249, 0.08), rgba(168, 85, 247, 0.14)),
    rgba(7, 11, 29, 0.88);
  padding: clamp(30px, 6vw, 70px) 20px;
  text-align: center;
}

.code-stage strong {
  max-width: 100%;
  margin: 14px 0 22px;
  color: white;
  font-size: clamp(4.2rem, 15vw, 10rem);
  font-weight: 950;
  font-variant-numeric: tabular-nums;
  letter-spacing: clamp(0.02em, 1vw, 0.12em);
  line-height: 0.86;
  white-space: nowrap;
  text-shadow: 0 0 44px rgba(103, 232, 249, 0.2);
}

.join-section {
  display: grid;
  justify-items: center;
  margin-top: 32px;
  text-align: center;
}

.join-heading {
  justify-content: center;
  gap: 12px;
  color: #67e8f9;
}

.join-heading div {
  text-align: left;
}

.join-heading h3 {
  color: white;
  font-size: 24px;
  font-weight: 950;
}

.join-heading p {
  margin-top: 5px;
  color: #94a3b8;
  font-weight: 700;
}

.qr-code {
  width: min(100%, 300px);
  margin-top: 20px;
  border-radius: 22px;
  background: white;
  padding: 12px;
}

.join-url {
  max-width: 100%;
  margin-top: 12px;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.launch-actions {
  display: grid;
  gap: 10px;
  max-width: 760px;
  margin: 30px auto 0;
}

.action-link {
  min-height: 74px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 20px;
  gap: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  padding: 14px 18px;
  color: white;
}

.action-link--primary {
  border-color: rgba(103, 232, 249, 0.4);
  background: #67e8f9;
  color: #061022;
}

.action-link span {
  display: grid;
  gap: 5px;
  font-size: 17px;
  font-weight: 950;
  text-transform: uppercase;
}

.action-link small {
  color: currentColor;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  opacity: 0.68;
  text-transform: none;
}

.copy-link-button {
  width: 100%;
}

.message {
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 14px;
  font-weight: 800;
}

.message.error {
  background: rgba(248, 113, 113, 0.14);
  color: #fecaca;
}

@media (max-width: 680px) {
  .topbar,
  .live-panel-header {
    align-items: stretch;
    flex-direction: column;
  }

  .token-panel {
    grid-template-columns: 1fr;
  }

  .nav-link {
    width: 100%;
  }

  .code-stage strong {
    font-size: clamp(2.8rem, 14vw, 4rem);
    letter-spacing: 0.02em;
  }
}
</style>
