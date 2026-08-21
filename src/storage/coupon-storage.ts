import type { CouponAnalysis, CouponDiagnostics } from "../lib/coupon-types"

const ANALYSIS_KEY = "carrefourCouponAnalysis"
const PREFERENCES_KEY = "carrefourCouponPreferences"

export interface CouponPreferences {
  query: string
  onlyMultiples: boolean
  tab: "all" | "multiples" | "expiring"
  sort: "count" | "expiration"
}

const defaultPreferences: CouponPreferences = {
  query: "",
  onlyMultiples: false,
  tab: "all",
  sort: "count"
}

export async function saveCoupons(analysis: CouponAnalysis): Promise<void> {
  await chrome.storage.local.set({ [ANALYSIS_KEY]: analysis })
}

export async function loadCoupons(): Promise<CouponAnalysis | null> {
  const data = await chrome.storage.local.get(ANALYSIS_KEY)
  return (data[ANALYSIS_KEY] as CouponAnalysis | undefined) ?? null
}

export async function clearCoupons(): Promise<void> {
  await chrome.storage.local.remove(ANALYSIS_KEY)
}

export async function savePreferences(preferences: CouponPreferences): Promise<void> {
  await chrome.storage.local.set({ [PREFERENCES_KEY]: preferences })
}

export async function loadPreferences(): Promise<CouponPreferences> {
  const data = await chrome.storage.local.get(PREFERENCES_KEY)
  return { ...defaultPreferences, ...((data[PREFERENCES_KEY] as Partial<CouponPreferences> | undefined) ?? {}) }
}

export function emptyDiagnostics(message: string): CouponDiagnostics {
  return {
    url: "",
    candidateCount: 0,
    parsedCount: 0,
    strategy: "none",
    updatedAt: new Date().toISOString(),
    message
  }
}
