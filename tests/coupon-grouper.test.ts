import { describe, expect, it } from "vitest"
import type { CarrefourCoupon } from "../src/lib/coupon-types"
import { groupCoupons } from "../src/lib/coupon-grouper"

describe("groupCoupons", () => {
  it("groups equivalent percent coupons", () => {
    const groups = groupCoupons([
      coupon("-30 % Café Carte Noire", "-30 %", 30, "percent", "Expire le 12/08/2026"),
      coupon("-30% Café Carte Noire", "-30%", 30, "percent", "Expire le 19/08/2026")
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
  })

  it("groups different discount amounts for the same product", () => {
    const groups = groupCoupons([
      coupon("-30% Café Carte Noire", "-30%", 30, "percent"),
      coupon("-20% Café Carte Noire", "-20%", 20, "percent")
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
  })

  it("groups Amos wallet coupons coming from different tabs", () => {
    const product = "a valoir sur l'achat d'un paquet de bonbons Amos"
    const groups = groupCoupons([
      { ...coupon("0,40 EUR", "0,40 EUR", 0.4, "amount", "Jusqu'au 31 octobre"), product, benefitType: "wallet", sourceList: "purchase" },
      { ...coupon("0,50 EUR", "0,50 EUR", 0.5, "amount", "Plus que 3 jours"), product, benefitType: "wallet", sourceList: "discount" }
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
  })

  it("groups equivalent euro coupons", () => {
    const groups = groupCoupons([
      coupon("2 € sur Ariel", "2 €", 2, "amount"),
      coupon("2€ sur Ariel", "2€", 2, "amount")
    ])
    expect(groups).toHaveLength(1)
  })

  it("keeps same-amount Carrefour coupons separate when coupon names differ", () => {
    const groups = groupCoupons([
      coupon("à valoir sur l'achat d'un paquet de Nutella Biscuits", "0,60 €", 0.6, "amount"),
      coupon("à valoir sur l'achat d'une tablette de chocolat Ferrero Rocher ou Raffaello", "0,60 €", 0.6, "amount")
    ])

    expect(groups).toHaveLength(2)
  })

  it("groups the same Carrefour product across coupon lists despite different discounts", () => {
    const groups = groupCoupons([
      {
        ...coupon("à valoir sur l'achat d'une boisson Dr Pepper", "0,30 €", 0.3, "amount"),
        benefitType: "immediate",
        sourceList: "purchase"
      },
      {
        ...coupon("à valoir sur l'achat d'une boisson Dr Pepper", "0,40 €", 0.4, "amount"),
        benefitType: "immediate",
        sourceList: "discount"
      }
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
  })

  it("recognizes identical immediate-remise products when list metadata is unavailable", () => {
    const groups = groupCoupons([
      couponWithBenefit("à valoir sur l'achat d'une boisson Dr Pepper", "0,30 €", 0.3),
      couponWithBenefit("à valoir sur l'achat d'une boisson Dr Pepper", "0,40 €", 0.4)
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
  })
})

function coupon(
  title: string,
  discountText: string,
  discountValue: number,
  discountType: CarrefourCoupon["discountType"],
  expirationDate?: string
): CarrefourCoupon {
  return {
    title,
    product: title,
    discountText,
    discountValue,
    discountType,
    expirationDate,
    rawText: [title, expirationDate].filter(Boolean).join(" ")
  }
}

function couponWithBenefit(title: string, discountText: string, discountValue: number): CarrefourCoupon {
  return { ...coupon(title, discountText, discountValue, "amount"), benefitType: "immediate" }
}
