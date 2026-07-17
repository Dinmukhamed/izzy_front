<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Check,
  FilePlus2,
  Image,
  ListChecks,
  Music,
  Plus,
  Save,
  Trash2,
} from 'lucide-vue-next'
import {
  createTemplate,
  deleteTemplate,
  getQuizErrorMessage,
  getTemplates,
  updateTemplate,
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
const isDeleting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const selectedTemplate = computed(
  () => templates.value.find((template) => template.id === selectedTemplateId.value) || null,
)
const isEditing = computed(() => Boolean(selectedTemplateId.value))
const activeTemplateCount = computed(
  () => templates.value.filter((template) => template.status === 'active').length,
)
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

function clearMessages() {
  errorMessage.value = ''
  successMessage.value = ''
}

const loadTemplates = async (preferredTemplateId?: string) => {
  if (!adminToken.value.trim()) {
    errorMessage.value = 'Enter the admin token first'
    return
  }

  clearMessages()
  setStoredAdminToken(adminToken.value.trim())

  try {
    templates.value = await getTemplates(adminToken.value.trim())
    const templateToSelect =
      templates.value.find((template) => template.id === preferredTemplateId) ||
      templates.value.find((template) => template.id === selectedTemplateId.value) ||
      templates.value[0]

    if (templateToSelect) selectTemplate(templateToSelect)
    else newTemplate()
  } catch (error) {
    errorMessage.value = getQuizErrorMessage(error, 'Could not load templates')
  }
}

const selectTemplate = (template: QuizTemplate) => {
  clearMessages()
  selectedTemplateId.value = template.id
  title.value = template.title
  status.value = template.status
  questions.value = template.questions.map((question) => ({
    text: question.text,
    kind: question.kind,
    mediaUrl: question.media?.url || '',
    options: question.options.map((option) => option.text),
    correctOptionIndex: Math.max(
      0,
      question.options.findIndex((option) => option.id === question.correctOptionId),
    ),
    durationSeconds: Math.round(question.durationMs / 1000),
    points: question.points,
  }))
}

const chooseTemplate = (event: Event) => {
  const templateId = (event.target as HTMLSelectElement).value
  const template = templates.value.find((candidate) => candidate.id === templateId)

  if (template) selectTemplate(template)
  else newTemplate()
}

const newTemplate = () => {
  clearMessages()
  selectedTemplateId.value = null
  title.value = ''
  status.value = 'draft'
  questions.value = [createDraftQuestion()]
}

const saveTemplate = async () => {
  if (!canSave.value) return

  const wasEditing = isEditing.value
  isLoading.value = true
  clearMessages()

  const payload: CreateQuizTemplateInput = {
    title: title.value.trim(),
    status: status.value,
    questions: questions.value.map(toQuestionInput),
  }

  try {
    const savedTemplate = selectedTemplateId.value
      ? await updateTemplate(selectedTemplateId.value, payload, adminToken.value.trim())
      : await createTemplate(payload, adminToken.value.trim())

    await loadTemplates(savedTemplate.id)
    successMessage.value = wasEditing ? 'Template updated' : 'Template created'
  } catch (error) {
    errorMessage.value = getQuizErrorMessage(error, 'Could not save template')
  } finally {
    isLoading.value = false
  }
}

const removeTemplate = async () => {
  if (!selectedTemplate.value) return
  if (!window.confirm(`Delete “${selectedTemplate.value.title}”? This cannot be undone.`)) return

  isDeleting.value = true
  clearMessages()

  try {
    await deleteTemplate(selectedTemplate.value.id, adminToken.value.trim())
    templates.value = templates.value.filter((template) => template.id !== selectedTemplateId.value)
    newTemplate()
    successMessage.value = 'Template deleted'
  } catch (error) {
    errorMessage.value = getQuizErrorMessage(error, 'Could not delete template')
  } finally {
    isDeleting.value = false
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

  clearMessages()

  try {
    const uploadedFile = await uploadQuizMedia(file, adminToken.value.trim())
    question.mediaUrl = uploadedFile.url
    question.kind = uploadedFile.mimetype.startsWith('audio/') ? 'audio' : 'image'
    successMessage.value = 'Media uploaded'
  } catch (error) {
    errorMessage.value = getQuizErrorMessage(error, 'Could not upload media')
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
        <a class="nav-link" href="/quiz/games">Live games</a>
      </header>

      <section class="token-panel">
        <label>
          <span>Admin token</span>
          <input
            v-model="adminToken"
            type="password"
            placeholder="dev-admin-token"
            @keyup.enter="loadTemplates()"
          />
        </label>
        <button type="button" @click="loadTemplates()">Connect</button>
      </section>

      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
      <p v-if="successMessage" class="message success">{{ successMessage }}</p>

      <section class="workspace panel">
        <header class="workspace-header">
          <div>
            <p class="eyebrow">Template library</p>
            <h2>{{ isEditing ? 'Edit template' : 'Create template' }}</h2>
            <p class="workspace-summary">
              {{ templates.length }} saved · {{ activeTemplateCount }} active
            </p>
          </div>

          <div class="workspace-actions">
            <button class="secondary-button" type="button" @click="newTemplate">
              <FilePlus2 :size="19" />
              New
            </button>
            <button
              v-if="isEditing"
              class="danger-button"
              type="button"
              :disabled="isDeleting"
              @click="removeTemplate"
            >
              <Trash2 :size="18" />
              {{ isDeleting ? 'Deleting...' : 'Delete' }}
            </button>
            <button
              class="save-button"
              type="button"
              :disabled="!canSave || isLoading"
              @click="saveTemplate"
            >
              <Save :size="19" />
              {{ isLoading ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </header>

        <div class="template-picker">
          <label>
            <span>Choose saved template</span>
            <select :value="selectedTemplateId || ''" @change="chooseTemplate">
              <option value="">New template</option>
              <option v-for="template in templates" :key="template.id" :value="template.id">
                {{ template.title }} · {{ template.questions.length }} questions · {{ template.status }}
              </option>
            </select>
          </label>
          <div class="current-template-state" :class="status">
            <Check v-if="status === 'active'" :size="18" />
            <ListChecks v-else :size="18" />
            {{ status }}
          </div>
        </div>

        <div class="form-grid template-fields">
          <label>
            <span>Template name</span>
            <input v-model="title" type="text" placeholder="Ultra Music Mix #68" />
          </label>
          <label>
            <span>Status</span>
            <select v-model="status">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>

        <div class="section-heading">
          <div>
            <p class="eyebrow">Content</p>
            <h3>{{ questions.length }} {{ questions.length === 1 ? 'question' : 'questions' }}</h3>
          </div>
          <button class="secondary-button" type="button" @click="addQuestion">
            <Plus :size="18" />
            Add question
          </button>
        </div>

        <section class="questions-list">
          <article
            v-for="(question, questionIndex) in questions"
            :key="questionIndex"
            class="question-editor"
          >
            <div class="question-head">
              <div class="question-number">{{ questionIndex + 1 }}</div>
              <div class="question-heading-copy">
                <span>Question</span>
                <strong>{{ question.text.trim() || 'Untitled question' }}</strong>
              </div>
              <button
                class="icon-button danger-icon"
                type="button"
                :aria-label="`Delete question ${questionIndex + 1}`"
                :disabled="questions.length === 1"
                @click="removeQuestion(questionIndex)"
              >
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
                <input
                  v-model.number="question.points"
                  type="number"
                  min="100"
                  max="5000"
                  step="100"
                />
              </label>
            </div>

            <div class="media-row">
              <label class="upload-button">
                <Image v-if="question.kind !== 'audio'" :size="18" />
                <Music v-else :size="18" />
                Upload media
                <input type="file" accept="image/*,audio/*" @change="uploadMedia(question, $event)" />
              </label>
              <input
                v-model="question.mediaUrl"
                type="text"
                placeholder="Uploaded or external media URL"
              />
            </div>

            <div class="option-list">
              <p class="field-label">Answers · select the correct one</p>
              <div v-for="(_, optionIndex) in question.options" :key="optionIndex" class="option-row">
                <label class="correct-answer" :title="`Mark answer ${optionIndex + 1} as correct`">
                  <input
                    v-model="question.correctOptionIndex"
                    type="radio"
                    :name="`correct-${questionIndex}`"
                    :value="optionIndex"
                  />
                  <span>{{ optionIndex + 1 }}</span>
                </label>
                <input
                  v-model="question.options[optionIndex]"
                  type="text"
                  :placeholder="`Answer ${optionIndex + 1}`"
                />
                <button
                  class="icon-button"
                  type="button"
                  :aria-label="`Delete answer ${optionIndex + 1}`"
                  :disabled="question.options.length <= 2"
                  @click="removeOption(question, optionIndex)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
              <button
                class="secondary-button small"
                type="button"
                :disabled="question.options.length >= 8"
                @click="addOption(question)"
              >
                <Plus :size="17" />
                Add answer
              </button>
            </div>
          </article>
        </section>

        <button class="add-question-button" type="button" @click="addQuestion">
          <Plus :size="20" />
          Add another question
        </button>
      </section>
    </section>
  </main>
</template>

<style scoped>
.quiz-admin-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at 10% 10%, rgba(103, 232, 249, 0.12), transparent 28%),
    linear-gradient(135deg, #070b1d, #132640 58%, #231038);
  color: white;
  padding: clamp(16px, 3vw, 36px);
}

.quiz-shell {
  width: min(100%, 1180px);
  margin: 0 auto;
}

.topbar,
.brand,
.workspace-header,
.workspace-actions,
.template-picker,
.section-heading,
.question-head,
.media-row,
.option-row,
.save-button,
.secondary-button,
.danger-button,
.icon-button,
.nav-link,
.current-template-state,
.upload-button,
.add-question-button,
.correct-answer {
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
.field-label,
.question-heading-copy span {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.18em;
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
textarea,
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
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

input:focus,
textarea:focus,
select:focus {
  border-color: rgba(103, 232, 249, 0.8);
  box-shadow: 0 0 0 3px rgba(103, 232, 249, 0.12);
}

textarea {
  min-height: 86px;
  padding-top: 13px;
  resize: vertical;
}

button,
.nav-link,
.upload-button {
  line-height: 1;
}

button :deep(svg),
.nav-link :deep(svg),
.upload-button :deep(svg) {
  display: block;
  flex: 0 0 auto;
}

.token-panel button,
.save-button,
.secondary-button,
.danger-button,
.add-question-button {
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
.save-button,
.add-question-button {
  background: #67e8f9;
  color: #061022;
}

.secondary-button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.secondary-button.small {
  width: fit-content;
  min-height: 42px;
  font-size: 12px;
}

.danger-button {
  border: 1px solid rgba(248, 113, 113, 0.28);
  background: rgba(248, 113, 113, 0.1);
  color: #fecaca;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.workspace {
  border-radius: 24px;
  padding: clamp(20px, 3vw, 34px);
}

.workspace-header {
  justify-content: space-between;
  gap: 22px;
}

.workspace-header h2 {
  margin-top: 5px;
  font-size: clamp(30px, 4vw, 48px);
  line-height: 1;
  font-weight: 950;
}

.workspace-summary {
  margin-top: 9px;
  color: #94a3b8;
  font-weight: 750;
}

.workspace-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.template-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  margin-top: 28px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
}

.current-template-state {
  min-width: 128px;
  align-self: end;
  min-height: 50px;
  justify-content: center;
  gap: 8px;
  border-radius: 13px;
  background: rgba(148, 163, 184, 0.12);
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.current-template-state.active {
  background: rgba(74, 222, 128, 0.12);
  color: #bbf7d0;
}

.current-template-state.archived {
  background: rgba(248, 113, 113, 0.12);
  color: #fecaca;
}

.form-grid {
  display: grid;
  gap: 14px;
}

.template-fields {
  grid-template-columns: minmax(0, 1fr) 220px;
  margin-top: 22px;
}

.form-grid.compact {
  grid-template-columns: minmax(180px, 1fr) 140px 160px;
}

.section-heading {
  justify-content: space-between;
  gap: 16px;
  margin-top: 34px;
  padding-top: 28px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.section-heading h3 {
  margin-top: 5px;
  font-size: 26px;
  font-weight: 950;
}

.questions-list {
  display: grid;
  gap: 18px;
  margin-top: 18px;
}

.question-editor {
  display: grid;
  gap: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.045);
  padding: clamp(16px, 2.5vw, 24px);
}

.question-head {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 44px;
  gap: 12px;
}

.question-number {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 14px;
  background: #67e8f9;
  color: #061022;
  font-size: 20px;
  font-weight: 950;
}

.question-heading-copy {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.question-heading-copy strong {
  overflow: hidden;
  color: white;
  font-size: 19px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon-button {
  width: 44px;
  height: 44px;
  justify-content: center;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
}

.danger-icon {
  color: #fca5a5;
}

.media-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
}

.upload-button {
  min-height: 50px;
  justify-content: center;
  gap: 8px;
  border-radius: 13px;
  background: white;
  color: #061022;
  padding: 0 15px;
  font-weight: 900;
  white-space: nowrap;
}

.upload-button input {
  display: none;
}

.option-list {
  display: grid;
  gap: 10px;
}

.field-label {
  margin-bottom: 2px;
}

.option-row {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr) 44px;
  gap: 10px;
}

.correct-answer {
  display: grid;
  width: 50px;
  min-height: 50px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 13px;
  background: rgba(7, 11, 29, 0.92);
  cursor: pointer;
}

.correct-answer input {
  position: absolute;
  width: 1px;
  min-height: 1px;
  opacity: 0;
}

.correct-answer span {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  font-weight: 950;
}

.correct-answer:has(input:checked) {
  border-color: rgba(74, 222, 128, 0.7);
  background: rgba(74, 222, 128, 0.1);
}

.correct-answer:has(input:checked) span {
  background: #4ade80;
  color: #052e16;
}

.add-question-button {
  width: 100%;
  margin-top: 18px;
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

.message.success {
  background: rgba(74, 222, 128, 0.14);
  color: #bbf7d0;
}

@media (max-width: 760px) {
  .topbar,
  .workspace-header,
  .section-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .workspace-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .template-picker,
  .template-fields,
  .form-grid.compact,
  .media-row {
    grid-template-columns: 1fr;
  }

  .current-template-state {
    align-self: stretch;
  }

  .token-panel {
    grid-template-columns: 1fr;
  }

  .nav-link {
    width: 100%;
  }
}

@media (max-width: 520px) {
  .workspace-actions {
    grid-template-columns: 1fr;
  }

  .option-row {
    grid-template-columns: 46px minmax(0, 1fr) 42px;
    gap: 7px;
  }

  .correct-answer {
    width: 46px;
  }
}
</style>
