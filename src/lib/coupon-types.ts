export interface CarrefourCoupon {
  id?: string
  title: string
  brand?: string
  product?: string
  discountText?: string
  discountValue?: number
  discountType?: "percent" | "amount" | "other"
  conditions?: string
  expirationDate?: string
  rawText: string
}

export interface CouponGroup {
  key: string
  representative: CarrefourCoupon
  coupons: CarrefourCoupon[]
  count: number
}

export interface CouponStats {
  totalCoupons: number
  uniqueOffers: number
  duplicateGroups: number
  maxCopies: number
  expiringWithin7Days: number
  potentialNominalSavings?: number
}

export interface CouponAnalysis {
  coupons: CarrefourCoupon[]
  groups: CouponGroup[]
  stats: CouponStats
  diagnostics: CouponDiagnostics
}

export interface CouponDiagnostics {
  url: string
  candidateCount: number
  parsedCount: number
  strategy: string
  updatedAt: string
  message?: string
}
