import type { CouponGroup as CouponGroupType } from "../lib/coupon-types"
import { formatExpirationLabel } from "../lib/date-parser"

export function CouponGroup({ group }: { group: CouponGroupType }) {
  const coupon = group.representative
  const expirations = expirationCounts(group)

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
      {expirations.length > 0 && (
        <div className="expirations">
          <strong>Expiration :</strong>
          {expirations.map(([date, count]) => (
            <span key={date}>{formatExpirationLabel(date)} ×{count}</span>
          ))}
        </div>
      )}
      {coupon.conditions && <p className="conditions">{coupon.conditions}</p>}
    </article>
  )
}

function expirationCounts(group: CouponGroupType): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const coupon of group.coupons) {
    if (!coupon.expirationDate) continue
    counts.set(coupon.expirationDate, (counts.get(coupon.expirationDate) ?? 0) + 1)
  }
  return Array.from(counts.entries())
}
