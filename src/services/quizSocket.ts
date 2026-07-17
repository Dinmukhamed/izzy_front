import { io, type Socket } from 'socket.io-client'
import { getQuizSocketUrl } from '@/services/quizConfig'

type AckSuccess<T> = {
  ok: true
  data: T
}

type AckError = {
  ok: false
  error: string
}

export type QuizSocketAck<T = unknown> = AckSuccess<T> | AckError

export function createQuizSocket(): Socket {
  return io(getQuizSocketUrl(), {
    autoConnect: true,
    transports: ['websocket', 'polling'],
  })
}

export function getStoredAdminToken() {
  return window.localStorage.getItem('izzy-admin-token') || ''
}

export function setStoredAdminToken(token: string) {
  window.localStorage.setItem('izzy-admin-token', token)
}
