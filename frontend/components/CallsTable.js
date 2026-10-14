import StatusBadge from './StatusBadge';
import { callLength, callNote, formatShort } from '@/lib/format';

export default function CallsTable({ items, loading, onOpen }) {
    return (
        <div className="table-box">
            <table>
                <thead>
                    <tr>
                        <th>Received</th><th>Customer</th><th>Agent</th><th>Campaign</th>
                        <th>Disposition</th><th>Length</th><th>Status</th><th>Note</th><th>Call ID</th>
                    </tr>
                </thead>
                <tbody>
                    {items.length === 0 && (
                        <tr>
                            <td colSpan={9} className="empty">
                                {loading ? 'Loading calls…' : 'No calls match these filters. Clear the filters to see every call.'}
                            </td>
                        </tr>
                    )}
                    {items.map((c) => (
                        <tr
                            key={c.callId}
                            tabIndex={0}
                            onClick={() => onOpen(c.callId)}
                            onKeyDown={(e) => e.key === 'Enter' && onOpen(c.callId)}
                        >
                            <td>{formatShort(c.createdAt)}</td>
                            <td>{c.customerName || '–'}<div className="sub">{c.phone}</div></td>
                            <td>{c.agentName || '–'}</td>
                            <td>{c.campaign || '–'}</td>
                            <td>{c.firstDisposition || '–'}</td>
                            <td>
                                {(() => {
                                    const len = callLength(c);
                                    return len.fromDialer
                                        ? <span className="sub" title="From the dialer's start and end time (no recording)">~{len.text}</span>
                                        : len.text;
                                })()}
                            </td>
                            <td><StatusBadge status={c.status} /></td>
                            <td className="note">{callNote(c)}</td>
                            <td className="id">{c.callId}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}