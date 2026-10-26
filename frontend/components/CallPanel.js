'use client';

import { useEffect, useState } from 'react';
import StatusBadge from './StatusBadge';
import { apiFetch, AuthError } from '@/lib/api';
import { SKIP_TEXT, formatFull, formatLength } from '@/lib/format';

// Summary: "Overview:" as a short paragraph, then "Label: text" key points with bold labels
function SummaryLines({ text }) {
    const lines = String(text).split(/\n+/).map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
    const parsed = lines.map((line) => {
        const m = /^([^:]{2,24}):\s*(.*)$/.exec(line);
        return m ? { label: m[1], text: m[2] } : { label: '', text: line };
    });
    const overview = parsed.filter((p) => /^overview$/i.test(p.label));
    const points = parsed.filter((p) => !/^overview$/i.test(p.label));
    return (
        <>
            {overview.map((p, i) => <p key={i} className="overview">{p.text}</p>)}
            {points.length > 0 && (
                <ul className="points">
                    {points.map((p, i) => <li key={i}>{p.label ? <><b>{p.label}:</b> {p.text}</> : p.text}</li>)}
                </ul>
            )}
        </>
    );
}
const ZOHO_TEXT = {
    pending: 'Waiting to send',
    updated: 'Added to Zoho',
    not_found: 'Portal ID not found in Zoho (retrying)',
    failed: 'Failed',
};
function Fact({ label, children }) {
    if (!children) return null;
    return (<><dt>{label}</dt><dd>{children}</dd></>);
}

// Slide-in panel with everything about one call
export default function CallPanel({ callId, apiKey, onClose, onAuthError, onRetried }) {
    const [call, setCall] = useState(null);
    const [error, setError] = useState('');
    const [showHindi, setShowHindi] = useState(false); // Hinglish first, original Hindi on request
    const [retrying, setRetrying] = useState(false);

    const retry = async () => {
        setRetrying(true);
        try {
            const r = await apiFetch(`/api/process/retry/${encodeURIComponent(callId)}`, apiKey, { method: 'POST' });
            onRetried?.(r.message);
            onClose();
        } catch (e) {
            if (e instanceof AuthError) onAuthError(e.message);
            else setError(`Could not retry: ${e.message}`);
        } finally {
            setRetrying(false);
        }
    };

    useEffect(() => {
        if (!callId) return;
        let cancelled = false;
        setCall(null);
        setError('');
        setShowHindi(false);
        apiFetch(`/api/dashboard/calls/${encodeURIComponent(callId)}`, apiKey)
            .then((c) => { if (!cancelled) setCall(c); })
            .catch((e) => {
                if (cancelled) return;
                if (e instanceof AuthError) onAuthError(e.message);
                else setError(`Could not load this call: ${e.message}`);
            });
        return () => { cancelled = true; };
    }, [callId, apiKey, onAuthError]);

    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const open = Boolean(callId);
    const problem = call?.status === 'skipped' ? (SKIP_TEXT[call.skipReason] || call.skipReason)
        : call?.status === 'failed' ? call.errorMessage : '';

    return (
        <>
            <div className={`scrim ${open ? 'open' : ''}`} onClick={onClose} />
            <aside className={`panel ${open ? 'open' : ''}`} aria-label="Call details" aria-hidden={!open}>
                <div className="panel-head">
                    <div>
                        <h2>{call ? (call.customerName || 'Unknown customer') : 'Loading…'}</h2>
                        {call && (
                            <div className="sub">
                                <StatusBadge status={call.status} /> &nbsp; {call.firstDisposition || 'No disposition'}
                            </div>
                        )}
                    </div>
                    <button className="btn x" onClick={onClose}>Close</button>
                </div>

                <div className="panel-body">
                    {error && <div className="problem">{error}</div>}

                    {call && (
                        <>
                            {problem && (
                                <div className="section problem">
                                    {problem}
                                    {call.status === 'failed' && (
                                        <div style={{ marginTop: 10 }}>
                                            <button className="btn primary" onClick={retry} disabled={retrying}>
                                                {retrying ? 'Retrying…' : 'Try again'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <dl className="facts">
                                <Fact label="Call ID">{call.callId}</Fact>
                                <Fact label="Phone">{call.phone}</Fact>
                                <Fact label="Agent">{call.agentName}</Fact>
                                <Fact label="Campaign">{call.campaign}</Fact>
                                <Fact label="Brand">{call.brand}</Fact>
                                <Fact label="Portal ID">{call.portalId || call.sdPortalId || call.smlPortalId}</Fact>
                                <Fact label="Remark">{call.remark}</Fact>
                                <Fact label="Zoho remark">
                                    {call.zohoStatus && (ZOHO_TEXT[call.zohoStatus] || call.zohoStatus)
                                        + (call.zohoStatus === 'failed' && call.zohoError ? ` - ${call.zohoError}` : '')
                                        + (call.zohoSyncedAt ? ` (${formatFull(call.zohoSyncedAt)})` : '')}
                                </Fact>
                                <Fact label="Sub-disposition">{call.secondDisposition}</Fact>
                                <Fact label="Call started">{formatFull(call.callStartTime)}</Fact>
                                <Fact label="Call ended">{formatFull(call.callEndTime)}</Fact>
                                <Fact label="Length">{call.audioSeconds != null ? formatLength(call.audioSeconds) : ''}</Fact>
                                <Fact label="Received">{formatFull(call.createdAt)}</Fact>
                                <Fact label="Last update">{formatFull(call.updatedAt)}</Fact>
                                <Fact label="Recording">
                                    {call.recordUrl
                                        ? <a href={call.recordUrl} target="_blank" rel="noopener noreferrer">Open recording</a>
                                        : <span className="muted">Not sent by the dialer</span>}
                                </Fact>
                            </dl>

                            <div className="section">
                                <h3>Summary</h3>
                                {call.summary
                                    ? <SummaryLines text={call.summary} />
                                    : <div className="muted">
                                        {call.transcript
                                            ? 'Not written yet. It is created when this call is processed with AI summaries on.'
                                            : 'Not available. The call has no transcript yet.'}
                                    </div>}
                            </div>

                            <div className="section">
                                <h3>
                                    Transcript
                                    {call.transcriptSource === 'ai' && <span className="sub" style={{ fontWeight: 400, marginLeft: 8 }}>by AI from the recording</span>}
                                    {call.transcriptHinglish && call.transcript && call.transcriptHinglish !== call.transcript && (
                                        <span className="tabs" role="group" aria-label="Transcript language">
                                            <button aria-pressed={!showHindi} onClick={() => setShowHindi(false)}>Hinglish</button>
                                            <button aria-pressed={showHindi} onClick={() => setShowHindi(true)}>Original Hindi</button>
                                        </span>
                                    )}
                                </h3>
                                {!call.transcript && <div className="muted">Not transcribed.</div>}
                                {call.transcript && (call.transcriptHinglish && !showHindi
                                    ? <div className="text hi">{call.transcriptHinglish}</div>
                                    : <div className="text hi" lang="hi">{call.transcript}</div>)}
                                {call.transcript && !call.transcriptHinglish && (
                                    <div className="muted" style={{ marginTop: 8 }}>
                                        Hinglish version not created yet. It is added the next time this call is processed.
                                    </div>
                                )}
                            </div>

                            <details className="section">
                                <summary>Everything the dialer sent</summary>
                                <pre>{JSON.stringify(call.dialerData || {}, null, 2)}</pre>
                                {call.rawBody && (<><h3>Unreadable body (as received)</h3><pre>{call.rawBody}</pre></>)}
                            </details>
                        </>
                    )}
                </div>
            </aside>
        </>
    );
}