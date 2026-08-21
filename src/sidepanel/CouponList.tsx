import type { CouponGroup as CouponGroupType } from "../lib/coupon-types"
import { CouponGroup } from "./CouponGroup"

export function CouponList({ groups }: { groups: CouponGroupType[] }) {
  if (groups.length === 0) {
    return <p className="muted">Aucun groupe ne correspond aux filtres.</p>
  }

  return (
    <section className="list" aria-label="Groupes de coupons">
      {groups.map((group) => (
        <CouponGroup key={group.key} group={group} />
      ))}
    </section>
  )
}
