import { describe, expect, it } from "vitest"
import type { CarrefourCoupon } from "../src/lib/coupon-types"
import { formatCouponValue, totalCouponValue } from "../src/lib/coupon-value"

const coupon = (discountValue: number, discountType: CarrefourCoupon["discountType"] = "amount"): CarrefourCoupon => ({
  title: "Test",
  rawText: "Test",
  discountValue,
  discountType
})

describe("coupon values", () => {
  it("formats each coupon and totals coupons of the same type", () => {
    expect(formatCouponValue(coupon(0.7))).toBe("0,7 €")
    expect(totalCouponValue([coupon(0.7), coupon(1)])).toBe("1,7 €")
    expect(totalCouponValue([coupon(20, "percent"), coupon(30, "percent")])).toBe("50 %")
  })

  it("does not total incompatible values", () => {
    expect(totalCouponValue([coupon(1), coupon(20, "percent")])).toBeNull()
  })
})
