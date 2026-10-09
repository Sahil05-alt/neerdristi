/**
 * FloodMap.jsx
 * OpenStreetMap-based flood monitoring map with:
 *  - ColourMarker pins by detected state
 *  - Orange risk rings / pulsing rings for severe
 *  - Toggleable water-flow layer (FlowLayer)
 *  - Canvas rain overlay (RainOverlay)
 *  - Layer toggle controls + updated legend
 *  - Disclaimer caption
 *  - Fly-to on external click (via selectedId prop)
 *  - onSelectStreet callback when a pin is clicked
 *  - riskFilter to hide pins not matching filter
 */

import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import {
    MapContainer,
    TileLayer,
    CircleMarker,
    Popup,
    useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import FlowLayer from './FlowLayer'
import RainOverlay from './RainOverlay'

// Pin colour = detected state
const COLORS = {
    clear: '#22c55e',
    waterlogged: '#3b82f6',
    severe: '#ef4444',
    unknown: '#94a3b8',
}
const LABELS = {
    clear: 'Clear',
    waterlogged: 'Waterlogged',
    severe: 'Flooded',   // backend "severe" shown as "Flooded"
    unknown: 'No live detection',
}
const RISK_COLORS = { medium: '#f59e0b', high: '#f97316' }

const DELHI = [28.6139, 77.209]

const stateOf = (s) => (COLORS[s.state] ? s.state : 'unknown')
const validPoint = (s) =>
    Number.isFinite(s.lat) &&
    Number.isFinite(s.lng) &&
    !(s.lat === 0 && s.lng === 0)

// Re-fits only when the set of locations changes, so refreshes never reset zoom.
function FitToStreets({ points }) {
    const map = useMap()
    const key = points.map((p) => p.join(',')).join('|')
    useEffect(() => {
        if (points.length === 0) return
        if (points.length === 1) map.setView(points[0], 14)
        else map.fitBounds(points, { padding: [40, 40], maxZoom: 15 })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])
    return null
}

// Fly-to + open popup imperatively when selectedId changes
function FlyToStreet({ streets, selectedId }) {
    const map = useMap()
    const markersRef = useRef({}) // street_id -> L.CircleMarker ref

    // Expose markersRef via a custom event so parent CircleMarker refs can register
    useEffect(() => {
        if (!selectedId) return
        const street = streets.find((s) => s.street_id === selectedId)
        if (!street || !validPoint(street)) return
        map.flyTo([street.lat, street.lng], Math.max(map.getZoom(), 15), {
            animate: true,
            duration: 0.8,
        })
    }, [selectedId, streets, map])

    return null
}

export default function FloodMap({
    streets = [],
    height = 460,
    rainMmHr = 0,
    selectedId = null,
    onSelectStreet = null,
    riskFilter = 'all',
}) {
    const [showFlow, setShowFlow] = useState(true)
    const mapRef = useRef(null)
    const markerRefs = useRef({}) // street_id -> leaflet layer

    const mapped = useMemo(
        () =>
            streets.filter((s) => {
                if (!validPoint(s)) return false
                if (riskFilter === 'all') return true
                return s.risk_level === riskFilter
            }),
        [streets, riskFilter]
    )
    const allValid = useMemo(() => streets.filter(validPoint), [streets])
    const points = useMemo(() => allValid.map((s) => [s.lat, s.lng]), [allValid])

    // Register marker ref so FlyToStreet can open its popup
    const registerMarker = useCallback((streetId, ref) => {
        if (ref) markerRefs.current[streetId] = ref
        else delete markerRefs.current[streetId]
    }, [])

    // Open popup for selectedId when map is ready and the marker exists
    useEffect(() => {
        if (!selectedId || !mapRef.current) return
        const marker = markerRefs.current[selectedId]
        if (marker) {
            setTimeout(() => marker.openPopup(), 900)
        }
    }, [selectedId])

    return (
        <div style={{ position: 'relative' }}>
            {/* Layer control bar */}
            <div className="map-layer-bar">
                <label className="map-layer-toggle">
                    <input
                        type="checkbox"
                        checked={showFlow}
                        onChange={(e) => setShowFlow(e.target.checked)}
                        aria-label="Toggle water flow layer"
                    />
                    <span>💧 Water flow</span>
                </label>
                {rainMmHr <= 0 && showFlow && (
                    <span className="map-layer-hint">No rainfall – flow lines faint</span>
                )}
            </div>

            <div
                style={{
                    position: 'relative',
                    height,
                    borderRadius: 12,
                    overflow: 'hidden',
                }}
            >
                <style>{`
          @keyframes nd-pulse { 0%,100% { opacity:.55 } 50% { opacity:.05 } }
          .nd-pulse-ring { animation: nd-pulse 1.6s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) { .nd-pulse-ring { animation: none; opacity:.3; } }
          .leaflet-popup-content { font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.5; }
          .nd-row-selected { background: rgba(59,130,246,0.12) !important; }
        `}</style>

                <MapContainer
                    center={DELHI}
                    zoom={11}
                    style={{ height: '100%', width: '100%' }}
                    ref={mapRef}
                >
                    <TileLayer
                        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution="&copy; OpenStreetMap contributors"
                        maxZoom={19}
                    />
                    <FitToStreets points={points} />
                    <FlyToStreet streets={allValid} selectedId={selectedId} />

                    {/* Water flow layer */}
                    <FlowLayer
                        streets={streets}
                        rainMmHr={rainMmHr}
                        visible={showFlow}
                    />

                    {/* Street markers */}
                    {mapped.map((s) => {
                        const st = stateOf(s)
                        const color = COLORS[st]
                        const riskColor = RISK_COLORS[s.risk_level]
                        const isSelected = s.street_id === selectedId
                        return (
                            <span key={s.street_id}>
                                {riskColor && st !== 'severe' && (
                                    <CircleMarker
                                        center={[s.lat, s.lng]}
                                        radius={s.risk_level === 'high' ? 22 : 16}
                                        pathOptions={{
                                            color: riskColor,
                                            weight: 2,
                                            fillColor: riskColor,
                                            fillOpacity: 0.15,
                                        }}
                                        interactive={false}
                                    />
                                )}
                                {st === 'severe' && (
                                    <CircleMarker
                                        center={[s.lat, s.lng]}
                                        radius={22}
                                        pathOptions={{
                                            color,
                                            weight: 2,
                                            fillOpacity: 0,
                                            className: 'nd-pulse-ring',
                                        }}
                                        interactive={false}
                                    />
                                )}
                                <CircleMarker
                                    center={[s.lat, s.lng]}
                                    radius={isSelected ? 12 : 9}
                                    pathOptions={{
                                        color: isSelected ? '#fff' : '#0b1220',
                                        weight: isSelected ? 3 : 2,
                                        fillColor: color,
                                        fillOpacity: 0.95,
                                    }}
                                    ref={(r) => registerMarker(s.street_id, r)}
                                    eventHandlers={{
                                        click: () => onSelectStreet && onSelectStreet(s.street_id),
                                    }}
                                >
                                    <Popup>
                                        <strong>{s.name || s.street_id}</strong>
                                        <br />
                                        <span style={{ color, fontWeight: 600 }}>{LABELS[st]}</span>
                                        {st !== 'unknown' &&
                                            typeof s.confidence === 'number' &&
                                            ` (${Math.round(s.confidence * 100)}%)`}
                                        {s.reason && (
                                            <>
                                                <br />
                                                {s.reason}
                                            </>
                                        )}
                                        {typeof s.risk === 'number' && (
                                            <>
                                                <br />
                                                <b>
                                                    Flood risk: {Math.round(s.risk * 100)}% ({s.risk_level})
                                                </b>
                                                {s.risk_reasons && s.risk_reasons.length > 0 && (
                                                    <>
                                                        <br />
                                                        <small>{s.risk_reasons.join(' · ')}</small>
                                                    </>
                                                )}
                                            </>
                                        )}
                                        {typeof s.elevation === 'number' && (
                                            <>
                                                <br />
                                                <small>Elevation: {s.elevation.toFixed(1)} m</small>
                                            </>
                                        )}
                                        <br />
                                        <small>
                                            {s.updated_at
                                                ? new Date(s.updated_at).toLocaleString('en-IN', {
                                                    timeZone: 'Asia/Kolkata',
                                                })
                                                : ''}
                                        </small>
                                    </Popup>
                                </CircleMarker>
                            </span>
                        )
                    })}
                </MapContainer>

                {/* Rain canvas overlay */}
                <RainOverlay rainMmHr={rainMmHr} />

                {/* Legend */}
                <div className="map-legend">
                    {Object.keys(COLORS).map((k) => (
                        <span key={k} className="map-legend-item">
                            <i
                                style={{
                                    width: 9,
                                    height: 9,
                                    borderRadius: '50%',
                                    background: COLORS[k],
                                    display: 'inline-block',
                                    flexShrink: 0,
                                }}
                            />
                            {LABELS[k]}
                        </span>
                    ))}
                    <span className="map-legend-item">
                        <i
                            style={{
                                width: 11,
                                height: 11,
                                borderRadius: '50%',
                                border: '2px solid #f97316',
                                display: 'inline-block',
                                flexShrink: 0,
                            }}
                        />
                        Predicted risk
                    </span>
                    {showFlow && (
                        <span className="map-legend-item">
                            <i
                                style={{
                                    width: 18,
                                    height: 3,
                                    background:
                                        'linear-gradient(90deg,#60a5fa 0%,#38bdf8 60%,#fb923c 100%)',
                                    display: 'inline-block',
                                    borderRadius: 2,
                                    flexShrink: 0,
                                }}
                            />
                            Water flow
                        </span>
                    )}
                </div>
            </div>

            {/* Disclaimer caption – always visible */}
            <p className="map-disclaimer">
                Illustrative flow direction from terrain elevation (~90 m model). Not a
                hydraulic simulation.
            </p>
        </div>
    )
}