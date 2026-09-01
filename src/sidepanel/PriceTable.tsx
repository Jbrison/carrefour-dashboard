import { useEffect, useMemo, useState } from "react"
import type { CarrefourProductPrice, CouponGroup } from "../lib/coupon-types"
import { priceAfterCoupons } from "../lib/coupon-value"
import { couponBenefitLabel, couponBenefitType } from "../lib/coupon-benefit"
import { loadProductPrices, PRODUCT_PRICES_KEY } from "../storage/product-price-storage"

export function PriceTable({ groups }: { groups: CouponGroup[] }) {
  const [products, setProducts] = useState<CarrefourProductPrice[]>([])
  const [sort, setSort] = useState<PriceTableSort>({ key: "percent", direction: "desc" })
  const [selectedProducts, setSelectedProducts] = useState<Record<string, string>>({})
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

  const rows = useMemo(() => buildRows(groups, products, sort), [groups, products, sort])
  const [benefitFilter, setBenefitFilter] = useState<BenefitFilter>("all")
  const filteredRows = useMemo(
    () => benefitFilter === "all" ? rows : rows.filter((row) => row.benefitType === benefitFilter),
    [benefitFilter, rows]
  )
  const sortHeader = (label: string, key: SortKey) => (
    <th aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button className="sortButton" type="button" onClick={() => setSort((current) => ({
        key,
        direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
      }))}>
        {label}{sortArrow(sort, key)}
      </button>
    </th>
  )
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
      <div className="tableHeader">
        <div className="tableSummary">{filteredRows.length} produit{filteredRows.length > 1 ? "s" : ""} affiché{filteredRows.length > 1 ? "s" : ""} sur {rows.length}</div>
        <label className="tableFilter">
          <span>Type</span>
          <select value={benefitFilter} onChange={(event) => setBenefitFilter(event.target.value as BenefitFilter)}>
            <option value="all">Tout</option>
            <option value="wallet">Cagnotte</option>
            <option value="immediate">Réduction immédiate</option>
          </select>
        </label>
      </div>
      {filteredRows.length === 0 ? <p className="tableNoResult">Aucun produit pour ce type de coupon.</p> : <div className="priceTableScroll">
        <table className="priceTable">
          <thead>
            <tr>
              {sortHeader("Coupon", "groupIndex")}
              {sortHeader("Produit", "product")}
              {sortHeader("Type", "benefitType")}
              {sortHeader("Prix initial", "initialPrice")}
              {sortHeader("Prix remisé", "discountedPrice")}
              {sortHeader("Remise", "saving")}
              {sortHeader("Réduction", "percent")}
              {sortHeader("Lien", "link")}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr className={`couponRow couponRow-${row.groupIndex % 2 === 0 ? "even" : "odd"} ${getRowState(row, selectedProducts)}`} key={`${row.groupKey}-${row.product.ean}`}>
                <td><span className="couponGroupTag">Coupon {row.groupIndex + 1}</span></td>
                <td className="productCell">
                  <button
                    className="productChoice"
                    type="button"
                    aria-pressed={selectedProducts[row.groupKey] === row.product.ean}
                    title={selectedProducts[row.groupKey] === row.product.ean ? "Annuler le choix pour ce coupon" : "Choisir ce produit pour ce coupon"}
                    onClick={() => setSelectedProducts((current) => {
                      const next = { ...current }
                      if (next[row.groupKey] === row.product.ean) delete next[row.groupKey]
                      else next[row.groupKey] = row.product.ean
                      return next
                    })}
                  >
                    <strong>{row.product.name ?? `EAN ${row.product.ean}`}</strong>
                    {selectedProducts[row.groupKey] === row.product.ean && <span className="productOk">OK</span>}
                  </button>
                </td>
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
      </div>}
    </section>
  )
}

type PriceRow = {
  groupKey: string
  groupIndex: number
  product: CarrefourProductPrice
  initialPrice: number
  discountedPrice: number
  saving: number
  percent: number
  benefitType: ReturnType<typeof couponBenefitType>
}

type PriceTableSort = {
  key: SortKey
  direction: "asc" | "desc"
}

type SortKey = "groupIndex" | "product" | "benefitType" | "initialPrice" | "discountedPrice" | "saving" | "percent" | "link"
type BenefitFilter = "all" | "wallet" | "immediate"

function buildRows(groups: CouponGroup[], products: CarrefourProductPrice[], sort: PriceTableSort): PriceRow[] {
  const productsByEan = new Map(products.map((product) => [product.ean, product]))
  const rows = groups.flatMap((group, groupIndex) => groupEans(group).flatMap((ean) => {
    const product = productsByEan.get(ean)
    const initialPrice = product?.regularPrice ?? product?.price
    if (!product || initialPrice === undefined || initialPrice <= 0) return []
    const discountedPrice = priceAfterCoupons(initialPrice, group.coupons)
    const saving = initialPrice - discountedPrice
    return [{
      groupKey: group.key,
      groupIndex,
      product,
      initialPrice,
      discountedPrice,
      saving,
      percent: (saving / initialPrice) * 100,
      benefitType: couponBenefitType(group.representative)
    }]
  }))

  return rows.sort((a, b) => {
    const comparison = compareRows(a, b, sort.key)
    if (comparison !== 0) return sort.direction === "asc" ? comparison : -comparison
    // Keep products attached to the same coupon together when another column is sorted.
    return a.groupIndex - b.groupIndex || a.product.ean.localeCompare(b.product.ean)
  })
}

function compareRows(a: PriceRow, b: PriceRow, key: SortKey): number {
  if (key === "groupIndex") return a.groupIndex - b.groupIndex
  if (key === "product") return (a.product.name ?? a.product.ean).localeCompare(b.product.name ?? b.product.ean, "fr")
  if (key === "benefitType") return benefitTypeSortValue(a.benefitType).localeCompare(benefitTypeSortValue(b.benefitType), "fr")
  if (key === "link") return (a.product.productUrl ?? a.product.searchUrl).localeCompare(b.product.productUrl ?? b.product.searchUrl, "fr")
  if (key === "initialPrice") return a.initialPrice - b.initialPrice
  if (key === "discountedPrice") return a.discountedPrice - b.discountedPrice
  if (key === "saving") return a.saving - b.saving
  return a.percent - b.percent
}

function benefitTypeSortValue(type: PriceRow["benefitType"]): string {
  return type === "immediate" ? "1" : type === "wallet" ? "2" : "3"
}

function getRowState(row: PriceRow, selectedProducts: Record<string, string>): string {
  const selectedEan = selectedProducts[row.groupKey]
  if (!selectedEan) return ""
  return selectedEan === row.product.ean ? "isOk" : "isBlocked"
}

function sortArrow(sort: PriceTableSort, key: SortKey): string {
  return sort.key === key ? (sort.direction === "asc" ? " ↑" : " ↓") : " ↕"
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
