import { computeStats, groupCoupons } from "../lib/coupon-grouper"
import type { CouponAnalysis, CouponDiagnostics, CouponSourceList } from "../lib/coupon-types"

const ANALYSIS_KEY = "carrefourCouponAnalysis"
const PREFERENCES_KEY = "carrefourCouponPreferences"

type StoredAnalyses = Partial<Record<CouponSourceList, CouponAnalysis>>

export interface CouponPreferences {
  query: string
  onlyMultiples: boolean
  tab: "all" | "multiples" | "expiring"
  sort: "count" | "expiration" | "savingsPercent"
}

const defaultPreferences: CouponPreferences = {
  query: "",
  onlyMultiples: false,
  tab: "all",
  sort: "count"
}

export async function saveCoupons(analysis: CouponAnalysis): Promise<void> {
  const data = await chrome.storage.local.get(ANALYSIS_KEY)
  const stored = normalizeStoredAnalyses(data[ANALYSIS_KEY])
  const source = couponSourceFromUrl(analysis.diagnostics.url)
  await chrome.storage.local.set({ [ANALYSIS_KEY]: { ...stored, [source]: analysis } satisfies StoredAnalyses })
}

export async function loadCoupons(): Promise<CouponAnalysis | null> {
  const data = await chrome.storage.local.get(ANALYSIS_KEY)
  return mergeAnalyses(normalizeStoredAnalyses(data[ANALYSIS_KEY]))
}

export function couponSourceFromUrl(url: string): CouponSourceList {
  try {
    const tab = new URL(url).searchParams.get("tab")?.toLocaleLowerCase("fr-FR") ?? ""
    if (tab.includes("bons-achat") || tab.includes("bon-achat")) return "purchase"
    if (tab.includes("reduction")) return "discount"
  } catch {
    // A malformed or legacy URL is kept in the fallback collection.
  }
  return "unknown"
}

function normalizeStoredAnalyses(value: unknown): StoredAnalyses {
  if (!value || typeof value !== "object") return {}
  if ("coupons" in value) {
    const legacy = value as CouponAnalysis
    return { [couponSourceFromUrl(legacy.diagnostics?.url ?? "")]: legacy }
  }
  return value as StoredAnalyses
}

function mergeAnalyses(analyses: StoredAnalyses): CouponAnalysis | null {
  const entries = Object.entries(analyses) as Array<[CouponSourceList, CouponAnalysis]>
  if (entries.length === 0) return null

  const coupons = entries.flatMap(([source, analysis]) =>
    analysis.coupons.map((coupon) => ({ ...coupon, sourceList: source }))
  )
  const groups = groupCoupons(coupons)
  const latest = entries
    .map(([, analysis]) => analysis.diagnostics)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]

  return {
    coupons,
    groups,
    stats: computeStats(coupons, groups),
    diagnostics: {
      ...latest,
      candidateCount: entries.reduce((sum, [, analysis]) => sum + analysis.diagnostics.candidateCount, 0),
      parsedCount: coupons.length,
      strategy: entries.map(([source, analysis]) => `${source}: ${analysis.diagnostics.strategy}`).join(" | "),
      message: undefined
    }
  }
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
