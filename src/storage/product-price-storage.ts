import type { CarrefourProductPrice } from "../lib/coupon-types"

export const PRODUCT_PRICES_KEY = "carrefourProductPrices"

type StoredProductPrices = Record<string, CarrefourProductPrice>

let pendingWrite: Promise<void> = Promise.resolve()

export async function loadProductPrices(eans: string[]): Promise<CarrefourProductPrice[]> {
  const data = await chrome.storage.local.get(PRODUCT_PRICES_KEY)
  const stored = normalizeStoredPrices(data[PRODUCT_PRICES_KEY])
  return eans.flatMap((ean) => stored[ean] ? [stored[ean]] : [])
}

export function saveProductPrices(products: CarrefourProductPrice[]): Promise<void> {
  const persistentProducts = products.filter((product) => product.status !== "error")
  if (persistentProducts.length === 0) return pendingWrite

  pendingWrite = pendingWrite.then(async () => {
    const data = await chrome.storage.local.get(PRODUCT_PRICES_KEY)
    const stored = normalizeStoredPrices(data[PRODUCT_PRICES_KEY])
    for (const product of persistentProducts) stored[product.ean] = product
    await chrome.storage.local.set({ [PRODUCT_PRICES_KEY]: stored })
  })
  return pendingWrite
}

export async function clearProductPrices(): Promise<void> {
  await chrome.storage.local.remove(PRODUCT_PRICES_KEY)
}

function normalizeStoredPrices(value: unknown): StoredProductPrices {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([ean, product]) =>
    /^\d{13}$/.test(ean) && isStoredProductPrice(product, ean)
  ))
}

function isStoredProductPrice(value: unknown, ean: string): value is CarrefourProductPrice {
  return value !== null && typeof value === "object" &&
    "ean" in value && value.ean === ean &&
    "status" in value && (value.status === "found" || value.status === "not-found")
}
