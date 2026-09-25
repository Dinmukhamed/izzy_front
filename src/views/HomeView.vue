<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { audioSamples, imgSamples, textSamples } from '@/utils/samples'
import {
  CalendarDays,
  CheckCircle2,
  Instagram,
  Link,
  MapPin,
  Music2,
  Share2,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-vue-next'
import TgIcon from '@/assets/tg.svg'
import { vMaska } from 'maska/vue'
import {
  GAMES,
  formatGameDate,
  getGameBySlug,
  isGameRegistrationAvailable,
  type LandingGame,
} from '@/utils/games'

const route = useRoute()
const router = useRouter()

// SECURITY TODO: move Telegram delivery server-side and rotate this browser-exposed bot token.
const botToken = import.meta.env.VITE_BOT_TOKEN
const chatId = import.meta.env.VITE_CHAT_ID

type QuestionType = 'text' | 'image' | 'audio'
type SampleQuestion = {
  text: string
  choices: string[]
  correctIndex: number
  image?: string
  audio?: string
}

const types: QuestionType[] = ['text', 'image', 'audio']
const typeLabels: Record<QuestionType, string> = {
  text: 'Текст',
  image: 'Картинка',
  audio: 'Аудио'
}

const sampleQuestions = reactive<Record<QuestionType, SampleQuestion[]>>({
  text: textSamples,
  image: imgSamples,
  audio: audioSamples,
})

const currentType = ref<QuestionType>('text')
const currentIndex = ref(0)
const selectedAnswer = ref<number | null>(null)
const selectedGame = ref<LandingGame | null>(null)

const currentQuestion = computed(() => {
  return sampleQuestions[currentType.value][currentIndex.value] || null
})

function selectTab(type: QuestionType) {
  currentType.value = type
  currentIndex.value = 0
  selectedAnswer.value = null
}

function selectAnswer(index: number) {
  if (selectedAnswer.value === null) {
    selectedAnswer.value = index
  }
}

function getChoiceClass(index: number) {
  if (selectedAnswer.value === null) return 'bg-white hover:bg-gray-100 border-gray-300'

  if (index === currentQuestion.value.correctIndex) return 'bg-green-100 border-green-500 text-green-700'
  if (index === selectedAnswer.value) return 'bg-red-100 border-red-500 text-red-700'
  return 'bg-white border-gray-300'
}

function nextQuestion() {
  const next = currentIndex.value + 1
  const hasMore = sampleQuestions[currentType.value].length > next

  if (hasMore) {
    currentIndex.value = next
  } else {
    currentIndex.value = 0
  }

  selectedAnswer.value = null
}

const isModalOpen = ref(false)
const isSubmitted = ref(false)
const modalDialog = ref<HTMLElement | null>(null)
const successHeading = ref<HTMLElement | null>(null)
let previouslyFocusedElement: HTMLElement | null = null
let previousBodyOverflow = ''

const teamName = ref('')
const captainName = ref('')
const phoneNumber = ref('')
const teamSize = ref<string | null>(null)
const isGuestPlayer = ref(false)

const errors = ref({
  teamName: '',
  captainName: '',
  phoneNumber: '',
  teamSize: '',
})

const availableGames = computed(() =>
  GAMES
    .filter((game) => new Date(game.startsAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
)

const featuredGame = computed(() => availableGames.value[0] || null)
const canRegisterSelectedGame = computed(() =>
  selectedGame.value ? isGameRegistrationAvailable(selectedGame.value) : false,
)

const scheduleClass = computed(() => {
  if (availableGames.value.length === 1) return 'schedule-list schedule-list--single'
  if (availableGames.value.length === 2) return 'schedule-list schedule-list--two'

  return 'schedule-list'
})

function resetRegistrationForm() {
  isSubmitted.value = false
  isLoading.value = false
  teamName.value = ''
  captainName.value = ''
  phoneNumber.value = ''
  teamSize.value = null
  isGuestPlayer.value = false
  errorMessage.value = ''
  clearErrors()
}

async function showRegistration(game: LandingGame | null) {
  resetRegistrationForm()
  selectedGame.value = game
  if (!isModalOpen.value) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  isModalOpen.value = true

  await nextTick()
  const autofocusTarget = modalDialog.value?.querySelector<HTMLElement>('[data-autofocus]:not(:disabled)')
  ;(autofocusTarget || modalDialog.value)?.focus()
}

function hideRegistration() {
  if (!isModalOpen.value) return
  isModalOpen.value = false
  document.body.style.overflow = previousBodyOverflow
  void nextTick(() => previouslyFocusedElement?.focus())
}

function openRegistration(game: LandingGame, event?: Event) {
  previouslyFocusedElement = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

  if (route.name === 'game-registration' && route.params.slug === game.slug) {
    void showRegistration(game)
    return
  }

  void router.push({ name: 'game-registration', params: { slug: game.slug } })
}

function closeRegistration() {
  hideRegistration()
  if (route.name === 'game-registration') {
    void router.replace({ name: 'home', hash: '#schedule' })
  }
}

function clearErrors() {
  errors.value = {
    teamName: '',
    captainName: '',
    phoneNumber: '',
    teamSize: '',
  }
}

function validateForm() {
  clearErrors()
  let isValid = true
  const numericTeamSize = Number(teamSize.value)

  if (!teamName.value.trim() && !isGuestPlayer.value) {
    errors.value.teamName = 'Введите название команды'
    isValid = false
  }
  if (!captainName.value.trim()) {
    errors.value.captainName = 'Введите Ваше имя'
    isValid = false
  }
  if (!phoneNumber.value.match(/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/)) {
    errors.value.phoneNumber = 'Введите корректный номер телефона'
    isValid = false
  }
  if (!isGuestPlayer.value && !teamSize.value) {
    errors.value.teamSize = 'Укажите количество участников'
    isValid = false
  }

  if (
    !isGuestPlayer.value &&
    teamSize.value &&
    (Number.isNaN(numericTeamSize) || numericTeamSize < 1 || numericTeamSize > 12)
  ) {
    errors.value.teamSize = 'Количество участников от 1 до 12'
    isValid = false
  }

  return isValid
}

const isLoading = ref(false)
const errorMessage = ref('')

const submitForm = async () => {
  if (isLoading.value || !selectedGame.value || !canRegisterSelectedGame.value) return
  errorMessage.value = ''

  try {
    if (validateForm()) {
      isLoading.value = true
      const payload = {
        game: selectedGame.value.shortName,
        captainName: captainName.value.trim(),
        teamName: isGuestPlayer.value ? 'No team' : teamName.value.trim(),
        phoneNumber: phoneNumber.value,
        teamSize: isGuestPlayer.value ? '1' : teamSize.value,
      }
      const message = `
      <b>🎮 Новая регистрация</b>

      <b>Игра:</b>
      ${escapeTelegramHtml(payload.game)}

      <b>Капитан:</b>
      ${escapeTelegramHtml(payload.captainName)}

      <b>Команда:</b>
      ${escapeTelegramHtml(payload.teamName)}

      <b>Игроков:</b>
      ${escapeTelegramHtml(String(payload.teamSize))}

      <b>Телефон:</b>
      <a href="tel:${payload.phoneNumber.replace(/\s|\(|\)|-/g, '')}">
      ${escapeTelegramHtml(payload.phoneNumber)}
      </a>
      `
      const BOT_TOKEN = botToken
      const CHAT_ID = chatId
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        })
      })
      const data = await response.json()
      if (response.ok && data.ok) {
        isSubmitted.value = true
        await nextTick()
        successHeading.value?.focus()
      } else {
        errorMessage.value = 'Произошла ошибка при отправке формы. Пожалуйста, попробуйте снова.'
      }
    }
  } catch (error: unknown) {
    console.error('Error registering team:', error)
    errorMessage.value = 'Не удалось отправить регистрацию. Проверьте интернет и попробуйте ещё раз.'
  } finally {
    isLoading.value = false
  }
}

function clickOutside(e: MouseEvent) {
  if (e.target === e.currentTarget) closeRegistration()
}

function onTeamSizeBlur() {
  if (teamSize.value === null || teamSize.value === '') return

  const value = Number(teamSize.value)
  if (Number.isNaN(value)) {
    teamSize.value = null
    return
  }

  if (value < 1) teamSize.value = '1'
  else if (value > 12) teamSize.value = '12'
  else teamSize.value = String(value)
}

function onGuestPlayerChange() {
  errors.value.teamName = ''
  errors.value.teamSize = ''
  if (isGuestPlayer.value) {
    teamName.value = ''
    teamSize.value = '1'
  } else {
    teamSize.value = null
  }
}

function registrationStatusLabel(game: LandingGame) {
  if (game.registrationStatus === 'sold_out') return 'Мест нет'
  if (game.registrationStatus === 'closed') return 'Регистрация закрыта'
  return 'Открыта запись'
}

function handleModalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeRegistration()
    return
  }
  if (event.key !== 'Tab' || !modalDialog.value) return

  const focusable = Array.from(
    modalDialog.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null)
  if (!focusable.length) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

const copiedGameSlug = ref('')
let copiedLabelTimer: number | undefined

async function shareGame(game: LandingGame) {
  const url = new URL(
    router.resolve({ name: 'game-registration', params: { slug: game.slug } }).href,
    window.location.origin,
  ).toString()

  if (navigator.share) {
    try {
      await navigator.share({ title: game.shortName, text: `Регистрация на ${game.shortName}`, url })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }

  try {
    await copyText(url)
    copiedGameSlug.value = game.slug
    if (copiedLabelTimer) window.clearTimeout(copiedLabelTimer)
    copiedLabelTimer = window.setTimeout(() => { copiedGameSlug.value = '' }, 2_000)
  } catch {
    copiedGameSlug.value = ''
  }
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Some browsers expose Clipboard API but deny access outside a trusted context.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Could not copy the registration link')
}

function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function getGameClass(id: number) {
  switch (id) {
    case 63:
      return 'game-rap'

    case 68:
      return 'game-rap'

    case 64:
      return 'game-pop'

    case 65:
      return 'game-rock'

    default:
      return 'game-pop'
  }
}

watch(
  () => [route.name, route.params.slug] as const,
  ([routeName, slug]) => {
    if (routeName === 'game-registration') {
      void showRegistration(getGameBySlug(String(slug || '')))
    } else {
      hideRegistration()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.body.style.overflow = previousBodyOverflow
  if (copiedLabelTimer) window.clearTimeout(copiedLabelTimer)
})
</script>

<template>
  <div class="home min-h-screen bg-[#090b13] text-white">
    <header class="hero-stage relative isolate min-h-[86svh] overflow-hidden px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <div class="absolute inset-0 -z-20 bg-[url('/rock-overlay.jpeg')] bg-cover bg-center"></div>
      <div class="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,11,19,.96)_0%,rgba(9,11,19,.72)_48%,rgba(9,11,19,.45)_100%)]"></div>

      <nav class="site-nav mx-auto flex max-w-6xl items-center justify-between">
        <a href="#" class="logo-link text-white hover:bg-transparent" aria-label="Izzy Quiz">
          <img src="/logo_trans.png" alt="Izzy Quiz" class="h-16 w-16 sm:h-20 sm:w-20" />
          <span class="brand-copy">
            <strong>Izzy Quiz</strong>
          </span>
        </a>

        <div class="social-links social-links--top flex items-center gap-3">
          <a
            href="https://www.instagram.com/iq_izzyquiz/"
            target="_blank"
            rel="noopener"
            class="icon-link"
            aria-label="Instagram"
          >
            <Instagram class="h-5 w-5" />
          </a>
          <a
            href="https://t.me/+baunhMVsfZ8yZTdi"
            target="_blank"
            rel="noopener"
            class="icon-link"
            aria-label="Telegram"
          >
            <img :src="TgIcon" alt="" class="h-5 w-5" />
          </a>
        </div>
      </nav>

      <div class="mx-auto grid max-w-6xl items-center gap-8 pt-10 md:grid-cols-[1.08fr_.92fr] md:pt-12 lg:pt-14">
        <div>
          <div class="mb-5 inline-flex items-center gap-2 border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-cyan-100 backdrop-blur">
            <Sparkles class="h-4 w-4 text-fuchsia-300" />
            Музыкальные квизы в Алматы
          </div>

          <h1 class="max-w-3xl text-4xl font-black uppercase leading-[0.98] text-white sm:text-5xl lg:text-6xl">
            Не просто квиз. Музыкальный вечер.
          </h1>

          <p class="mt-5 max-w-2xl text-lg font-medium leading-8 text-slate-200 sm:text-xl">
            Собирай команду, угадывай треки, спорь о любимых эпохах и забирай призы в барах Алматы.
          </p>

          <div class="mt-7 flex flex-col gap-3 sm:flex-row">
            <a href="#schedule" class="primary-action">
              Смотреть игры
            </a>
            <a href="#sample" class="secondary-action sample-action">
              Попробовать вопрос
            </a>
          </div>

          <div class="mobile-social-links">
            <a
              href="https://www.instagram.com/iq_izzyquiz/"
              target="_blank"
              rel="noopener"
              class="mobile-social-link"
              aria-label="Instagram"
            >
              <Instagram class="h-5 w-5" />
              Instagram
            </a>
            <a
              href="https://t.me/+baunhMVsfZ8yZTdi"
              target="_blank"
              rel="noopener"
              class="mobile-social-link"
              aria-label="Telegram"
            >
              <img :src="TgIcon" alt="" class="h-5 w-5" />
              Telegram
            </a>
          </div>
        </div>

        <div v-if="featuredGame" class="event-panel hidden md:block">
          <p class="text-sm font-black uppercase tracking-[0.16em] text-cyan-200">Ближайшая игра</p>
          <h2 class="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
            {{ featuredGame.name }}
          </h2>
          <div class="mt-7 space-y-4">
            <div class="event-row">
              <CalendarDays class="h-5 w-5 text-fuchsia-300" />
              <span>{{ formatGameDate(featuredGame) }}</span>
            </div>
            <div class="event-row">
              <MapPin class="h-5 w-5 text-cyan-300" />
              <span>{{ featuredGame.venue }}, {{ featuredGame.address }}</span>
            </div>
          </div>
          <a href="#schedule" class="mt-8 inline-flex text-sm font-black uppercase tracking-[0.14em] text-white hover:bg-transparent">
            Детали ниже
          </a>
        </div>

        <div v-else class="event-panel event-panel--empty hidden md:block">
          <p class="text-sm font-black uppercase tracking-[0.16em] text-cyan-200">Ближайшая игра</p>
          <h2 class="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
            Скоро объявим новую дату
          </h2>
          <p class="mt-5 text-base font-semibold leading-7 text-slate-200">
            Сейчас активных игр нет. Анонсы первыми появляются в Instagram и Telegram.
          </p>
          <a href="#schedule" class="mt-8 inline-flex text-sm font-black uppercase tracking-[0.14em] text-white hover:bg-transparent">
            Где следить
          </a>
        </div>
      </div>
    </header>

    <main>
      <section id="schedule" class="section-band bg-[#f6f7fb] text-slate-950">
        <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div class="section-heading">
            <p class="eyebrow text-fuchsia-700">Расписание</p>
            <h2>Выбери свою игру</h2>
            <p>
              Каждая игра отличается темой, музыкой и атмосферой. Регистрация занимает меньше минуты.
            </p>
          </div>

          <div v-if="availableGames.length" :class="scheduleClass">
            <article
              v-for="game in availableGames"
              :key="game.id"
              :class="getGameClass(game.id)"
              class="game-card"
            >
              <div class="game-card__shade"></div>
              <div class="game-card__content">
                <div class="game-card__intro">
                  <div
                    class="registration-badge mb-5 inline-flex items-center gap-2 bg-black/35 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white backdrop-blur"
                    :class="`is-${game.registrationStatus}`"
                  >
                    <CheckCircle2 class="h-4 w-4 text-emerald-300" />
                    {{ registrationStatusLabel(game) }}
                  </div>
                  <div class="game-card__heading">
                    <h3 class="game-card__title">
                      {{ game.title }}
                    </h3>
                    <p class="game-card__name">
                      {{ game.name }}
                    </p>
                  </div>
                </div>

                <div class="game-card__footer">
                  <div class="game-card__details">
                    <div class="game-meta">
                      <CalendarDays class="h-5 w-5" />
                      <span>{{ formatGameDate(game) }}</span>
                    </div>
                    <div class="game-meta">
                      <MapPin class="h-5 w-5" />
                      <span>{{ game.venue }}, {{ game.address }}</span>
                    </div>
                  </div>
                  <div class="game-card__action">
                    <button
                      type="button"
                      @click="openRegistration(game, $event)"
                      class="register-button"
                      :disabled="!isGameRegistrationAvailable(game)"
                    >
                      {{ game.registrationStatus === 'sold_out' ? 'Мест нет' : game.registrationStatus === 'closed' ? 'Регистрация закрыта' : 'Записаться' }}
                    </button>
                    <button
                      type="button"
                      class="share-button"
                      :aria-label="`Поделиться регистрацией на ${game.shortName}`"
                      @click="shareGame(game)"
                    >
                      <Link v-if="copiedGameSlug === game.slug" class="h-4 w-4" />
                      <Share2 v-else class="h-4 w-4" />
                      {{ copiedGameSlug === game.slug ? 'Ссылка скопирована' : 'Поделиться' }}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="empty-schedule">
            <Music2 class="h-10 w-10 text-fuchsia-600" />
            <h3>Новые даты скоро появятся</h3>
            <p>
              Последние игры уже прошли. Следи за Instagram и Telegram, там анонсы появляются первыми.
            </p>
            <div class="flex flex-col gap-3 sm:flex-row">
              <a href="https://www.instagram.com/iq_izzyquiz/" target="_blank" rel="noopener" class="primary-action primary-action--dark">
                Instagram
              </a>
              <a href="https://t.me/+baunhMVsfZ8yZTdi" target="_blank" rel="noopener" class="secondary-action secondary-action--dark">
                Telegram
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="about" class="section-band bg-[#090b13] text-white">
        <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div class="section-heading section-heading--dark">
            <p class="eyebrow text-cyan-300">Формат</p>
            <h2>Вечер, где плейлист становится спортом</h2>
            <p>
              Не нужно быть энциклопедией. Нужны команда, азарт и желание вспомнить тот самый трек быстрее соседнего стола.
            </p>
          </div>

          <div class="grid gap-4 md:grid-cols-3">
            <div class="feature-tile">
              <Music2 class="h-8 w-8 text-cyan-300" />
              <h3>Музыка всех эпох</h3>
              <p>Поп, рок, рэп, ностальгия, кино и неожиданные механики в одном вечере.</p>
            </div>
            <div class="feature-tile">
              <Users class="h-8 w-8 text-fuchsia-300" />
              <h3>Команда или легионер</h3>
              <p>Приходи своей компанией или регистрируйся один, чтобы найти команду на месте.</p>
            </div>
            <div class="feature-tile">
              <Trophy class="h-8 w-8 text-amber-300" />
              <h3>Призы и барный вайб</h3>
              <p>Соревнование, напитки, шутки ведущего и призы для тех, кто дожимает финал.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="sample" class="section-band bg-white text-slate-950">
        <div class="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:px-8">
          <div class="section-heading section-heading--left">
            <p class="eyebrow text-fuchsia-700">Разминка</p>
            <h2>Попробуй вопрос перед игрой</h2>
            <p>
              На игре бывают текстовые, визуальные и аудио-вопросы. Здесь маленький демо-кусочек формата.
            </p>
          </div>

          <div class="question-panel">
            <div class="mb-6 grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1">
              <button
                v-for="type in types"
                :key="type"
                @click="selectTab(type)"
                :class="[
                  'h-11 rounded-md text-sm font-black uppercase tracking-[0.08em] transition',
                  currentType === type ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
                ]"
              >
                {{ typeLabels[type] }}
              </button>
            </div>

            <div v-if="currentQuestion" class="space-y-5">
              <h3 class="text-2xl font-black leading-snug text-slate-950">{{ currentQuestion.text }}</h3>

              <img
                v-if="currentQuestion.image"
                :src="currentQuestion.image"
                alt="question image"
                class="mx-auto aspect-square w-52 rounded-lg object-cover"
              />
              <audio
                v-if="currentQuestion.audio"
                controls
                class="w-full"
                :src="currentQuestion.audio"
              ></audio>

              <div class="space-y-3">
                <button
                  v-for="(choice, idx) in currentQuestion.choices"
                  :key="idx"
                  @click="selectAnswer(idx)"
                  class="w-full rounded-lg border px-4 py-3 text-left font-semibold transition"
                  :class="getChoiceClass(idx)"
                  :disabled="selectedAnswer !== null"
                >
                  {{ choice }}
                </button>
              </div>

              <button
                @click="nextQuestion"
                class="primary-action primary-action--dark w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="selectedAnswer === null"
              >
                Следующий вопрос
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="bg-[#090b13] px-4 py-8 text-white">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 border-t border-white/10 pt-8 text-center sm:flex-row sm:text-left">
        <div class="flex items-center gap-3">
          <img src="/logo_trans.png" alt="Izzy Quiz" class="h-14 w-14" />
          <p class="text-sm font-semibold text-slate-300">Сделано для тех, кто узнает песню с первых трех секунд.</p>
        </div>
        <a
          href="https://instagram.com/iq_izzyquiz"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-cyan-200 hover:bg-transparent"
        >
          <Instagram class="h-5 w-5" />
          Instagram
        </a>
      </div>
    </footer>
    <div
      v-if="isModalOpen"
      id="modal-bg"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
      @click="clickOutside"
      @keydown="handleModalKeydown"
    >
      <div
        ref="modalDialog"
        class="registration-modal relative max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 text-slate-950 shadow-2xl sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-title"
        tabindex="-1"
      >
        <button
          @click="closeRegistration"
          class="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
          aria-label="Закрыть"
        >
          <X class="h-5 w-5" />
        </button>

        <div v-if="!selectedGame" class="registration-state text-center">
          <p class="eyebrow text-fuchsia-700">Регистрация</p>
          <h3 id="registration-title" class="mt-2 pr-8 text-3xl font-black text-slate-950">Игра не найдена</h3>
          <p class="mt-4 text-slate-600">Возможно, ссылка устарела. Посмотрите актуальные игры в расписании.</p>
          <button
            @click="closeRegistration"
            class="primary-action primary-action--dark mx-auto mt-6"
          >
            К расписанию
          </button>
        </div>

        <div v-else-if="!canRegisterSelectedGame" class="registration-state text-center">
          <p class="eyebrow text-fuchsia-700">Регистрация закрыта</p>
          <h3 id="registration-title" class="mt-2 pr-8 text-3xl font-black text-slate-950">{{ selectedGame.shortName }}</h3>
          <div class="modal-game-meta mt-5 text-left">
            <div><CalendarDays /><span>{{ formatGameDate(selectedGame) }}</span></div>
            <div><MapPin /><span>{{ selectedGame.venue }}, {{ selectedGame.address }}</span></div>
          </div>
          <p class="mt-5 text-slate-600">
            {{ selectedGame.registrationStatus === 'sold_out' ? 'Все места уже заняты.' : 'На эту игру больше нельзя зарегистрироваться.' }}
          </p>
          <button @click="closeRegistration" class="primary-action primary-action--dark mx-auto mt-6">К расписанию</button>
        </div>

        <div v-else-if="isSubmitted" class="registration-state text-center">
          <CheckCircle2 class="success-mark mx-auto h-14 w-14" />
          <h3
            id="registration-title"
            ref="successHeading"
            class="mt-4 pr-8 text-3xl font-black text-slate-950"
            tabindex="-1"
          >
            Регистрация отправлена!
          </h3>
          <p class="mt-3 text-slate-600">Мы проверим заявку и напишем на указанный номер с подтверждением.</p>
          <div class="modal-game-meta mt-5 text-left">
            <strong>{{ selectedGame.shortName }}</strong>
            <div><CalendarDays /><span>{{ formatGameDate(selectedGame) }}</span></div>
            <div><MapPin /><span>{{ selectedGame.venue }}, {{ selectedGame.address }}</span></div>
          </div>
          <button @click="closeRegistration" class="primary-action primary-action--dark mx-auto mt-6">Готово</button>
        </div>

        <div v-else>
          <p class="eyebrow mb-2 text-fuchsia-700">Регистрация</p>
          <h3 id="registration-title" class="mb-1 pr-8 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">Записаться на игру</h3>
          <h4 class="text-lg font-bold text-slate-700">{{ selectedGame.shortName }}</h4>
          <div class="modal-game-meta my-4">
            <div><CalendarDays /><span>{{ formatGameDate(selectedGame) }}</span></div>
            <div><MapPin /><span>{{ selectedGame.venue }}, {{ selectedGame.address }}</span></div>
          </div>

          <form @submit.prevent="submitForm" class="registration-form mt-4" novalidate>
            <div v-if="!isGuestPlayer">
              <label class="form-field-wrap" for="registration-team-name">
                <span>Название команды</span>
                <input
                  id="registration-team-name"
                  v-model="teamName"
                  type="text"
                  autocomplete="organization"
                  maxlength="80"
                  placeholder="Например, Аппарат Президента"
                  class="form-field"
                  data-autofocus
                  :aria-invalid="Boolean(errors.teamName)"
                  aria-describedby="registration-team-error"
                />
              </label>
              <p v-if="errors.teamName" id="registration-team-error" class="form-error">{{ errors.teamName }}</p>
            </div>

            <label class="guest-toggle" for="isGuestPlayer">
              <input
                id="isGuestPlayer"
                v-model="isGuestPlayer"
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500"
                @change="onGuestPlayerChange"
              />
              <span><strong>Я легионер</strong><small>Приду один — помогите найти команду</small></span>
            </label>

            <div>
              <label class="form-field-wrap" for="registration-captain-name">
                <input
                  id="registration-captain-name"
                  v-model="captainName"
                  type="text"
                  autocomplete="name"
                  maxlength="80"
                  placeholder="Как к вам обращаться"
                  class="form-field"
                  :data-autofocus="isGuestPlayer ? '' : undefined"
                  :aria-invalid="Boolean(errors.captainName)"
                  aria-describedby="registration-captain-error"
                />
                <span>Ваше имя</span>
              </label>
              <p v-if="errors.captainName" id="registration-captain-error" class="form-error">{{ errors.captainName }}</p>
            </div>

            <div>
              <label class="form-field-wrap" for="registration-phone">
                <span>Номер телефона</span>
                <input
                  id="registration-phone"
                  v-model="phoneNumber"
                  v-maska="'+7 (###) ###-##-##'"
                  type="tel"
                  inputmode="tel"
                  autocomplete="tel"
                  placeholder="+7 (___) ___-__-__"
                  class="form-field"
                  :aria-invalid="Boolean(errors.phoneNumber)"
                  aria-describedby="registration-phone-error"
                />
              </label>
              <p v-if="errors.phoneNumber" id="registration-phone-error" class="form-error">{{ errors.phoneNumber }}</p>
            </div>

            <div v-if="!isGuestPlayer">
              <label class="form-field-wrap" for="registration-team-size">
                <span>Игроков в команде</span>
                <input
                  id="registration-team-size"
                  v-model="teamSize"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="12"
                  placeholder="От 1 до 12"
                  class="form-field"
                  :aria-invalid="Boolean(errors.teamSize)"
                  aria-describedby="registration-size-error"
                  @blur="onTeamSizeBlur"
                />
              </label>
              <p v-if="errors.teamSize" id="registration-size-error" class="form-error">{{ errors.teamSize }}</p>
            </div>

            <div v-if="errorMessage" class="submit-error" role="alert">
              {{ errorMessage }}
            </div>

            <button
              type="submit"
              :disabled="isLoading"
              class="primary-action primary-action--dark mt-1 w-full justify-center disabled:cursor-wait disabled:opacity-70"
            >
              <svg
                v-if="isLoading"
                class="animate-spin h-5 w-5 text-white mr-2"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
              <span>{{ isLoading ? 'Отправка...' : 'Отправить' }}</span>
            </button>
          </form>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hero-stage::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 38%;
  z-index: -1;
  background: linear-gradient(180deg, rgba(9, 11, 19, 0) 0%, #090b13 92%);
}

.logo-link {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  padding: 6px 14px 6px 6px;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(10px);
}

.logo-link img {
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 8px 18px rgba(103, 232, 249, 0.18));
}

.brand-copy {
  display: grid;
  line-height: 1;
}

.brand-copy strong {
  color: white;
  font-size: clamp(1.35rem, 2.8vw, 2rem);
  font-weight: 950;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.icon-link {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: white;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  transition: transform 0.2s ease, background 0.2s ease;
}

.icon-link:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.18);
}

.mobile-social-links {
  display: none;
}

.primary-action,
.secondary-action {
  display: inline-flex;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  padding: 0 22px;
  border-radius: 8px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.primary-action {
  color: #090b13;
  background: #67e8f9;
  box-shadow: 0 18px 34px rgba(103, 232, 249, 0.24);
}

.primary-action:hover,
.secondary-action:hover {
  transform: translateY(-2px);
}

.secondary-action {
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: white;
  background: rgba(255, 255, 255, 0.08);
}

.primary-action--dark {
  color: white;
  background: #090b13;
  box-shadow: 0 16px 32px rgba(9, 11, 19, 0.18);
}

.secondary-action--dark {
  border-color: rgba(9, 11, 19, 0.16);
  color: #090b13;
  background: white;
}

.event-panel {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  padding: 28px;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.88), rgba(88, 28, 135, 0.72)),
    rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(18px);
}

.event-panel--empty {
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(49, 46, 129, 0.72)),
    rgba(255, 255, 255, 0.08);
}

.event-row,
.game-meta {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-weight: 800;
}

.section-band {
  padding: 88px 0;
}

.section-heading {
  margin: 0 auto 36px;
  max-width: 720px;
  text-align: center;
}

.section-heading--left {
  margin: 0;
  text-align: left;
}

.section-heading h2 {
  margin-top: 8px;
  font-size: clamp(2.2rem, 5vw, 4.6rem);
  line-height: 0.98;
  font-weight: 900;
  text-transform: uppercase;
}

.section-heading p:last-child {
  margin-top: 16px;
  color: #475569;
  font-size: 1.08rem;
  font-weight: 600;
  line-height: 1.8;
}

.section-heading--dark p:last-child {
  color: #cbd5e1;
}

.eyebrow {
  font-size: 0.78rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.16em;
}

.schedule-list {
  display: grid;
  gap: 20px;
}

@media (min-width: 1024px) {
  .schedule-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 28px;
  }

  .schedule-list--single {
    grid-template-columns: minmax(0, 780px);
    justify-content: center;
  }

  .schedule-list--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    justify-content: center;
  }
}

.game-card {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background:
    radial-gradient(circle at top left, rgba(217, 70, 239, 0.55), transparent 34%),
    radial-gradient(circle at 88% 18%, rgba(103, 232, 249, 0.25), transparent 30%),
    linear-gradient(135deg, #562a8e 0%, #273ea8 48%, #07122d 100%);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.18);
}

.game-card.game-rap {
  background:
    linear-gradient(135deg, #7e22ce 0%, #4c1d95 48%, #172554 100%);
}

.game-card.game-rap::before {
  position: absolute;
  inset: 0;
  content: '';
  background-image: url('/rap-overlay.jpeg');
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  opacity: 0.62;
  pointer-events: none;
}

.game-card.game-rap .game-card__shade {
  background:
    linear-gradient(180deg, rgba(30, 5, 64, 0.18) 0%, rgba(2, 6, 23, 0.78) 100%),
    linear-gradient(90deg, rgba(88, 28, 135, 0.18), rgba(30, 64, 175, 0.08));
}

.game-card__shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(2, 6, 23, 0.68) 100%),
    linear-gradient(90deg, rgba(217, 70, 239, 0.18), rgba(34, 211, 238, 0.1));
}

.game-card__content {
  position: relative;
  z-index: 10;
  display: grid;
  height: 100%;
  min-height: 400px;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 30px;
  padding: 34px;
}

.game-card__intro {
  display: grid;
  align-content: start;
}

.game-card__intro > :first-child {
  justify-self: start;
}

.registration-badge.is-closed,
.registration-badge.is-sold_out {
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.58);
}

.registration-badge.is-closed svg,
.registration-badge.is-sold_out svg {
  color: #cbd5e1;
}

.game-card__heading {
  display: grid;
  gap: 8px;
}

.game-card__title {
  color: rgba(255, 255, 255, 0.78);
  font-size: clamp(0.9rem, 1.2vw, 1.05rem);
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.game-card__name {
  min-height: 2.08em;
  max-width: 100%;
  color: white;
  font-size: clamp(1.9rem, 2.8vw, 2.65rem);
  font-weight: 900;
  line-height: 1.04;
  text-wrap: balance;
}

.game-card__footer {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 24px;
}

.game-card__details {
  display: grid;
  grid-template-rows: auto minmax(4.1em, auto);
  align-content: start;
  gap: 10px;
}

.game-meta {
  min-width: 0;
  align-items: center;
  padding: 11px 13px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.07);
  font-size: clamp(1.02rem, 1.35vw, 1.12rem);
  line-height: 1.4;
  backdrop-filter: blur(10px);
}

.game-meta svg {
  box-sizing: content-box;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 9px;
  padding: 7px;
  color: #67e8f9;
  background: rgba(34, 211, 238, 0.14);
}

.game-meta:nth-child(2) svg {
  color: #f0abfc;
  background: rgba(217, 70, 239, 0.14);
}

.game-card__action {
  align-self: stretch;
  display: grid;
  gap: 9px;
}

.register-button,
.share-button {
  display: inline-flex;
  width: 100%;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  transition: transform 0.2s ease, background 0.2s ease;
}

.register-button {
  color: #090b13;
  background: white;
}

.share-button {
  min-height: 43px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  background: rgba(255, 255, 255, 0.08);
  font-size: 0.73rem;
}

.register-button:hover {
  transform: translateY(-2px);
  background: #67e8f9;
}

.register-button:disabled {
  color: #64748b;
  background: #e2e8f0;
  cursor: not-allowed;
  transform: none;
}

.share-button:hover {
  background: rgba(255, 255, 255, 0.16);
}

@media (min-width: 1024px) {
  .schedule-list--single .game-card__content {
    min-height: 360px;
    padding: 34px;
  }

  .schedule-list--single .game-card__name {
    max-width: 100%;
    font-size: clamp(2.2rem, 3.1vw, 3.1rem);
  }

  .schedule-list--single .game-card__footer {
    grid-template-columns: minmax(0, 1fr) 260px;
    align-items: end;
  }

}

.empty-schedule,
.question-panel,
.feature-tile {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  background: white;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
}

.empty-schedule {
  display: flex;
  max-width: 720px;
  margin: 0 auto;
  padding: 34px;
  align-items: flex-start;
  flex-direction: column;
  gap: 18px;
}

.empty-schedule h3 {
  font-size: 2rem;
  line-height: 1.1;
  font-weight: 900;
}

.empty-schedule p {
  max-width: 560px;
  color: #475569;
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.7;
}

.feature-tile {
  padding: 28px;
  color: white;
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: none;
}

.feature-tile h3 {
  margin-top: 20px;
  font-size: 1.35rem;
  line-height: 1.2;
  font-weight: 900;
}

.feature-tile p {
  margin-top: 10px;
  color: #cbd5e1;
  font-weight: 600;
  line-height: 1.7;
}

.question-panel {
  padding: 28px;
}

.registration-modal {
  overscroll-behavior: contain;
}

.modal-game-meta {
  display: grid;
  gap: 8px;
  border-radius: 12px;
  background: #f1f5f9;
  padding: 12px 13px;
  color: #334155;
  font-size: 0.9rem;
  font-weight: 750;
}

.modal-game-meta > div {
  display: flex;
  align-items: center;
  gap: 9px;
}

.modal-game-meta svg {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  color: #a21caf;
}

.registration-form {
  display: grid;
  gap: 10px;
}

.form-field-wrap {
  position: relative;
  display: block;
}

.form-field-wrap > span {
  position: absolute;
  top: 7px;
  left: 14px;
  z-index: 1;
  color: #64748b;
  font-size: 0.64rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  line-height: 1;
  text-transform: uppercase;
  pointer-events: none;
}

.form-field {
  width: 100%;
  min-height: 52px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 20px 14px 5px;
  color: #0f172a;
  background: white;
  font-weight: 700;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-field::placeholder {
  color: #a8b1bf;
  font-size: 0.84rem;
  font-weight: 650;
}

.form-field:focus {
  border-color: #d946ef;
  box-shadow: 0 0 0 3px rgba(217, 70, 239, 0.16);
}

.form-field[aria-invalid='true'] {
  border-color: #ef4444;
}

.form-error {
  margin: 4px 3px 0;
  color: #dc2626;
  font-size: 0.75rem;
  font-weight: 700;
}

.guest-toggle {
  display: flex;
  min-height: 43px;
  align-items: center;
  gap: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  padding: 7px 11px;
  cursor: pointer;
}

.guest-toggle > span {
  display: grid;
  gap: 1px;
  color: #334155;
  font-size: 0.82rem;
}

.guest-toggle small {
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 650;
}

.submit-error {
  border-radius: 8px;
  color: #b91c1c;
  background: #fef2f2;
  padding: 9px 11px;
  font-size: 0.78rem;
  font-weight: 750;
  text-align: center;
}

.success-mark {
  border-radius: 50%;
  color: #059669;
  background: #d1fae5;
  padding: 10px;
}

.registration-form .primary-action {
  min-height: 50px;
}

@media (max-width: 767px) {
  .hero-stage {
    min-height: auto;
  }

  .site-nav {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }

  .logo-link {
    width: 100%;
    justify-content: flex-start;
    gap: 14px;
    padding: 8px 14px 8px 8px;
  }

  .logo-link img {
    width: 72px;
    height: 72px;
  }

  .brand-copy strong {
    font-size: clamp(2rem, 11vw, 3rem);
    letter-spacing: 0.04em;
  }

  .social-links {
    width: 100%;
    justify-content: flex-end;
  }

  .social-links--top {
    display: none;
  }

  .sample-action {
    display: none;
  }

  .mobile-social-links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
  }

  .mobile-social-link {
    display: inline-flex;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 8px;
    color: white;
    background: rgba(255, 255, 255, 0.09);
    font-size: 0.82rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    backdrop-filter: blur(12px);
  }

  .event-panel {
    padding: 22px;
  }

  .section-band {
    padding: 64px 0;
  }

  .primary-action,
  .secondary-action {
    width: 100%;
  }

  .game-card__content {
    min-height: 300px;
    gap: 22px;
    padding: 24px;
  }

  .game-card.game-rap::before {
    background-position: right center;
    opacity: 0.55;
  }

  .game-card__title {
    font-size: 0.85rem;
  }

  .game-card__name {
    min-height: auto;
    max-width: 100%;
    font-size: clamp(1.5rem, 6.7vw, 2.05rem);
    line-height: 1.06;
  }

  .game-meta {
    padding: 10px 11px;
    font-size: 1.02rem;
    line-height: 1.45;
  }

  .game-card__footer {
    grid-template-rows: auto auto;
    gap: 18px;
  }

  .game-card__details {
    grid-template-rows: auto auto;
  }

  .empty-schedule,
  .question-panel,
  .feature-tile {
    padding: 22px;
  }
}
</style>
