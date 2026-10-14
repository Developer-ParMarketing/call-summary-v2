// "Explain DMP only" switch, search box, disposition dropdown and date range

export default function Filters({
    dmpOnly, onDmpOnly, dmpLabel, search, onSearch, disposition, dispositions, from, to, onChange, onClear,
}) {
    return (
        <div className="filters">
            <label className="switch" title={dmpLabel}>
                <input type="checkbox" checked={dmpOnly} onChange={(e) => onDmpOnly(e.target.checked)} />
                Explain DMP calls only
            </label>
            <input
                type="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search call ID, customer, phone, agent or campaign"
                aria-label="Search calls"
            />
            <select value={disposition} onChange={(e) => onChange('disposition', e.target.value)} aria-label="Disposition">
                <option value="">All dispositions</option>
                {dispositions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <label>From <input type="date" value={from} onChange={(e) => onChange('from', e.target.value)} /></label>
            <label>To <input type="date" value={to} onChange={(e) => onChange('to', e.target.value)} /></label>
            <button className="btn" onClick={onClear}>Clear filters</button>
        </div>
    );
}
