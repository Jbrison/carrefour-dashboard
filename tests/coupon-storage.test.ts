import { describe, expect, it } from "vitest"
import { couponSourceFromUrl } from "../src/storage/coupon-storage"

describe("couponSourceFromUrl", () => {
  it("distinguishes both Carrefour coupon tabs", () => {
    expect(couponSourceFromUrl("https://www.carrefour.fr/mon-compte/fidelite/mes-coupons?tab=bons-achat")).toBe("purchase")
    expect(couponSourceFromUrl("https://www.carrefour.fr/mon-compte/fidelite/mes-coupons?tab=bons-reduction")).toBe("discount")
    expect(couponSourceFromUrl("https://www.carrefour.fr/mon-compte/fidelite/mes-coupons?tab=bons-de-reduction")).toBe("discount")
  })

  it("keeps an unknown fallback for legacy URLs", () => {
    expect(couponSourceFromUrl("https://www.carrefour.fr/mon-compte/fidelite/mes-coupons")).toBe("unknown")
  })
})
