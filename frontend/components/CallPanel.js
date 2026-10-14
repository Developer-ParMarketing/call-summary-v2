'use client';

import { useEffect, useState } from 'react';
import StatusBadge from './StatusBadge';
import { apiFetch, AuthError } from '@/lib/api';
import { SKIP_TEXT, formatFull, formatLength } from '@/lib/format';

function Fact({ label, children }) {
    if (!children) return null;
    return (<><dt>{label}</dt><dd>{children}</dd></>);
}

// Slide-in panel with everything about one call
export default function CallPanel({ callId, apiKey, onClose, onAuthError }) {
    const [call, setCall] = useState(null);
    const [error, setError] = useState('');
    const [showHindi, setShowHindi] = useState(false); // Hinglish first, original Hindi on request

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
                            {problem && <div className="section problem">{problem}</div>}

                            <dl className="facts">
                                <Fact label="Call ID">{call.callId}</Fact>
                                <Fact label="Phone">{call.phone}</Fact>
                                <Fact label="Agent">{call.agentName}</Fact>
                                <Fact label="Campaign">{call.campaign}</Fact>
                                <Fact label="Brand">{call.brand}</Fact>
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
                                    ? <div className="text">{call.summary}</div>
                                    : <div className="muted">
                                        {call.transcript
                                            ? 'Not written yet. It is created once OpenAI summaries are switched on.'
                                            : 'Not available. The call has no transcript yet.'}
                                    </div>}
                            </div>

                            <div className="section">
                                <h3>
                                    Transcript
                                    {call.transcriptHinglish && call.transcript && (
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