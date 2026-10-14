'use client';

import { useEffect, useRef, useState } from 'react';

// Asks for the API key (the same one the dialer uses). Saved in this browser only.
export default function KeyDialog({ open, message, initialKey, onSave }) {
    const ref = useRef(null);
    const [value, setValue] = useState(initialKey);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) { setValue(initialKey); dialog.showModal(); }
        if (!open && dialog.open) dialog.close();
    }, [open, initialKey]);

    return (
        <dialog ref={ref} onCancel={(e) => e.preventDefault()}>
            <form method="dialog" onSubmit={() => onSave(value.trim())}>
                <h2>Enter the API key</h2>
                <p>The same key the dialer uses. It is saved in this browser only.</p>
                <input
                    type="password"
                    autoComplete="off"
                    required
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    aria-label="API key"
                />
                <div className="err">{message}</div>
                <button className="btn primary" type="submit">Open dashboard</button>
            </form>
        </dialog>
    );
}
