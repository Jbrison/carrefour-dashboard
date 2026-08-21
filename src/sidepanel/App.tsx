import { ExternalLink, RefreshCw, RotateCcw, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { CouponAnalysis, CouponGroup } from "../lib/coupon-types"
import { daysUntilExpiration, parseExpirationDate } from "../lib/date-parser"
import { clearCoupons, emptyDiagnostics, loadCoupons, loadPreferences, savePreferences, type CouponPreferences } from "../storage/coupon-storage"
import { CouponList } from "./CouponList"

const isDevelopment = import.meta.env.DEV
const CARREFOUR_COUPONS_URL = "https://www.carrefour.fr/mon-compte/fidelite/mes-coupons"

export function App() {
  const [analysis, setAnalysis] = useState<CouponAnalysis | null>(null)
  const [preferences, setPreferences] = useState<CouponPreferences>({
    query: "",
    onlyMultiples: false,
    tab: "all",
    sort: "count"
  })
  const [isLoading, setIsLoading] = useState(true)
  const [savingsPercentByGroup, setSavingsPercentByGroup] = useState<Record<string, number>>({})

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
    void clearCoupons().then(() => setAnalysis(null))
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

      <div className="tabs">
        <button className={preferences.tab === "all" ? "active" : ""} type="button" onClick={() => updatePreferences({ tab: "all" })}>Tous</button>
        <button className={preferences.tab === "multiples" ? "active" : ""} type="button" onClick={() => updatePreferences({ tab: "multiples" })}>Multiples</button>
        <button className={preferences.tab === "expiring" ? "active" : ""} type="button" onClick={() => updatePreferences({ tab: "expiring" })}>Expirent bientôt</button>
      </div>

      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input value={preferences.query} onChange={(event) => updatePreferences({ query: event.target.value })} placeholder="Rechercher" />
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={preferences.onlyMultiples}
            onChange={(event) => updatePreferences({ onlyMultiples: event.target.checked })}
          />
          multiples
        </label>
        <select value={preferences.sort} onChange={(event) => updatePreferences({ sort: event.target.value as CouponPreferences["sort"] })}>
          <option value="count">Tri par nombre</option>
          <option value="expiration">Tri par expiration</option>
          <option value="savingsPercent">Tri par % de réduction</option>
        </select>
      </div>

      <CouponList
        groups={groups}
        onSavingsPercent={(groupKey, percent) => setSavingsPercentByGroup((current) => ({ ...current, [groupKey]: percent }))}
      />

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
      if (preferences.onlyMultiples || preferences.tab === "multiples") return group.count > 1
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

function firstExpiration(group: CouponGroup): number {
  const times = group.coupons
    .map((coupon) => (coupon.expirationDate ? parseExpirationDate(coupon.expirationDate)?.getTime() : undefined))
    .filter((time): time is number => time !== undefined)
  return Math.min(...times, Number.POSITIVE_INFINITY)
}
