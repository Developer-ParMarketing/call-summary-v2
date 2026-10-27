// "Explain DMP only" switch, search box, disposition dropdown, Zoho dropdown and date range

export default function Filters({
    dmpOnly, onDmpOnly, dmpLabel, search, onSearch, disposition, dispositions, zoho, from, to, onChange, onClear,
}) {
    return (
        <div className="filters">
            <label className="switch" title={dmpLabel}>
                <input type="checkbox" checked={dmpOnly} onChange={(e) => onDmpOnly(e.target.checked)} />
                Summary calls only
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
            <select value={zoho} onChange={(e) => onChange('zoho', e.target.value)} aria-label="Zoho remark">
                <option value="">Zoho: all calls</option>
                <option value="any">Zoho: has remark</option>
                <option value="updated">Zoho: added</option>
                <option value="pending">Zoho: waiting</option>
                <option value="not_found">Zoho: not found</option>
                <option value="failed">Zoho: failed</option>
            </select>
            <label>From <input type="date" value={from} onChange={(e) => onChange('from', e.target.value)} /></label>
            <label>To <input type="date" value={to} onChange={(e) => onChange('to', e.target.value)} /></label>
            <button className="btn" onClick={onClear}>Clear filters</button>
        </div>
    );
}