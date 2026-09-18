export const GAMES = [
  {
    id: 78,
    title: 'Ultra Music Mix#78',
    name: 'Зарубежная Музыка',
    shortName: 'Ultra Music Mix#78: Зарубежная Музыка',
    date: '17 сентября 2026, 19:30',
    venue: 'Maroon',
    address: ' ул. Жамбыла, 154'
  },
  {
    id: 2,
    title: 'Izzy Mix#2',
    name: 'Rap',
    shortName: 'Izzy Mix#2: Rap',
    date: '19 сентября 2026, 19:30',
    venue: 'Sintra',
    address: ' ул. Байзакова, 280'
  },
  {
    id: 3,
    title: 'Izzy Mix#3',
    name: 'Зарубежный Рок',
    shortName: 'Izzy Mix#3: Зарубежный Рок',
    date: '25 сентября 2026, 19:30',
    venue: 'Sintra',
    address: ' ул. Байзакова, 280'
  },
  /*{
    id: 79,
    title: 'Ultra Music Mix#79',
    name: '90е и 00е',
    shortName: 'Ultra Music Mix#79: 90е и 00е',
    date: '24 сентября 2026, 19:30',
    venue: 'Maroon',
    address: ' ул. Жамбыла, 154'
  },
  /*
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
