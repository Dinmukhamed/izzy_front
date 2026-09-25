import axios from 'axios'
import { getQuizApiUrl } from '@/services/quizConfig'
import type {
  CreateQuizTemplateInput,
  CreateSessionResponse,
  AuthenticatedPlayerState,
  HostQuizState,
  JoinQuizResponse,
  PlayerQuizState,
  QuizSessionSummary,
  QuizTemplate,
} from '@/types/quiz'

const quizApi = axios.create({
  baseURL: getQuizApiUrl(),
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

export async function updateTemplate(id: string, input: CreateQuizTemplateInput, token: string) {
  const { data } = await quizApi.put<QuizTemplate>(`/admin/templates/${id}`, input, {
    headers: adminHeaders(token),
  })

  return data
}

export async function updateTemplateStatus(id: string, status: QuizTemplate['status'], token: string) {
  const { data } = await quizApi.patch<QuizTemplate>(
    `/admin/templates/${id}/status`,
    { status },
    { headers: adminHeaders(token) },
  )

  return data
}

export async function deleteTemplate(id: string, token: string) {
  await quizApi.delete(`/admin/templates/${id}`, {
    headers: adminHeaders(token),
  })
}

export function getQuizErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : fallback

  const apiMessage = error.response?.data?.error
  const validationDetails = error.response?.data?.details
  if (Array.isArray(validationDetails) && typeof validationDetails[0]?.message === 'string') {
    return validationDetails[0].message
  }
  if (typeof apiMessage === 'string') return apiMessage
  if (error.response?.status === 401) return 'The admin token is incorrect'
  if (error.code === 'ERR_NETWORK') {
    return `Cannot reach the quiz API at ${getQuizApiUrl()}. Check that the API is running.`
  }

  return fallback
}

export function isQuizUnauthorizedError(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 401
}

export async function uploadQuizMedia(file: File, token: string) {
  const formData = new FormData()
  formData.append('file', file)

  const { data } = await quizApi.post<{ url: string; filename: string; mimetype: string; size: number }>(
    '/admin/uploads',
    formData,
    {
      headers: adminHeaders(token),
    },
  )

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

export async function getSessions(token: string) {
  const { data } = await quizApi.get<QuizSessionSummary[]>('/admin/sessions', {
    headers: adminHeaders(token),
  })

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

export async function getAuthenticatedPlayerState(code: string, playerToken: string) {
  const { data } = await quizApi.get<AuthenticatedPlayerState>(`/sessions/${code}/player`, {
    headers: adminHeaders(playerToken),
  })

  return data
}

export async function joinQuiz(code: string, name: string) {
  const { data } = await quizApi.post<JoinQuizResponse>(`/sessions/${code}/join`, { name })

  return data
}
