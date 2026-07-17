const LOOPBACK_URL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i

export function getQuizApiUrl() {
  const configuredUrl = String(import.meta.env.VITE_IZZY_API_URL || '').trim()

  if (import.meta.env.PROD && (!configuredUrl || LOOPBACK_URL.test(configuredUrl))) return '/api'

  return configuredUrl || 'http://127.0.0.1:4010'
}

export function getQuizSocketUrl() {
  const configuredUrl = String(import.meta.env.VITE_IZZY_SOCKET_URL || '').trim()

  if (configuredUrl && !(import.meta.env.PROD && LOOPBACK_URL.test(configuredUrl))) return configuredUrl

  const apiUrl = getQuizApiUrl()
  if (apiUrl.startsWith('/')) return window.location.origin

  return new URL(apiUrl, window.location.origin).origin
}
