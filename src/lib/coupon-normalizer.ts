import type { CarrefourCoupon } from "./coupon-types"
import { couponBenefitType } from "./coupon-benefit"

const EURO_WORDS = /\b(euro|euros|eur)\b/gi
const SPACED_PERCENT = /(\d+(?:[,.]\d+)?)\s*%/g
const SPACED_EURO = /(\d+(?:[,.]\d+)?)\s*(?:€|eur|euro|euros)(?=\s|$)/gi
const NON_RELEVANT_PUNCTUATION = /[()[\]{}"'`´:;!?|•·]/g

export function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(EURO_WORDS, "€")
    .replace(SPACED_PERCENT, "$1%")
    .replace(SPACED_EURO, "$1€")
    .replace(/(\d+),(\d+)/g, "$1.$2")
    .replace(/\bde remise\b/g, "")
    .replace(/\bremise immediate\b/g, "")
    .replace(/\bvalable jusqu(?:'|’)?au\b/g, "expire")
    .replace(/\bjusqu(?:'|’)?au\b/g, "expire")
    .replace(/\bexpire le\b/g, "expire")
    .replace(NON_RELEVANT_PUNCTUATION, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/[^\p{Letter}\p{Number}%€./ -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeBrand(brand?: string): string {
  return normalizeText(brand ?? "")
}

export function normalizeProduct(product?: string): string {
  return normalizeText(product ?? "")
}

export function normalizeCouponName(coupon: CarrefourCoupon): string {
  const source = coupon.product || coupon.title
  return normalizeCouponNameText(source)
}

export function normalizeCouponNameText(text: string): string {
  return normalizeText(text)
    .replace(/^[-+]?\d+(?:[,.]\d+)?\s*(?:%|€)\s*(?:sur|pour)?\s*/g, "")
    .replace(/\b\d+\s*(?:achete|achetes|achetee|achetees)\s+\d+(?:[,.]\d+)?€\s*(?:d\s+)?(?:economies|remise)?\b/g, "")
    .replace(/\ba valoir\s+(?:sur|pour)\s+l\s*achat\s+d\s*(?:un|une)\b/g, "")
    .replace(/\ba valoir\s+(?:sur|pour)\s+l\s*achat\s+de\b/g, "")
    .replace(/\ba valoir\s+(?:sur|pour)\s+l\s*achat\b/g, "")
    .replace(/\b(?:d un|d une|du|de la|de l|des|un|une)\b/g, " ")
    .replace(/\b(?:produit|produits|rayon)\b/g, " ")
    .replace(/\b(?:de|d)\s+/g, " ")
    .replace(/\b(?:hors|gamme|format|present au rayon)\b.*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeDiscount(discountText?: string, value?: number, type?: CarrefourCoupon["discountType"]): string {
  if (value !== undefined && type === "percent") return `${formatNumber(value)}%`
  if (value !== undefined && type === "amount") return `${formatNumber(value)}€`
  return normalizeText(discountText ?? "")
    .replace(/^[-+]/, "")
    .replace(/\b(?:sur|pour|offert|offerte)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeConditions(conditions?: string): string {
  return normalizeText(conditions ?? "")
    .replace(/\b(?:expire|expiration|valable|jusqu au|jusquau)\b.*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function getCouponSignature(coupon: CarrefourCoupon): string {
  const explicitProduct = normalizeProduct(coupon.product)
  if (explicitProduct) return [explicitProduct, couponBenefitType(coupon) ?? ""].filter(Boolean).join("|")

  const parts = [
    normalizeCouponName(coupon),
    couponBenefitType(coupon) ?? "",
    normalizeBrand(coupon.brand)
  ].filter(Boolean)

  return Array.from(new Set(parts)).join("|")
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(",", ".")
}
