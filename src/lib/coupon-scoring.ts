import type { CarrefourCoupon } from "./coupon-types"
import { normalizeBrand, normalizeConditions, normalizeCouponName, normalizeDiscount, normalizeText } from "./coupon-normalizer"

export const SIMILARITY_THRESHOLD = 0.78

export function similarityScore(a: CarrefourCoupon, b: CarrefourCoupon): number {
  const brandA = normalizeBrand(a.brand)
  const brandB = normalizeBrand(b.brand)
  if (brandA && brandB && brandA !== brandB) return 0

  const discountA = normalizeDiscount(a.discountText, a.discountValue, a.discountType)
  const discountB = normalizeDiscount(b.discountText, b.discountValue, b.discountType)
  if (discountA && discountB && discountA !== discountB) return 0

  const conditionsA = normalizeConditions(a.conditions)
  const conditionsB = normalizeConditions(b.conditions)
  if (conditionsA && conditionsB && incompatibleConditions(conditionsA, conditionsB)) return 0

  const nameScore = jaccard(tokens(normalizeCouponName(a)), tokens(normalizeCouponName(b)))
  const brandScore = brandA || brandB ? Number(brandA === brandB) : 0.5
  if (brandScore === 1 && nameScore >= 0.55) return 0.9

  return nameScore * 0.9 + brandScore * 0.1
}

function tokens(text: string): Set<string> {
  const ignored = new Set([
    "sur",
    "les",
    "des",
    "une",
    "pour",
    "avec",
    "offre",
    "coupon",
    "expire",
    "valable",
    "achat",
    "valoir",
    "produit",
    "produit",
    "paquet",
    "boite",
    "pack",
    "rayon"
  ])
  return new Set(
    normalizeText(text)
      .split(" ")
      .map((token) => token.trim())
      .map((token) => (token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token))
      .filter((token) => token.length > 1 && !ignored.has(token) && !/^\d{1,2}[./-]\d{1,2}/.test(token))
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  const intersection = Array.from(a).filter((token) => b.has(token)).length
  const union = new Set([...a, ...b]).size
  return intersection / union
}

function incompatibleConditions(a: string, b: string): boolean {
  const quantityA = a.match(/\b(\d+)\s*(?:produits?|articles?)\b/)
  const quantityB = b.match(/\b(\d+)\s*(?:produits?|articles?)\b/)
  return Boolean(quantityA && quantityB && quantityA[1] !== quantityB[1])
}
