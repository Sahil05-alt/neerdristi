const CHIPS = [
    { value: 'all',    label: 'All',    color: '#94a3b8' },
    { value: 'high',   label: 'High',   color: '#f97316' },
    { value: 'medium', label: 'Medium', color: '#f59e0b' },
    { value: 'low',    label: 'Low',    color: '#22c55e' },
]

export default function FilterChips({ value = 'all', onChange }) {
    return (
        <div className="filter-chips" role="group" aria-label="Filter by risk level">
            {CHIPS.map((chip) => {
                const active = value === chip.value
                return (
                    <button
                        key={chip.value}
                        className={`filter-chip${active ? ' filter-chip--active' : ''}`}
                        style={{ '--chip-color': chip.color }}
                        onClick={() => onChange(chip.value)}
                        aria-pressed={active}
                    >
                        {chip.label}
                    </button>
                )
            })}
        </div>
    )
}
