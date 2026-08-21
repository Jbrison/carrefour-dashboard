export interface CouponSelectorStrategy {
  name: string
  selectors: string[]
}

export const CARREFOUR_COUPON_STRATEGIES: CouponSelectorStrategy[] = [
  {
    name: "carrefour-current-coupon-card",
    selectors: ["article.coupon-card", ".coupon-card"]
  },
  {
    name: "carrefour-data-attributes",
    selectors: [
      "[data-testid*='coupon' i]",
      "[data-test*='coupon' i]",
      "[data-qa*='coupon' i]",
      "[data-testid*='voucher' i]",
      "[data-test*='voucher' i]"
    ]
  },
  {
    name: "carrefour-classnames",
    selectors: [
      "[class*='coupon' i]",
      "[class*='voucher' i]",
      "[class*='fidelity' i]",
      "[class*='fidelite' i]",
      "[class*='loyalty' i]"
    ]
  },
  {
    name: "semantic-cards",
    selectors: ["article", "li", "[role='listitem']", "[class*='card' i]"]
  }
]

export const COUPON_TEXT_PATTERNS = [
  /(?:-|−)?\d+(?:[,.]\d+)?\s*%/,
  /(?:-|−)?\d+(?:[,.]\d+)?\s*(?:€|euros?|eur)(?=\s|$)/i,
  /\b(?:expire|expiration|valable jusqu|jusqu'au|jusqu’au)\b/i,
  /\b(?:activer|ajouté|ajoute|coupon|remise|économies|economies|offre fidélité|offre fidelite)\b/i
]

export const MIN_COUPON_TEXT_LENGTH = 12
export const MAX_COUPON_TEXT_LENGTH = 1_500
