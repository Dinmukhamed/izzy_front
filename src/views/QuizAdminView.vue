<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { Copy, ExternalLink, Plus, Rocket, Trash2 } from 'lucide-vue-next'
import { createSession, createTemplate } from '@/services/quizApi'
import { getStoredAdminToken, setStoredAdminToken } from '@/services/quizSocket'
import type { CreateQuizQuestionInput, CreateSessionResponse } from '@/types/quiz'

type DraftQuestion = {
  text: string
  kind: 'text' | 'image' | 'audio'
  mediaUrl: string
  options: string[]
  correctOptionIndex: number
  durationSeconds: number
  points: number
}

const adminToken = ref('')
const title = ref('Izzy Quiz Live')
const questions = ref<DraftQuestion[]>([createDraftQuestion()])
const createdSession = ref<CreateSessionResponse | null>(null)
const qrDataUrl = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

const hostLink = computed(() => (createdSession.value ? `/quiz/${createdSession.value.code}/host` : ''))
const joinLink = computed(() => (createdSession.value ? `/quiz/join?code=${createdSession.value.code}` : ''))
const absoluteHostLink = computed(() => `${window.location.origin}${hostLink.value}`)
const absoluteJoinLink = computed(() => `${window.location.origin}${joinLink.value}`)
const canCreate = computed(() => {
  if (!adminToken.value.trim() || !title.value.trim()) return false

  return questions.value.every(
    (question) =>
      question.text.trim() &&
      question.options.every((option) => option.trim()) &&
      question.options.length >= 2 &&
      question.correctOptionIndex >= 0 &&
      question.correctOptionIndex < question.options.length,
  )
})

function createDraftQuestion(): DraftQuestion {
  return {
    text: '',
    kind: 'text',
    mediaUrl: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0,
    durationSeconds: 20,
    points: 1000,
  }
}

const addQuestion = () => {
  questions.value.push(createDraftQuestion())
}

const removeQuestion = (index: number) => {
  if (questions.value.length === 1) return
  questions.value.splice(index, 1)
}

const addOption = (question: DraftQuestion) => {
  if (question.options.length >= 8) return
  question.options.push('')
}

const removeOption = (question: DraftQuestion, optionIndex: number) => {
  if (question.options.length <= 2) return
  question.options.splice(optionIndex, 1)
  question.correctOptionIndex = Math.min(question.correctOptionIndex, question.options.length - 1)
}

const createLiveGame = async () => {
  if (!canCreate.value) return

  isLoading.value = true
  errorMessage.value = ''
  setStoredAdminToken(adminToken.value.trim())

  try {
    const template = await createTemplate(
      {
        title: title.value.trim(),
        status: 'active',
        questions: questions.value.map(toQuestionInput),
      },
      adminToken.value.trim(),
    )

    createdSession.value = await createSession(template.id, adminToken.value.trim())
    await generateQr()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Не получилось создать live-игру'
  } finally {
    isLoading.value = false
  }
}

const toQuestionInput = (question: DraftQuestion): CreateQuizQuestionInput => {
  const input: CreateQuizQuestionInput = {
    kind: question.kind,
    text: question.text.trim(),
    options: question.options.filter((option) => option.trim()).map((option) => ({ text: option.trim() })),
    correctOptionIndex: question.correctOptionIndex,
    durationMs: question.durationSeconds * 1000,
    points: question.points,
  }

  if (question.kind !== 'text' && question.mediaUrl.trim()) {
    input.media = {
      type: question.kind,
      url: question.mediaUrl.trim(),
    }
  }

  return input
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
})
</script>

<template>
  <main class="admin-page">
    <section class="admin-shell">
      <header class="topbar">
        <div class="brand">
          <img src="/logo_trans.png" alt="Izzy Quiz" />
          <div>
            <p>Izzy Quiz Live</p>
            <h1>Создать игру</h1>
          </div>
        </div>
      </header>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <section class="layout-grid">
        <article class="panel editor-panel">
          <div class="form-grid">
            <label>
              <span>Admin token</span>
              <input v-model="adminToken" type="password" placeholder="dev-admin-token" />
            </label>
            <label>
              <span>Название игры</span>
              <input v-model="title" type="text" placeholder="Например: Music Mix #67" />
            </label>
          </div>

          <div class="questions-header">
            <div>
              <p class="eyebrow">Вопросы</p>
              <h2>{{ questions.length }} в игре</h2>
            </div>
            <button class="icon-command" type="button" @click="addQuestion">
              <Plus :size="20" />
            </button>
          </div>

          <section class="questions-list">
            <article v-for="(question, questionIndex) in questions" :key="questionIndex" class="question-editor">
              <div class="question-editor-head">
                <strong>Вопрос {{ questionIndex + 1 }}</strong>
                <button type="button" :disabled="questions.length === 1" @click="removeQuestion(questionIndex)">
                  <Trash2 :size="18" />
                </button>
              </div>

              <label>
                <span>Текст вопроса</span>
                <textarea v-model="question.text" rows="2" placeholder="Например: Кто исполняет этот трек?" />
              </label>

              <div class="form-grid compact">
                <label>
                  <span>Тип</span>
                  <select v-model="question.kind">
                    <option value="text">Текст</option>
                    <option value="image">Картинка</option>
                    <option value="audio">Аудио</option>
                  </select>
                </label>
                <label v-if="question.kind !== 'text'">
                  <span>Media URL</span>
                  <input v-model="question.mediaUrl" type="url" placeholder="https://..." />
                </label>
                <label>
                  <span>Секунд</span>
                  <input v-model.number="question.durationSeconds" type="number" min="5" max="120" />
                </label>
                <label>
                  <span>Очки</span>
                  <input v-model.number="question.points" type="number" min="100" max="5000" step="100" />
                </label>
              </div>

              <div class="options-list">
                <div v-for="(_, optionIndex) in question.options" :key="optionIndex" class="option-row">
                  <input
                    v-model="question.correctOptionIndex"
                    type="radio"
                    :name="`correct-${questionIndex}`"
                    :value="optionIndex"
                  />
                  <input v-model="question.options[optionIndex]" type="text" :placeholder="`Ответ ${optionIndex + 1}`" />
                  <button type="button" :disabled="question.options.length <= 2" @click="removeOption(question, optionIndex)">
                    <Trash2 :size="16" />
                  </button>
                </div>
                <button class="ghost-button small" type="button" :disabled="question.options.length >= 8" @click="addOption(question)">
                  <Plus :size="18" />
                  Добавить ответ
                </button>
              </div>
            </article>
          </section>
        </article>

        <aside class="panel launch-panel">
          <p class="eyebrow">Live session</p>

          <template v-if="createdSession">
            <h2 class="session-code">{{ createdSession.code }}</h2>
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR для входа игроков" class="qr-code" />
            <p class="muted">Покажи QR на экране, игроки попадут сразу на вход в игру.</p>

            <div class="launch-links">
              <a class="secondary-button" :href="hostLink" target="_blank" rel="noreferrer">
                <ExternalLink :size="20" />
                Экран ведущего
              </a>
              <a class="secondary-button" :href="joinLink" target="_blank" rel="noreferrer">
                <ExternalLink :size="20" />
                Вход игрока
              </a>
              <button class="ghost-button" type="button" @click="copyText(absoluteHostLink)">
                <Copy :size="18" />
                Копировать host
              </button>
              <button class="ghost-button" type="button" @click="copyText(absoluteJoinLink)">
                <Copy :size="18" />
                Копировать join
              </button>
            </div>
          </template>

          <template v-else>
            <h2>Собери вопросы и запускай</h2>
            <p class="muted">
              Это не “готовый шаблон”, а конкретная игра: добавил вопросы, создал код, игроки заходят по QR.
            </p>
            <button class="primary-button" type="button" :disabled="!canCreate || isLoading" @click="createLiveGame">
              <Rocket :size="22" />
              {{ isLoading ? 'Создаю...' : 'Создать игру' }}
            </button>
          </template>
        </aside>
      </section>
    </section>
  </main>
</template>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #070b1d, #132640 58%, #231038);
  color: white;
  padding: clamp(16px, 3vw, 36px);
}

.admin-shell {
  width: min(100%, 1280px);
  margin: 0 auto;
}

.topbar,
.brand,
.questions-header,
.question-editor-head,
.option-row,
.primary-button,
.secondary-button,
.ghost-button,
.icon-command {
  display: flex;
  align-items: center;
}

.topbar {
  justify-content: space-between;
  margin-bottom: 24px;
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
.launch-panel h2 {
  font-size: clamp(34px, 5vw, 64px);
  line-height: 0.95;
  font-weight: 950;
  text-transform: uppercase;
}

.layout-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(330px, 420px);
  gap: 18px;
  align-items: start;
}

.panel {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 24px;
  background: rgba(11, 17, 40, 0.82);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.28);
  padding: clamp(20px, 3vw, 34px);
}

.launch-panel {
  position: sticky;
  top: 18px;
  background: linear-gradient(145deg, rgba(104, 43, 138, 0.42), rgba(16, 28, 58, 0.95));
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.form-grid.compact {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

label {
  display: grid;
  gap: 8px;
}

input,
textarea,
select {
  width: 100%;
  min-height: 50px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(7, 11, 29, 0.82);
  padding: 0 14px;
  color: white;
  font-size: 16px;
  font-weight: 800;
}

textarea {
  min-height: 82px;
  padding-top: 12px;
  resize: vertical;
}

.questions-header {
  justify-content: space-between;
  gap: 16px;
  margin-top: 30px;
}

.questions-header h2 {
  font-size: 28px;
  font-weight: 950;
}

.questions-list {
  display: grid;
  gap: 16px;
  margin-top: 18px;
}

.question-editor {
  display: grid;
  gap: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  padding: 18px;
}

.question-editor-head {
  justify-content: space-between;
}

.question-editor-head strong {
  font-size: 20px;
  font-weight: 950;
}

.question-editor-head button,
.option-row button,
.icon-command {
  width: 44px;
  height: 44px;
  justify-content: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.options-list {
  display: grid;
  gap: 10px;
}

.option-row {
  gap: 10px;
}

.option-row input[type='radio'] {
  width: 22px;
  min-height: 22px;
  accent-color: #67e8f9;
}

.primary-button,
.secondary-button,
.ghost-button {
  justify-content: center;
  gap: 10px;
  min-height: 54px;
  border-radius: 14px;
  font-weight: 950;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.primary-button {
  width: 100%;
  margin-top: 28px;
  background: #67e8f9;
  color: #061022;
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

.ghost-button.small {
  width: fit-content;
  min-height: 44px;
  padding: 0 14px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.muted {
  margin-top: 16px;
  color: #cbd5e1;
  font-size: 18px;
  font-weight: 800;
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

.error-text {
  margin-bottom: 18px;
  border-radius: 14px;
  background: rgba(248, 113, 113, 0.14);
  padding: 12px 14px;
  color: #fecaca;
  font-weight: 800;
}

@media (max-width: 1040px) {
  .layout-grid,
  .form-grid,
  .form-grid.compact {
    grid-template-columns: 1fr;
  }

  .launch-panel {
    position: static;
  }
}
</style>
