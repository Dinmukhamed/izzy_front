<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Instagram,
  ListRestart,
  Play,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-vue-next'

const participantCount = ref<number | null>(null)
const winners = ref<number[]>([])
const currentNumber = ref<number | null>(null)
const isRolling = ref(false)
const errorMessage = ref('')

let rollTimer: number | null = null
let rollTimeout: number | null = null

const participantTotal = computed(() => Number(participantCount.value) || 0)
const canDraw = computed(() => participantTotal.value > 0 && eligibleNumbers.value.length > 0 && !isRolling.value)

const eligibleNumbers = computed(() => {
  const total = participantTotal.value
  if (total < 1) return []

  const blocked = new Set(winners.value)

  return Array.from({ length: total }, (_, index) => index + 1).filter((number) => !blocked.has(number))
})

const latestWinner = computed(() => winners.value[0] || null)

function randomFrom(numbers: number[]) {
  return numbers[Math.floor(Math.random() * numbers.length)]
}

function clearRollTimers() {
  if (rollTimer) window.clearInterval(rollTimer)
  if (rollTimeout) window.clearTimeout(rollTimeout)
  rollTimer = null
  rollTimeout = null
}

function drawWinner() {
  errorMessage.value = ''

  if (isRolling.value) return
  if (participantTotal.value < 1) {
    errorMessage.value = 'Введите количество участников'
    return
  }
  if (eligibleNumbers.value.length === 0) {
    errorMessage.value = 'Свободных номеров больше нет'
    return
  }

  isRolling.value = true
  const pool = eligibleNumbers.value
  const finalNumber = randomFrom(pool)

  rollTimer = window.setInterval(() => {
    currentNumber.value = randomFrom(pool)
  }, 70)

  rollTimeout = window.setTimeout(() => {
    clearRollTimers()
    currentNumber.value = finalNumber
    winners.value = [finalNumber, ...winners.value]
    isRolling.value = false
  }, 2200)
}

function resetWinners() {
  clearRollTimers()
  winners.value = []
  currentNumber.value = null
  isRolling.value = false
  errorMessage.value = ''
}

function normalizeParticipantCount() {
  const value = Number(participantCount.value)

  if (!Number.isFinite(value) || value < 1) {
    participantCount.value = null
    return
  }

  participantCount.value = Math.floor(value)
}
</script>

<template>
  <main class="randomizer-page">
    <div class="stage-glow"></div>

    <header class="randomizer-header">
      <a href="/" class="brand-link" aria-label="Izzy Quiz">
        <img src="/logo_trans.png" alt="Izzy Quiz" />
        <span>
          <strong>Izzy Quiz</strong>
          <small>Randomizer</small>
        </span>
      </a>

      <a
        href="https://instagram.com/iq_izzyquiz"
        target="_blank"
        rel="noopener"
        class="social-link"
        aria-label="Instagram"
      >
        <Instagram class="h-5 w-5" />
      </a>
    </header>

    <section class="randomizer-hero">
      <div class="intro-panel">
        <div class="intro-panel__top">
          <div class="show-badge">
            <img src="/logo_trans.png" alt="" />
            <span>Izzy Quiz</span>
          </div>
          <p class="eyebrow">На сцене</p>
          <h1>Розыгрыш призов</h1>
          <p>
            Введи количество номеров, запускай анимацию и выбирай победителей без повторов.
          </p>
        </div>

        <div class="hero-setup">
          <label class="field-label" for="participant-count">Количество номеров</label>
          <div class="hero-input-row">
            <input
              id="participant-count"
              v-model.number="participantCount"
              type="number"
              min="1"
              inputmode="numeric"
              class="field-input"
              placeholder="0"
              @blur="normalizeParticipantCount"
            />
          </div>

          <div class="quick-actions">
            <button type="button" @click="participantCount = 50">50</button>
            <button type="button" @click="participantCount = 100">100</button>
            <button type="button" @click="participantCount = 150">150</button>
            <button type="button" @click="participantCount = 200">200</button>
          </div>
        </div>

        <div class="stats-grid">
          <div>
            <Users class="h-5 w-5 text-cyan-300" />
            <span>{{ participantTotal || 0 }}</span>
            <p>участников</p>
          </div>
          <div>
            <Trophy class="h-5 w-5 text-amber-300" />
            <span>{{ winners.length }}</span>
            <p>победителей</p>
          </div>
        </div>
      </div>

      <div class="draw-stage">
        <div class="draw-stage__label">
          <Sparkles class="h-4 w-4" />
          <span>{{ isRolling ? 'Выбираем номер' : latestWinner ? 'Победитель' : 'Готов к розыгрышу' }}</span>
        </div>

        <div class="number-window" :class="{ 'number-window--rolling': isRolling }">
          <span v-if="currentNumber">{{ currentNumber }}</span>
          <span v-else>?</span>
        </div>

        <button class="draw-button" :disabled="!canDraw" @click="drawWinner">
          <Play class="h-5 w-5" />
          {{ isRolling ? 'Крутим...' : 'Крутить номер' }}
        </button>

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        <p v-else class="draw-note">Осталось доступных номеров: {{ eligibleNumbers.length }}</p>
      </div>
    </section>

    <section class="control-grid">
      <div class="control-panel winners-panel">
        <div class="panel-heading panel-heading--row">
          <div>
            <p class="eyebrow">История</p>
            <h2>Победители</h2>
          </div>
          <button type="button" class="ghost-icon-button" aria-label="Сбросить победителей" @click="resetWinners">
            <ListRestart class="h-5 w-5" />
          </button>
        </div>

        <div v-if="winners.length" class="winner-list">
          <div v-for="(winner, index) in winners" :key="`${winner}-${index}`" class="winner-row">
            <span>#{{ winners.length - index }}</span>
            <strong>{{ winner }}</strong>
          </div>
        </div>

        <div v-else class="empty-winners">
          Нажми “Крутить номер”, и победители появятся здесь.
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.randomizer-page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  padding: 24px;
  color: white;
  background:
    radial-gradient(circle at 12% 18%, rgba(217, 70, 239, 0.32), transparent 30%),
    radial-gradient(circle at 84% 8%, rgba(103, 232, 249, 0.22), transparent 26%),
    linear-gradient(135deg, #070913 0%, #111531 48%, #090b13 100%);
}

.stage-glow {
  position: absolute;
  inset: 16% -20% auto;
  height: 360px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(103, 232, 249, 0.16), transparent);
  transform: rotate(-8deg);
}

.randomizer-header,
.randomizer-hero,
.control-grid {
  position: relative;
  z-index: 1;
  width: min(1420px, 100%);
  margin: 0 auto;
}

.randomizer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand-link,
.social-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(14px);
}

.brand-link {
  min-height: 72px;
  gap: 12px;
  padding: 6px 18px 6px 6px;
  color: white;
}

.brand-link img {
  width: 64px;
  height: 64px;
  object-fit: contain;
}

.brand-link span {
  display: grid;
  gap: 2px;
}

.brand-link strong {
  font-size: 1rem;
  font-weight: 950;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.brand-link small {
  color: #67e8f9;
  font-size: 0.72rem;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.16em;
}

.social-link {
  width: 48px;
  height: 48px;
  color: white;
}

.randomizer-hero {
  display: grid;
  grid-template-columns: minmax(360px, 0.68fr) minmax(620px, 1.32fr);
  gap: 28px;
  align-items: stretch;
  padding: 34px 0 22px;
}

.intro-panel,
.draw-stage,
.control-panel {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(18px);
}

.intro-panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: space-between;
  gap: 24px;
  padding: 30px;
}

.eyebrow {
  color: #67e8f9;
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.intro-panel__top {
  min-width: 0;
}

.show-badge {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 22px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 8px 14px 8px 8px;
  background: rgba(255, 255, 255, 0.08);
}

.show-badge img {
  width: 42px;
  height: 42px;
  object-fit: contain;
}

.show-badge span {
  color: white;
  font-size: 0.92rem;
  font-weight: 950;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.intro-panel h1 {
  margin-top: 12px;
  max-width: 11ch;
  font-size: clamp(2.75rem, 3.8vw, 4.7rem);
  font-weight: 950;
  line-height: 1;
  text-transform: uppercase;
  overflow-wrap: break-word;
}

.intro-panel > p:last-of-type {
  margin-top: 22px;
  max-width: 560px;
  color: #cbd5e1;
  font-size: 1.1rem;
  font-weight: 650;
  line-height: 1.8;
}

.hero-setup {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 18px;
  background: rgba(2, 6, 23, 0.3);
}

.hero-input-row {
  display: grid;
  grid-template-columns: 1fr;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 28px;
}

.stats-grid div {
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
}

.stats-grid span {
  display: block;
  margin-top: 12px;
  font-size: 2rem;
  font-weight: 950;
  line-height: 1;
}

.stats-grid p {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.draw-stage {
  display: flex;
  min-height: 590px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 34px;
  text-align: center;
}

.draw-stage__label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #f0abfc;
  font-size: 0.9rem;
  font-weight: 950;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.number-window {
  position: relative;
  display: grid;
  width: min(100%, 640px);
  min-height: 300px;
  margin: 30px 0;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(217, 70, 239, 0.35), rgba(34, 211, 238, 0.14)),
    rgba(2, 6, 23, 0.72);
}

.number-window::before,
.number-window::after {
  content: '';
  position: absolute;
  inset: auto 34px;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(103, 232, 249, 0.82), transparent);
}

.number-window::before {
  top: 32px;
}

.number-window::after {
  bottom: 32px;
}

.number-window span {
  font-size: clamp(7rem, 18vw, 13rem);
  font-weight: 950;
  line-height: 1;
  text-shadow:
    0 0 28px rgba(103, 232, 249, 0.3),
    0 18px 46px rgba(0, 0, 0, 0.36);
}

.number-window--rolling span {
  animation: rollPulse 0.14s ease-in-out infinite alternate;
}

.draw-button {
  display: inline-flex;
  width: min(100%, 440px);
  min-height: 58px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 10px;
  color: #090b13;
  background: #67e8f9;
  box-shadow: 0 18px 38px rgba(103, 232, 249, 0.22);
  font-size: 0.95rem;
  font-weight: 950;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.draw-button:not(:disabled):hover {
  transform: translateY(-2px);
}

.draw-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.draw-note,
.error-message {
  margin-top: 16px;
  font-weight: 800;
}

.draw-note {
  color: #94a3b8;
}

.error-message {
  color: #fca5a5;
}

.control-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
  padding-bottom: 48px;
}

.control-panel {
  padding: 24px;
}

.panel-heading {
  margin-bottom: 20px;
}

.panel-heading--row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.panel-heading h2 {
  margin-top: 6px;
  font-size: 1.35rem;
  font-weight: 950;
  line-height: 1.1;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  color: #cbd5e1;
  font-size: 0.86rem;
  font-weight: 800;
}

.field-input {
  width: 100%;
  min-height: 52px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  padding: 0 14px;
  color: white;
  background: rgba(2, 6, 23, 0.44);
  font-weight: 850;
  outline: none;
}

.field-input:focus {
  border-color: rgba(103, 232, 249, 0.75);
  box-shadow: 0 0 0 3px rgba(103, 232, 249, 0.12);
}

.field-textarea {
  min-height: 126px;
  padding: 14px;
  resize: vertical;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.quick-actions button {
  min-height: 34px;
  border-radius: 999px;
  padding: 0 14px;
  color: white;
  background: rgba(255, 255, 255, 0.1);
  font-weight: 900;
}

.ghost-icon-button {
  display: inline-flex;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.winner-list {
  display: grid;
  max-height: 244px;
  gap: 8px;
  overflow: auto;
}

.winner-row {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  border-radius: 10px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.1);
}

.winner-row span {
  color: #94a3b8;
  font-weight: 900;
}

.winner-row strong {
  font-size: 1.45rem;
  font-weight: 950;
}

.empty-winners {
  min-height: 138px;
  display: grid;
  place-items: center;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  padding: 22px;
  color: #94a3b8;
  font-weight: 750;
  text-align: center;
}

@keyframes rollPulse {
  from {
    opacity: 0.58;
    transform: translateY(-3px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(3px) scale(1.03);
  }
}

@media (max-width: 980px) {
  .randomizer-hero,
  .control-grid {
    grid-template-columns: 1fr;
  }

  .draw-stage {
    min-height: 500px;
  }

  .intro-panel h1 {
    max-width: 12ch;
    font-size: clamp(2.8rem, 9vw, 4.6rem);
  }
}

@media (max-width: 640px) {
  .randomizer-page {
    padding: 16px;
  }

  .brand-link {
    min-height: 62px;
    padding-right: 12px;
  }

  .brand-link img {
    width: 56px;
    height: 56px;
  }

  .brand-link strong {
    font-size: 0.82rem;
  }

  .brand-link small {
    font-size: 0.62rem;
  }

  .randomizer-hero {
    gap: 16px;
    padding-top: 30px;
  }

  .intro-panel,
  .draw-stage,
  .control-panel {
    border-radius: 12px;
    padding: 22px;
  }

  .intro-panel h1 {
    max-width: 11ch;
    font-size: clamp(2.35rem, 11vw, 3.25rem);
  }

  .show-badge {
    margin-bottom: 18px;
  }

  .show-badge img {
    width: 36px;
    height: 36px;
  }

  .show-badge span {
    font-size: 0.78rem;
  }

  .hero-setup {
    padding: 16px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .draw-stage {
    min-height: auto;
  }

  .number-window {
    min-height: 190px;
    margin: 22px 0;
  }

  .number-window span {
    font-size: clamp(5rem, 30vw, 8rem);
  }
}
</style>
