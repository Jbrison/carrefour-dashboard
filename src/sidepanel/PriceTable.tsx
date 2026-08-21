import { useEffect, useMemo, useState } from "react"
import type { CarrefourProductPrice, CouponGroup } from "../lib/coupon-types"
import { priceAfterCoupons } from "../lib/coupon-value"
import { couponBenefitLabel, couponBenefitType } from "../lib/coupon-benefit"
import { loadProductPrices, PRODUCT_PRICES_KEY } from "../storage/product-price-storage"

export function PriceTable({ groups }: { groups: CouponGroup[] }) {
  const [products, setProducts] = useState<CarrefourProductPrice[]>([])
  const eans = useMemo(() => Array.from(new Set(groups.flatMap(groupEans))), [groups])
  const eanKey = eans.join(",")

  useEffect(() => {
    let active = true
    const restore = () => void loadProductPrices(eans).then((stored) => {
      if (active) setProducts(stored)
    })
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === "local" && changes[PRODUCT_PRICES_KEY]) restore()
    }
    restore()
    chrome.storage.onChanged.addListener(listener)
    return () => {
      active = false
      chrome.storage.onChanged.removeListener(listener)
    }
  }, [eanKey])

  const rows = useMemo(() => buildRows(groups, products), [groups, products])
  if (rows.length === 0) {
    return (
      <section className="empty tableEmpty">
        <h2>Aucun prix calculé</h2>
        <p>Lance « Calculer toutes les réductions » pour remplir le tableau.</p>
      </section>
    )
  }

  return (
    <section className="priceTableSection" aria-label="Tableau des prix après réduction">
      <div className="tableSummary">{rows.length} produit{rows.length > 1 ? "s" : ""} avec un prix Carrefour</div>
      <div className="priceTableScroll">
        <table className="priceTable">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Type</th>
              <th>Prix initial</th>
              <th>Prix remisé</th>
              <th>Remise</th>
              <th>Réduction</th>
              <th>Lien</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.groupKey}-${row.product.ean}`}>
                <td><strong>{row.product.name ?? `EAN ${row.product.ean}`}</strong></td>
                <td><span className={`benefitBadge ${row.benefitType ?? "unknown"}`}>{couponBenefitLabel(row.benefitType)}</span></td>
                <td>{formatPrice(row.initialPrice)}</td>
                <td className="discountedPrice">{formatPrice(row.discountedPrice)}</td>
                <td>{formatPrice(row.saving)}</td>
                <td className="discountPercent">−{formatPercent(row.percent)}</td>
                <td><a href={row.product.productUrl ?? row.product.searchUrl} target="_blank" rel="noreferrer">Voir</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

type PriceRow = {
  groupKey: string
  product: CarrefourProductPrice
  initialPrice: number
  discountedPrice: number
  saving: number
  percent: number
  benefitType: ReturnType<typeof couponBenefitType>
}

function buildRows(groups: CouponGroup[], products: CarrefourProductPrice[]): PriceRow[] {
  const productsByEan = new Map(products.map((product) => [product.ean, product]))
  return groups.flatMap((group) => groupEans(group).flatMap((ean) => {
    const product = productsByEan.get(ean)
    const initialPrice = product?.regularPrice ?? product?.price
    if (!product || initialPrice === undefined || initialPrice <= 0) return []
    const discountedPrice = priceAfterCoupons(initialPrice, group.coupons)
    const saving = initialPrice - discountedPrice
    return [{
      groupKey: group.key,
      product,
      initialPrice,
      discountedPrice,
      saving,
      percent: (saving / initialPrice) * 100,
      benefitType: couponBenefitType(group.representative)
    }]
  })).sort((a, b) => b.percent - a.percent || b.saving - a.saving)
}

function groupEans(group: CouponGroup): string[] {
  return Array.from(new Set(group.coupons.flatMap((coupon) => coupon.eans ?? [])))
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value)
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value) + " %"
}
