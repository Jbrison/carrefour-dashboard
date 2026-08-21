import type { CouponGroup as CouponGroupType } from "../lib/coupon-types"
import { formatExpirationLabel } from "../lib/date-parser"
import { formatCouponValue, totalCouponValue } from "../lib/coupon-value"
import { useState } from "react"

export function CouponGroup({ group }: { group: CouponGroupType }) {
  const coupon = group.representative
  const expirations = expirationCounts(group)
  const sources = sourceCounts(group)
  const [isOpen, setIsOpen] = useState(false)
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
      {coupon.conditions && <p className="conditions">{coupon.conditions}</p>}
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
