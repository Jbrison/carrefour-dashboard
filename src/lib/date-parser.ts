const MONTHS: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  décembre: 11
}

export function parseExpirationDate(text: string, now = new Date()): Date | null {
  const normalized = text.toLocaleLowerCase("fr-FR").normalize("NFC")
  const numeric = normalized.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/)

  if (numeric) {
    const day = Number(numeric[1])
    const month = Number(numeric[2]) - 1
    const year = normalizeYear(numeric[3], day, month, now)
    return validDate(day, month, year)
  }

  const monthPattern = Object.keys(MONTHS).join("|")
  const word = normalized.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthPattern})(?:\\s+(\\d{2,4}))?\\b`, "i"))
  if (word) {
    const day = Number(word[1])
    const month = MONTHS[word[2]]
    const year = normalizeYear(word[3], day, month, now)
    return validDate(day, month, year)
  }

  return null
}

export function daysUntilExpiration(expirationDate?: string, now = new Date()): number | null {
  if (!expirationDate) return null
  const parsed = parseExpirationDate(expirationDate, now)
  if (!parsed) return null
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const end = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  return Math.round((end - start) / 86_400_000)
}

export function formatExpirationLabel(expirationDate?: string, now = new Date()): string {
  const days = daysUntilExpiration(expirationDate, now)
  if (days === null) return expirationDate ?? "Date inconnue"
  if (days === 0) return "Expire aujourd'hui"
  if (days === 1) return "Expire demain"
  if (days < 0) return "Expiré"
  return `Expire dans ${days} jours`
}

function normalizeYear(rawYear: string | undefined, day: number, month: number, now: Date): number {
  if (rawYear) {
    const year = Number(rawYear)
    return year < 100 ? 2000 + year : year
  }

  const currentYearDate = validDate(day, month, now.getFullYear())
  if (currentYearDate && currentYearDate.getTime() < startOfToday(now).getTime()) {
    return now.getFullYear() + 1
  }
  return now.getFullYear()
}

function validDate(day: number, month: number, year: number): Date | null {
  const date = new Date(year, month, day, 12)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null
  return date
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}
