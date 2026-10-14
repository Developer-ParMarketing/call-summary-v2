import { STATUS, STATUS_ORDER, formatCount } from '@/lib/format';

// The colour bar with every call by status. Clicking a status filters the table.
export default function StatusBar({ counts = {}, active, onSelect, label = 'received from the dialer' }) {
    const total = STATUS_ORDER.reduce((n, k) => n + (counts[k] || 0), 0);

    return (
        <section className="pipeline" aria-label="Calls by status">
            <div className="pipeline-head">
                <strong>{formatCount(total)}</strong>
                <span>calls{' '}{label}</span>
            </div>

            <div className="bar">
                {STATUS_ORDER.filter((k) => counts[k]).map((k) => (
                    <div
                        key={k}
                        title={`${STATUS[k].label}: ${counts[k]}`}
                        style={{ width: `${(counts[k] / total) * 100}%`, background: STATUS[k].color }}
                    />
                ))}
            </div>

            <div className="legend">
                <button aria-pressed={!active} onClick={() => onSelect('')}>
                    <span className="n">{formatCount(total)}</span>
                    <span className="l">All</span>
                </button>
                {STATUS_ORDER.map((k) => (
                    <button key={k} aria-pressed={active === k} onClick={() => onSelect(k)}>
                        <span className="dot" style={{ background: STATUS[k].color }} />
                        <span className="n">{formatCount(counts[k])}</span>
                        <span className="l">{STATUS[k].label}</span>
                    </button>
                ))}
            </div>
        </section>
    );
}
