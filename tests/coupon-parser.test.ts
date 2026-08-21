import { describe, expect, it } from "vitest"
import fixture from "./fixtures/carrefour-coupons.html?raw"
import { extractEans, parseCoupon, parseDiscount } from "../src/content/coupon-parser"

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
    expect(coupon?.benefitType).toBe("wallet")
    expect(coupon?.discountText).toContain("0,60 €")
    expect(coupon?.expirationDate).toContain("Jusqu'au 31 août")
    expect(coupon?.product).toContain("Nutella Biscuits")
    expect(coupon?.title).toContain("Nutella Biscuits")
    expect(coupon?.title).not.toContain("0,60 €")
    expect(coupon?.imageUrl).toBe("https://example.test/nutella.png")
  })
})

describe("extractEans", () => {
  it("extracts valid unique EAN-13 codes from offer conditions", () => {
    const text = "Réduction valable pour les produits 8001665725750, 8001665726542 et 8001665725750."
    expect(extractEans(text)).toEqual(["8001665725750", "8001665726542"])
  })

  it("rejects arbitrary 13 digit numbers with an invalid check digit", () => {
    expect(extractEans("Produit 8001665725751")).toEqual([])
  })

  it("distinguishes immediate discounts from loyalty wallet savings", () => {
    document.body.innerHTML = `<article class="coupon-card"><h2>Café</h2><div>-30 % de remise</div></article>`
    expect(parseCoupon(document.querySelector("article") as HTMLElement)?.benefitType).toBe("immediate")
  })
})
