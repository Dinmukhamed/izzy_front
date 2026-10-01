export type RegistrationStatus = 'open' | 'closed' | 'sold_out'

export type LandingGame = {
  id: number
  slug: string
  title: string
  name: string
  shortName: string
  startsAt: string
  venue: string
  address: string
  registrationStatus: RegistrationStatus
}

export const GAMES: LandingGame[] = [
  {
    id: 80,
    slug: 'ultra-mix-80',
    title: 'Ultra Music Mix #80',
    name: 'Все эпохи и жанры',
    shortName: 'Ultra Music Mix #80: Все эпохи и жанры',
    startsAt: '2026-10-08T19:30:00+05:00',
    venue: 'Maroon',
    address: 'ул. Жамбыла, 154',
    registrationStatus: 'open',
  },
]

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Almaty',
})

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Almaty',
})

export function getGameBySlug(slug: string) {
  return GAMES.find((game) => game.slug === slug) || null
}

export function getGameStart(game: LandingGame) {
  return new Date(game.startsAt)
}

export function isGameRegistrationAvailable(game: LandingGame, now = new Date()) {
  return game.registrationStatus === 'open' && getGameStart(game).getTime() >= now.getTime()
}

export function formatGameDate(game: LandingGame) {
  const startsAt = getGameStart(game)
  return `${dateFormatter.format(startsAt)}, ${timeFormatter.format(startsAt)}`
}
