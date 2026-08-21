import { describe, expect, it } from "vitest"
import { getCouponSignature, normalizeCouponNameText, normalizeText } from "../src/lib/coupon-normalizer"

describe("normalizeText", () => {
  it("normalizes accents, spaces and discount formats", () => {
    expect(normalizeText("  -30 % de remise sur Café   Carte Noire !! ")).toBe("-30% sur cafe carte noire")
    expect(normalizeText("2 euros sur Ariel")).toBe("2€ sur ariel")
  })
})

describe("normalizeCouponNameText", () => {
  it("keeps the coupon name and removes Carrefour purchase boilerplate", () => {
    expect(normalizeCouponNameText("à valoir sur l'achat d'un paquet de Nutella Biscuits")).toBe("paquet nutella biscuits")
    expect(normalizeCouponNameText("1 acheté = 0,60 € d'économies à valoir pour l'achat d'une tablette de chocolat Ferrero Rocher ou Raffaello")).toBe(
      "tablette chocolat ferrero rocher ou raffaello"
    )
  })
})

describe("getCouponSignature", () => {
  it("ignores ids and expiration dates", () => {
    const first = getCouponSignature({
      id: "one",
      title: "-30 % Café Carte Noire",
      discountText: "-30 %",
      discountValue: 30,
      discountType: "percent",
      conditions: "Expire le 12/08/2026",
      rawText: "-30 % Café Carte Noire Expire le 12/08/2026"
    })
    const second = getCouponSignature({
      id: "two",
      title: "-30% Café Carte Noire",
      discountText: "-30%",
      discountValue: 30,
      discountType: "percent",
      conditions: "Expire le 19/08/2026",
      rawText: "-30% Café Carte Noire Expire le 19/08/2026"
    })

    expect(first).toBe(second)
  })

  it("uses the coupon name so same amount does not imply same offer", () => {
    const first = getCouponSignature({
      title: "à valoir sur l'achat d'un paquet de Nutella Biscuits",
      product: "à valoir sur l'achat d'un paquet de Nutella Biscuits",
      discountText: "0,60 €",
      discountValue: 0.6,
      discountType: "amount",
      rawText: "Jusqu'au 31 août 0,60 € à valoir sur l'achat d'un paquet de Nutella Biscuits"
    })
    const second = getCouponSignature({
      title: "à valoir sur l'achat d'une tablette de chocolat Ferrero Rocher ou Raffaello",
      product: "à valoir sur l'achat d'une tablette de chocolat Ferrero Rocher ou Raffaello",
      discountText: "0,60 €",
      discountValue: 0.6,
      discountType: "amount",
      rawText: "Jusqu'au 31 août 0,60 € à valoir sur l'achat d'une tablette de chocolat Ferrero Rocher ou Raffaello"
    })

    expect(first).not.toBe(second)
  })

  it("keeps wallet savings separate from immediate discounts", () => {
    const base = {
      title: "Café Carte Noire",
      product: "Café Carte Noire",
      discountText: "1 €",
      discountValue: 1,
      discountType: "amount" as const
    }
    expect(getCouponSignature({ ...base, benefitType: "wallet", rawText: "1 € d'économies" }))
      .not.toBe(getCouponSignature({ ...base, benefitType: "immediate", rawText: "1 € de remise" }))
  })
})
