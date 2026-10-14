import { STATUS } from '@/lib/format';

export default function StatusBadge({ status }) {
    const s = STATUS[status] || { label: status, color: 'inherit' };
    return <span className="badge" style={{ color: s.color }}>{s.label}</span>;
}
