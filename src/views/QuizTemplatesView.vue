<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  FilePlus2,
  Image,
  ListChecks,
  Music,
  Plus,
  Save,
  Search,
  Trash2,
  Wifi,
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

type FourOptions = [string, string, string, string]
type DraftQuestion = {
  clientId: string
  text: string
  kind: 'text' | 'image' | 'audio'
  mediaUrl: string
  options: FourOptions
  correctOptionIndex: number
  durationSeconds: number
  points: number
}

const DEFAULT_DURATION_SECONDS = 20
const DEFAULT_POINTS = 1000
const statusLabels: Record<QuizTemplate['status'], string> = {
  draft: 'Черновик',
  active: 'Активный',
  archived: 'Архив',
}
const answerLabels = ['A', 'B', 'C', 'D']

const adminToken = ref('')
const connectedToken = ref('')
const templates = ref<QuizTemplate[]>([])
const selectedTemplateId = ref<string | null>(null)
const title = ref('')
const status = ref<QuizTemplate['status']>('draft')
const questions = ref<DraftQuestion[]>([createDraftQuestion()])
const searchQuery = ref('')
const statusFilter = ref<'all' | QuizTemplate['status']>('all')
const collapsedQuestionIds = ref<Set<string>>(new Set())
const baselineSignature = ref('')
const isLoading = ref(false)
const isDeleting = ref(false)
const isUploading = ref(false)
const showValidation = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const selectedTemplate = computed(
  () => templates.value.find((template) => template.id === selectedTemplateId.value) || null,
)
const isEditing = computed(() => Boolean(selectedTemplateId.value))
const isConnected = computed(
  () => Boolean(connectedToken.value) && connectedToken.value === adminToken.value.trim(),
)
const activeTemplateCount = computed(
  () => templates.value.filter((template) => template.status === 'active').length,
)
const filteredTemplates = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return templates.value.filter((template) => {
    const matchesQuery = !query || template.title.toLowerCase().includes(query)
    const matchesStatus = statusFilter.value === 'all' || template.status === statusFilter.value
    return matchesQuery && matchesStatus
  })
})
const editorSignature = computed(() =>
  JSON.stringify({
    title: title.value,
    status: status.value,
    questions: questions.value.map((question) => ({
      text: question.text,
      kind: question.kind,
      mediaUrl: question.mediaUrl,
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
      durationSeconds: question.durationSeconds,
      points: question.points,
    })),
  }),
)
const isDirty = computed(() => editorSignature.value !== baselineSignature.value)
const validationIssues = computed(() => {
  const issues: string[] = []

  if (!isConnected.value) issues.push('Сначала подключитесь к API с admin token')
  if (!title.value.trim()) issues.push('Укажите название шаблона')
  if (title.value.trim().length > 120) issues.push('Название шаблона: максимум 120 символов')
  if (!questions.value.length) issues.push('Добавьте хотя бы один вопрос')
  if (questions.value.length > 100) issues.push('В шаблоне может быть максимум 100 вопросов')

  questions.value.forEach((question, index) => {
    const questionNumber = index + 1
    if (!question.text.trim()) issues.push(`Вопрос ${questionNumber}: заполните текст`)
    if (question.text.trim().length > 500) issues.push(`Вопрос ${questionNumber}: максимум 500 символов`)
    if (question.options.length !== 4) issues.push(`Вопрос ${questionNumber}: должно быть ровно 4 ответа`)
    if (question.options.some((option) => !option.trim())) {
      issues.push(`Вопрос ${questionNumber}: заполните все 4 ответа`)
    }
    if (question.options.some((option) => option.trim().length > 180)) {
      issues.push(`Вопрос ${questionNumber}: ответ может содержать максимум 180 символов`)
    }
    if (question.correctOptionIndex < 0 || question.correctOptionIndex > 3) {
      issues.push(`Вопрос ${questionNumber}: выберите правильный ответ`)
    }
    if (!Number.isFinite(question.points) || question.points < 100 || question.points > 5000) {
      issues.push(`Вопрос ${questionNumber}: очки должны быть от 100 до 5000`)
    }
    if (question.kind !== 'text' && !question.mediaUrl.trim()) {
      issues.push(`Вопрос ${questionNumber}: загрузите медиафайл или укажите ссылку`)
    }
    if (question.mediaUrl.trim().length > 2048) {
      issues.push(`Вопрос ${questionNumber}: ссылка на файл слишком длинная`)
    }
  })

  return issues
})
const canSave = computed(() => validationIssues.value.length === 0)
const saveHint = computed(() => {
  if (isLoading.value) return 'Сохраняем шаблон…'
  if (!isDirty.value && isEditing.value) return 'Все изменения сохранены'
  if (validationIssues.value.length) return validationIssues.value[0]
  return 'Готово к сохранению · ⌘/Ctrl + S'
})

function createDraftQuestion(source?: Partial<DraftQuestion>): DraftQuestion {
  return {
    clientId: crypto.randomUUID(),
    text: source?.text || '',
    kind: source?.kind || 'text',
    mediaUrl: source?.mediaUrl || '',
    options: normalizeOptions(source?.options || []),
    correctOptionIndex: source?.correctOptionIndex ?? 0,
    durationSeconds: DEFAULT_DURATION_SECONDS,
    points: source?.points ?? DEFAULT_POINTS,
  }
}

function normalizeOptions(options: readonly string[]): FourOptions {
  return [options[0] || '', options[1] || '', options[2] || '', options[3] || '']
}

function clearMessages() {
  errorMessage.value = ''
  successMessage.value = ''
}

function setBaseline() {
  baselineSignature.value = editorSignature.value
  showValidation.value = false
}

function confirmDiscardChanges() {
  return !isDirty.value || window.confirm('Есть несохранённые изменения. Продолжить без сохранения?')
}

function fillEditorFromTemplate(template: QuizTemplate) {
  selectedTemplateId.value = template.id
  title.value = template.title
  status.value = template.status
  questions.value = template.questions.map((question) =>
    createDraftQuestion({
      text: question.text,
      kind: question.kind,
      mediaUrl: question.media?.url || '',
      options: normalizeOptions(question.options.map((option) => option.text)),
      correctOptionIndex: Math.max(
        0,
        Math.min(3, question.options.findIndex((option) => option.id === question.correctOptionId)),
      ),
      points: question.points,
    }),
  )
  collapsedQuestionIds.value = new Set(
    questions.value.slice(1).map((question) => question.clientId),
  )
  setBaseline()
}

async function refreshConnection() {
  if (!confirmDiscardChanges()) return
  await connectAndLoad(selectedTemplateId.value || undefined)
}

async function connectAndLoad(preferredTemplateId?: string) {
  if (!adminToken.value.trim()) {
    connectedToken.value = ''
    errorMessage.value = 'Введите admin token'
    return
  }

  isLoading.value = true
  clearMessages()

  try {
    const loadedTemplates = await getTemplates(adminToken.value.trim())
    connectedToken.value = adminToken.value.trim()
    setStoredAdminToken(connectedToken.value)
    templates.value = loadedTemplates

    const templateToSelect =
      loadedTemplates.find((template) => template.id === preferredTemplateId) ||
      loadedTemplates.find((template) => template.id === selectedTemplateId.value) ||
      loadedTemplates[0]

    if (templateToSelect) fillEditorFromTemplate(templateToSelect)
    else resetToNewTemplate(false)
  } catch (error) {
    connectedToken.value = ''
    errorMessage.value = getQuizErrorMessage(error, 'Не удалось загрузить шаблоны')
  } finally {
    isLoading.value = false
  }
}

function selectTemplate(template: QuizTemplate) {
  if (template.id === selectedTemplateId.value) return
  if (!confirmDiscardChanges()) return
  clearMessages()
  fillEditorFromTemplate(template)
}

function resetToNewTemplate(askForConfirmation = true) {
  if (askForConfirmation && !confirmDiscardChanges()) return
  clearMessages()
  selectedTemplateId.value = null
  title.value = ''
  status.value = 'draft'
  questions.value = [createDraftQuestion()]
  collapsedQuestionIds.value = new Set()
  setBaseline()
}

function duplicateTemplate() {
  clearMessages()
  selectedTemplateId.value = null
  title.value = `${title.value.trim() || 'Новый шаблон'} — копия`
  status.value = 'draft'
  questions.value = questions.value.map((question) => createDraftQuestion(question))
  collapsedQuestionIds.value = new Set()
  baselineSignature.value = ''
  successMessage.value = 'Создана копия. Проверьте название и сохраните её.'
}

function duplicateSavedTemplate(template: QuizTemplate) {
  if (template.id !== selectedTemplateId.value && !confirmDiscardChanges()) return
  fillEditorFromTemplate(template)
  duplicateTemplate()
}

async function saveTemplate() {
  clearMessages()
  showValidation.value = true

  if (!canSave.value) {
    errorMessage.value = validationIssues.value[0] || 'Проверьте заполнение шаблона'
    return
  }

  const wasEditing = isEditing.value
  isLoading.value = true
  const payload: CreateQuizTemplateInput = {
    title: title.value.trim(),
    status: status.value,
    questions: questions.value.map(toQuestionInput),
  }

  try {
    const savedTemplate = selectedTemplateId.value
      ? await updateTemplate(selectedTemplateId.value, payload, connectedToken.value)
      : await createTemplate(payload, connectedToken.value)

    templates.value = await getTemplates(connectedToken.value)
    fillEditorFromTemplate(savedTemplate)
    successMessage.value = wasEditing ? 'Шаблон обновлён и сохранён в базе' : 'Шаблон создан и сохранён в базе'
  } catch (error) {
    errorMessage.value = getQuizErrorMessage(error, 'Не удалось сохранить шаблон')
  } finally {
    isLoading.value = false
  }
}

async function removeTemplate() {
  if (!selectedTemplate.value || isDeleting.value) return
  if (!window.confirm(`Удалить шаблон «${selectedTemplate.value.title}»? Игры сохранят свою копию вопросов.`)) return

  isDeleting.value = true
  clearMessages()

  try {
    await deleteTemplate(selectedTemplate.value.id, connectedToken.value)
    templates.value = await getTemplates(connectedToken.value)
    const nextTemplate = templates.value[0]
    if (nextTemplate) fillEditorFromTemplate(nextTemplate)
    else resetToNewTemplate(false)
    successMessage.value = 'Шаблон удалён. История созданных игр не затронута.'
  } catch (error) {
    errorMessage.value = getQuizErrorMessage(error, 'Не удалось удалить шаблон')
  } finally {
    isDeleting.value = false
  }
}

function addQuestion() {
  if (questions.value.length >= 100) return
  const question = createDraftQuestion()
  questions.value.push(question)
  collapsedQuestionIds.value.delete(question.clientId)
}

function duplicateQuestion(index: number) {
  if (questions.value.length >= 100) return
  const source = questions.value[index]
  if (!source) return
  const duplicate = createDraftQuestion(source)
  questions.value.splice(index + 1, 0, duplicate)
}

function removeQuestion(index: number) {
  if (questions.value.length === 1) return
  const question = questions.value[index]
  questions.value.splice(index, 1)
  if (question) collapsedQuestionIds.value.delete(question.clientId)
}

function moveQuestion(index: number, direction: -1 | 1) {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= questions.value.length) return
  const [question] = questions.value.splice(index, 1)
  if (question) questions.value.splice(targetIndex, 0, question)
}

function toggleQuestion(questionId: string) {
  const next = new Set(collapsedQuestionIds.value)
  if (next.has(questionId)) next.delete(questionId)
  else next.add(questionId)
  collapsedQuestionIds.value = next
}

async function uploadMedia(question: DraftQuestion, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!isConnected.value) {
    errorMessage.value = 'Сначала подключитесь к API'
    input.value = ''
    return
  }

  isUploading.value = true
  clearMessages()

  try {
    const uploadedFile = await uploadQuizMedia(file, connectedToken.value)
    question.mediaUrl = uploadedFile.url
    question.kind = uploadedFile.mimetype.startsWith('audio/') ? 'audio' : 'image'
    successMessage.value = 'Медиафайл загружен'
  } catch (error) {
    errorMessage.value = getQuizErrorMessage(error, 'Не удалось загрузить файл')
  } finally {
    isUploading.value = false
    input.value = ''
  }
}

function toQuestionInput(question: DraftQuestion): CreateQuizQuestionInput {
  const input: CreateQuizQuestionInput = {
    kind: question.kind,
    text: question.text.trim(),
    options: question.options.map((option) => ({ text: option.trim() })),
    correctOptionIndex: question.correctOptionIndex,
    durationMs: DEFAULT_DURATION_SECONDS * 1000,
    points: question.points,
  }

  if (question.kind !== 'text') {
    input.media = {
      type: question.kind,
      url: question.mediaUrl.trim(),
    }
  }

  return input
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function questionCountLabel(count: number) {
  const lastTwoDigits = count % 100
  const lastDigit = count % 10

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${count} вопросов`
  if (lastDigit === 1) return `${count} вопрос`
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} вопроса`
  return `${count} вопросов`
}

function markTokenChanged() {
  if (adminToken.value.trim() !== connectedToken.value) connectedToken.value = ''
}

function handleKeyboardShortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void saveTemplate()
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  adminToken.value = getStoredAdminToken() || (import.meta.env.DEV ? 'dev-admin-token' : '')
  window.addEventListener('keydown', handleKeyboardShortcut)
  window.addEventListener('beforeunload', handleBeforeUnload)
  if (adminToken.value) void connectAndLoad()
  else setBaseline()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboardShortcut)
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <main class="templates-page">
    <section class="templates-shell">
      <header class="topbar">
        <div class="brand">
          <img src="/logo_trans.png" alt="Izzy Quiz" />
          <div>
            <p>Izzy Quiz Admin</p>
            <h1>Шаблоны игр</h1>
          </div>
        </div>
        <a class="nav-link" href="/quiz/games">Live games</a>
      </header>

      <section class="connection-panel">
        <div class="connection-copy">
          <div class="connection-title">
            <Wifi :size="20" />
            <strong>Подключение к базе</strong>
            <span :class="['connection-state', { connected: isConnected }]">
              {{ isConnected ? 'Подключено' : 'Не подключено' }}
            </span>
          </div>
          <p>Локальный token уже подставлен. В production он задаётся на сервере.</p>
        </div>
        <label>
          <span>Admin token</span>
          <input
            v-model="adminToken"
            type="password"
            placeholder="Введите admin token"
            @input="markTokenChanged"
            @keyup.enter="refreshConnection()"
          />
        </label>
        <button class="connect-button" type="button" :disabled="isLoading" @click="refreshConnection()">
          {{ isLoading ? 'Подключаемся…' : isConnected ? 'Обновить' : 'Подключиться' }}
        </button>
      </section>

      <p v-if="errorMessage" class="message error"><CircleAlert :size="18" />{{ errorMessage }}</p>
      <p v-if="successMessage" class="message success"><Check :size="18" />{{ successMessage }}</p>

      <section class="library-panel panel">
        <header class="section-header">
          <div>
            <p class="eyebrow">Библиотека</p>
            <h2>Сохранённые шаблоны</h2>
            <p>{{ templates.length }} всего · {{ activeTemplateCount }} активных</p>
          </div>
          <button class="primary-button" type="button" @click="resetToNewTemplate()">
            <FilePlus2 :size="19" />
            Новый шаблон
          </button>
        </header>

        <div class="library-tools">
          <label class="search-field">
            <Search :size="18" />
            <input v-model="searchQuery" type="search" placeholder="Найти по названию" />
          </label>
          <select v-model="statusFilter" aria-label="Фильтр по статусу">
            <option value="all">Все статусы</option>
            <option value="draft">Черновики</option>
            <option value="active">Активные</option>
            <option value="archived">Архив</option>
          </select>
        </div>

        <div v-if="filteredTemplates.length" class="template-grid">
          <article
            v-for="template in filteredTemplates"
            :key="template.id"
            class="template-card"
            :class="{ selected: template.id === selectedTemplateId }"
          >
            <button class="template-card-main" type="button" @click="selectTemplate(template)">
              <span :class="['status-pill', template.status]">{{ statusLabels[template.status] }}</span>
              <strong>{{ template.title }}</strong>
              <span>{{ questionCountLabel(template.questions.length) }}</span>
              <small>Изменён {{ formatUpdatedAt(template.updatedAt) }}</small>
            </button>
            <button
              class="card-copy-button"
              type="button"
              :aria-label="`Создать копию шаблона ${template.title}`"
              @click="duplicateSavedTemplate(template)"
            >
              <Copy :size="16" />
              Копировать
            </button>
          </article>
        </div>
        <div v-else class="empty-library">
          <ListChecks :size="34" />
          <strong>{{ templates.length ? 'Ничего не найдено' : 'Шаблонов пока нет' }}</strong>
          <p>{{ templates.length ? 'Измените поиск или фильтр.' : 'Создайте первый шаблон игры.' }}</p>
        </div>
      </section>

      <section class="editor-panel panel">
        <header class="editor-header">
          <div class="editor-heading">
            <p class="eyebrow">{{ isEditing ? 'Редактирование' : 'Новый шаблон' }}</p>
            <div class="editor-title-row">
              <h2>{{ title.trim() || 'Без названия' }}</h2>
              <span v-if="isDirty" class="dirty-badge">Не сохранено</span>
              <span v-else-if="isEditing" class="saved-badge"><Check :size="14" /> Сохранено</span>
            </div>
            <p>{{ questionCountLabel(questions.length) }}</p>
          </div>

          <div class="editor-actions">
            <button class="secondary-button" type="button" @click="duplicateTemplate">
              <Copy :size="18" />
              Копия
            </button>
            <button
              v-if="isEditing"
              class="danger-button"
              type="button"
              :disabled="isDeleting"
              @click="removeTemplate"
            >
              <Trash2 :size="18" />
              {{ isDeleting ? 'Удаляем…' : 'Удалить' }}
            </button>
            <button class="save-button" type="button" :disabled="isLoading" @click="saveTemplate">
              <Save :size="19" />
              {{ isLoading ? 'Сохраняем…' : isEditing ? 'Сохранить' : 'Создать' }}
            </button>
          </div>
          <p class="save-hint" :class="{ invalid: showValidation && !canSave }">{{ saveHint }}</p>
        </header>

        <div class="template-fields">
          <label>
            <span>Название шаблона</span>
            <input
              v-model="title"
              type="text"
              maxlength="120"
              placeholder="Например: Музыкальная разминка"
              :class="{ invalid: showValidation && !title.trim() }"
            />
          </label>
          <label>
            <span>Статус</span>
            <select v-model="status">
              <option value="draft">Черновик</option>
              <option value="active">Активный — можно создать игру</option>
              <option value="archived">Архив</option>
            </select>
          </label>
        </div>

        <div class="content-heading">
          <div>
            <p class="eyebrow">Вопросы</p>
            <h3>Всегда четыре варианта ответа</h3>
            <p>Таймер live-игры пока общий — 20 секунд.</p>
          </div>
          <button class="secondary-button" type="button" :disabled="questions.length >= 100" @click="addQuestion">
            <Plus :size="18" />
            Добавить вопрос
          </button>
        </div>

        <section class="questions-list">
          <article
            v-for="(question, questionIndex) in questions"
            :key="question.clientId"
            class="question-editor"
            :class="{ collapsed: collapsedQuestionIds.has(question.clientId) }"
          >
            <header class="question-header">
              <button class="question-toggle" type="button" @click="toggleQuestion(question.clientId)">
                <span class="question-number">{{ questionIndex + 1 }}</span>
                <span class="question-heading-copy">
                  <small>Вопрос</small>
                  <strong>{{ question.text.trim() || 'Пока без текста' }}</strong>
                </span>
                <span
                  class="question-validity"
                  :class="{
                    valid: question.text.trim() && question.options.every((option) => option.trim()),
                  }"
                >
                  {{ question.text.trim() && question.options.every((option) => option.trim()) ? 'Готов' : 'Заполнить' }}
                </span>
                <ChevronDown v-if="collapsedQuestionIds.has(question.clientId)" :size="20" />
                <ChevronUp v-else :size="20" />
              </button>
              <div class="question-actions">
                <button
                  type="button"
                  aria-label="Переместить вопрос вверх"
                  :disabled="questionIndex === 0"
                  @click="moveQuestion(questionIndex, -1)"
                ><ChevronUp :size="17" /></button>
                <button
                  type="button"
                  aria-label="Переместить вопрос вниз"
                  :disabled="questionIndex === questions.length - 1"
                  @click="moveQuestion(questionIndex, 1)"
                ><ChevronDown :size="17" /></button>
                <button type="button" aria-label="Дублировать вопрос" :disabled="questions.length >= 100" @click="duplicateQuestion(questionIndex)">
                  <Copy :size="17" />
                </button>
                <button
                  class="danger-icon"
                  type="button"
                  aria-label="Удалить вопрос"
                  :disabled="questions.length === 1"
                  @click="removeQuestion(questionIndex)"
                ><Trash2 :size="17" /></button>
              </div>
            </header>

            <div v-if="!collapsedQuestionIds.has(question.clientId)" class="question-body">
              <label>
                <span>Текст вопроса</span>
                <textarea
                  v-model="question.text"
                  rows="2"
                  maxlength="500"
                  placeholder="Напишите вопрос"
                  :class="{ invalid: showValidation && !question.text.trim() }"
                />
              </label>

              <div class="question-settings">
                <label>
                  <span>Тип</span>
                  <select v-model="question.kind">
                    <option value="text">Текст</option>
                    <option value="image">Изображение</option>
                    <option value="audio">Аудио</option>
                  </select>
                </label>
                <label>
                  <span>Максимум очков</span>
                  <input v-model.number="question.points" type="number" min="100" max="5000" step="100" />
                </label>
              </div>

              <div v-if="question.kind !== 'text'" class="media-row">
                <label class="upload-button">
                  <Image v-if="question.kind === 'image'" :size="18" />
                  <Music v-else :size="18" />
                  {{ isUploading ? 'Загрузка…' : 'Загрузить файл' }}
                  <input
                    type="file"
                    :accept="question.kind === 'audio' ? 'audio/*' : 'image/*'"
                    :disabled="isUploading"
                    @change="uploadMedia(question, $event)"
                  />
                </label>
                <input
                  v-model="question.mediaUrl"
                  type="text"
                  maxlength="2048"
                  placeholder="Или вставьте ссылку на файл"
                  :class="{ invalid: showValidation && !question.mediaUrl.trim() }"
                />
              </div>

              <fieldset class="answers-fieldset">
                <legend>Ответы · отметьте правильный</legend>
                <div class="answers-grid">
                  <div
                    v-for="(_, optionIndex) in question.options"
                    :key="optionIndex"
                    class="answer-row"
                    :class="{
                      correct: question.correctOptionIndex === optionIndex,
                      invalid: showValidation && !question.options[optionIndex].trim(),
                    }"
                  >
                    <label class="correct-answer" :title="`Ответ ${answerLabels[optionIndex]} правильный`">
                      <input
                        v-model="question.correctOptionIndex"
                        type="radio"
                        :name="`correct-${question.clientId}`"
                        :value="optionIndex"
                      />
                      <span>{{ answerLabels[optionIndex] }}</span>
                    </label>
                    <input
                      v-model="question.options[optionIndex]"
                      type="text"
                      maxlength="180"
                      :placeholder="`Вариант ${answerLabels[optionIndex]}`"
                    />
                    <Check v-if="question.correctOptionIndex === optionIndex" :size="19" />
                  </div>
                </div>
              </fieldset>
            </div>
          </article>
        </section>

        <button class="add-question-button" type="button" :disabled="questions.length >= 100" @click="addQuestion">
          <Plus :size="20" />
          Добавить ещё один вопрос
        </button>
      </section>
    </section>
  </main>
</template>

<style scoped>
.templates-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at 8% 4%, rgba(103, 232, 249, 0.13), transparent 25%),
    radial-gradient(circle at 92% 12%, rgba(217, 70, 239, 0.13), transparent 28%),
    #070b1d;
  color: #fff;
  padding: clamp(14px, 3vw, 34px);
}

.templates-shell { width: min(100%, 1240px); margin: 0 auto; }
.topbar, .brand, .connection-title, .section-header, .editor-title-row, .editor-actions,
.content-heading, .question-header, .question-actions, .media-row, .message, .primary-button,
.secondary-button, .danger-button, .save-button, .connect-button, .nav-link, .upload-button,
.add-question-button, .search-field, .saved-badge { display: flex; align-items: center; }

.topbar { justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.brand { gap: 13px; min-width: 0; }
.brand img { width: 58px; height: 58px; padding: 7px; border-radius: 17px; background: rgba(255,255,255,.1); }
.brand p, .eyebrow, label > span, .answers-fieldset legend, .question-heading-copy small {
  color: #67e8f9; font-size: 11px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase;
}
.brand h1 { margin-top: 2px; font-size: clamp(27px, 5vw, 51px); line-height: .96; font-weight: 950; text-transform: uppercase; }
.nav-link { min-height: 46px; justify-content: center; padding: 0 17px; border: 1px solid rgba(255,255,255,.14); border-radius: 13px; color: #fff; background: rgba(11,17,40,.82); font-weight: 900; text-transform: uppercase; }

.panel, .connection-panel { border: 1px solid rgba(255,255,255,.12); background: rgba(11,17,40,.86); box-shadow: 0 24px 70px rgba(0,0,0,.24); }
.connection-panel { display: grid; grid-template-columns: minmax(260px,1fr) minmax(250px,.75fr) auto; align-items: end; gap: 14px; margin-bottom: 14px; padding: 15px; border-radius: 18px; }
.connection-copy { align-self: center; }
.connection-title { gap: 8px; }
.connection-title strong { font-size: 16px; }
.connection-copy p { margin-top: 5px; color: #94a3b8; font-size: 12px; font-weight: 700; }
.connection-state { margin-left: 4px; padding: 5px 8px; border-radius: 999px; color: #fda4af; background: rgba(244,63,94,.12); font-size: 10px; font-weight: 900; text-transform: uppercase; }
.connection-state.connected { color: #6ee7b7; background: rgba(16,185,129,.13); }

label { display: grid; gap: 7px; }
input, textarea, select { width: 100%; min-height: 48px; border: 1px solid rgba(255,255,255,.14); border-radius: 12px; background: rgba(5,9,25,.88); padding: 0 13px; color: #fff; font-size: 15px; font-weight: 720; outline: none; transition: border-color .18s, box-shadow .18s; }
textarea { min-height: 86px; padding-top: 12px; line-height: 1.45; resize: vertical; }
input:focus, textarea:focus, select:focus { border-color: rgba(103,232,249,.8); box-shadow: 0 0 0 3px rgba(103,232,249,.12); }
input.invalid, textarea.invalid, .answer-row.invalid { border-color: rgba(251,113,133,.75); box-shadow: 0 0 0 2px rgba(251,113,133,.1); }

button, .nav-link, .upload-button { line-height: 1; }
button:disabled { cursor: not-allowed; opacity: .45; }
.connect-button, .primary-button, .secondary-button, .danger-button, .save-button, .upload-button, .add-question-button { min-height: 46px; justify-content: center; gap: 8px; border-radius: 12px; padding: 0 16px; font-size: 13px; font-weight: 900; }
.connect-button, .primary-button, .save-button { color: #06101e; background: #67e8f9; }
.save-button { background: #fff; }
.secondary-button, .upload-button { border: 1px solid rgba(255,255,255,.14); color: #fff; background: rgba(255,255,255,.07); }
.danger-button { border: 1px solid rgba(251,113,133,.28); color: #fecdd3; background: rgba(244,63,94,.1); }

.message { gap: 8px; margin-bottom: 14px; padding: 12px 14px; border-radius: 13px; font-weight: 800; }
.message.error { border: 1px solid rgba(251,113,133,.3); color: #fecdd3; background: rgba(127,29,29,.7); }
.message.success { border: 1px solid rgba(110,231,183,.25); color: #a7f3d0; background: rgba(6,78,59,.62); }

.library-panel, .editor-panel { border-radius: 22px; padding: clamp(18px, 3vw, 27px); }
.library-panel { margin-bottom: 18px; }
.section-header, .content-heading { justify-content: space-between; gap: 18px; }
.section-header h2, .editor-header h2, .content-heading h3 { margin-top: 5px; font-size: clamp(23px, 3vw, 34px); line-height: 1.04; font-weight: 950; }
.section-header p:last-child, .editor-heading > p:last-child, .content-heading p:last-child { margin-top: 6px; color: #94a3b8; font-size: 13px; font-weight: 700; }
.library-tools { display: grid; grid-template-columns: minmax(0,1fr) 210px; gap: 10px; margin: 19px 0 13px; }
.search-field { position: relative; }
.search-field svg { position: absolute; left: 14px; color: #94a3b8; pointer-events: none; }
.search-field input { padding-left: 42px; }
.template-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
.template-card { min-width: 0; overflow: hidden; border: 1px solid rgba(255,255,255,.1); border-radius: 15px; background: rgba(255,255,255,.045); }
.template-card.selected { border-color: rgba(103,232,249,.7); background: rgba(103,232,249,.09); box-shadow: inset 0 0 0 1px rgba(103,232,249,.14); }
.template-card-main { width: 100%; display: grid; gap: 8px; padding: 14px; color: #fff; text-align: left; }
.template-card-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 17px; }
.template-card-main > span:not(.status-pill), .template-card-main small { color: #94a3b8; font-size: 12px; font-weight: 750; }
.status-pill { justify-self: start; padding: 5px 8px; border-radius: 999px; font-size: 9px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.status-pill.active { color: #6ee7b7; background: rgba(16,185,129,.14); }
.status-pill.draft { color: #fde68a; background: rgba(245,158,11,.14); }
.status-pill.archived { color: #cbd5e1; background: rgba(148,163,184,.14); }
.card-copy-button { width: 100%; min-height: 36px; display: flex; align-items: center; justify-content: center; gap: 6px; border-top: 1px solid rgba(255,255,255,.08); color: #cbd5e1; background: rgba(0,0,0,.1); font-size: 11px; font-weight: 850; }
.empty-library { display: grid; justify-items: center; gap: 7px; padding: 30px; border: 1px dashed rgba(255,255,255,.15); border-radius: 15px; color: #94a3b8; text-align: center; }
.empty-library strong { color: #fff; }

.editor-panel { position: relative; }
.editor-header { position: sticky; top: 10px; z-index: 20; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 13px 20px; margin: -10px -10px 20px; padding: 16px 10px; border-bottom: 1px solid rgba(255,255,255,.1); background: rgba(11,17,40,.96); backdrop-filter: blur(16px); }
.editor-title-row { gap: 10px; min-width: 0; }
.editor-title-row h2 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dirty-badge, .saved-badge { flex: 0 0 auto; padding: 5px 8px; border-radius: 999px; font-size: 9px; font-weight: 950; text-transform: uppercase; }
.dirty-badge { color: #fde68a; background: rgba(245,158,11,.14); }
.saved-badge { gap: 4px; color: #6ee7b7; background: rgba(16,185,129,.14); }
.editor-actions { justify-content: flex-end; gap: 8px; }
.save-hint { grid-column: 1 / -1; color: #94a3b8; font-size: 12px; font-weight: 750; text-align: right; }
.save-hint.invalid { color: #fda4af; }
.template-fields { display: grid; grid-template-columns: minmax(0,1.6fr) minmax(220px,.7fr); gap: 12px; }
.content-heading { margin: 28px 0 13px; }

.questions-list { display: grid; gap: 11px; }
.question-editor { overflow: hidden; border: 1px solid rgba(255,255,255,.11); border-radius: 17px; background: rgba(255,255,255,.04); }
.question-editor.collapsed { background: rgba(255,255,255,.025); }
.question-header { min-width: 0; gap: 8px; padding: 10px; border-bottom: 1px solid rgba(255,255,255,.08); }
.question-editor.collapsed .question-header { border-bottom: 0; }
.question-toggle { min-width: 0; flex: 1; display: grid; grid-template-columns: 38px minmax(0,1fr) auto auto; align-items: center; gap: 10px; color: #fff; text-align: left; }
.question-number { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 11px; color: #06101e; background: #67e8f9; font-weight: 950; }
.question-heading-copy { min-width: 0; display: grid; gap: 3px; }
.question-heading-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.question-validity { padding: 5px 8px; border-radius: 999px; color: #fda4af; background: rgba(244,63,94,.11); font-size: 9px; font-weight: 900; text-transform: uppercase; }
.question-validity.valid { color: #6ee7b7; background: rgba(16,185,129,.12); }
.question-actions { gap: 5px; }
.question-actions button { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid rgba(255,255,255,.1); border-radius: 9px; color: #cbd5e1; background: rgba(255,255,255,.045); }
.question-actions button.danger-icon { color: #fda4af; }
.question-body { display: grid; gap: 15px; padding: 16px; }
.question-settings { display: grid; grid-template-columns: minmax(0,1fr) minmax(180px,.45fr); gap: 11px; }
.media-row { gap: 10px; align-items: end; }
.media-row .upload-button { flex: 0 0 auto; }
.media-row > input { flex: 1; }
.upload-button input { display: none; }
.answers-fieldset { min-width: 0; }
.answers-fieldset legend { margin-bottom: 9px; }
.answers-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
.answer-row { min-width: 0; display: grid; grid-template-columns: 42px minmax(0,1fr) 22px; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,.1); border-radius: 13px; padding: 7px; background: rgba(5,9,25,.58); }
.answer-row.correct { border-color: rgba(110,231,183,.55); background: rgba(16,185,129,.09); }
.answer-row > input { min-height: 42px; border: 0; background: transparent; padding: 0 5px; box-shadow: none; }
.answer-row > svg { color: #6ee7b7; }
.correct-answer { cursor: pointer; }
.correct-answer input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.correct-answer span { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 10px; color: #cbd5e1; background: rgba(255,255,255,.09); font-weight: 950; }
.answer-row.correct .correct-answer span { color: #052e16; background: #6ee7b7; }
.add-question-button { width: 100%; margin-top: 12px; border: 1px dashed rgba(103,232,249,.38); color: #67e8f9; background: rgba(103,232,249,.055); }

@media (max-width: 900px) {
  .connection-panel { grid-template-columns: 1fr auto; }
  .connection-copy { grid-column: 1 / -1; }
  .template-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .editor-header { position: static; grid-template-columns: 1fr; margin-top: 0; }
  .editor-actions { justify-content: flex-start; flex-wrap: wrap; }
  .save-hint { text-align: left; }
}

@media (max-width: 640px) {
  .templates-page { padding: 11px; }
  .topbar { align-items: flex-start; }
  .brand img { width: 47px; height: 47px; }
  .brand p { font-size: 9px; }
  .brand h1 { font-size: 23px; }
  .nav-link { min-height: 40px; padding: 0 11px; font-size: 10px; }
  .connection-panel { grid-template-columns: 1fr; }
  .connection-copy, .connect-button { grid-column: auto; }
  .section-header, .content-heading { align-items: flex-start; flex-direction: column; }
  .section-header .primary-button, .content-heading .secondary-button { width: 100%; }
  .library-tools, .template-fields, .question-settings, .answers-grid { grid-template-columns: 1fr; }
  .template-grid { grid-template-columns: 1fr; }
  .editor-actions { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); width: 100%; }
  .save-button { grid-column: 1 / -1; }
  .question-header { align-items: stretch; flex-direction: column; }
  .question-actions { justify-content: flex-end; }
  .question-toggle { grid-template-columns: 38px minmax(0,1fr) auto; }
  .question-toggle > svg { display: none; }
  .question-validity { display: none; }
  .media-row { align-items: stretch; flex-direction: column; }
  .media-row .upload-button { width: 100%; }
}
</style>
