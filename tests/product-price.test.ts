import { describe, expect, it } from "vitest"
import { carrefourAutocompleteUrl, carrefourSearchUrl, parseCarrefourAutocomplete, parseCarrefourProductPage } from "../src/lib/product-price"

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

  it("reads the exact autocomplete product and offer structure", () => {
    const payload = { data: { products: [{
      attributes: {
        ean: "3327272107259",
        title: "Beurre de Cacahuètes creamy MENGUY'S",
        images: { paths: ["https://media.carrefour.fr/product.png"] },
        offers: { "3327272107259": { "8066-150-2225": { attributes: {
          price: { price: 4.2 },
          promotion: { messageArgs: { initialPrice: 5.63 } }
        } } } }
      },
      links: { self: "/p/beurre-de-cacahuetes-creamy-menguy-s-3327272107259" }
    }] } }

    const product = parseCarrefourAutocomplete(payload, "3327272107259")
    expect(product).toMatchObject({
      status: "found",
      name: "Beurre de Cacahuètes creamy MENGUY'S",
      price: 4.2,
      regularPrice: 5.63,
      promotional: true,
      imageUrl: "https://media.carrefour.fr/product.png",
      productUrl: "https://www.carrefour.fr/p/beurre-de-cacahuetes-creamy-menguy-s-3327272107259"
    })
  })

  it("treats an empty autocomplete product list as a definitive miss", () => {
    const product = parseCarrefourAutocomplete({ data: { products: [] } }, "3327272107259")
    expect(product.status).toBe("not-found")
    expect(product.price).toBeUndefined()
  })

  it("builds the autocomplete URL without session secrets", () => {
    expect(carrefourAutocompleteUrl("3327272107259")).toBe(
      "https://www.carrefour.fr/autocomplete?q=3327272107259&maxResults=4&productCard=true"
    )
  })
})
