import { describe, expect, it } from "vitest"
import { formatExpirationLabel, parseExpirationDate } from "../src/lib/date-parser"

const now = new Date(2026, 7, 7)

describe("parseExpirationDate", () => {
  it("parses French numeric and word dates", () => {
    expect(parseExpirationDate("Expire le 12/08/2026", now)?.toISOString().slice(0, 10)).toBe("2026-08-12")
    expect(parseExpirationDate("Valable jusqu'au 12 août", now)?.toISOString().slice(0, 10)).toBe("2026-08-12")
    expect(parseExpirationDate("Jusqu'au 12/08", now)?.toISOString().slice(0, 10)).toBe("2026-08-12")
  })

  it("formats relative expiration labels", () => {
    expect(formatExpirationLabel("07/08/2026", now)).toBe("Expire aujourd'hui")
    expect(formatExpirationLabel("08/08/2026", now)).toBe("Expire demain")
  })
})
