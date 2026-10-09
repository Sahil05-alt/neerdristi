import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

// Haversine distance in km between two [lat,lng] points
function haversineKm(a, b) {
    const R = 6371
    const dLat = ((b[0] - a[0]) * Math.PI) / 180
    const dLng = ((b[1] - a[1]) * Math.PI) / 180
    const lat1 = (a[0] * Math.PI) / 180
    const lat2 = (b[0] * Math.PI) / 180
    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

// Build flow edges: connect each street with elevation to its nearest 1-2 lower neighbours
function buildEdges(streets) {
    const withElev = streets.filter(
        (s) =>
            typeof s.elevation === 'number' &&
            Number.isFinite(s.elevation) &&
            Number.isFinite(s.lat) &&
            Number.isFinite(s.lng)
    )

    const edges = []
    for (const src of withElev) {
        const candidates = withElev
            .filter(
                (t) =>
                    t.street_id !== src.street_id &&
                    src.elevation - t.elevation >= 0.5 &&
                    haversineKm([src.lat, src.lng], [t.lat, t.lng]) <= 5
            )
            .sort((a, b) => {
                const dA = haversineKm([src.lat, src.lng], [a.lat, a.lng])
                const dB = haversineKm([src.lat, src.lng], [b.lat, b.lng])
                return dA - dB
            })
            .slice(0, 2)

        for (const tgt of candidates) {
            edges.push({ from: src, to: tgt, downstream_risk_level: tgt.risk_level })
        }
    }
    return edges
}

function edgeStyle(rainMmHr, downstreamRisk) {
    const rain = rainMmHr || 0
    let opacity, weight, speed
    if (rain <= 0)       { opacity = 0.22; weight = 1.5; speed = 0 }
    else if (rain < 10)  { opacity = 0.38; weight = 2;   speed = 12 }
    else if (rain < 30)  { opacity = 0.55; weight = 2.5; speed = 7 }
    else if (rain < 50)  { opacity = 0.72; weight = 3.5; speed = 4 }
    else                 { opacity = 0.88; weight = 4.5; speed = 2.5 }

    const color =
        downstreamRisk === 'high'   ? '#fb923c' :
        downstreamRisk === 'medium' ? '#38bdf8' : '#60a5fa'

    return { opacity, weight, speed, color }
}

let _uid = 0
function nextUid() { return ++_uid }

export default function FlowLayer({ streets = [], rainMmHr = 0, visible = true }) {
    const map = useMap()
    const layerRef = useRef(null)
    const styleRef = useRef(null)

    useEffect(() => {
        if (!layerRef.current) layerRef.current = L.layerGroup()
        if (!styleRef.current) {
            styleRef.current = document.createElement('style')
            document.head.appendChild(styleRef.current)
        }

        const lg = layerRef.current
        const styleEl = styleRef.current
        lg.clearLayers()
        styleEl.textContent = ''

        if (!visible) {
            if (map.hasLayer(lg)) lg.remove()
            return
        }

        if (!map.hasLayer(lg)) lg.addTo(map)

        const edges = buildEdges(streets)
        if (edges.length === 0) return

        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const cssRules = []

        for (const edge of edges) {
            const { from, to, downstream_risk_level } = edge
            const { opacity, weight, speed, color } = edgeStyle(rainMmHr, downstream_risk_level)
            const id = nextUid()
            const cls = `fl-path-${id}`
            const dashLen = 14, gapLen = 8
            const dashTotal = dashLen + gapLen

            const poly = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
                color, weight, opacity,
                dashArray: `${dashLen} ${gapLen}`,
                className: cls,
                lineCap: 'round', lineJoin: 'round',
                interactive: false,
            })
            lg.addLayer(poly)

            // Arrow at midpoint
            const midLat = (from.lat + to.lat) / 2
            const midLng = (from.lng + to.lng) / 2
            const bearing = (Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180) / Math.PI
            const arrowIcon = L.divIcon({
                className: '',
                html: `<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid ${color};opacity:${opacity};transform:rotate(${bearing}deg);transform-origin:center bottom;"></div>`,
                iconSize: [10, 9],
                iconAnchor: [5, 4],
            })
            lg.addLayer(L.marker([midLat, midLng], { icon: arrowIcon, interactive: false, keyboard: false }))

            if (!prefersReduced && speed > 0) {
                const kf = `nd-flow-${id}`
                cssRules.push(`
                    @keyframes ${kf} { from { stroke-dashoffset: ${dashTotal}; } to { stroke-dashoffset: 0; } }
                    .${cls} path { animation: ${kf} ${speed.toFixed(2)}s linear infinite; }
                `)
            }
        }

        styleEl.textContent = cssRules.join('\n')

        return () => {
            lg.clearLayers()
            styleEl.textContent = ''
        }
    }, [streets, rainMmHr, visible, map])

    useEffect(() => {
        return () => {
            if (layerRef.current) { layerRef.current.clearLayers(); layerRef.current.remove() }
            if (styleRef.current) styleRef.current.remove()
        }
    }, [])

    return null
}
