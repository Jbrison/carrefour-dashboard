import { describe, expect, it } from "vitest"
import fixture from "./fixtures/carrefour-coupons.html?raw"
import { parseCoupon, parseDiscount } from "../src/content/coupon-parser"

describe("parseDiscount", () => {
  it("parses percent and amount discounts", () => {
    expect(parseDiscount("-30 % Café")?.discountValue).toBe(30)
    expect(parseDiscount("-30 % Café")?.discountType).toBe("percent")
    expect(parseDiscount("2 € sur Ariel")?.discountType).toBe("amount")
  })
})

describe("parseCoupon", () => {
  it("keeps coupons even when some fields are missing", () => {
    document.body.innerHTML = fixture
    const element = document.querySelector<HTMLElement>("[data-coupon-id='a1']")
    expect(element).not.toBeNull()
    const coupon = parseCoupon(element as HTMLElement)
    expect(coupon?.title).toContain("Café Carte Noire")
    expect(coupon?.discountType).toBe("percent")
    expect(coupon?.expirationDate).toContain("12/08/2026")
  })

  it("parses the current Carrefour coupon-card structure", () => {
    document.body.innerHTML = fixture
    const element = document.querySelector<HTMLElement>("[data-coupon-id='nutella']")
    expect(element).not.toBeNull()
    const coupon = parseCoupon(element as HTMLElement)

    expect(coupon?.discountValue).toBe(0.6)
    expect(coupon?.discountType).toBe("amount")
    expect(coupon?.discountText).toContain("0,60 €")
    expect(coupon?.expirationDate).toContain("Jusqu'au 31 août")
    expect(coupon?.product).toContain("Nutella Biscuits")
    expect(coupon?.title).toContain("Nutella Biscuits")
    expect(coupon?.title).not.toContain("0,60 €")
  })
})
