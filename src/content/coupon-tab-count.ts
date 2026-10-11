export type CouponTabSource = "purchase" | "discount" | "unknown"

const PURCHASE_TAB_TITLE_PATTERN = /bons?\s+d(?:['’]|â€™)achat\s*\(\s*(\d+)\s*\)/i
const DISCOUNT_TAB_TITLE_PATTERN = /bons?\s+de\s+r(?:é|Ã©|e)duction\s*\(\s*(\d+)\s*\)/i
const TAB_TITLE_PATTERN = /bons?\s+(?:d(?:['’]|â€™)achat|de\s+r(?:é|Ã©|e)duction)\s*\(\s*(\d+)\s*\)/i

export function couponCountFromTabTitle(text: string): number | undefined {
  const value = TAB_TITLE_PATTERN.exec(text.replace(/\s+/g, " "))?.[1]
  if (value === undefined) return undefined
  const count = Number(value)
  return Number.isSafeInteger(count) ? count : undefined
}

export function expectedCouponCount(source: CouponTabSource): number | undefined {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("[role='tab'],label,.pl-tab,[class*='tab' i]"))
  for (const candidate of candidates) {
    const text = candidate.innerText || candidate.textContent || ""
    const pattern = source === "purchase" ? PURCHASE_TAB_TITLE_PATTERN : source === "discount" ? DISCOUNT_TAB_TITLE_PATTERN : undefined
    const value = pattern?.exec(text.replace(/\s+/g, " "))?.[1]
    if (value !== undefined) return Number(value)
  }
  return undefined
}

export function isCouponListComplete(detectedCount: number, source: CouponTabSource): boolean {
  const expected = expectedCouponCount(source)
  return expected !== undefined && detectedCount === expected
}
