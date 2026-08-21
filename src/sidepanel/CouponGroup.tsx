import type { CarrefourProductPrice, CouponGroup as CouponGroupType } from "../lib/coupon-types"
import { formatExpirationLabel } from "../lib/date-parser"
import { formatCouponValue, totalCouponValue } from "../lib/coupon-value"
import { carrefourSearchUrl } from "../lib/product-price"
import { useState } from "react"

export function CouponGroup({ group }: { group: CouponGroupType }) {
  const coupon = group.representative
  const expirations = expirationCounts(group)
  const sources = sourceCounts(group)
  const [isOpen, setIsOpen] = useState(false)
  const [prices, setPrices] = useState<CarrefourProductPrice[] | null>(null)
  const [isLoadingPrices, setIsLoadingPrices] = useState(false)
  const total = totalCouponValue(group.coupons)

  return (
    <article className={group.count > 1 ? "couponGroup multiple" : "couponGroup"}>
      <div className="groupHeader">
        <div>
          <h2>{coupon.product || coupon.title}</h2>
          <p>{coupon.discountText || "Remise non identifiée"}</p>
        </div>
        <span className="badge">×{group.count}</span>
      </div>
      <p className="muted">{group.count} coupon{group.count > 1 ? "s similaires" : " similaire"}</p>
      {group.count > 1 && (
        <div className="valueSummary">
          <span>Valeur unitaire : <strong>{formatCouponValue(coupon)}</strong></span>
          <span>Valeur totale : <strong>{total ?? "non calculable"}</strong></span>
        </div>
      )}
      {sources.length > 0 && (
        <div className="sources" aria-label="Origine des coupons">
          {sources.map(([source, count]) => <span key={source}>{sourceLabel(source)} ×{count}</span>)}
        </div>
      )}
      {expirations.length > 0 && (
        <div className="expirations">
          <strong>Expiration :</strong>
          {expirations.map(([date, count]) => (
            <span key={date}>{formatExpirationLabel(date)} ×{count}</span>
          ))}
        </div>
      )}
      {groupEans(group).length > 0 ? (
        <div className="eanLinks" aria-label="Références EAN admissibles">
          <strong>EAN :</strong>
          {groupEans(group).map((ean) => (
            <a key={ean} href={carrefourSearchUrl(ean)} target="_blank" rel="noreferrer">{ean}</a>
          ))}
        </div>
      ) : coupon.conditions ? <p className="conditions">{coupon.conditions}</p> : null}
      {groupEans(group).length > 0 && (
        <div className="priceComparison">
          <div className="eanSummary">{groupEans(group).length} référence{groupEans(group).length > 1 ? "s" : ""} EAN admissible{groupEans(group).length > 1 ? "s" : ""}</div>
          <button className="priceButton" type="button" disabled={isLoadingPrices} onClick={() => void loadPrices()}>
            {isLoadingPrices ? "Recherche des prix…" : prices ? "Actualiser les prix" : "Comparer les prix Carrefour"}
          </button>
          {prices && <PriceResults products={prices} coupon={coupon} />}
        </div>
      )}
      <button className="detailsButton" type="button" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        {isOpen ? "Masquer les coupons" : "Voir les coupons et leurs photos"}
      </button>
      {isOpen && (
        <div className="couponDetails">
          {group.coupons.map((item, index) => (
            <article className="couponDetail" key={`${item.id ?? item.imageUrl ?? "coupon"}-${index}`}>
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.product || item.title} loading="lazy" />
              ) : (
                <div className="imagePlaceholder">Photo indisponible</div>
              )}
              <div>
                <strong>Coupon {index + 1} · {formatCouponValue(item)}</strong>
                <p>{item.product || item.title}</p>
                {item.sourceList && item.sourceList !== "unknown" && <small>{sourceLabel(item.sourceList)}</small>}
              </div>
            </article>
          ))}
        </div>
      )}
    </article>
  )

  async function loadPrices(): Promise<void> {
    setIsLoadingPrices(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: "LOOKUP_EAN_PRICES", eans: groupEans(group) }) as CarrefourProductPrice[]
      setPrices(response)
    } finally {
      setIsLoadingPrices(false)
    }
  }
}

function PriceResults({ products, coupon }: { products: CarrefourProductPrice[]; coupon: CouponGroupType["representative"] }) {
  const sorted = [...products].sort((a, b) => netPrice(a, coupon) - netPrice(b, coupon))
  return (
    <div className="priceResults">
      {sorted.map((product) => {
        const effectivePrice = product.regularPrice ?? product.price
        const net = effectivePrice === undefined ? undefined : applyDiscount(effectivePrice, coupon)
        return (
          <div className="priceResult" key={product.ean}>
            <div>
              <strong>{product.name ?? `EAN ${product.ean}`}</strong>
              {effectivePrice !== undefined ? (
                <span>{formatPrice(effectivePrice)} → <b>{formatPrice(net ?? effectivePrice)}</b></span>
              ) : <span>Prix non trouvé</span>}
              {product.promotional && <small>Calcul basé sur le prix de base hors promotion</small>}
            </div>
            <a href={product.productUrl ?? product.searchUrl} target="_blank" rel="noreferrer">Voir</a>
          </div>
        )
      })}
    </div>
  )
}

function groupEans(group: CouponGroupType): string[] {
  return Array.from(new Set(group.coupons.flatMap((coupon) => coupon.eans ?? [])))
}

function applyDiscount(price: number, coupon: CouponGroupType["representative"]): number {
  if (coupon.discountValue === undefined) return price
  if (coupon.discountType === "amount") return Math.max(0, price - coupon.discountValue)
  if (coupon.discountType === "percent") return Math.max(0, price * (1 - coupon.discountValue / 100))
  return price
}

function netPrice(product: CarrefourProductPrice, coupon: CouponGroupType["representative"]): number {
  const price = product.regularPrice ?? product.price
  return price === undefined ? Number.POSITIVE_INFINITY : applyDiscount(price, coupon)
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value)
}

function sourceCounts(group: CouponGroupType): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const coupon of group.coupons) {
    if (!coupon.sourceList || coupon.sourceList === "unknown") continue
    counts.set(coupon.sourceList, (counts.get(coupon.sourceList) ?? 0) + 1)
  }
  return Array.from(counts.entries())
}

function sourceLabel(source: string): string {
  return source === "purchase" ? "Bons d’achat" : "Bons de réduction"
}

function expirationCounts(group: CouponGroupType): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const coupon of group.coupons) {
    if (!coupon.expirationDate) continue
    counts.set(coupon.expirationDate, (counts.get(coupon.expirationDate) ?? 0) + 1)
  }
  return Array.from(counts.entries())
}
