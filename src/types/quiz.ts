export type QuizStatus =
  | 'lobby_open'
  | 'lobby_locked'
  | 'in_progress'
  | 'countdown'
  | 'question_open'
  | 'question_closed'
  | 'show_answer'
  | 'leaderboard'
  | 'paused'
  | 'finished'

export type QuizPlayer = {
  id: string
  name: string
  score: number
  connected: boolean
}

export type QuizOption = {
  id: string
  text: string
}

export type QuizQuestion = {
  id: string
  kind: 'text' | 'image' | 'audio'
  text: string
  media?: {
    type: 'image' | 'audio'
    url: string
  }
  options: QuizOption[]
  correctOptionId?: string
  durationMs: number
  points: number
}

export type QuizTemplate = {
  id: string
  title: string
  status: 'draft' | 'active' | 'archived'
  questions: QuizQuestion[]
  createdAt: string
  updatedAt: string
}

export type QuizAnswer = {
  id: string
  playerId: string
  questionId: string
  optionId: string
  isCorrect: boolean
  score: number
  answeredAt: string
  elapsedMs: number
}

export type PlayerQuizState = {
  code: string
  templateTitle: string
  status: QuizStatus
  players: QuizPlayer[]
  currentQuestion: QuizQuestion | null
  currentQuestionIndex: number | null
  questionCount: number
  questionStartedAt: string | null
  phaseEndsAt: string | null
  serverNow: string
  stateVersion: number
  answeredPlayerIds: string[]
  answers: Array<Pick<QuizAnswer, 'id' | 'playerId' | 'questionId' | 'optionId' | 'isCorrect' | 'score' | 'elapsedMs'>>
}

export type HostQuizState = PlayerQuizState & {
  template: QuizTemplate
  answers: QuizAnswer[]
}

export type JoinQuizResponse = {
  player: QuizPlayer
  state: PlayerQuizState
}

export type CreateSessionResponse = {
  id: string
  code: string
  templateId: string
  status: QuizStatus
}

export type QuizSessionSummary = {
  id: string
  code: string
  templateId: string
  templateTitle: string
  status: QuizStatus
  playerCount: number
  connectedPlayerCount: number
  currentQuestionIndex: number | null
  questionCount: number
  phaseEndsAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreateQuizQuestionInput = {
  kind: 'text' | 'image' | 'audio'
  text: string
  media?: {
    type: 'image' | 'audio'
    url: string
  }
  options: Array<{ text: string }>
  correctOptionIndex: number
  durationMs: number
  points: number
}

export type CreateQuizTemplateInput = {
  title: string
  status: 'draft' | 'active' | 'archived'
  questions: CreateQuizQuestionInput[]
}
