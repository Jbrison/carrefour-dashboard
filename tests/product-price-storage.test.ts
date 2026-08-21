import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CarrefourProductPrice } from "../src/lib/coupon-types"
import { clearProductPrices, loadProductPrices, saveProductPrices } from "../src/storage/product-price-storage"

describe("product price storage", () => {
  const store: Record<string, unknown> = {}

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key]
    vi.stubGlobal("chrome", {
      storage: { local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (values: Record<string, unknown>) => Object.assign(store, values)),
        remove: vi.fn(async (key: string) => { delete store[key] })
      } }
    })
  })

  it("restores prices in the requested EAN order", async () => {
    await saveProductPrices([product("8000500359488", 3.75), product("3327272107259", 4.2)])
    await expect(loadProductPrices(["3327272107259", "8000500359488"])).resolves.toEqual([
      product("3327272107259", 4.2),
      product("8000500359488", 3.75)
    ])
  })

  it("does not persist transient API errors", async () => {
    await saveProductPrices([{ ...product("8000500359488", 3.75), status: "error" }])
    await expect(loadProductPrices(["8000500359488"])).resolves.toEqual([])
  })

  it("clears the cached prices with the coupon data", async () => {
    await saveProductPrices([product("8000500359488", 3.75)])
    await clearProductPrices()
    await expect(loadProductPrices(["8000500359488"])).resolves.toEqual([])
  })
})

function product(ean: string, price: number): CarrefourProductPrice {
  return { ean, price, promotional: false, searchUrl: `https://www.carrefour.fr/s?q=${ean}`, status: "found" }
}
