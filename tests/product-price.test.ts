import { describe, expect, it } from "vitest"
import { carrefourSearchUrl, parseCarrefourProductPage } from "../src/lib/product-price"

describe("Carrefour product price parsing", () => {
  it("finds an EAN and its base and promotional prices in JSON-LD", () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"Product","gtin13":"8001665725750","name":"Girasoli Rana 250 g","url":"/p/test",
         "offers":{"price":2.49,"regularPrice":3.15}}
      </script>`
    const product = parseCarrefourProductPage(html, "8001665725750")
    expect(product.status).toBe("found")
    expect(product.name).toBe("Girasoli Rana 250 g")
    expect(product.price).toBe(2.49)
    expect(product.regularPrice).toBe(3.15)
    expect(product.promotional).toBe(true)
    expect(product.productUrl).toBe("https://www.carrefour.fr/p/test")
  })

  it("provides a usable Carrefour search fallback", () => {
    const product = parseCarrefourProductPage("<html></html>", "8001665725750")
    expect(product.status).toBe("not-found")
    expect(product.searchUrl).toBe(carrefourSearchUrl("8001665725750"))
  })

  it("reads the split price from the real Carrefour PLP card structure", () => {
    const html = `
      <article data-testid="8001665725750" class="product-list-card-plp-grid-new">
        <img src="https://media.carrefour.fr/rana.png">
        <a href="/p/ravioli-rana-8001665725750">
          <p class="product-card-title__text product-card-title__text--reduced-line-clamp">
            Pâtes fraîches Ravioli Cèpes, Champignons rôtis &amp; Ricotta RANA
          </p>
        </a>
        <div data-testid="product-price__amount--main" class="product-price__amount product-price__amount--main">
          <p> 3 </p><p> ,75 </p><p> € </p>
        </div>
      </article>`
    const product = parseCarrefourProductPage(html, "8001665725750")
    expect(product.status).toBe("found")
    expect(product.price).toBe(3.75)
    expect(product.name).toContain("Ravioli Cèpes")
    expect(product.productUrl).toBe("https://www.carrefour.fr/p/ravioli-rana-8001665725750")
  })
})
