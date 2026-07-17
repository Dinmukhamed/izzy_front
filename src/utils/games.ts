export const GAMES = [
  {
    id: 68,
    title: 'Ultra Music Mix#68',
    name: 'Rap & RnB Зарубежка',
    shortName: 'Ultra Music Mix#68: Rap & RnB Зарубежка',
    date: '23 июля 2026, 19:30',
    venue: 'Veselidze Resto Bar & Karaoke',
    address: ' ул. Абая 143'
  },
  {
    id: 69,
    title: 'Ultra Music Mix#69',
    name: 'Без цензуры',
    shortName: 'Ultra Music Mix#69: Без цензуры',
    date: '25 июля 2026, 19:30',
    venue: 'Veselidze Resto Bar & Karaoke',
    address: ' ул. Абая 143'
  },
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
