<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Image, Music, Plus, Save, ToggleLeft, ToggleRight, Trash2 } from 'lucide-vue-next'
import {
  createTemplate,
  getTemplates,
  updateTemplate,
  updateTemplateStatus,
  uploadQuizMedia,
} from '@/services/quizApi'
import { getStoredAdminToken, setStoredAdminToken } from '@/services/quizSocket'
import type { CreateQuizQuestionInput, CreateQuizTemplateInput, QuizTemplate } from '@/types/quiz'

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
const templates = ref<QuizTemplate[]>([])
const selectedTemplateId = ref<string | null>(null)
const title = ref('')
const status = ref<QuizTemplate['status']>('draft')
const questions = ref<DraftQuestion[]>([createDraftQuestion()])
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const selectedTemplate = computed(() => templates.value.find((template) => template.id === selectedTemplateId.value) || null)
const isEditing = computed(() => Boolean(selectedTemplateId.value))
const activeTemplates = computed(() => templates.value.filter((template) => template.status === 'active'))
const canSave = computed(() => {
  if (!adminToken.value.trim() || !title.value.trim()) return false

  return questions.value.every(
    (question) =>
      question.text.trim() &&
      question.options.length >= 2 &&
      question.options.every((option) => option.trim()) &&
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

const loadTemplates = async () => {
  if (!adminToken.value.trim()) {
    errorMessage.value = 'Enter admin token first'
    return
  }

  errorMessage.value = ''
  setStoredAdminToken(adminToken.value.trim())

  try {
    templates.value = await getTemplates(adminToken.value.trim())
    if (!selectedTemplateId.value && templates.value[0]) selectTemplate(templates.value[0])
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load templates'
  }
}

const selectTemplate = (template: QuizTemplate) => {
  selectedTemplateId.value = template.id
  title.value = template.title
  status.value = template.status
  questions.value = template.questions.map((question) => ({
    text: question.text,
    kind: question.kind,
    mediaUrl: question.media?.url || '',
    options: question.options.map((option) => option.text),
    correctOptionIndex: Math.max(0, question.options.findIndex((option) => option.id === question.correctOptionId)),
    durationSeconds: Math.round(question.durationMs / 1000),
    points: question.points,
  }))
}

const newTemplate = () => {
  selectedTemplateId.value = null
  title.value = ''
  status.value = 'draft'
  questions.value = [createDraftQuestion()]
  successMessage.value = ''
  errorMessage.value = ''
}

const saveTemplate = async () => {
  if (!canSave.value) return

  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  const payload: CreateQuizTemplateInput = {
    title: title.value.trim(),
    status: status.value,
    questions: questions.value.map(toQuestionInput),
  }

  try {
    const savedTemplate = selectedTemplateId.value
      ? await updateTemplate(selectedTemplateId.value, payload, adminToken.value.trim())
      : await createTemplate(payload, adminToken.value.trim())

    await loadTemplates()
    selectTemplate(savedTemplate)
    successMessage.value = 'Template saved'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not save template'
  } finally {
    isLoading.value = false
  }
}

const toggleTemplateStatus = async (template: QuizTemplate) => {
  const nextStatus = template.status === 'active' ? 'draft' : 'active'

  try {
    const updatedTemplate = await updateTemplateStatus(template.id, nextStatus, adminToken.value.trim())
    await loadTemplates()
    if (selectedTemplateId.value === updatedTemplate.id) selectTemplate(updatedTemplate)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not update status'
  }
}

const addQuestion = () => questions.value.push(createDraftQuestion())

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

const uploadMedia = async (question: DraftQuestion, event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const uploadedFile = await uploadQuizMedia(file, adminToken.value.trim())
    question.mediaUrl = uploadedFile.url
    question.kind = uploadedFile.mimetype.startsWith('audio/') ? 'audio' : 'image'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not upload media'
  } finally {
    input.value = ''
  }
}

const toQuestionInput = (question: DraftQuestion): CreateQuizQuestionInput => {
  const input: CreateQuizQuestionInput = {
    kind: question.kind,
    text: question.text.trim(),
    options: question.options.map((option) => ({ text: option.trim() })),
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

onMounted(() => {
  adminToken.value = getStoredAdminToken()
  if (adminToken.value) void loadTemplates()
})
</script>

<template>
  <main class="quiz-admin-page">
    <section class="quiz-shell">
      <header class="topbar">
        <div class="brand">
          <img src="/logo_trans.png" alt="Izzy Quiz" />
          <div>
            <p>Izzy Quiz Admin</p>
            <h1>Templates</h1>
          </div>
        </div>
        <a class="nav-link" href="/quiz/games">Games</a>
      </header>

      <section class="token-panel">
        <label>
          <span>Token / password</span>
          <input v-model="adminToken" type="password" placeholder="dev-admin-token" @keyup.enter="loadTemplates" />
        </label>
        <button type="button" @click="loadTemplates">Unlock</button>
      </section>

      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
      <p v-if="successMessage" class="message success">{{ successMessage }}</p>

      <section class="templates-layout">
        <aside class="panel template-list-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Saved</p>
              <h2>{{ templates.length }} templates</h2>
            </div>
            <button class="icon-button" type="button" @click="newTemplate">
              <Plus :size="20" />
            </button>
          </div>

          <div class="template-list">
            <button
              v-for="template in templates"
              :key="template.id"
              type="button"
              class="template-card"
              :class="{ selected: template.id === selectedTemplateId }"
              @click="selectTemplate(template)"
            >
              <span :class="['status-dot', template.status]" />
              <strong>{{ template.title }}</strong>
              <small>{{ template.questions.length }} questions</small>
              <button class="status-button" type="button" @click.stop="toggleTemplateStatus(template)">
                <ToggleRight v-if="template.status === 'active'" :size="22" />
                <ToggleLeft v-else :size="22" />
                {{ template.status === 'active' ? 'Active' : 'Inactive' }}
              </button>
            </button>
          </div>

          <div class="template-summary">
            <Check :size="22" />
            {{ activeTemplates.length }} active templates available for games
          </div>
        </aside>

        <article class="panel editor-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">{{ isEditing ? 'Edit' : 'Create' }}</p>
              <h2>{{ isEditing ? selectedTemplate?.title : 'New template' }}</h2>
            </div>
            <button class="save-button" type="button" :disabled="!canSave || isLoading" @click="saveTemplate">
              <Save :size="20" />
              {{ isLoading ? 'Saving...' : 'Save' }}
            </button>
          </div>

          <div class="form-grid">
            <label>
              <span>Template name</span>
              <input v-model="title" type="text" placeholder="Ultra Music Mix #68" />
            </label>
            <label>
              <span>Status</span>
              <select v-model="status">
                <option value="draft">Inactive</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>

          <section class="questions-list">
            <article v-for="(question, questionIndex) in questions" :key="questionIndex" class="question-editor">
              <div class="question-head">
                <strong>Question {{ questionIndex + 1 }}</strong>
                <button type="button" :disabled="questions.length === 1" @click="removeQuestion(questionIndex)">
                  <Trash2 :size="18" />
                </button>
              </div>

              <label>
                <span>Question text</span>
                <textarea v-model="question.text" rows="2" placeholder="What song is playing?" />
              </label>

              <div class="form-grid compact">
                <label>
                  <span>Type</span>
                  <select v-model="question.kind">
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                    <option value="audio">Audio</option>
                  </select>
                </label>
                <label>
                  <span>Seconds</span>
                  <input v-model.number="question.durationSeconds" type="number" min="5" max="120" />
                </label>
                <label>
                  <span>Points</span>
                  <input v-model.number="question.points" type="number" min="100" max="5000" step="100" />
                </label>
              </div>

              <div class="media-row">
                <label class="upload-button">
                  <Image v-if="question.kind !== 'audio'" :size="18" />
                  <Music v-else :size="18" />
                  Upload media
                  <input type="file" accept="image/*,audio/*" @change="uploadMedia(question, $event)" />
                </label>
                <input v-model="question.mediaUrl" type="text" placeholder="Media URL after upload, or external URL" />
              </div>

              <div class="option-list">
                <div v-for="(_, optionIndex) in question.options" :key="optionIndex" class="option-row">
                  <input
                    v-model="question.correctOptionIndex"
                    type="radio"
                    :name="`correct-${questionIndex}`"
                    :value="optionIndex"
                  />
                  <input v-model="question.options[optionIndex]" type="text" :placeholder="`Answer ${optionIndex + 1}`" />
                  <button type="button" :disabled="question.options.length <= 2" @click="removeOption(question, optionIndex)">
                    <Trash2 :size="16" />
                  </button>
                </div>
                <button class="ghost-button small" type="button" :disabled="question.options.length >= 8" @click="addOption(question)">
                  <Plus :size="18" />
                  Add answer
                </button>
              </div>
            </article>
          </section>

          <button class="add-question-button" type="button" @click="addQuestion">
            <Plus :size="20" />
            Add question
          </button>
        </article>
      </section>
    </section>
  </main>
</template>

<style scoped>
.quiz-admin-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #070b1d, #132640 58%, #231038);
  color: white;
  padding: clamp(16px, 3vw, 36px);
}

.quiz-shell {
  width: min(100%, 1360px);
  margin: 0 auto;
}

.topbar,
.brand,
.token-panel,
.panel-head,
.template-card,
.status-button,
.question-head,
.media-row,
.option-row,
.save-button,
.icon-button,
.ghost-button,
.add-question-button,
.nav-link,
.template-summary {
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
.panel-head h2 {
  font-size: clamp(32px, 4vw, 58px);
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

.token-panel button,
.save-button,
.ghost-button,
.add-question-button {
  min-height: 50px;
  justify-content: center;
  gap: 10px;
  border-radius: 14px;
  font-weight: 950;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.token-panel button,
.save-button,
.add-question-button {
  background: #67e8f9;
  color: #061022;
  padding: 0 18px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.templates-layout {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.panel {
  border-radius: 24px;
  padding: clamp(20px, 3vw, 30px);
}

.template-list-panel {
  position: sticky;
  top: 18px;
}

.panel-head {
  justify-content: space-between;
  gap: 14px;
}

.icon-button,
.question-head button,
.option-row button {
  width: 44px;
  height: 44px;
  justify-content: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.template-list {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.template-card {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 8px 12px;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  padding: 14px;
  color: white;
  text-align: left;
}

.template-card.selected {
  border-color: rgba(103, 232, 249, 0.6);
  background: rgba(103, 232, 249, 0.1);
}

.template-card strong,
.template-card small,
.status-button {
  grid-column: 2;
}

.template-card strong {
  font-size: 17px;
  font-weight: 950;
}

.template-card small {
  color: #cbd5e1;
  font-weight: 800;
}

.status-dot {
  width: 12px;
  height: 12px;
  grid-row: 1 / span 3;
  border-radius: 999px;
  background: #94a3b8;
}

.status-dot.active {
  background: #4ade80;
}

.status-dot.archived {
  background: #fb7185;
}

.status-button {
  justify-content: flex-start;
  gap: 8px;
  color: #67e8f9;
  font-size: 12px;
  font-weight: 950;
  text-transform: uppercase;
}

.template-summary {
  gap: 10px;
  margin-top: 18px;
  color: #cbd5e1;
  font-weight: 850;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 14px;
  margin-top: 22px;
}

.form-grid.compact {
  grid-template-columns: 180px 140px 140px;
  margin-top: 0;
}

.questions-list {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

.question-editor {
  display: grid;
  gap: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  padding: 18px;
}

.question-head {
  justify-content: space-between;
}

.question-head strong {
  font-size: 20px;
  font-weight: 950;
}

.media-row {
  gap: 10px;
}

.upload-button {
  min-height: 50px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  background: white;
  color: #061022;
  padding: 0 14px;
  font-weight: 950;
  white-space: nowrap;
}

.upload-button input {
  display: none;
}

.option-list {
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

.ghost-button {
  width: fit-content;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: white;
  padding: 0 14px;
}

.add-question-button {
  width: 100%;
  margin-top: 18px;
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

.message.success {
  background: rgba(74, 222, 128, 0.14);
  color: #bbf7d0;
}

@media (max-width: 1020px) {
  .templates-layout,
  .token-panel,
  .form-grid,
  .form-grid.compact {
    grid-template-columns: 1fr;
  }

  .template-list-panel {
    position: static;
  }

  .media-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
