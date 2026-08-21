import { carrefourAutocompleteUrl, carrefourSearchUrl, parseCarrefourAutocomplete } from "../lib/product-price"
import type { CarrefourProductPrice } from "../lib/coupon-types"

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (!isOpenSidePanelMessage(message)) return false
  const tabId = sender.tab?.id
  if (tabId !== undefined) {
    void chrome.sidePanel.open({ tabId })
    return false
  }
  const windowId = sender.tab?.windowId
  if (windowId !== undefined) {
    void chrome.sidePanel.open({ windowId })
  }
  return false
})

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isPriceLookupMessage(message)) return false
  void lookupPrices(message.eans).then(sendResponse)
  return true
})

const MAX_API_REQUESTS = 16
const API_TIMEOUT_MS = 8_000

async function lookupPrices(eans: string[]): Promise<CarrefourProductPrice[]> {
  const uniqueEans = Array.from(new Set(eans)).slice(0, 100)
  const pageResults = await lookupPricesFromCarrefourPage(uniqueEans)
  if (pageResults) return pageResults

  const results = new Array<CarrefourProductPrice>(uniqueEans.length)
  let nextIndex = 0
  const apiWorkers = Array.from({ length: Math.min(MAX_API_REQUESTS, uniqueEans.length) }, async () => {
    while (nextIndex < uniqueEans.length) {
      const index = nextIndex++
      results[index] = await fetchAutocomplete(uniqueEans[index])
    }
  })
  await Promise.all(apiWorkers)

  return results
}

async function lookupPricesFromCarrefourPage(eans: string[]): Promise<CarrefourProductPrice[] | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const carrefourTab = tabs.find((tab) => tab.id !== undefined && tab.url?.startsWith("https://www.carrefour.fr/"))
    if (carrefourTab?.id === undefined) return null
    const response: unknown = await chrome.tabs.sendMessage(carrefourTab.id, {
      type: "FETCH_CARREFOUR_AUTOCOMPLETE",
      eans
    })
    return isProductPriceArray(response) ? response : null
  } catch {
    return null
  }
}

async function fetchAutocomplete(ean: string): Promise<CarrefourProductPrice> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const response = await fetch(carrefourAutocompleteUrl(ean), {
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest"
      },
      signal: controller.signal
    })
    if (!response.ok) return failedPrice(ean, "error", `HTTP ${response.status}`)
    try {
      return parseCarrefourAutocomplete(await response.json(), ean)
    } catch {
      return failedPrice(ean, "error", "Réponse non JSON")
    }
  } catch (error) {
    return failedPrice(ean, "error", error instanceof DOMException && error.name === "AbortError" ? "Délai dépassé" : "Erreur réseau")
  } finally {
    clearTimeout(timeout)
  }
}

function isProductPriceArray(value: unknown): value is CarrefourProductPrice[] {
  return Array.isArray(value) && value.every((product) =>
    product !== null && typeof product === "object" &&
    "ean" in product && typeof product.ean === "string" &&
    "status" in product && (product.status === "found" || product.status === "not-found" || product.status === "error")
  )
}

function failedPrice(ean: string, status: "not-found" | "error" = "not-found", errorReason?: string): CarrefourProductPrice {
  return { ean, promotional: false, searchUrl: carrefourSearchUrl(ean), status, errorReason }
}

function isPriceLookupMessage(message: unknown): message is { type: "LOOKUP_EAN_PRICES"; eans: string[] } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "LOOKUP_EAN_PRICES" &&
    "eans" in message && Array.isArray(message.eans) && message.eans.every((ean) => /^\d{13}$/.test(ean))
}

function isOpenSidePanelMessage(message: unknown): message is { type: "OPEN_SIDE_PANEL" } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "OPEN_SIDE_PANEL"
}
