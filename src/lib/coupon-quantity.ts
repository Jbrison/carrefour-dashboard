import type { CarrefourCoupon } from "./coupon-types"

const BOUGHT_PATTERN = /(?<!\d)(\d{1,2})\s*achet[ée]e?s?\b/i
// "dans la limite de 4 produits" is a cap, not a purchase requirement.
const PRODUCTS_PATTERN = /(?<!limite\s+(?:de\s+)?)(?<!\d)(\d{1,2})\s*(?:produits|articles)\b/i

/** Number of products to buy together for the coupon to apply ("2 achetés = 1,10 € d'économies"). */
export function couponRequiredQuantity(coupon: CarrefourCoupon): number {
  const texts = [coupon.discountText, coupon.title, coupon.product, coupon.conditions, coupon.rawText]
    .filter((text): text is string => Boolean(text))
  const quantity = firstQuantity(texts, BOUGHT_PATTERN) ?? firstQuantity(texts, PRODUCTS_PATTERN) ?? 1
  return Math.max(1, quantity)
}

export function groupRequiredQuantity(coupons: CarrefourCoupon[]): number {
  return Math.max(1, ...coupons.map(couponRequiredQuantity))
}

function firstQuantity(texts: string[], pattern: RegExp): number | undefined {
  for (const text of texts) {
    const match = text.match(pattern)
    if (match) return Number(match[1])
  }
  return undefined
}
