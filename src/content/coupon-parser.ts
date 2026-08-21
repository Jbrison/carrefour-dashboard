import type { CarrefourCoupon } from "../lib/coupon-types"
import { parseExpirationDate } from "../lib/date-parser"

const DISCOUNT_PATTERN = /(?:-|−)?\s*(\d+(?:[,.]\d+)?)\s*(%|€|euros?|eur)(?=\s|$)/i
const DATE_CONTEXT_PATTERN = /(?:expire(?: le)?|expiration|valable jusqu(?:'|’)?au|jusqu(?:'|’)?au)\s+([^\n.]{3,40})/i

export function parseCoupon(element: HTMLElement): CarrefourCoupon | null {
  const rawText = cleanText(element.innerText || element.textContent || "")
  if (!rawText) return null

  const discount = parseDiscountFromElement(element) ?? parseDiscount(rawText)
  const expirationDate = extractText(element, ".validity-dates") || parseExpiration(rawText)
  const title = extractTitle(element, rawText, discount?.discountText)
  if (!title && !discount) return null

  return {
    id: extractId(element),
    title: title || rawText.slice(0, 120),
    brand: extractBrand(element, rawText),
    product: extractProduct(element, rawText, discount?.discountText),
    discountText: discount?.discountText,
    discountValue: discount?.discountValue,
    discountType: discount?.discountType,
    conditions: extractConditions(element, rawText),
    expirationDate,
    rawText
  }
}

export function parseDiscount(text: string): Pick<CarrefourCoupon, "discountText" | "discountValue" | "discountType"> | null {
  const match = text.match(DISCOUNT_PATTERN)
  if (!match) return null
  const value = Number(match[1].replace(",", "."))
  const unit = match[2].toLocaleLowerCase("fr-FR")
  return {
    discountText: match[0].replace(/\s+/g, " ").trim(),
    discountValue: Number.isFinite(value) ? value : undefined,
    discountType: unit === "%" ? "percent" : unit === "€" || unit.startsWith("euro") || unit === "eur" ? "amount" : "other"
  }
}

function parseDiscountFromElement(element: HTMLElement): Pick<CarrefourCoupon, "discountText" | "discountValue" | "discountType"> | null {
  const label = extractText(element, ".coupon-card__discount-label")
  const price = extractText(element, ".coupon-card__discount .formatted-price__price")
  const unit = extractText(element, ".coupon-card__discount .formatted-price__price + div")
  const combined = [price, unit].filter(Boolean).join(" ")

  if (label) {
    const parsedLabel = parseDiscount(label)
    if (parsedLabel) return parsedLabel
  }

  if (combined) {
    const parsedPrice = parseDiscount(combined)
    if (parsedPrice) return parsedPrice
  }

  return null
}

function extractId(element: HTMLElement): string | undefined {
  return (
    element.dataset.couponId ||
    element.dataset.id ||
    element.getAttribute("data-coupon-id") ||
    element.getAttribute("data-offer-id") ||
    element.id ||
    undefined
  )
}

function extractTitle(element: HTMLElement, rawText: string, discountText?: string): string {
  const product = extractText(element, ".coupon-card__main-paragraph")
  if (product) return product

  const heading = element.querySelector("h1,h2,h3,h4,[class*='title' i],[data-testid*='title' i]")
  const headingText = cleanText(heading?.textContent ?? "")
  if (headingText) return headingText

  const line = rawText
    .split("\n")
    .map(cleanText)
    .find((candidate) => candidate.length > 4 && candidate !== discountText && !/^(activer|voir|details|détails)$/i.test(candidate))
  return line ?? ""
}

function extractBrand(element: HTMLElement, rawText: string): string | undefined {
  const explicit = element.querySelector("[class*='brand' i],[data-testid*='brand' i],[data-test*='brand' i]")
  const explicitText = cleanText(explicit?.textContent ?? "")
  if (explicitText) return explicitText

  const lines = rawText.split("\n").map(cleanText).filter(Boolean)
  const upperCaseLine = lines.find((line) => line.length > 2 && line.length < 40 && line === line.toLocaleUpperCase("fr-FR"))
  return upperCaseLine
}

function extractProduct(element: HTMLElement, rawText: string, discountText?: string): string | undefined {
  const product = extractText(element, ".coupon-card__main-paragraph")
  if (product) return product

  const lines = rawText.split("\n").map(cleanText).filter(Boolean)
  const candidates = lines.filter(
    (line) =>
      line !== discountText &&
      !DATE_CONTEXT_PATTERN.test(line) &&
      !/^(activer|voir|details|détails|conditions)$/i.test(line) &&
      !DISCOUNT_PATTERN.test(line)
  )
  return candidates[0]
}

function extractConditions(element: HTMLElement, rawText: string): string | undefined {
  if (extractText(element, ".coupon-card__main-paragraph")) return undefined

  const line = rawText
    .split("\n")
    .map(cleanText)
    .find((candidate) => /\b(?:des|sur|pour|lot|achat|produits?|articles?)\b/i.test(candidate) && !DATE_CONTEXT_PATTERN.test(candidate))
  return line
}

function parseExpiration(rawText: string): string | undefined {
  const contextual = rawText.match(DATE_CONTEXT_PATTERN)?.[0]
  if (contextual && parseExpirationDate(contextual)) return contextual
  const parsed = parseExpirationDate(rawText)
  return parsed ? rawText.match(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/)?.[0] ?? contextual : undefined
}

function cleanText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim()
}

function extractText(element: HTMLElement, selector: string): string | undefined {
  const text = cleanText(element.querySelector(selector)?.textContent ?? "")
  return text || undefined
}
