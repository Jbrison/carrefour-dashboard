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

  it("keeps different discounts separate", () => {
    const groups = groupCoupons([
      coupon("-30% Café Carte Noire", "-30%", 30, "percent"),
      coupon("-20% Café Carte Noire", "-20%", 20, "percent")
    ])
    expect(groups).toHaveLength(2)
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
