import { beforeEach, describe, expect, it } from "vitest"
import { couponCountFromTabTitle, expectedCouponCount, isCouponListComplete } from "../src/content/coupon-tab-count"

describe("coupon tab count", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div role="tab">Bons d'achat (12)</div>
      <div role="tab">Bons de réduction ( 7 )</div>
    `
  })

  it("reads both Carrefour tab titles", () => {
    expect(couponCountFromTabTitle("Bons d’achat (12)")).toBe(12)
    expect(couponCountFromTabTitle("Bons de réduction ( 7 )")).toBe(7)
  })

  it("finds the expected count for the current coupon source", () => {
    expect(expectedCouponCount("purchase")).toBe(12)
    expect(expectedCouponCount("discount")).toBe(7)
  })

  it("only considers a list complete when detected and displayed counts match", () => {
    expect(isCouponListComplete(12, "purchase")).toBe(true)
    expect(isCouponListComplete(11, "purchase")).toBe(false)
    expect(isCouponListComplete(7, "discount")).toBe(true)
  })
})
