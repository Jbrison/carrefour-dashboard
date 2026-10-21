import type { CarrefourCoupon } from "./coupon-types"
import { groupRequiredQuantity } from "./coupon-quantity"

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

export function priceAfterCoupons(price: number, coupons: CarrefourCoupon[]): number {
  const valued = coupons.filter((coupon) => coupon.discountValue !== undefined)
  if (valued.length === 0) return price
  const type = valued[0].discountType
  if (valued.some((coupon) => coupon.discountType !== type)) return price
  const totalDiscount = valued.reduce((sum, coupon) => sum + (coupon.discountValue ?? 0), 0)
  if (type === "amount") return Math.max(0, price - totalDiscount)
  if (type === "percent") return Math.max(0, price * (1 - totalDiscount / 100))
  return price
}

/** Price of the products to buy for the coupons to apply, e.g. 2 × unit price for "2 achetés = …". */
export function basketPrice(unitPrice: number, coupons: CarrefourCoupon[]): number {
  return unitPrice * groupRequiredQuantity(coupons)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)
}
