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
    id: 82,
    slug: 'ultra-mix-83',
    title: 'Ultra Music Mix #83',
    name: '90е и 00е',
    shortName: 'Ultra Music Mix #83: 90е и 00е',
    startsAt: '2026-10-22T19:30:00+05:00',
    venue: 'Cafe Leffe',
    address: 'ул. Манаса 5А',
    registrationStatus: 'open',
  },
  {
    id: 84,
    slug: 'ultra-84',
    title: 'Ultra Music Mix #84',
    name: 'Все эпохи и жанры + Halloween',
    shortName: 'Все эпохи и жанры + Halloween',
    startsAt: '2026-10-29T19:30:00+05:00',
    venue: 'Maroon',
    address: 'Жамбыла 154',
    registrationStatus: 'open',
  },
  {
    id: 4,
    slug: 'izzy-mix-4',
    title: 'Izzy Mix #4',
    name: 'Зарубежный Рок',
    shortName: 'Izzy Mix #4: Зарубежный Рок',
    startsAt: '2026-11-01T17:00:00+05:00',
    venue: 'Cafe Leffe',
    address: 'ул. Манаса, 5А',
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
