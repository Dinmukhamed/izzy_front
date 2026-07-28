export const GAMES = [
  {
    id: 1,
    title: 'Ultra Music Mix#68',
    name: 'Все эпохи и жанры',
    shortName: 'Ultra Music Mix#68: Все эпохи и жанры',
    date: '30 июля 2026, 19:30',
    venue: 'Maroon',
    address: ' ул. Жамбыла, 154'
  },
  {
    id: 69,
    title: 'Ultra Music Mix#69',
    name: 'Rock',
    shortName: 'Ultra Music Mix#69: Rock',
    date: '1 августа 2026, 18:00',
    venue: 'Sintra',
    address: ' БЦ Almaty Towers, ул. Байзакова 280'
  },
  {
    id: 70,
    title: 'Ultra Music Mix#70',
    name: '90е и 00е',
    shortName: 'Ultra Music Mix#70: 90е и 00е',
    date: '6 августа 2026, 19:30',
    venue: 'Maroon',
    address: ' ул. Жамбыла, 154'
  },
  {
    id: 71,
    title: 'Ultra Music Mix#71',
    name: 'Rap vs Rock',
    shortName: 'Ultra Music Mix#71: Rap vs Rock',
    date: '8 августа 2026, 18:00',
    venue: 'Sintra',
    address: ' БЦ Almaty Towers, ул. Байзакова 280'
  },
  {
    id: 72,
    title: 'Ultra Music Mix#72',
    name: 'Rap & RnB Зарубежное',
    shortName: 'Ultra Music Mix#72: Rap & RnB Зарубежное',
    date: '13 августа 2026, 19:30',
    venue: 'Maroon',
    address: ' ул. Жамбыла, 154'
  },
  {
    id: 73,
    title: 'Izzy Mix#2',
    name: 'Зарубежный Рок Типо Лайт',
    shortName: 'Izzy Mix#2: Зарубежный Рок Типо Лайт',
    date: '16 августа 2026, 18:00',
    venue: 'Sintra',
    address: ' БЦ Almaty Towers, ул. Байзакова 280'
  },
  {
    id: 74,
    title: 'Ultra Music Mix#73',
    name: 'Зарубежная Музыка',
    shortName: 'Ultra Music Mix#73: Зарубежная Музыка',
    date: '20 августа 2026, 19:30',
    venue: 'Maroon',
    address: ' ул. Жамбыла, 154'
  },/*
  {
    id: 75,
    title: 'Ultra Music Mix#74',
    name: 'Все эпохи и жанры',
    shortName: 'Ultra Music Mix#73: Все эпохи и жанры',
    date: '27 августа 2026, 19:30',
    venue: 'Maroon',
    address: ' ул. Жамбыла, 154'
  },
  {
    id: 76,
    title: 'Ultra Music Mix#75',
    name: 'Зарубежная Музыка',
    shortName: 'Ultra Music Mix#73: Зарубежная Музыка',
    date: '29 августа 2026, 18:00',
    venue: 'Sintra',
    address: ' БЦ Almaty Towers, ул. Байзакова 280'
  },*/
]

const monthMap: Record<string, number> = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
}

export function parseRuDate(dateStr: string): Date {
  const [datePart, timePart] = dateStr.split(', ')
  const [day, monthRu, year] = datePart.split(' ')
  const [hours, minutes] = timePart.split(':')

  return new Date(
    Number(year),
    monthMap[monthRu],
    Number(day),
    Number(hours),
    Number(minutes)
  )
}

export function getNearestThursday(from = new Date()): Date {
  const result = new Date(from)
  const day = result.getDay() // Sun=0 ... Thu=4

  const diff = (4 - day + 7) % 7
  result.setDate(result.getDate() + diff)
  result.setHours(23, 59, 59, 999) // include whole day

  return result
}
