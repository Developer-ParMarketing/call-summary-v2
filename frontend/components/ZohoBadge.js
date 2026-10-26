import { ZOHO } from '@/lib/format';

// Zoho remark result: Added / Waiting / Not found / Failed ('–' when the call has no remark for Zoho)
export default function ZohoBadge({ status, error }) {
    if (!status) return <span className="sub">–</span>;
    const z = ZOHO[status] || { label: status, color: 'inherit', long: status };
    return <span className="badge" style={{ color: z.color }} title={error ? `${z.long}: ${error}` : z.long}>{z.label}</span>;
}