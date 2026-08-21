import type { CarrefourCoupon, CouponGroup, CouponStats } from "./coupon-types"
import { daysUntilExpiration, parseExpirationDate } from "./date-parser"
import { getCouponSignature } from "./coupon-normalizer"
import { SIMILARITY_THRESHOLD, similarityScore } from "./coupon-scoring"

export function groupCoupons(coupons: CarrefourCoupon[], threshold = SIMILARITY_THRESHOLD): CouponGroup[] {
  const groups = new Map<string, CouponGroup>()

  for (const coupon of coupons) {
    const signature = getCouponSignature(coupon)
    const existing = groups.get(signature)
    if (existing) {
      existing.coupons.push(coupon)
      existing.count = existing.coupons.length
    } else {
      groups.set(signature, { key: signature, representative: coupon, coupons: [coupon], count: 1 })
    }
  }

  const merged: CouponGroup[] = []
  for (const group of groups.values()) {
    const similar = merged.find((candidate) => similarityScore(candidate.representative, group.representative) >= threshold)
    if (similar) {
      similar.coupons.push(...group.coupons)
      similar.count = similar.coupons.length
    } else {
      merged.push(group)
    }
  }

  return merged.sort(compareGroups)
}

export function computeStats(coupons: CarrefourCoupon[], groups: CouponGroup[], now = new Date()): CouponStats {
  const expiringWithin7Days = coupons.filter((coupon) => {
    const days = daysUntilExpiration(coupon.expirationDate, now)
    return days !== null && days >= 0 && days <= 7
  }).length

  const potentialNominalSavings = coupons.reduce((sum, coupon) => {
    if (coupon.discountType !== "amount" || coupon.discountValue === undefined) return sum
    return sum + coupon.discountValue
  }, 0)

  return {
    totalCoupons: coupons.length,
    uniqueOffers: groups.length,
    duplicateGroups: groups.filter((group) => group.count > 1).length,
    maxCopies: Math.max(0, ...groups.map((group) => group.count)),
    expiringWithin7Days,
    potentialNominalSavings: potentialNominalSavings > 0 ? potentialNominalSavings : undefined
  }
}

function compareGroups(a: CouponGroup, b: CouponGroup): number {
  if (b.count !== a.count) return b.count - a.count
  return firstExpirationTime(a) - firstExpirationTime(b)
}

function firstExpirationTime(group: CouponGroup): number {
  const times = group.coupons
    .map((coupon) => (coupon.expirationDate ? parseExpirationDate(coupon.expirationDate)?.getTime() : undefined))
    .filter((time): time is number => time !== undefined)
  return Math.min(...times, Number.POSITIVE_INFINITY)
}
