import { describe, expect, it } from "vitest"
import type { CarrefourCoupon } from "../src/lib/coupon-types"
import { couponRequiredQuantity, groupRequiredQuantity } from "../src/lib/coupon-quantity"
import { basketPrice, priceAfterCoupons } from "../src/lib/coupon-value"
import { getCouponSignature } from "../src/lib/coupon-normalizer"
import { similarityScore } from "../src/lib/coupon-scoring"

const coupon = (title: string, conditions?: string): CarrefourCoupon => ({
  title,
  rawText: title,
  conditions,
  discountText: "1,10 €",
  discountValue: 1.1,
  discountType: "amount"
})

describe("coupon required quantity", () => {
  it("reads the quantity from the title or the description", () => {
    expect(couponRequiredQuantity(coupon("1 acheté = 1,10 € d'économies sur Lu Prince"))).toBe(1)
    expect(couponRequiredQuantity(coupon("2 achetés = 1,10 € d'économies sur Lu Prince"))).toBe(2)
    expect(couponRequiredQuantity(coupon("1,10 € d'économies sur Lu Prince", "Offre valable pour l'achat de 2 produits Lu Prince"))).toBe(2)
  })

  it("ignores purchase limits and EAN digits", () => {
    expect(couponRequiredQuantity(coupon("1,10 € sur Lu Prince", "Dans la limite de 4 produits par foyer"))).toBe(1)
    expect(couponRequiredQuantity(coupon("1,10 € sur Lu Prince", "Produits 3017760000109 produits"))).toBe(1)
  })

  it("applies the discount to the price of all the required products", () => {
    const coupons = [coupon("2 achetés = 1,10 € d'économies sur Lu Prince"), coupon("2 achetés = 1,10 € d'économies sur Lu Prince")]
    expect(groupRequiredQuantity(coupons)).toBe(2)
    expect(basketPrice(2, coupons)).toBe(4)
    expect(priceAfterCoupons(basketPrice(2, coupons), coupons)).toBeCloseTo(1.8)
  })

  it("does not group single and multi-product offers together", () => {
    const single = coupon("1 acheté = 1,10 € d'économies sur Lu Prince")
    const double = coupon("2 achetés = 1,10 € d'économies sur Lu Prince")
    expect(getCouponSignature(single)).not.toBe(getCouponSignature(double))
    expect(similarityScore(single, double)).toBe(0)
  })
})
