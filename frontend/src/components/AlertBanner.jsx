import { useState, useEffect } from 'react'

export default function AlertBanner({ streets = [] }) {
    const severeStreets = streets.filter((s) => s.state === 'severe')
    const [dismissed, setDismissed] = useState(false)

    // Re-show if a NEW severe street appears
    const key = severeStreets.map((s) => s.street_id).sort().join(',')
    useEffect(() => {
        if (severeStreets.length > 0) setDismissed(false)
    }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

    if (severeStreets.length === 0 || dismissed) return null

    const names = severeStreets.map((s) => s.name || s.street_id)
    const label =
        names.length === 1
            ? names[0]
            : names.length === 2
            ? `${names[0]} and ${names[1]}`
            : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`

    return (
        <div
            className="alert-banner"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
        >
            <div className="alert-banner-content">
                <span className="alert-banner-icon">🚨</span>
                <span>
                    <strong>Flood Alert:</strong> {label}{' '}
                    {severeStreets.length === 1 ? 'is' : 'are'} currently reporting severe flooding.
                </span>
            </div>
            <button
                className="alert-banner-dismiss"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss flood alert"
            >
                ✕
            </button>
        </div>
    )
}
