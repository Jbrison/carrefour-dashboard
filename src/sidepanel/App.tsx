import { ExternalLink, RefreshCw, RotateCcw, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { CouponAnalysis, CouponGroup } from "../lib/coupon-types"
import { daysUntilExpiration, parseExpirationDate } from "../lib/date-parser"
import { priceAfterCoupons } from "../lib/coupon-value"
import { clearCoupons, emptyDiagnostics, loadCoupons, loadPreferences, savePreferences, type CouponPreferences } from "../storage/coupon-storage"
import { clearProductPrices, loadProductPrices, saveProductPrices } from "../storage/product-price-storage"
import type { CarrefourProductPrice } from "../lib/coupon-types"
import { CouponList } from "./CouponList"
import { PriceTable } from "./PriceTable"

const isDevelopment = import.meta.env.DEV
const CARREFOUR_COUPONS_URL = "https://www.carrefour.fr/mon-compte/fidelite/mes-coupons"

export function App() {
  const [analysis, setAnalysis] = useState<CouponAnalysis | null>(null)
  const [preferences, setPreferences] = useState<CouponPreferences>({
    query: "",
    tab: "all",
    sort: "count"
  })
  const [isLoading, setIsLoading] = useState(true)
  const [savingsPercentByGroup, setSavingsPercentByGroup] = useState<Record<string, number>>({})
  const [isCalculatingAll, setIsCalculatingAll] = useState(false)
  const [calculateAllMessage, setCalculateAllMessage] = useState<string | null>(null)
  const [calculationProgress, setCalculationProgress] = useState<{ completed: number; total: number; stage: string } | null>(null)
  const [view, setView] = useState<"coupons" | "table">("coupons")

  useEffect(() => {
    void Promise.all([loadCoupons(), loadPreferences()]).then(([storedAnalysis, storedPreferences]) => {
      setAnalysis(storedAnalysis)
      setPreferences(storedPreferences)
      setIsLoading(false)
    })
  }, [])

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === "local" && changes.carrefourCouponAnalysis) {
        void loadCoupons().then(setAnalysis)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const groups = useMemo(
    () => filterGroups(analysis?.groups ?? [], preferences, savingsPercentByGroup),
    [analysis?.groups, preferences, savingsPercentByGroup]
  )
  const diagnostics = analysis?.diagnostics ?? emptyDiagnostics("Aucune analyse disponible.")

  const updatePreferences = (patch: Partial<CouponPreferences>) => {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    void savePreferences(next)
  }

  const rescan = () => {
    chrome.tabs?.query?.({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return
      void chrome.tabs.sendMessage(tab.id, { type: "RESCAN_COUPONS" })
    })
  }

  const resetCoupons = () => {
    if (!window.confirm("Réinitialiser toutes les listes de coupons enregistrées ?")) return
    void Promise.all([clearCoupons(), clearProductPrices()]).then(() => {
      setAnalysis(null)
      setSavingsPercentByGroup({})
    })
  }

  const calculateAllDiscounts = async () => {
    const multipleGroups = (analysis?.groups ?? []).filter((group) => group.count > 1)
    const eans = Array.from(new Set(multipleGroups.flatMap(groupEans)))
    if (eans.length === 0) {
      setCalculateAllMessage("Aucun EAN dans les coupons multiples.")
      return
    }

    setIsCalculatingAll(true)
    setCalculateAllMessage(null)
    setCalculationProgress({ completed: 0, total: eans.length, stage: "Lecture des prix mémorisés" })
    try {
      const cachedProducts = await loadProductPrices(eans)
      const cachedEans = new Set(cachedProducts.map((product) => product.ean))
      const missingEans = eans.filter((ean) => !cachedEans.has(ean))
      const products: CarrefourProductPrice[] = [...cachedProducts]
      setCalculationProgress({
        completed: cachedProducts.length,
        total: eans.length,
        stage: missingEans.length > 0 ? `Recherche Carrefour · ${cachedProducts.length} en cache` : "Tous les prix sont en cache"
      })

      for (let index = 0; index < missingEans.length; index += 16) {
        const batch = missingEans.slice(index, index + 16)
        const response: unknown = await chrome.runtime.sendMessage({
          type: "LOOKUP_EAN_PRICES",
          eans: batch
        })
        if (!Array.isArray(response)) throw new Error("Réponse invalide")
        products.push(...response as CarrefourProductPrice[])
        setCalculationProgress({
          completed: cachedProducts.length + Math.min(index + batch.length, missingEans.length),
          total: eans.length,
          stage: cachedProducts.length > 0 ? `Recherche Carrefour · ${cachedProducts.length} en cache` : "Recherche des prix Carrefour"
        })
      }
      setCalculationProgress({ completed: eans.length, total: eans.length, stage: "Enregistrement des prix" })
      await saveProductPrices(products)
      setCalculationProgress({ completed: eans.length, total: eans.length, stage: "Calcul des réductions" })
      const productsByEan = new Map(products.map((product) => [product.ean, product]))
      setSavingsPercentByGroup((current) => {
        const next = { ...current }
        for (const group of multipleGroups) {
          const candidates = groupEans(group)
            .map((ean) => productsByEan.get(ean))
            .filter((product): product is CarrefourProductPrice => product?.price !== undefined || product?.regularPrice !== undefined)
          const best = candidates.sort((a, b) => discountedPrice(a, group) - discountedPrice(b, group))[0]
          const basePrice = best ? best.regularPrice ?? best.price : undefined
          if (basePrice !== undefined && basePrice > 0) {
            next[group.key] = ((basePrice - priceAfterCoupons(basePrice, group.coupons)) / basePrice) * 100
          }
        }
        return next
      })
      const failures = products.filter((product) => product.status === "error").length
      setCalculateAllMessage(failures > 0
        ? `${products.length - failures}/${products.length} prix recherchés ; ${failures} recherche(s) indisponible(s).`
        : `${products.length} prix Carrefour enregistrés.`)
    } catch {
      setCalculateAllMessage("Le calcul global des réductions a échoué.")
    } finally {
      setIsCalculatingAll(false)
      setCalculationProgress(null)
    }
  }

  if (isLoading) return <main className="panel"><p>Chargement...</p></main>

  return (
    <main className="panel">
      <header className="header">
        <div>
          <h1>Optimiseur Carrefour</h1>
          <p>
            {analysis?.stats.totalCoupons ?? 0} coupons détectés · {analysis?.stats.uniqueOffers ?? 0} offres uniques ·{" "}
            {analysis?.stats.duplicateGroups ?? 0} offres avec plusieurs coupons
          </p>
        </div>
        <div className="headerActions">
          <button className="iconButton" type="button" title="Relancer l'analyse" aria-label="Relancer l'analyse" onClick={rescan}>
            <RefreshCw size={18} />
          </button>
          <button className="iconButton dangerButton" type="button" title="Réinitialiser toutes les listes" aria-label="Réinitialiser toutes les listes" onClick={resetCoupons}>
            <RotateCcw size={18} />
          </button>
          <a className="siteButton" href={CARREFOUR_COUPONS_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Site Carrefour
          </a>
        </div>
      </header>

      <nav className="viewTabs" aria-label="Mode d’affichage">
        <button className={view === "coupons" ? "active" : ""} type="button" onClick={() => setView("coupons")}>Vue coupons</button>
        <button className={view === "table" ? "active" : ""} type="button" onClick={() => setView("table")}>Vue tableau</button>
      </nav>

      {analysis?.stats.totalCoupons ? (
        <section className="stats" aria-label="Statistiques">
          <Stat label="Groupes multiples" value={analysis.stats.duplicateGroups} />
          <Stat label="Max exemplaires" value={analysis.stats.maxCopies} />
          <Stat label="Dans 7 jours" value={analysis.stats.expiringWithin7Days} />
          {analysis.stats.potentialNominalSavings !== undefined && (
            <Stat label="Valeur nominale potentielle" value={`${analysis.stats.potentialNominalSavings.toFixed(2)} €`} />
          )}
        </section>
      ) : (
        <section className="empty">
          <h2>Aucun coupon détecté.</h2>
          <p>La structure de la page Carrefour a peut-être changé.</p>
          <button type="button" onClick={rescan}>Relancer l’analyse</button>
        </section>
      )}

      {view === "coupons" && <div className="tabs">
        <button className={preferences.tab === "all" ? "active" : ""} type="button" onClick={() => updatePreferences({ tab: "all" })}>Tous</button>
        <button className={preferences.tab === "multiples" ? "active" : ""} type="button" onClick={() => updatePreferences({ tab: "multiples" })}>Multiples</button>
        <button className={preferences.tab === "expiring" ? "active" : ""} type="button" onClick={() => updatePreferences({ tab: "expiring" })}>Expirent bientôt</button>
      </div>}

      <div className={view === "coupons" ? "toolbar" : "toolbar tableToolbar"}>
        {view === "coupons" && <>
        <label className="search">
          <Search size={16} />
          <input value={preferences.query} onChange={(event) => updatePreferences({ query: event.target.value })} placeholder="Rechercher" />
        </label>
        </>}
        <button className="calculateAllButton" type="button" disabled={isCalculatingAll} onClick={() => void calculateAllDiscounts()}>
          {isCalculatingAll ? "Calcul en cours…" : "Calculer toutes les réductions"}
        </button>
        {view === "coupons" && <select value={preferences.sort} onChange={(event) => updatePreferences({ sort: event.target.value as CouponPreferences["sort"] })}>
          <option value="count">Tri par nombre</option>
          <option value="expiration">Tri par expiration</option>
          <option value="savingsPercent">Tri par % de réduction</option>
        </select>}
      </div>
      {calculationProgress && (
        <div className="calculationProgress" aria-live="polite">
          <div>
            <strong>{calculationProgress.stage}</strong>
            <span>{calculationProgress.completed} / {calculationProgress.total}</span>
          </div>
          <progress value={calculationProgress.completed} max={calculationProgress.total} />
        </div>
      )}
      {calculateAllMessage && <p className="calculateAllMessage" role="status">{calculateAllMessage}</p>}

      {view === "coupons" ? (
        <CouponList
          groups={groups}
          onSavingsPercent={(groupKey, percent) => setSavingsPercentByGroup((current) => ({ ...current, [groupKey]: percent }))}
        />
      ) : <PriceTable groups={analysis?.groups ?? []} />}

      {isDevelopment && (
        <section className="debug">
          <h2>Debug</h2>
          <dl>
            <dt>URL</dt><dd>{diagnostics.url || "-"}</dd>
            <dt>Cartes candidates</dt><dd>{diagnostics.candidateCount}</dd>
            <dt>Coupons parsés</dt><dd>{diagnostics.parsedCount}</dd>
            <dt>Stratégie DOM</dt><dd>{diagnostics.strategy}</dd>
          </dl>
        </section>
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function filterGroups(groups: CouponGroup[], preferences: CouponPreferences, savingsPercentByGroup: Record<string, number>): CouponGroup[] {
  const query = preferences.query.trim().toLocaleLowerCase("fr-FR")
  return groups
    .filter((group) => {
      if (preferences.tab === "multiples") return group.count > 1
      if (preferences.tab === "expiring") {
        return group.coupons.some((coupon) => {
          const days = daysUntilExpiration(coupon.expirationDate)
          return days !== null && days >= 0 && days <= 7
        })
      }
      return true
    })
    .filter((group) => !query || `${group.representative.title} ${group.representative.rawText}`.toLocaleLowerCase("fr-FR").includes(query))
    .sort((a, b) => {
      if (preferences.sort === "expiration") return firstExpiration(a) - firstExpiration(b)
      if (preferences.sort === "savingsPercent") {
        const aPercent = savingsPercentByGroup[a.key]
        const bPercent = savingsPercentByGroup[b.key]
        if (aPercent === undefined && bPercent === undefined) return b.count - a.count
        if (aPercent === undefined) return 1
        if (bPercent === undefined) return -1
        return bPercent - aPercent
      }
      return b.count - a.count
    })
}

function groupEans(group: CouponGroup): string[] {
  return Array.from(new Set(group.coupons.flatMap((coupon) => coupon.eans ?? [])))
}

function discountedPrice(product: CarrefourProductPrice, group: CouponGroup): number {
  const price = product.regularPrice ?? product.price
  return price === undefined ? Number.POSITIVE_INFINITY : priceAfterCoupons(price, group.coupons)
}

function firstExpiration(group: CouponGroup): number {
  const times = group.coupons
    .map((coupon) => (coupon.expirationDate ? parseExpirationDate(coupon.expirationDate)?.getTime() : undefined))
    .filter((time): time is number => time !== undefined)
  return Math.min(...times, Number.POSITIVE_INFINITY)
}
