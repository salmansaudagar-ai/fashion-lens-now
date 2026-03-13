import React, { useState, useEffect, useRef } from 'react';

/**
 * Overlay that appears when the browser goes offline.
 * Auto-hides when connectivity returns. Non-destructive — children stay mounted.
 */
export const ConnectionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [offline, setOffline] = useState(!navigator.onLine);
  const retryCount = useRef(0);

  useEffect(() => {
    const goOffline = () => { setOffline(true); retryCount.current = 0; };
    const goOnline = () => setOffline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Also detect "online but no actual connectivity" via periodic check
    const checkReal = async () => {
      if (!navigator.onLine) { setOffline(true); return; }
      try {
        // Lightweight HEAD to Supabase (same-origin, no CORS issues)
        const url = import.meta.env.VITE_SUPABASE_URL;
        if (url) {
          const r = await fetch(`${url}/rest/v1/`, { method: 'HEAD', cache: 'no-store' });
          if (r.ok || r.status === 400) { setOffline(false); return; }
        }
        setOffline(false);
      } catch {
        retryCount.current++;
        // Only show offline after 2 consecutive failures to avoid flicker
        if (retryCount.current >= 2) setOffline(true);
      }
    };

    const interval = setInterval(checkReal, 15_000);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      {children}
      {offline && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
          background: 'rgba(10, 10, 15, 0.92)', backdropFilter: 'blur(12px)',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(251, 146, 60, 0.1)', border: '2px solid rgba(251, 146, 60, 0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth={2} strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Connection Lost</h2>
            <p style={{ fontSize: 14, color: '#888' }}>Waiting for network… Will reconnect automatically.</p>
          </div>
          <div style={{
            width: 40, height: 40, border: '3px solid rgba(251,146,60,0.2)',
            borderTopColor: '#fb923c', borderRadius: '50%',
            animation: 'connSpin 1s linear infinite',
          }} />
          <style>{`@keyframes connSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </>
  );
};
