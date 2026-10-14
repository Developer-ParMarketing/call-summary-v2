'use client';

import { useCallback, useEffect, useState } from 'react';
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

    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [searchInput, setSearchInput] = useState('');
    const [page, setPage] = useState(1);

    const [engine, setEngine] = useState(null);       // /api/process/status
    const [list, setList] = useState({ items: [], total: 0, pages: 1 });
    const [dispositions, setDispositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [toast, setToast] = useState('');
    const [running, setRunning] = useState(false);

    // Read the saved key once the page is in the browser
    useEffect(() => {
        const saved = loadKey();
        if (saved) setApiKey(saved);
        else setKeyPrompt({ open: true, message: '' });
    }, []);

    const showToast = useCallback((text) => {
        setToast(text);
        setTimeout(() => setToast(''), 3500);
    }, []);

    const handleAuthError = useCallback((message) => setKeyPrompt({ open: true, message }), []);

    const handleError = useCallback((e) => {
        if (e instanceof AuthError) handleAuthError(e.message);
        else showToast(`Could not load data: ${e.message}`);
    }, [handleAuthError, showToast]);

    // Load status counts + the current page of calls
    const refresh = useCallback(async () => {
        if (!apiKey) return;
        const params = new URLSearchParams({ page, limit: PAGE_SIZE });
        for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
        try {
            const [status, calls] = await Promise.all([
                apiFetch('/api/process/status', apiKey),
                apiFetch(`/api/dashboard/calls?${params}`, apiKey),
            ]);
            setEngine(status);
            setList(calls);
        } catch (e) {
            handleError(e);
        } finally {
            setLoading(false);
        }
    }, [apiKey, filters, page, handleError]);

    useEffect(() => { refresh(); }, [refresh]);

    // Dropdown values (dispositions), once per key
    useEffect(() => {
        if (!apiKey) return;
        apiFetch('/api/dashboard/filters', apiKey)
            .then((f) => setDispositions(f.dispositions))
            .catch(() => {});
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

    const processNow = async () => {
        if (!confirm('Start processing all waiting calls now? Only Explain DMP calls are transcribed.')) return;
        setRunning(true);
        try {
            const r = await apiFetch('/api/process/run', apiKey, { method: 'POST' });
            showToast(r.queued ? `Processing started for ${formatCount(r.queued)} waiting calls` : 'Nothing is waiting to be processed');
            setTimeout(refresh, 2000);
        } catch (e) {
            handleError(e);
        } finally {
            setRunning(false);
        }
    };

    const engineText = engine
        ? (engine.manualRunActive ? 'running now' : engine.insideTimeWindowNow ? 'running (night window)' : 'paused')
        : null;
    const start = list.total ? (page - 1) * PAGE_SIZE + 1 : 0;
    const end = Math.min(page * PAGE_SIZE, list.total);

    return (
        <>
            <div className="wrap">
                <header className="top">
                    <h1>Call summaries</h1>
                    <div className="engine">
                        {engine ? <>Processing <b>{engineText}</b> · night window {engine.timeWindow}</> : 'Connecting…'}
                    </div>
                    <div className="spacer" />
                    <label className="check">
                        <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                        Refresh every 30s
                    </label>
                    <button className="btn" onClick={refresh}>Refresh</button>
                    <button className="btn primary" onClick={processNow} disabled={running || !apiKey}>Process queued calls now</button>
                    <button className="btn" onClick={() => setKeyPrompt({ open: true, message: '' })} title="Change API key">Key</button>
                </header>

                <StatusBar counts={engine?.counts} active={filters.status} onSelect={(s) => setFilter('status', s)} />

                <Filters
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

            <CallPanel callId={openId} apiKey={apiKey} onClose={() => setOpenId(null)} onAuthError={handleAuthError} />
            <KeyDialog open={keyPrompt.open} message={keyPrompt.message} initialKey={apiKey} onSave={saveNewKey} />
            <div className={`toast ${toast ? 'show' : ''}`} role="status">{toast}</div>
        </>
    );
}
