import { useEffect, useState, useRef, useCallback } from 'react'
import FloodMap from './components/FloodMap'
import AlertBanner from './components/AlertBanner'
import FilterChips from './components/FilterChips'
import './app.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

const STATE_CONFIG = {
  waterlogged: { label: 'Waterlogged', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', icon: '🌊' },
  severe: { label: 'Flooded', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: '🚨' },
  clear: { label: 'Clear', color: '#22c55e', bg: 'rgba(34,197,94,0.15)', icon: '✅' },
  unknown: { label: 'Unknown', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', icon: '❓' },
}
const RISK_COLOR = { low: '#22c55e', medium: '#f59e0b', high: '#f97316' }

// ── Small UI helpers ──────────────────────────────────────────────────────────

function StateBadge({ state }) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.unknown
  return (
    <span className="state-badge" style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.color }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="conf-wrap">
      <div className="conf-bar">
        <div className="conf-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="conf-label" style={{ color }}>{pct}%</span>
    </div>
  )
}

function RiskBadge({ level, risk }) {
  if (!level) return <span>—</span>
  const color = RISK_COLOR[level]
  return (
    <span style={{ color, fontWeight: 600 }}>
      {Math.round((risk || 0) * 100)}% <small style={{ opacity: 0.8 }}>({level})</small>
    </span>
  )
}

function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

// Loading skeleton rows
function SkeletonRows({ count = 5 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="skeleton-row">
          {[1, 2, 3, 4, 5, 6].map((c) => (
            <td key={c}><div className="skeleton-cell" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

// Auto-refresh countdown pill
function RefreshPill({ secondsLeft }) {
  return (
    <span className="refresh-pill" aria-live="polite" aria-label={`Auto-refreshing in ${secondsLeft} seconds`}>
      <span className="refresh-dot" />
      Auto-refresh in {secondsLeft}s
    </span>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [streets, setStreets] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [simulate, setSimulate] = useState(false)
  const [rainInput, setRainInput] = useState(30)
  const [rain, setRain] = useState(30)
  const [rainInfo, setRainInfo] = useState({ value: null, source: null })
  const [riskFilter, setRiskFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [countdown, setCountdown] = useState(30)
  const tableRef = useRef(null)

  // Debounce slider
  useEffect(() => {
    const t = setTimeout(() => setRain(rainInput), 400)
    return () => clearTimeout(t)
  }, [rainInput])

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    setCountdown(30)
    fetch(simulate ? `${API_BASE}/streets?rain=${rain}` : `${API_BASE}/streets`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        setStreets(data.streets || [])
        setRainInfo({ value: data.rain_mm_hr, source: data.rain_source })
        setLastRefresh(new Date())
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [simulate, rain])

  // Auto-refresh every 30 s
  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [fetchData])

  // Countdown ticker
  useEffect(() => {
    const id = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 30)), 1_000)
    return () => clearInterval(id)
  }, [])

  // Scroll + highlight table row when a map pin is clicked
  const handleSelectStreet = useCallback((streetId) => {
    setSelectedId(streetId)
    // If the row is in the table, scroll it into view
    setTimeout(() => {
      const row = tableRef.current?.querySelector(`[data-street-id="${streetId}"]`)
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 200)
  }, [])

  // Clicking a table row -> fly map to that pin
  const handleRowClick = useCallback((streetId) => {
    setSelectedId(streetId)
  }, [])

  // Determine what rain value to use for the flow layer
  const effectiveRain = simulate ? rain : (Number(rainInfo.value) || 0)

  const counts = Object.fromEntries(
    Object.keys(STATE_CONFIG).map((k) => [k, streets.filter((s) => s.state === k).length])
  )
  const highRisk = streets.filter((s) => s.risk_level === 'high').length
  const medRisk = streets.filter((s) => s.risk_level === 'medium').length

  // Filtered streets for the table
  const filteredStreets = riskFilter === 'all'
    ? streets
    : streets.filter((s) => s.risk_level === riskFilter)

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">💧</span>
            <div>
              <h1 className="logo-title">Neerdrishti</h1>
              <p className="logo-sub">Flood Digital Twin · Live Monitor</p>
            </div>
          </div>
          <div className="header-actions">
            <RefreshPill secondsLeft={countdown} />
            {lastRefresh && (
              <span className="refresh-time">Updated {formatTime(lastRefresh.toISOString())}</span>
            )}
            <button className="btn-refresh" id="btn-refresh" onClick={fetchData} disabled={loading}
              aria-label="Refresh data now">
              {loading ? '⏳' : '🔄'} Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Severe alert banner */}
        <AlertBanner streets={streets} />

        {/* Summary stat cards */}
        <div className="stats-grid">
          <div className="stat-card">
            {loading && streets.length === 0
              ? <div className="skeleton-stat" />
              : <span className="stat-num">{streets.length}</span>}
            <span className="stat-label">Total Streets</span>
          </div>
          {Object.entries(STATE_CONFIG).map(([key, cfg]) => (
            <div className="stat-card" key={key} style={{ borderTopColor: cfg.color }}>
              {loading && streets.length === 0
                ? <div className="skeleton-stat" />
                : <span className="stat-num" style={{ color: cfg.color }}>{counts[key] || 0}</span>}
              <span className="stat-label">{cfg.icon} {cfg.label}</span>
            </div>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="error-banner" role="alert">
            <span>⚠️ Failed to fetch data: {error}</span>
            <button onClick={fetchData}>Retry</button>
          </div>
        )}

        {/* Map card */}
        <div className="table-card" style={{ marginBottom: '1.5rem' }}>
          <div className="table-header">
            <h2 className="table-title">Live Map</h2>
            <span className="table-count">Delhi NCR</span>
          </div>

          {/* Live/Simulate toggle + rain slider */}
          <div className="map-controls">
            <div className="toggle-group" role="group" aria-label="Data source">
              {[['Live rainfall', false], ['Simulate', true]].map(([label, val]) => (
                <button
                  key={label}
                  className={`toggle-btn${simulate === val ? ' toggle-btn--active' : ''}`}
                  onClick={() => setSimulate(val)}
                  aria-pressed={simulate === val}
                >
                  {label}
                </button>
              ))}
            </div>

            {simulate ? (
              <div className="rain-slider-wrap">
                <label htmlFor="rain-slider" className="rain-slider-label">
                  🌧️ Simulated:
                  <b aria-live="polite" aria-atomic="true"> {rainInput} mm/hr</b>
                </label>
                <input
                  id="rain-slider"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={rainInput}
                  onChange={(e) => setRainInput(Number(e.target.value))}
                  className="rain-slider"
                  aria-label={`Simulated rainfall: ${rainInput} mm per hour`}
                />
              </div>
            ) : (
              <span className="rain-live-label">
                🌧️ Delhi rainfall now:{' '}
                <b aria-live="polite" aria-atomic="true">
                  {rainInfo.source === 'live'
                    ? `${Number(rainInfo.value).toFixed(1)} mm/hr`
                    : 'unavailable'}
                </b>{' '}
                <small className="muted-badge">Open-Meteo model estimate</small>
              </span>
            )}

            <span className="risk-summary">
              Predicted risk:{' '}
              <b style={{ color: RISK_COLOR.high }}>{highRisk} high</b> ·{' '}
              <b style={{ color: RISK_COLOR.medium }}>{medRisk} medium</b>
            </span>
          </div>

          {/* Filter chips */}
          <div style={{ padding: '0 1.25rem 0.75rem' }}>
            <FilterChips value={riskFilter} onChange={setRiskFilter} />
          </div>

          {/* The Map */}
          {loading && streets.length === 0 ? (
            <div className="map-skeleton" aria-label="Loading map…" />
          ) : (
            <FloodMap
              streets={streets}
              height={480}
              rainMmHr={effectiveRain}
              selectedId={selectedId}
              onSelectStreet={handleSelectStreet}
              riskFilter={riskFilter}
            />
          )}
        </div>

        {/* Street table */}
        <div className="table-card">
          <div className="table-header">
            <h2 className="table-title">Street Status</h2>
            <span className="table-count">{filteredStreets.length} records</span>
          </div>

          {streets.length === 0 && !error && !loading ? (
            <div className="empty">
              <span style={{ fontSize: '3rem' }}>🏙️</span>
              <p>No streets yet</p>
              <small>Upload a frame via the API to start monitoring</small>
            </div>
          ) : (
            <div className="table-wrap" ref={tableRef}>
              <table className="data-table" aria-label="Street flood status">
                <thead>
                  <tr>
                    <th scope="col">Street</th>
                    <th scope="col">State</th>
                    <th scope="col">Confidence</th>
                    <th scope="col">Predicted Risk</th>
                    <th scope="col">Elevation</th>
                    <th scope="col">Coordinates</th>
                    <th scope="col">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && filteredStreets.length === 0 ? (
                    <SkeletonRows count={6} />
                  ) : (
                    [...filteredStreets]
                      .sort((a, b) => (b.risk || 0) - (a.risk || 0))
                      .map((s) => {
                        const isSelected = s.street_id === selectedId
                        return (
                          <tr
                            key={s.street_id}
                            data-street-id={s.street_id}
                            className={`table-row${isSelected ? ' table-row--selected' : ''}`}
                            onClick={() => handleRowClick(s.street_id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') handleRowClick(s.street_id)
                            }}
                            tabIndex={0}
                            role="button"
                            aria-pressed={isSelected}
                            aria-label={`Select ${s.name || s.street_id}`}
                            title="Click to fly to this location on the map"
                          >
                            <td>
                              <code className="street-id">{s.name || s.street_id}</code>
                            </td>
                            <td><StateBadge state={s.state} /></td>
                            <td>{s.state === 'unknown' ? '—' : <ConfidenceBar value={s.confidence} />}</td>
                            <td title={(s.risk_reasons || []).join(' · ')}>
                              <RiskBadge level={s.risk_level} risk={s.risk} />
                            </td>
                            <td className="coord-cell">
                              {typeof s.elevation === 'number'
                                ? `${s.elevation.toFixed(1)} m`
                                : '—'}
                            </td>
                            <td className="coord-cell">
                              {s.lat != null
                                ? `${Number(s.lat).toFixed(4)}, ${Number(s.lng).toFixed(4)}`
                                : '—'}
                            </td>
                            <td className="time-cell">{formatTime(s.updated_at)}</td>
                          </tr>
                        )
                      })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}