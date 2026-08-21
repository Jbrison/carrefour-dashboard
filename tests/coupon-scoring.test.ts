import { describe, expect, it } from "vitest"
import { similarityScore } from "../src/lib/coupon-scoring"
import type { CarrefourCoupon } from "../src/lib/coupon-types"

describe("similarityScore", () => {
  it("scores wording variations as similar", () => {
    expect(
      similarityScore(
        coupon("30% sur Café Carte Noire", "Carte Noire", "-30%", 30),
        coupon("-30 % sur les cafés Carte Noire", "Carte Noire", "-30 %", 30)
      )
    ).toBeGreaterThan(0.78)
  })

  it("does not merge different brands or discounts", () => {
    expect(similarityScore(coupon("30% café", "Carte Noire", "-30%", 30), coupon("30% café", "Lavazza", "-30%", 30))).toBe(0)
    expect(similarityScore(coupon("30% café", "Carte Noire", "-30%", 30), coupon("20% café", "Carte Noire", "-20%", 20))).toBe(0)
  })

  it("does not score same-amount Carrefour coupons as similar when names differ", () => {
    const score = similarityScore(
      amountCoupon("à valoir sur l'achat d'un paquet de Nutella Biscuits", "0,60 €", 0.6),
      amountCoupon("à valoir sur l'achat d'une tablette de chocolat Ferrero Rocher ou Raffaello", "0,60 €", 0.6)
    )

    expect(score).toBeLessThan(0.78)
  })
})

function coupon(title: string, brand: string, discountText: string, discountValue: number): CarrefourCoupon {
  return {
    title,
    brand,
    product: title,
    discountText,
    discountValue,
    discountType: "percent",
    rawText: title
  }
}

function amountCoupon(title: string, discountText: string, discountValue: number): CarrefourCoupon {
  return {
    title,
    product: title,
    discountText,
    discountValue,
    discountType: "amount",
    rawText: `${discountText} ${title}`
  }
}
