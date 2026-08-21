import type { CarrefourCoupon, CouponBenefitType } from "./coupon-types"

export function detectCouponBenefitType(text: string): CouponBenefitType | undefined {
  if (/\bd['’]\s*[ée]conomies\b/i.test(text)) return "wallet"
  if (/\bde\s+remise\b/i.test(text)) return "immediate"
  return undefined
}

export function couponBenefitType(coupon: CarrefourCoupon): CouponBenefitType | undefined {
  return coupon.benefitType ?? detectCouponBenefitType(`${coupon.discountText ?? ""} ${coupon.rawText}`)
}

export function couponBenefitLabel(type?: CouponBenefitType): string {
  if (type === "wallet") return "Cagnotte"
  if (type === "immediate") return "Remise immédiate"
  return "Type non identifié"
}
