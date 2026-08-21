import type { CarrefourProductPrice } from "./coupon-types"

const PRICE_KEYS = ["price", "currentPrice", "salePrice", "unitPrice"]
const REGULAR_PRICE_KEYS = ["regularPrice", "originalPrice", "oldPrice", "crossedPrice"]

export function carrefourSearchUrl(ean: string): string {
  return `https://www.carrefour.fr/s?q=${encodeURIComponent(ean)}`
}

export function carrefourAutocompleteUrl(ean: string): string {
  return `https://www.carrefour.fr/autocomplete?q=${encodeURIComponent(ean)}&maxResults=4&productCard=true`
}

export function parseCarrefourAutocomplete(payload: unknown, ean: string): CarrefourProductPrice {
  const searchUrl = carrefourSearchUrl(ean)
  const products = autocompleteProducts(payload)
  const product = products.find((candidate) => candidate.attributes?.ean === ean)
  if (!product) return { ean, promotional: false, searchUrl, status: "not-found" }

  const attributes = product.attributes!
  const offer = findAutocompleteOffer(attributes.offers, ean)
  const price = positiveNumber(offer?.attributes?.price?.price)
  const initialPrice = positiveNumber(offer?.attributes?.promotion?.messageArgs?.initialPrice)
    ?? offer?.attributes?.promotions
      ?.map((promotion) => positiveNumber(promotion.messageArgs?.initialPrice))
      .find((value) => value !== undefined)
  const regularPrice = initialPrice !== undefined && price !== undefined && initialPrice > price
    ? initialPrice
    : undefined
  const imagePath = attributes.images?.paths?.find((path) => typeof path === "string" && path.trim())

  return {
    ean,
    name: nonEmptyString(attributes.title),
    price,
    regularPrice,
    promotional: regularPrice !== undefined,
    imageUrl: absoluteCarrefourUrl(nonEmptyString(imagePath)),
    productUrl: absoluteCarrefourUrl(nonEmptyString(product.links?.self)),
    searchUrl,
    status: "found"
  }
}

type AutocompleteOffer = {
  attributes?: {
    price?: { price?: unknown }
    promotion?: { messageArgs?: { initialPrice?: unknown } } | null
    promotions?: Array<{ messageArgs?: { initialPrice?: unknown } }>
  }
}

type AutocompleteProduct = {
  attributes?: {
    ean?: unknown
    title?: unknown
    images?: { paths?: unknown[] }
    offers?: unknown
  }
  links?: { self?: unknown }
}

function autocompleteProducts(payload: unknown): AutocompleteProduct[] {
  if (!payload || typeof payload !== "object") return []
  const data = (payload as { data?: unknown }).data
  if (!data || typeof data !== "object") return []
  const products = (data as { products?: unknown }).products
  return Array.isArray(products)
    ? products.filter((product): product is AutocompleteProduct => product !== null && typeof product === "object")
    : []
}

function findAutocompleteOffer(offers: unknown, ean: string): AutocompleteOffer | undefined {
  if (!offers || typeof offers !== "object") return undefined
  const eanOffers = (offers as Record<string, unknown>)[ean]
  if (!eanOffers || typeof eanOffers !== "object") return undefined
  return Object.values(eanOffers as Record<string, unknown>)
    .find((offer): offer is AutocompleteOffer => offer !== null && typeof offer === "object")
}

function positiveNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN
  return Number.isFinite(number) && number > 0 && number < 10_000 ? number : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export function parseCarrefourProductPage(html: string, ean: string): CarrefourProductPrice {
  const searchUrl = carrefourSearchUrl(ean)
  const htmlCard = productFromHtmlCard(html, ean, searchUrl)
  if (htmlCard) return htmlCard
  const candidates = extractJsonDocuments(html)
    .flatMap((document) => findObjectsContainingEan(document, ean))
    .map((value) => productFromObject(value, ean, searchUrl))
    .filter((product): product is CarrefourProductPrice => product !== null)

  const priced = candidates.find((candidate) => candidate.price !== undefined)
  if (priced) return priced
  if (candidates[0]) return candidates[0]
  return { ean, promotional: false, searchUrl, status: "not-found" }
}

function productFromHtmlCard(html: string, ean: string, searchUrl: string): CarrefourProductPrice | null {
  const escapedEan = ean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const card = html.match(new RegExp(`<article\\b[^>]*data-testid=["']${escapedEan}["'][^>]*>([\\s\\S]*?)<\\/article>`, "i"))?.[0]
  if (!card) return null

  const priceBlock = card.match(/data-testid=["']product-price__amount--main["'][^>]*>([\s\S]{0,600}?)(?:<\/div>)/i)?.[1]
  const price = parseDisplayedPrice(textFromHtml(priceBlock ?? ""))
  const regularBlock = card.match(/class=["'][^"']*product-price__amount--(?:old|regular|crossed)[^"']*["'][^>]*>([\s\S]{0,600}?)(?:<\/div>)/i)?.[1]
  const regularPrice = parseDisplayedPrice(textFromHtml(regularBlock ?? ""))
  const productHref = card.match(new RegExp(`<a\\b[^>]*href=["']([^"']*${escapedEan}[^"']*)["']`, "i"))?.[1]
  const titleHtml = card.match(/<p\b[^>]*class=["'][^"']*product-card-title__text[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]
  const imageUrl = card.match(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1]

  return {
    ean,
    name: textFromHtml(titleHtml ?? "") || undefined,
    price,
    regularPrice,
    promotional: regularPrice !== undefined && price !== undefined && regularPrice > price,
    imageUrl: absoluteCarrefourUrl(imageUrl),
    productUrl: absoluteCarrefourUrl(productHref),
    searchUrl,
    status: "found"
  }
}

function parseDisplayedPrice(text: string): number | undefined {
  const normalized = text.replace(/\s+/g, " ").replace(/(\d)\s*,\s*(\d{2})/, "$1.$2")
  const match = normalized.match(/(\d+(?:[.,]\d{1,2})?)\s*€/)
  if (!match) return undefined
  const value = Number(match[1].replace(",", "."))
  return Number.isFinite(value) ? value : undefined
}

function textFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function extractJsonDocuments(html: string): unknown[] {
  const documents: unknown[] = []
  const scripts = html.matchAll(/<script\b[^>]*(?:type=["']application\/(?:ld\+)?json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi)
  for (const match of scripts) {
    try {
      documents.push(JSON.parse(match[1]))
    } catch {
      // A malformed analytics script must not prevent other product data being read.
    }
  }
  return documents
}

function findObjectsContainingEan(value: unknown, ean: string, depth = 0): Record<string, unknown>[] {
  if (depth > 20 || value === null || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap((item) => findObjectsContainingEan(item, ean, depth + 1))

  const object = value as Record<string, unknown>
  const directValues = Object.values(object).filter((item) => typeof item === "string" || typeof item === "number")
  const here = directValues.some((item) => String(item) === ean) ? [object] : []
  return here.concat(Object.values(object).flatMap((item) => findObjectsContainingEan(item, ean, depth + 1)))
}

function productFromObject(object: Record<string, unknown>, ean: string, searchUrl: string): CarrefourProductPrice | null {
  const price = findNumber(object, PRICE_KEYS)
  const regularPrice = findNumber(object, REGULAR_PRICE_KEYS)
  const name = findString(object, ["name", "title", "label", "productName"])
  const rawUrl = findString(object, ["url", "productUrl", "canonicalUrl"])
  const imageUrl = imageFrom(object.image) ?? findString(object, ["imageUrl", "image"])
  if (!name && price === undefined && !rawUrl) return null

  return {
    ean,
    name,
    price,
    regularPrice,
    promotional: regularPrice !== undefined && price !== undefined && regularPrice > price,
    imageUrl,
    productUrl: absoluteCarrefourUrl(rawUrl),
    searchUrl,
    status: "found"
  }
}

function findNumber(object: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = object[key]
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN
    if (Number.isFinite(number) && number > 0 && number < 10_000) return number
  }
  for (const child of Object.values(object)) {
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const result = findNumber(child as Record<string, unknown>, keys)
      if (result !== undefined) return result
    }
  }
  return undefined
}

function findString(object: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = object[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}

function imageFrom(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string")
  if (value && typeof value === "object") return findString(value as Record<string, unknown>, ["url", "src"])
  return undefined
}

function absoluteCarrefourUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value, "https://www.carrefour.fr").href
  } catch {
    return undefined
  }
}
