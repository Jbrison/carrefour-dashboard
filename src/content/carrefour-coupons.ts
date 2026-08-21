import { groupCoupons, computeStats } from "../lib/coupon-grouper"
import type { CarrefourCoupon, CouponAnalysis } from "../lib/coupon-types"
import { couponSourceFromUrl, loadCoupons, saveCoupons } from "../storage/coupon-storage"
import { observeCouponChanges } from "./coupon-observer"
import { extractEans, parseCoupon } from "./coupon-parser"
import { CARREFOUR_COUPON_STRATEGIES, COUPON_TEXT_PATTERNS, MAX_COUPON_TEXT_LENGTH, MIN_COUPON_TEXT_LENGTH } from "./selectors"
import type { CarrefourProductPrice } from "../lib/coupon-types"
import { carrefourSearchUrl } from "../lib/product-price"

const DEBUG = true
const BADGE_ID = "carrefour-coupon-optimizer-badge"

let stopObserving: (() => void) | undefined
let contextInvalidated = false
let pendingConditionsCard: HTMLElement | undefined
const revealedConditions = new WeakMap<HTMLElement, { text: string; eans: string[] }>()
const conditionsAttempts = new WeakMap<HTMLElement, number>()
let isCollectingConditions = false
let conditionsCollectionQueued = false
let isLoadingCouponList = false

interface FindResult {
  elements: HTMLElement[]
  strategy: string
}

export function findCouponElements(): HTMLElement[] {
  return findCouponElementsWithStrategy().elements
}

function findCouponElementsWithStrategy(): FindResult {
  for (const strategy of CARREFOUR_COUPON_STRATEGIES) {
    const elements = uniqueElements(strategy.selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector))))
      .filter(isLikelyCouponElement)

    if (elements.length > 0) return { elements, strategy: strategy.name }
  }

  const structural = Array.from(document.querySelectorAll<HTMLElement>("article,li,section,div"))
    .filter(isLikelyCouponElement)
    .filter((element) => !hasCouponAncestor(element))

  return { elements: structural, strategy: structural.length > 0 ? "text-heuristics" : "none" }
}

async function scanCoupons(): Promise<CouponAnalysis> {
  assertExtensionContext()
  const { elements, strategy } = findCouponElementsWithStrategy()
  captureRevealedConditions()
  const coupons = elements.map((element) => {
    const coupon = parseCoupon(element)
    const revealed = revealedConditions.get(element)
    if (!coupon || !revealed) return coupon
    return {
      ...coupon,
      conditions: revealed.text,
      eans: Array.from(new Set([...(coupon.eans ?? []), ...revealed.eans]))
    }
  }).filter((coupon): coupon is CarrefourCoupon => coupon !== null)
  const groups = groupCoupons(coupons)
  const analysis: CouponAnalysis = {
    coupons,
    groups,
    stats: computeStats(coupons, groups),
    diagnostics: {
      url: couponListUrl(),
      candidateCount: elements.length,
      parsedCount: coupons.length,
      strategy,
      updatedAt: new Date().toISOString(),
      message: coupons.length === 0 ? "Aucun coupon détecté. La structure de la page Carrefour a peut-être changé." : undefined
    }
  }

  debugLog(elements, strategy, coupons.length)
  await saveCoupons(analysis)
  renderBadge(analysis)
  return analysis
}

function captureRevealedConditions(): void {
  if (!pendingConditionsCard) return
  const containers = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog'],dialog,[class*='modal' i],[class*='drawer' i]"))
  const container = containers.find((candidate) => /conditions de l['â€™]offre/i.test(candidate.innerText || candidate.textContent || ""))
  if (!container) return
  const text = (container.innerText || container.textContent || "").replace(/\s+/g, " ").trim()
  const eans = extractEans(text)
  if (eans.length === 0) return
  revealedConditions.set(pendingConditionsCard, { text, eans })
  pendingConditionsCard = undefined
}

function registerConditionsClicks(): void {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button,a") : null
    if (!target || !/conditions/i.test(target.innerText || target.textContent || target.getAttribute("aria-label") || "")) return
    pendingConditionsCard = findCouponElements().find((element) => element.contains(target))
  }, true)
}

async function collectAllConditions(): Promise<void> {
  if (contextInvalidated || !isDiscountCouponList()) return
  if (isCollectingConditions || isLoadingCouponList) {
    conditionsCollectionQueued = true
    return
  }
  isCollectingConditions = true
  try {
    const cards = findCouponElements()
    const parsedCards = cards
      .map((card) => ({ card, coupon: parseCoupon(card) }))
      .filter((item): item is { card: HTMLElement; coupon: CarrefourCoupon } => item.coupon !== null)
    const stored = await loadCoupons()
    const otherListCoupons = (stored?.coupons ?? []).filter((coupon) => coupon.sourceList !== "discount")
    const comparisonGroups = groupCoupons([...otherListCoupons, ...parsedCards.map((item) => item.coupon)])
    const multipleCoupons = new Set(
      comparisonGroups.filter((group) => group.count > 1).flatMap((group) => group.coupons)
    )

    for (const { card, coupon } of parsedCards) {
      if (!multipleCoupons.has(coupon)) continue
      if ((coupon.eans?.length ?? 0) > 0 || revealedConditions.has(card) || (conditionsAttempts.get(card) ?? 0) >= 3) continue
      const trigger = Array.from(card.querySelectorAll<HTMLElement>("button,a"))
        .find((element) => /voir\s+les\s+conditions|conditions/i.test(element.innerText || element.textContent || element.getAttribute("aria-label") || ""))
      if (!trigger) continue
      conditionsAttempts.set(card, (conditionsAttempts.get(card) ?? 0) + 1)
      pendingConditionsCard = card
      trigger.click()
      const dialog = await waitForConditionsDialog(4_000)
      if (!dialog) {
        pendingConditionsCard = undefined
        continue
      }
      const text = (dialog.innerText || dialog.textContent || "").replace(/\s+/g, " ").trim()
      const eans = extractEans(text)
      if (eans.length > 0) revealedConditions.set(card, { text, eans })
      pendingConditionsCard = undefined
      closeConditionsDialog(dialog)
      await contentDelay(250)
    }
    await safeScanCoupons()
  } finally {
    isCollectingConditions = false
    if (conditionsCollectionQueued) {
      conditionsCollectionQueued = false
      void collectAllConditions()
    }
  }
}

function isDiscountCouponList(): boolean {
  const source = currentCouponSource()
  if (source === "discount") return true
  if (source === "purchase") return false
  const selectedTab = document.querySelector<HTMLElement>("[role='tab'][aria-selected='true'],[aria-current='page']")
  return /bons?\s+de\s+r[ée]duction/i.test(selectedTab?.innerText || selectedTab?.textContent || "")
}

function currentCouponSource(): "purchase" | "discount" | "unknown" {
  const sourceFromUrl = couponSourceFromUrl(location.href)
  if (sourceFromUrl !== "unknown") return sourceFromUrl
  const selectedValue = document.querySelector<HTMLInputElement>(
    ".pl-tab--selected input[type='radio'][value], input[type='radio'][value]:checked"
  )?.value
  if (selectedValue === "bons-achat") return "purchase"
  if (selectedValue === "bons-de-reduction") return "discount"
  return "unknown"
}

function couponListUrl(): string {
  const source = currentCouponSource()
  if (source === "unknown") return location.href
  const url = new URL(location.href)
  url.searchParams.set("tab", source === "purchase" ? "bons-achat" : "bons-de-reduction")
  return url.href
}

async function loadAllCouponCards(): Promise<void> {
  if (isLoadingCouponList || contextInvalidated) return
  isLoadingCouponList = true
  const initialX = window.scrollX
  const initialY = window.scrollY
  let stableRounds = 0
  let previousCount = -1
  let previousHeight = -1
  try {
    for (let round = 0; round < 40 && stableRounds < 3; round += 1) {
      const cards = findCouponElements()
      const lastCard = cards.at(-1)
      if (lastCard) lastCard.scrollIntoView({ block: "end", behavior: "auto" })
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" })
      await contentDelay(600)

      const count = findCouponElements().length
      const height = document.documentElement.scrollHeight
      stableRounds = count === previousCount && height === previousHeight ? stableRounds + 1 : 0
      previousCount = count
      previousHeight = height
    }
  } finally {
    window.scrollTo({ left: initialX, top: initialY, behavior: "auto" })
    isLoadingCouponList = false
    await safeScanCoupons()
  }

  if (currentCouponSource() === "purchase" && !contextInvalidated) {
    isLoadingCouponList = true
    const clicked = clickDiscountCouponsTab()
    if (clicked) {
      await contentDelay(900)
      isLoadingCouponList = false
      await loadAllCouponCards()
    } else {
      isLoadingCouponList = false
      const discountUrl = new URL(location.href)
      discountUrl.searchParams.set("tab", "bons-de-reduction")
      location.assign(discountUrl.href)
    }
  }
}

function clickDiscountCouponsTab(): boolean {
  const input = document.querySelector<HTMLInputElement>('input[type="radio"][value="bons-de-reduction"]')
  if (!input) return false
  const label = input.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(input.id)}"]`) : null
  if (label) label.click()
  else input.click()
  if (!input.checked) {
    input.click()
    input.dispatchEvent(new Event("change", { bubbles: true }))
  }
  return true
}

async function waitForConditionsDialog(timeoutMs: number): Promise<HTMLElement | undefined> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const dialog = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog'],dialog,[class*='modal' i],[class*='drawer' i]"))
      .find((candidate) => /conditions de l['â€™]offre/i.test(candidate.innerText || candidate.textContent || ""))
    if (dialog) return dialog
    await contentDelay(100)
  }
  return undefined
}

function closeConditionsDialog(dialog: HTMLElement): void {
  const close = Array.from(dialog.querySelectorAll<HTMLElement>("button,[role='button']"))
    .find((element) => /fermer|close/i.test(element.getAttribute("aria-label") || element.getAttribute("title") || element.innerText || ""))
  if (close) close.click()
  else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }))
}

function contentDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function safeScanCoupons(): Promise<CouponAnalysis | null> {
  if (contextInvalidated) return null

  try {
    return await scanCoupons()
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      handleExtensionContextInvalidated()
      return null
    }

    console.warn("[Optimiseur Carrefour] Analyse impossible", error)
    return null
  }
}

function handleExtensionContextInvalidated(): void {
  contextInvalidated = true
  stopObserving?.()
  document.getElementById(BADGE_ID)?.remove()
}

function renderBadge(analysis: CouponAnalysis): void {
  const existing = document.getElementById(BADGE_ID)
  const badge = existing instanceof HTMLButtonElement ? existing : document.createElement("button")
  badge.id = BADGE_ID
  badge.type = "button"
  badge.textContent = `Optimiseur coupons · ${analysis.stats.duplicateGroups} groupes multiples`
  badge.setAttribute("aria-label", "Ouvrir l'optimiseur de coupons Carrefour")
  badge.style.cssText = [
    "position:fixed",
    "top:88px",
    "right:16px",
    "z-index:2147483647",
    "padding:8px 12px",
    "border:1px solid #0b5",
    "border-radius:6px",
    "background:#fff",
    "color:#064",
    "font:600 13px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    "box-shadow:0 3px 12px rgba(0,0,0,.14)",
    "cursor:pointer"
  ].join(";")
  badge.onclick = () => {
    if (!isExtensionContextActive()) return
    chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }).catch(() => undefined)
  }
  if (!existing) document.body.append(badge)
}

function isLikelyCouponElement(element: HTMLElement): boolean {
  if (element.id === BADGE_ID || element.closest(`#${BADGE_ID}`)) return false
  const text = (element.innerText || element.textContent || "").trim()
  if (text.length < MIN_COUPON_TEXT_LENGTH || text.length > MAX_COUPON_TEXT_LENGTH) return false
  const patternMatches = COUPON_TEXT_PATTERNS.filter((pattern) => pattern.test(text)).length
  return patternMatches >= 2 || (patternMatches >= 1 && /\b(?:activer|coupon|remise)\b/i.test(text))
}

function hasCouponAncestor(element: HTMLElement): boolean {
  let parent = element.parentElement
  while (parent && parent !== document.body) {
    if (isLikelyCouponElement(parent)) return true
    parent = parent.parentElement
  }
  return false
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  return Array.from(new Set(elements))
}

function debugLog(elements: HTMLElement[], strategy: string, parsedCount: number): void {
  if (!DEBUG) return
  console.info("[Optimiseur Carrefour]", {
    candidateCount: elements.length,
    parsedCount,
    strategy,
    samples: elements.slice(0, 3).map((element) => anonymizeText(element.innerText || element.textContent || ""))
  })
}

function anonymizeText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{6,}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240)
}

function isExtensionContextActive(): boolean {
  try {
    return Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

function assertExtensionContext(): void {
  if (!isExtensionContextActive()) {
    throw new Error("Extension context invalidated")
  }
}

function isExtensionContextInvalidatedError(error: unknown): boolean {
  return error instanceof Error && /extension context invalidated|context invalidated/i.test(error.message)
}

function registerRuntimeListener(): void {
  if (!isExtensionContextActive()) return

  try {
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (typeof message === "object" && message !== null && "type" in message && message.type === "RESCAN_COUPONS") {
        void safeScanCoupons().then(sendResponse)
        return true
      }
      return false
    })
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      handleExtensionContextInvalidated()
    } else {
      console.warn("[Optimiseur Carrefour] Listener runtime indisponible", error)
    }
  }
}

function registerContextInvalidationFilters(): void {
  window.addEventListener("unhandledrejection", (event) => {
    if (isExtensionContextInvalidatedError(event.reason)) {
      event.preventDefault()
      handleExtensionContextInvalidated()
    }
  })

  window.addEventListener("error", (event) => {
    if (isExtensionContextInvalidatedError(event.error)) {
      event.preventDefault()
      handleExtensionContextInvalidated()
    }
  })
}

function start(): void {
  registerContextInvalidationFilters()
  if (!isExtensionContextActive()) return

  registerConditionsClicks()
  void safeScanCoupons().then(() => loadAllCouponCards()).then(() => collectAllConditions())
  stopObserving = observeCouponChanges(() => {
    void safeScanCoupons().then(() => collectAllConditions())
  })
  registerRuntimeListener()
}

function startProductReader(): void {
  let lastSignature = ""
  let timer: number | undefined
  const read = () => {
    const product = readRenderedProduct()
    if (!product) return
    const signature = JSON.stringify(product)
    if (signature === lastSignature) return
    lastSignature = signature
    if (isExtensionContextActive()) chrome.runtime.sendMessage({ type: "CARREFOUR_PRICE_RESULT", product }).catch(() => undefined)
  }
  const observer = new MutationObserver(() => {
    window.clearTimeout(timer)
    timer = window.setTimeout(read, 100)
  })
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  read()
}

function readRenderedProduct(): CarrefourProductPrice | null {
  const requestedEan = new URL(location.href).searchParams.get("q")?.match(/^\d{13}$/)?.[0]
    ?? location.pathname.match(/(\d{13})(?:$|[/?#])/)?.[1]
  if (!requestedEan) return null
  const pageText = document.body?.innerText || document.body?.textContent || ""
  if (/nous avons beau chercher,?\s+nous ne trouvons pas de r[ée]sultat pour/i.test(pageText)) {
    return {
      ean: requestedEan,
      promotional: false,
      searchUrl: carrefourSearchUrl(requestedEan),
      status: "not-found"
    }
  }
  const card = document.querySelector<HTMLElement>(`article[data-testid="${requestedEan}"]`)
    ?? document.querySelector<HTMLElement>("article[data-testid]")
  if (!card) return null
  const ean = card.dataset.testid?.match(/^\d{13}$/)?.[0] ?? requestedEan
  const mainPriceText = card.querySelector<HTMLElement>("[data-testid='product-price__amount--main']")?.innerText ?? ""
  const price = parseRenderedPrice(mainPriceText)
  if (price === undefined) return null
  const regularPrice = parseRenderedPrice(
    card.querySelector<HTMLElement>("[class*='product-price__amount--old'],[class*='product-price__amount--regular'],[class*='product-price__amount--crossed']")?.innerText ?? ""
  )
  const link = card.querySelector<HTMLAnchorElement>(`a[href*="${ean}"]`)
  const image = card.querySelector<HTMLImageElement>("img[src]")
  return {
    ean,
    name: card.querySelector<HTMLElement>(".product-card-title__text")?.innerText.trim(),
    price,
    regularPrice,
    promotional: regularPrice !== undefined && regularPrice > price,
    imageUrl: image?.src,
    productUrl: link?.href,
    searchUrl: carrefourSearchUrl(ean),
    status: "found"
  }
}

function parseRenderedPrice(text: string): number | undefined {
  const match = text.replace(/\s+/g, "").replace(",", ".").match(/\d+(?:\.\d{1,2})?/)?.[0]
  const value = match ? Number(match) : NaN
  return Number.isFinite(value) ? value : undefined
}

try {
  if (location.pathname.startsWith("/mon-compte/fidelite/mes-coupons")) start()
  else startProductReader()
} catch (error) {
  if (isExtensionContextInvalidatedError(error)) {
    handleExtensionContextInvalidated()
  } else {
    throw error
  }
}
