// "Summary calls only" switch (selected dispositions + campaigns), search box, disposition dropdown and date range

export default function Filters({
    dmpOnly, onDmpOnly, dmpLabel, search, onSearch, disposition, dispositions, selected = [], zoho, from, to, onChange, onClear,
}) {
    // Split the dropdown: dispositions we summarise (from .env) / everything else the dialer sent
    const norm = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const selectedSet = new Set(selected.map(norm));
    const others = dispositions.filter((d) => !selectedSet.has(norm(d)));

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
                placeholder="Search call ID, customer, phone, agent, campaign or portal ID"
                aria-label="Search calls"
            />
            <select value={disposition} onChange={(e) => onChange('disposition', e.target.value)} aria-label="Disposition">
                <option value="">All dispositions</option>
                {selected.length > 0 && (
                    <optgroup label="Summarised (PROCESS_DISPOSITIONS)">
                        {selected.map((d) => <option key={`s-${d}`} value={d}>{d}</option>)}
                    </optgroup>
                )}
                {others.length > 0 && (
                    <optgroup label="Other dispositions received">
                        {others.map((d) => <option key={d} value={d}>{d}</option>)}
                    </optgroup>
                )}
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