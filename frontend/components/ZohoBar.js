import { ZOHO, ZOHO_ORDER, formatCount } from '@/lib/format';

// One line under the status bar: remarks sent to Zoho, per result. Clicking one filters the table.
export default function ZohoBar({ counts = {}, active, onSelect }) {
    const total = ZOHO_ORDER.reduce((n, k) => n + (counts[k] || 0), 0);
    if (!total && !active) return null;

    return (
        <section className="zoho-bar" aria-label="Zoho remarks">
            <span className="zoho-title">Zoho remarks</span>
            <button aria-pressed={active === 'any'} onClick={() => onSelect(active === 'any' ? '' : 'any')}>
                <span className="n">{formatCount(total)}</span> <span className="l">All</span>
            </button>
            {ZOHO_ORDER.map((k) => (
                <button key={k} aria-pressed={active === k} onClick={() => onSelect(active === k ? '' : k)}>
                    <span className="dot" style={{ background: ZOHO[k].color }} />
                    <span className="n">{formatCount(counts[k])}</span> <span className="l">{ZOHO[k].label}</span>
                </button>
            ))}
        </section>
    );
}