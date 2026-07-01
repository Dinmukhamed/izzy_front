import axios from 'axios'
import type {
  CreateQuizTemplateInput,
  CreateSessionResponse,
  HostQuizState,
  JoinQuizResponse,
  PlayerQuizState,
  QuizTemplate,
} from '@/types/quiz'

const quizApi = axios.create({
  baseURL: import.meta.env.VITE_IZZY_API_URL || 'http://127.0.0.1:4010',
})

const adminHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
})

export async function getTemplates(token: string) {
  const { data } = await quizApi.get<QuizTemplate[]>('/admin/templates', {
    headers: adminHeaders(token),
  })

  return data
}

export async function createTemplate(input: CreateQuizTemplateInput, token: string) {
  const { data } = await quizApi.post<QuizTemplate>('/admin/templates', input, {
    headers: adminHeaders(token),
  })

  return data
}

export async function createSession(templateId: string, token: string) {
  const { data } = await quizApi.post<CreateSessionResponse>(
    '/admin/sessions',
    { templateId },
    { headers: adminHeaders(token) },
  )

  return data
}

export async function getHostState(code: string, token: string) {
  const { data } = await quizApi.get<HostQuizState>(`/admin/sessions/${code}`, {
    headers: adminHeaders(token),
  })

  return data
}

export async function getPlayerState(code: string) {
  const { data } = await quizApi.get<PlayerQuizState>(`/sessions/${code}`)

  return data
}

export async function joinQuiz(code: string, name: string) {
  const { data } = await quizApi.post<JoinQuizResponse>(`/sessions/${code}/join`, { name })

  return data
}
