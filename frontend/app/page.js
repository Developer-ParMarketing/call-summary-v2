'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import StatusBar from '@/components/StatusBar';
import Filters from '@/components/Filters';
import CallsTable from '@/components/CallsTable';
import CallPanel from '@/components/CallPanel';
import KeyDialog from '@/components/KeyDialog';
import { apiFetch, AuthError, loadKey, saveKey } from '@/lib/api';
import { formatCount } from '@/lib/format';

const PAGE_SIZE = 50;
const EMPTY_FILTERS = { status: '', disposition: '', search: '', from: '', to: '' };

export default function DashboardPage() {
    const [apiKey, setApiKey] = useState('');
    const [keyPrompt, setKeyPrompt] = useState({ open: false, message: '' });

    const [dmpOnly, setDmpOnly] = useState(true); // show only the calls we summarise
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [searchInput, setSearchInput] = useState('');
    const [page, setPage] = useState(1);

    const [engine, setEngine] = useState(null); // /api/process/status
    const [counts, setCounts] = useState({});   // /api/dashboard/stats
    const [list, setList] = useState({ items: [], total: 0, pages: 1 });
    const [dispositions, setDispositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [toast, setToast] = useState('');
    const [busy, setBusy] = useState(false);

    const requestNo = useRef(0); // ignore answers to older requests (fast filter changes)

    useEffect(() => {
        const saved = loadKey();
        if (saved) setApiKey(saved);
        else setKeyPrompt({ open: true, message: '' });
    }, []);

    const showToast = useCallback((text) => {
        setToast(text);
        setTimeout(() => setToast(''), 4000);
    }, []);

    const handleAuthError = useCallback((message) => setKeyPrompt({ open: true, message }), []);
    const handleError = useCallback((e) => {
        if (e instanceof AuthError) handleAuthError(e.message);
        else showToast(`Could not load data: ${e.message}`);
    }, [handleAuthError, showToast]);

    // Load processing status, counts and the current page of calls
    const refresh = useCallback(async () => {
        if (!apiKey) return;
        const myNo = ++requestNo.current;

        const shared = new URLSearchParams();
        if (dmpOnly) shared.set('dmpOnly', 'true');
        for (const k of ['disposition', 'search', 'from', 'to']) if (filters[k]) shared.set(k, filters[k]);
        const listParams = new URLSearchParams(shared);
        listParams.set('page', page);
        listParams.set('limit', PAGE_SIZE);
        if (filters.status) listParams.set('status', filters.status);

        try {
            const [status, stats, calls] = await Promise.all([
                apiFetch('/api/process/status', apiKey),
                apiFetch(`/api/dashboard/stats?${shared}`, apiKey),
                apiFetch(`/api/dashboard/calls?${listParams}`, apiKey),
            ]);
            if (myNo !== requestNo.current) return; // a newer request is on its way
            setEngine(status);
            setCounts(stats.counts);
            setList(calls);
        } catch (e) {
            if (myNo === requestNo.current) handleError(e);
        } finally {
            if (myNo === requestNo.current) setLoading(false);
        }
    }, [apiKey, dmpOnly, filters, page, handleError]);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        if (!apiKey) return;
        apiFetch('/api/dashboard/filters', apiKey).then((f) => setDispositions(f.dispositions)).catch(() => { });
    }, [apiKey]);

    // Auto-refresh every 30 seconds while the tab is visible
    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
        return () => clearInterval(id);
    }, [autoRefresh, refresh]);

    // Wait until typing stops before searching
    useEffect(() => {
        const id = setTimeout(() => {
            setFilters((f) => (f.search === searchInput.trim() ? f : { ...f, search: searchInput.trim() }));
            setPage(1);
        }, 350);
        return () => clearTimeout(id);
    }, [searchInput]);

    const setFilter = (name, value) => { setFilters((f) => ({ ...f, [name]: value })); setPage(1); };
    const clearFilters = () => { setFilters(EMPTY_FILTERS); setSearchInput(''); setPage(1); };

    const saveNewKey = (key) => {
        saveKey(key);
        setApiKey(key);
        setKeyPrompt({ open: false, message: '' });
    };

    // Put every failed call back in the queue and start processing
    const retryAllFailed = async () => {
        if (!confirm(`Try all ${counts.failed} failed calls again now?`)) return;
        setBusy(true);
        try {
            const r = await apiFetch('/api/process/run?retryFailed=true', apiKey, { method: 'POST' });
            showToast(`${formatCount(r.retriedFailed)} failed calls queued again - processing started`);
            setTimeout(refresh, 1500);
        } catch (e) {
            handleError(e);
        } finally {
            setBusy(false);
        }
    };

    // Start / stop processing
    const control = async (action) => {
        if (action === 'run' && !confirm(`Start processing waiting calls now? Only ${(engine?.dispositions || ['Explain DMP']).join(' / ')} calls are transcribed; others are skipped.`)) return;
        setBusy(true);
        try {
            const r = await apiFetch(`/api/process/${action}`, apiKey, { method: 'POST' });
            showToast(action === 'stop' ? r.message
                : r.queued ? `Processing started for ${formatCount(r.queued)} waiting calls` : 'Nothing is waiting to be processed');
            setTimeout(refresh, 1500);
        } catch (e) {
            handleError(e);
        } finally {
            setBusy(false);
        }
    };

    const running = engine?.manualRunActive;
    const engineText = engine
        ? (running ? 'running now' : engine.insideTimeWindowNow ? 'running (night window)' : 'paused')
        : null;
    const start = list.total ? (page - 1) * PAGE_SIZE + 1 : 0;
    const end = Math.min(page * PAGE_SIZE, list.total);

    return (
        <>
            <div className="wrap">
                <header className="top">
                    <h1>Call summaries</h1>
                    <div className="engine">
                        {engine
                            ? <>Processing <b>{engineText}</b> · night window {engine.timeWindow}
                                {!engine.summariesEnabled && <> · summaries <b>off</b></>}</>
                            : 'Connecting…'}
                    </div>
                    <div className="spacer" />
                    <label className="check">
                        <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                        Refresh every 30s
                    </label>
                    <button className="btn" onClick={refresh}>Refresh</button>
                    {counts.failed > 0 && !running && (
                        <button className="btn stop" onClick={retryAllFailed} disabled={busy}>
                            Retry failed ({formatCount(counts.failed)})
                        </button>
                    )}
                    {running
                        ? <button className="btn stop" onClick={() => control('stop')} disabled={busy}>Stop processing</button>
                        : <button className="btn primary" onClick={() => control('run')} disabled={busy || !apiKey}>Process waiting calls now</button>}
                    <button className="btn" onClick={() => setKeyPrompt({ open: true, message: '' })} title="Change API key">Key</button>
                </header>

                <StatusBar
                    counts={counts}
                    active={filters.status}
                    onSelect={(s) => setFilter('status', s)}
                    label={dmpOnly ? 'with Explain DMP' : 'received from the dialer'}
                />

                <Filters
                    dmpOnly={dmpOnly}
                    onDmpOnly={(v) => { setDmpOnly(v); setPage(1); }}
                    dmpLabel={`Only: ${(engine?.dispositions || []).join(', ')}`}
                    search={searchInput}
                    onSearch={setSearchInput}
                    disposition={filters.disposition}
                    dispositions={dispositions}
                    from={filters.from}
                    to={filters.to}
                    onChange={setFilter}
                    onClear={clearFilters}
                />

                <CallsTable items={list.items} loading={loading} onOpen={setOpenId} />

                <div className="pager">
                    <span>Showing {formatCount(start)}–{formatCount(end)} of {formatCount(list.total)}</span>
                    <span>
                        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>{' '}
                        <button className="btn" disabled={page >= list.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
                    </span>
                </div>
            </div>

            <CallPanel
                callId={openId}
                apiKey={apiKey}
                onClose={() => setOpenId(null)}
                onAuthError={handleAuthError}
                onRetried={(msg) => { showToast(msg); setTimeout(refresh, 1500); }}
            />
            <KeyDialog open={keyPrompt.open} message={keyPrompt.message} initialKey={apiKey} onSave={saveNewKey} />
            <div className={`toast ${toast ? 'show' : ''}`} role="status">{toast}</div>
        </>
    );
}