<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { Copy, ExternalLink, RefreshCw, Rocket } from 'lucide-vue-next'
import { createSession, getTemplates } from '@/services/quizApi'
import { getStoredAdminToken, setStoredAdminToken } from '@/services/quizSocket'
import type { CreateSessionResponse, QuizTemplate } from '@/types/quiz'

const adminToken = ref('')
const templates = ref<QuizTemplate[]>([])
const selectedTemplateId = ref('')
const createdSession = ref<CreateSessionResponse | null>(null)
const qrDataUrl = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

const activeTemplates = computed(() => templates.value.filter((template) => template.status === 'active'))
const selectedTemplate = computed(() => activeTemplates.value.find((template) => template.id === selectedTemplateId.value) || null)
const hostLink = computed(() => (createdSession.value ? `/quiz/${createdSession.value.code}/host` : ''))
const joinLink = computed(() => (createdSession.value ? `/quiz/join?code=${createdSession.value.code}` : ''))
const absoluteHostLink = computed(() => `${window.location.origin}${hostLink.value}`)
const absoluteJoinLink = computed(() => `${window.location.origin}${joinLink.value}`)

const loadTemplates = async () => {
  if (!adminToken.value.trim()) {
    errorMessage.value = 'Enter admin token first'
    return
  }

  errorMessage.value = ''
  setStoredAdminToken(adminToken.value.trim())

  try {
    templates.value = await getTemplates(adminToken.value.trim())
    selectedTemplateId.value ||= activeTemplates.value[0]?.id || ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load templates'
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
    errorMessage.value = error instanceof Error ? error.message : 'Could not create game'
  } finally {
    isLoading.value = false
  }
}

const generateQr = async () => {
  if (!joinLink.value) return

  qrDataUrl.value = await QRCode.toDataURL(absoluteJoinLink.value, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: {
      dark: '#070b1d',
      light: '#ffffff',
    },
  })
}

const copyText = async (text: string) => {
  await navigator.clipboard.writeText(text)
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
            <h1>Games</h1>
          </div>
        </div>
        <a class="nav-link" href="/quiz/templates">Templates</a>
      </header>

      <section class="token-panel">
        <label>
          <span>Token / password</span>
          <input v-model="adminToken" type="password" placeholder="dev-admin-token" @keyup.enter="loadTemplates" />
        </label>
        <button type="button" @click="loadTemplates">
          <RefreshCw :size="18" />
          Load
        </button>
      </section>

      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>

      <section class="games-layout">
        <article class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Active templates</p>
              <h2>Select game pack</h2>
            </div>
          </div>

          <div v-if="activeTemplates.length" class="template-grid">
            <button
              v-for="template in activeTemplates"
              :key="template.id"
              type="button"
              class="template-card"
              :class="{ selected: template.id === selectedTemplateId }"
              @click="selectedTemplateId = template.id"
            >
              <strong>{{ template.title }}</strong>
              <span>{{ template.questions.length }} questions</span>
            </button>
          </div>

          <div v-else class="empty-state">
            <h3>No active templates yet</h3>
            <p>Create a template or switch one to active on the templates page.</p>
            <a href="/quiz/templates">Open templates</a>
          </div>
        </article>

        <aside class="panel launch-panel">
          <p class="eyebrow">Live game</p>

          <template v-if="createdSession">
            <h2 class="session-code">{{ createdSession.code }}</h2>
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR for player join page" class="qr-code" />
            <p class="muted">Show this QR on the host screen or projector so players can join quickly.</p>

            <div class="launch-links">
              <a class="secondary-button" :href="hostLink" target="_blank" rel="noreferrer">
                <ExternalLink :size="20" />
                Host screen
              </a>
              <a class="secondary-button" :href="joinLink" target="_blank" rel="noreferrer">
                <ExternalLink :size="20" />
                Player join
              </a>
              <button class="ghost-button" type="button" @click="copyText(absoluteHostLink)">
                <Copy :size="18" />
                Copy host
              </button>
              <button class="ghost-button" type="button" @click="copyText(absoluteJoinLink)">
                <Copy :size="18" />
                Copy join
              </button>
            </div>
          </template>

          <template v-else>
            <h2>{{ selectedTemplate?.title || 'Choose template' }}</h2>
            <p class="muted">
              Live games are created from active templates. The template stays reusable for future events.
            </p>
            <button class="primary-button" type="button" :disabled="!selectedTemplate || isLoading" @click="createLiveGame">
              <Rocket :size="22" />
              {{ isLoading ? 'Creating...' : 'Create live game' }}
            </button>
          </template>
        </aside>
      </section>
    </section>
  </main>
</template>

<style scoped>
.games-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #070b1d, #132640 58%, #231038);
  color: white;
  padding: clamp(16px, 3vw, 36px);
}

.games-shell {
  width: min(100%, 1220px);
  margin: 0 auto;
}

.topbar,
.brand,
.token-panel,
.panel-head,
.template-card,
.primary-button,
.secondary-button,
.ghost-button,
.nav-link {
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
label span {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.brand h1,
.panel-head h2,
.launch-panel h2 {
  font-size: clamp(34px, 5vw, 64px);
  line-height: 0.95;
  font-weight: 950;
  text-transform: uppercase;
}

.nav-link,
.token-panel,
.panel {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(11, 17, 40, 0.82);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.26);
}

.nav-link {
  min-height: 48px;
  justify-content: center;
  border-radius: 14px;
  padding: 0 18px;
  color: white;
  font-weight: 950;
  text-transform: uppercase;
}

.token-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  border-radius: 22px;
  padding: 16px;
  margin-bottom: 18px;
}

label {
  display: grid;
  gap: 8px;
}

input {
  min-height: 50px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(7, 11, 29, 0.82);
  padding: 0 14px;
  color: white;
  font-size: 16px;
  font-weight: 800;
}

.token-panel button,
.primary-button,
.secondary-button,
.ghost-button {
  min-height: 52px;
  justify-content: center;
  gap: 10px;
  border-radius: 14px;
  font-weight: 950;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.token-panel button,
.primary-button {
  background: #67e8f9;
  color: #061022;
  padding: 0 18px;
}

.games-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 430px);
  gap: 18px;
  align-items: start;
}

.panel {
  border-radius: 24px;
  padding: clamp(20px, 3vw, 34px);
}

.launch-panel {
  position: sticky;
  top: 18px;
  background: linear-gradient(145deg, rgba(104, 43, 138, 0.42), rgba(16, 28, 58, 0.95));
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 22px;
}

.template-card {
  min-height: 132px;
  align-items: flex-start;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.07);
  padding: 18px;
  color: white;
  text-align: left;
}

.template-card.selected {
  border-color: rgba(103, 232, 249, 0.72);
  background: rgba(103, 232, 249, 0.13);
}

.template-card strong {
  font-size: 22px;
  font-weight: 950;
}

.template-card span,
.muted,
.empty-state p {
  color: #cbd5e1;
  font-weight: 800;
}

.primary-button {
  width: 100%;
  margin-top: 28px;
}

.secondary-button {
  background: white;
  color: #061022;
}

.ghost-button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.session-code {
  margin-top: 12px;
  color: #67e8f9;
  font-size: clamp(58px, 9vw, 92px) !important;
  letter-spacing: 0.1em;
}

.qr-code {
  width: min(100%, 320px);
  margin-top: 18px;
  border-radius: 22px;
  background: white;
  padding: 12px;
}

.launch-links {
  display: grid;
  gap: 10px;
  margin-top: 22px;
}

.empty-state {
  margin-top: 22px;
  border: 1px dashed rgba(255, 255, 255, 0.22);
  border-radius: 18px;
  padding: 24px;
}

.empty-state h3 {
  font-size: 28px;
  font-weight: 950;
}

.empty-state a {
  display: inline-flex;
  margin-top: 18px;
  color: #67e8f9;
  font-weight: 950;
  text-transform: uppercase;
}

.message {
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 14px;
  font-weight: 850;
}

.message.error {
  background: rgba(248, 113, 113, 0.14);
  color: #fecaca;
}

@media (max-width: 980px) {
  .games-layout,
  .token-panel,
  .template-grid {
    grid-template-columns: 1fr;
  }

  .launch-panel {
    position: static;
  }
}
</style>
