import type { CarrefourCoupon } from "./coupon-types"

export function formatCouponValue(coupon: CarrefourCoupon): string {
  if (coupon.discountValue === undefined) return coupon.discountText || "Valeur non identifiée"
  if (coupon.discountType === "amount") return `${formatNumber(coupon.discountValue)} €`
  if (coupon.discountType === "percent") return `${formatNumber(coupon.discountValue)} %`
  return coupon.discountText || formatNumber(coupon.discountValue)
}

export function totalCouponValue(coupons: CarrefourCoupon[]): string | null {
  const valued = coupons.filter((coupon) => coupon.discountValue !== undefined)
  if (valued.length !== coupons.length || valued.length === 0) return null

  const type = valued[0].discountType
  if ((type !== "amount" && type !== "percent") || valued.some((coupon) => coupon.discountType !== type)) return null

  const total = valued.reduce((sum, coupon) => sum + (coupon.discountValue ?? 0), 0)
  return `${formatNumber(total)} ${type === "amount" ? "€" : "%"}`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)
}
