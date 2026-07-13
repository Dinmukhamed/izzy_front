import { io, type Socket } from 'socket.io-client'

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
  return io(
    import.meta.env.VITE_IZZY_SOCKET_URL ||
      import.meta.env.VITE_IZZY_API_URL ||
      'http://127.0.0.1:4010',
    {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    },
  )
}

export function getStoredAdminToken() {
  return window.localStorage.getItem('izzy-admin-token') || ''
}

export function setStoredAdminToken(token: string) {
  window.localStorage.setItem('izzy-admin-token', token)
}
