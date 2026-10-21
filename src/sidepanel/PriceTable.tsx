import { useEffect, useMemo, useState } from "react"
import type { CarrefourProductPrice, CouponGroup } from "../lib/coupon-types"
import { basketPrice, priceAfterCoupons } from "../lib/coupon-value"
import { groupRequiredQuantity } from "../lib/coupon-quantity"
import { couponBenefitLabel, couponBenefitType } from "../lib/coupon-benefit"
import { getCouponSignature } from "../lib/coupon-normalizer"
import { loadProductPrices, PRODUCT_PRICES_KEY } from "../storage/product-price-storage"

const CARREFOUR_COUPONS_URL = "https://www.carrefour.fr/mon-compte/fidelite/mes-coupons"

export function PriceTable({ groups }: { groups: CouponGroup[] }) {
  const [products, setProducts] = useState<CarrefourProductPrice[]>([])
  const [sort, setSort] = useState<PriceTableSort>({ key: "percent", direction: "desc" })
  const [selectedProducts, setSelectedProducts] = useState<Record<string, string>>({})
  const [locateMessage, setLocateMessage] = useState<string | null>(null)
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
  const groupsByKey = useMemo(() => new Map(groups.map((group) => [group.key, group])), [groups])
  const locateCoupon = async (groupKey: string, groupIndex: number, copyIndex: number) => {
    const group = groupsByKey.get(groupKey)
    if (!group) return
    setLocateMessage(null)
    try {
      setLocateMessage(await locateCouponOnPage(group, groupIndex, copyIndex))
    } catch {
      setLocateMessage("Impossible de contacter la page Carrefour. Recharge l’onglet « Mes coupons ».")
    }
  }
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
      {locateMessage && <p className="locateMessage" role="status">{locateMessage}</p>}
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
                <td className="couponCell">
                  <span className="couponGroupTag">Coupon {row.groupIndex + 1}</span>
                  {row.quantity > 1 && <span className="quantityBadge" title={`Remise valable pour l’achat de ${row.quantity} produits`}>{row.quantity} produits</span>}
                  <div className="locateLinks">
                    {groupsByKey.get(row.groupKey)?.coupons.map((coupon, copyIndex) => (
                      <button
                        className="locateButton"
                        type="button"
                        key={copyIndex}
                        title={`Afficher l’exemplaire ${copyIndex + 1}${coupon.sourceList && coupon.sourceList !== "unknown" ? ` (${sourceLabel(coupon.sourceList)})` : ""} sur la page Carrefour pour l’ajouter`}
                        onClick={() => void locateCoupon(row.groupKey, row.groupIndex, copyIndex)}
                      >
                        {copyIndex === 0 ? "Localiser " : ""}{copyIndex + 1}
                      </button>
                    ))}
                  </div>
                </td>
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
                <td>
                  {formatPrice(row.initialPrice)}
                  {row.quantity > 1 && <small className="quantityHint">{row.quantity} × {formatPrice(row.unitPrice)}</small>}
                </td>
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
  quantity: number
  unitPrice: number
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
    const unitPrice = product?.regularPrice ?? product?.price
    if (!product || unitPrice === undefined || unitPrice <= 0) return []
    const quantity = groupRequiredQuantity(group.coupons)
    const initialPrice = basketPrice(unitPrice, group.coupons)
    const discountedPrice = priceAfterCoupons(initialPrice, group.coupons)
    const saving = initialPrice - discountedPrice
    return [{
      groupKey: group.key,
      groupIndex,
      product,
      quantity,
      unitPrice,
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

async function locateCouponOnPage(group: CouponGroup, groupIndex: number, copyIndex: number): Promise<string> {
  const tabs = await chrome.tabs.query({ currentWindow: true, url: `${CARREFOUR_COUPONS_URL}*` })
  const tab = tabs.find((candidate) => candidate.active) ?? tabs[0]
  if (tab?.id === undefined) return "Ouvre la page « Mes coupons » Carrefour pour localiser ce coupon."
  if (!tab.active) await chrome.tabs.update(tab.id, { active: true })
  const coupon = group.coupons[copyIndex]
  const source = coupon.sourceList ?? "unknown"
  // Copies are stored in page order, so the n-th copy of a list is the n-th matching card on that list.
  const occurrence = group.coupons.slice(0, copyIndex).filter((candidate) => (candidate.sourceList ?? "unknown") === source).length
  const signatures = Array.from(new Set(group.coupons.map(getCouponSignature)))
  const result: unknown = await chrome.tabs.sendMessage(tab.id, { type: "LOCATE_COUPON", signatures, source, occurrence })
  if (!isLocateResult(result)) throw new Error("Réponse invalide")
  const label = `Coupon ${groupIndex + 1} · exemplaire ${copyIndex + 1}/${group.coupons.length}`
  const where = source !== "unknown" ? ` (${sourceLabel(source)})` : ""
  return result.found === 0
    ? `${label}${where} introuvable sur la page.`
    : `${label}${where} mis en évidence sur la page.`
}

function sourceLabel(source: "purchase" | "discount"): string {
  return source === "purchase" ? "bons d’achat" : "bons de réduction"
}

function isLocateResult(value: unknown): value is { found: number; source: string } {
  return typeof value === "object" && value !== null &&
    "found" in value && typeof value.found === "number" &&
    "source" in value && typeof value.source === "string"
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
