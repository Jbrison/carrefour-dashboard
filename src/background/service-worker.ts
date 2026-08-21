import { carrefourSearchUrl } from "../lib/product-price"
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

const MAX_PRICE_TABS = 4
const pendingReads = new Map<number, { ean: string; resolve: (product: CarrefourProductPrice) => void }>()

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  const tabId = sender.tab?.id
  if (!isPriceResultMessage(message) || tabId === undefined) return false
  const pending = pendingReads.get(tabId)
  if (!pending || message.product.ean !== pending.ean) return false
  pending.resolve(message.product)
  pendingReads.delete(tabId)
  return false
})

async function lookupPrices(eans: string[]): Promise<CarrefourProductPrice[]> {
  const uniqueEans = Array.from(new Set(eans)).slice(0, 100)
  const results = new Array<CarrefourProductPrice>(uniqueEans.length)
  let nextIndex = 0
  const workerCount = Math.min(MAX_PRICE_TABS, uniqueEans.length)
  const workers = Array.from({ length: workerCount }, async () => {
    const tab = await chrome.tabs.create({ active: false })
    if (tab.id === undefined) return
    try {
      while (nextIndex < uniqueEans.length) {
        const index = nextIndex++
        results[index] = await readPriceInTab(tab.id, uniqueEans[index])
        await delay(150)
      }
    } finally {
      pendingReads.delete(tab.id)
      await chrome.tabs.remove(tab.id).catch(() => undefined)
    }
  })
  await Promise.all(workers)
  return results.map((result, index) => result ?? failedPrice(uniqueEans[index]))
}

async function readPriceInTab(tabId: number, ean: string): Promise<CarrefourProductPrice> {
  const result = new Promise<CarrefourProductPrice>((resolve) => {
    pendingReads.set(tabId, { ean, resolve })
  })
  await chrome.tabs.update(tabId, { url: carrefourSearchUrl(ean), active: false })
  return Promise.race([result, delay(12_000).then(() => failedPrice(ean))]).finally(() => {
    if (pendingReads.get(tabId)?.ean === ean) pendingReads.delete(tabId)
  })
}

function failedPrice(ean: string): CarrefourProductPrice {
  return { ean, promotional: false, searchUrl: carrefourSearchUrl(ean), status: "not-found" }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function isPriceLookupMessage(message: unknown): message is { type: "LOOKUP_EAN_PRICES"; eans: string[] } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "LOOKUP_EAN_PRICES" &&
    "eans" in message && Array.isArray(message.eans) && message.eans.every((ean) => /^\d{13}$/.test(ean))
}

function isPriceResultMessage(message: unknown): message is { type: "CARREFOUR_PRICE_RESULT"; product: CarrefourProductPrice } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "CARREFOUR_PRICE_RESULT" &&
    "product" in message && typeof message.product === "object" && message.product !== null && "ean" in message.product
}

function isOpenSidePanelMessage(message: unknown): message is { type: "OPEN_SIDE_PANEL" } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "OPEN_SIDE_PANEL"
}
