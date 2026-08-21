import { groupCoupons, computeStats } from "../lib/coupon-grouper"
import type { CarrefourCoupon, CouponAnalysis } from "../lib/coupon-types"
import { saveCoupons } from "../storage/coupon-storage"
import { observeCouponChanges } from "./coupon-observer"
import { parseCoupon } from "./coupon-parser"
import { CARREFOUR_COUPON_STRATEGIES, COUPON_TEXT_PATTERNS, MAX_COUPON_TEXT_LENGTH, MIN_COUPON_TEXT_LENGTH } from "./selectors"

const DEBUG = true
const BADGE_ID = "carrefour-coupon-optimizer-badge"

let stopObserving: (() => void) | undefined
let contextInvalidated = false

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
  const coupons = elements.map(parseCoupon).filter((coupon): coupon is CarrefourCoupon => coupon !== null)
  const groups = groupCoupons(coupons)
  const analysis: CouponAnalysis = {
    coupons,
    groups,
    stats: computeStats(coupons, groups),
    diagnostics: {
      url: location.href,
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

  void safeScanCoupons()
  stopObserving = observeCouponChanges(() => {
    void safeScanCoupons()
  })
  registerRuntimeListener()
}

try {
  start()
} catch (error) {
  if (isExtensionContextInvalidatedError(error)) {
    handleExtensionContextInvalidated()
  } else {
    throw error
  }
}
