import React, { useState, useEffect, useCallback, useMemo } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FUNCTION_BASE = `${SUPABASE_URL}/functions/v1`;
const hdrs = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
const PIN_SESSION_KEY = 'trends_admin_pin';

/** Convert expired signed URLs to public URLs (bucket is now public) */
const toPublicUrl = (url: string | null): string | null => {
  if (!url) return null;
  // Already a public URL
  if (url.includes('/object/public/')) return url;
  // Signed URL pattern: .../object/sign/bucket/path?token=...
  const m = url.match(/\/object\/sign\/([^?]+)/);
  if (m) return `${SUPABASE_URL}/storage/v1/object/public/${m[1]}`;
  return url;
};

interface Session {
  id: string;
  session_token: string;
  registration_status: string;
  generation_count: number;
  selfie_url: string | null;
  full_body_url: string | null;
  generated_look_url: string | null;
  generated_video_url: string | null;
  garment_url: string | null;
  body_measurements: Record<string, any> | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

interface PromptRow { key: string; prompt: string; description: string | null; updated_at: string; }
interface HealthStatus { supabaseApi: boolean; edgeFunction: boolean; lastCheck: string; }

type TabKey = 'sessions' | 'analytics' | 'funnel' | 'prompts' | 'quality' | 'monitor';

// ── Cost estimates (INR) ─────────────────────────────────────
const COST = {
  geminiPerCall: 2.5,     // ~$0.03 per Gemini 2.5 Flash image gen
  veoPerVideo: 8.0,       // ~$0.10 per Veo 3 Fast video
  measurePerCall: 0.5,    // ~$0.006 per Gemini text call
  storagePerMB: 0.15,     // ~$0.002 per MB stored
  avgImageMB: 0.4,
  avgVideoMB: 3.0,
};

// ── PIN Gate wrapper ──────────────────────────────────────────
function PinGate({ children }: { children: React.ReactNode }) {
  const [pin, setPin] = useState<string | null>(() => sessionStorage.getItem(PIN_SESSION_KEY));
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!input.trim()) return;
    setChecking(true);
    setError('');
    try {
      const res = await fetch(`${FUNCTION_BASE}/validate-admin-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ pin: input.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        sessionStorage.setItem(PIN_SESSION_KEY, input.trim());
        setPin(input.trim());
      } else {
        setError('Incorrect PIN');
        setInput('');
      }
    } catch {
      setError('Validation failed');
    } finally {
      setChecking(false);
    }
  };

  if (pin) return <>{children}</>;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Command Centre</div>
        <div style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>Enter admin PIN to continue</div>
        <input
          type="password"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          placeholder="PIN"
          autoFocus
          style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid #333', background: '#111', color: '#fff', fontSize: 18, textAlign: 'center', letterSpacing: '0.3em', marginBottom: 12 }}
        />
        {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <button
          onClick={handleLogin}
          disabled={checking || !input.trim()}
          style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: checking ? '#333' : '#c8a97e', color: '#000', fontWeight: 600, fontSize: 15, border: 'none', cursor: checking ? 'wait' : 'pointer' }}
        >
          {checking ? 'Verifying…' : 'Unlock'}
        </button>
      </div>
    </div>
  );
}

const ModelComparison: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<TabKey>('sessions');
  const [health, setHealth] = useState<HealthStatus>({ supabaseApi: false, edgeFunction: false, lastCheck: '' });
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const PAGE_SIZE = 20;

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 200));
  }, []);

  // Fetch paginated sessions for table view
  const fetchSessions = useCallback(async () => {
    try {
      const offset = page * PAGE_SIZE;
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/vto_sessions?order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}&select=*`,
        { headers: { ...hdrs, Prefer: 'count=exact' } }
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const range = res.headers.get('content-range');
      if (range) { const m = range.match(/\/(\d+)/); if (m) setTotalCount(parseInt(m[1])); }
      setSessions(await res.json());
    } catch (e) { addLog(`Fetch sessions failed: ${e}`); }
  }, [page, addLog]);

  // Fetch ALL sessions for analytics (up to 1000)
  const fetchAllSessions = useCallback(async () => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/vto_sessions?order=created_at.desc&limit=1000&select=id,registration_status,generation_count,selfie_url,full_body_url,generated_look_url,generated_video_url,garment_url,body_measurements,created_at,updated_at`,
        { headers: hdrs }
      );
      if (res.ok) setAllSessions(await res.json());
    } catch {}
  }, []);

  const runHealthCheck = useCallback(async () => {
    const status: HealthStatus = { supabaseApi: false, edgeFunction: false, lastCheck: new Date().toISOString() };
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/vto_sessions?limit=1&select=id`, { headers: hdrs });
      status.supabaseApi = r.ok;
      addLog(`Supabase API: ${r.ok ? 'OK' : r.status}`);
    } catch (e) { addLog(`Supabase API: FAIL ${e}`); }
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/generate-virtual-tryon`, {
        method: 'POST',
        headers: { ...hdrs, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: '__health_check__' }),
      });
      status.edgeFunction = true;
      addLog(`Edge function: OK (status ${r.status})`);
    } catch (e) { addLog(`Edge function: FAIL ${e}`); }
    setHealth(status);
  }, [addLog]);

  useEffect(() => { fetchSessions(); fetchAllSessions(); runHealthCheck(); }, [fetchSessions, fetchAllSessions, runHealthCheck]);
  useEffect(() => {
    let tick = 0;
    const i = setInterval(() => {
      tick++;
      fetchSessions();
      if (tick % 6 === 0) { runHealthCheck(); fetchAllSessions(); }
    }, 10_000);
    return () => clearInterval(i);
  }, [fetchSessions, fetchAllSessions, runHealthCheck]);

  // Memoized stats
  const stats = useMemo(() => {
    let gens = 0, looks = 0, vids = 0, meas = 0;
    for (const s of sessions) {
      gens += s.generation_count;
      if (s.generated_look_url) looks++;
      if (s.generated_video_url) vids++;
      if (s.body_measurements) meas++;
    }
    return { totalGenerations: gens, withLooks: looks, withVideos: vids, withMeasurements: meas };
  }, [sessions]);

  const TAB_LABELS: Record<TabKey, string> = {
    sessions: 'Sessions',
    analytics: 'Analytics',
    funnel: 'Funnel',
    prompts: 'Prompts',
    quality: 'Quality',
    monitor: 'Monitoring',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e5e5e5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: health.supabaseApi && health.edgeFunction ? '#22c55e' : '#ef4444' }} />
          <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>VTO Command Centre</h1>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(Object.keys(TAB_LABELS) as TabKey[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
              background: tab === t ? 'rgba(255,255,255,0.1)' : 'transparent', color: tab === t ? '#fff' : '#888',
            }}>{TAB_LABELS[t]}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'sessions' && (
        <SessionsTab
          sessions={sessions} totalCount={totalCount} page={page} setPage={setPage}
          stats={stats} selectedSession={selectedSession} setSelectedSession={setSelectedSession}
          allSessions={allSessions}
        />
      )}
      {tab === 'analytics' && <AnalyticsTab allSessions={allSessions} />}
      {tab === 'funnel' && <FunnelTab allSessions={allSessions} />}
      {tab === 'prompts' && <PromptsTab />}
      {tab === 'quality' && <QualityTab />}
      {tab === 'monitor' && (
        <MonitorTab health={health} runHealthCheck={runHealthCheck} logs={logs} addLog={addLog} />
      )}

      {selectedSession && <SessionModal s={selectedSession} onClose={() => setSelectedSession(null)} />}
    </div>
  );
};

// ─── Sessions Tab ────────────────────────────────────────────────────────────

function SessionsTab({ sessions, totalCount, page, setPage, stats, selectedSession, setSelectedSession, allSessions }: {
  sessions: Session[]; totalCount: number; page: number; setPage: (fn: (p: number) => number) => void;
  stats: { totalGenerations: number; withLooks: number; withVideos: number; withMeasurements: number };
  selectedSession: Session | null; setSelectedSession: (s: Session | null) => void;
  allSessions: Session[];
}) {
  const PAGE_SIZE = 20;
  const [view, setView] = useState<'sessions' | 'generations'>('generations');
  const [generations, setGenerations] = useState<any[]>([]);
  const [genLoading, setGenLoading] = useState(false);

  // Fetch generations for the Generations view
  useEffect(() => {
    if (view !== 'generations') return;
    setGenLoading(true);
    fetch(`${SUPABASE_URL}/rest/v1/vto_generations?order=created_at.desc&limit=200&select=id,session_id,garment_url,garment_description,category,generated_look_url,generated_video_url,body_measurements,duration_ms,created_at`, { headers: hdrs })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setGenerations(data); })
      .catch(() => {})
      .finally(() => setGenLoading(false));
  }, [view]);

  const exportCSV = () => {
    const rows = allSessions.map(s => ({
      id: s.id,
      status: s.registration_status,
      name: s.full_name || '',
      phone: s.phone || '',
      generations: s.generation_count,
      has_selfie: s.selfie_url ? 'yes' : 'no',
      has_full_body: s.full_body_url ? 'yes' : 'no',
      has_garment: s.garment_url ? 'yes' : 'no',
      has_look: s.generated_look_url ? 'yes' : 'no',
      has_video: s.generated_video_url ? 'yes' : 'no',
      recommended_size: s.body_measurements?.recommended_size || '',
      created_at: s.created_at,
    }));
    const header = Object.keys(rows[0] || {}).join(',');
    const csv = [header, ...rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `vto-sessions-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[['Total Sessions', totalCount], ['Generations', stats.totalGenerations], ['Looks', stats.withLooks], ['Videos', stats.withVideos], ['Measurements', stats.withMeasurements]].map(([l, v]) => (
          <div key={String(l)} style={cardStyle}>
            <div style={labelStyle}>{String(l)}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{String(v)}</div>
          </div>
        ))}
      </div>

      {/* View toggle + Export */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 2 }}>
          {(['generations', 'sessions'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 16px', borderRadius: 6, fontSize: 12, border: 'none', cursor: 'pointer', fontWeight: 600,
              background: view === v ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: view === v ? '#818cf8' : '#888',
            }}>{v === 'generations' ? 'Try-Ons' : 'Sessions'}</button>
          ))}
        </div>
        <button onClick={exportCSV} style={{ ...btn, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>&#8615;</span> Export CSV
        </button>
      </div>

      {/* Generations View — each garment try-on as separate row */}
      {view === 'generations' && (
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['Time', 'Garment', 'Category', 'VTO Result', 'Video', 'Size', 'Duration', 'Description'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {genLoading ? (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#666', padding: 40 }}>Loading...</td></tr>
              ) : generations.length === 0 ? (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#666', padding: 40 }}>No try-ons yet. They'll appear here after the first VTO generation.</td></tr>
              ) : generations.map(g => (
                <tr key={g.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={td}>{fmtTime(g.created_at)}</td>
                  <td style={td}><Thumb url={g.garment_url} /></td>
                  <td style={td}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#ccc' }}>{g.category || '—'}</span></td>
                  <td style={td}><Thumb url={g.generated_look_url} /></td>
                  <td style={td}>{g.generated_video_url ? <span style={{ color: '#22c55e', fontSize: 12 }}>YES</span> : <span style={{ color: '#444' }}>—</span>}</td>
                  <td style={td}><span style={{ fontWeight: 600 }}>{g.body_measurements?.recommended_size || '—'}</span></td>
                  <td style={td}>{g.duration_ms ? `${(g.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                  <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.garment_description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sessions View — original view */}
      {view === 'sessions' && (
        <>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {['Time', 'Status', 'User', 'Selfie', 'Full Body', 'Garment', 'VTO Result', 'Video', 'Size', 'Gens'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} onClick={() => setSelectedSession(s)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={td}>{fmtTime(s.created_at)}</td>
                    <td style={td}><span style={{ color: s.registration_status === 'registered' ? '#22c55e' : s.registration_status === 'generating' ? '#f59e0b' : '#888', fontSize: 12, fontWeight: 500 }}>{s.registration_status}</span></td>
                    <td style={td}>{s.full_name || s.phone || '—'}</td>
                    <td style={td}><Thumb url={s.selfie_url} /></td>
                    <td style={td}><Thumb url={s.full_body_url} /></td>
                    <td style={td}><Thumb url={s.garment_url} /></td>
                    <td style={td}><Thumb url={s.generated_look_url} /></td>
                    <td style={td}>{s.generated_video_url ? <span style={{ color: '#22c55e', fontSize: 12 }}>YES</span> : <span style={{ color: '#444' }}>—</span>}</td>
                    <td style={td}><span style={{ fontWeight: 600 }}>{s.body_measurements?.recommended_size || '—'}</span></td>
                    <td style={td}>{s.generation_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13, color: '#888' }}>
            <span>Page {page + 1} of {Math.ceil(totalCount / PAGE_SIZE) || 1} ({totalCount} total)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={btn}>Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= totalCount} style={btn}>Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Analytics Tab ───────────────────────────────────────────────────────────

function AnalyticsTab({ allSessions }: { allSessions: Session[] }) {
  const [range, setRange] = useState<'7d' | '14d' | '30d' | 'all'>('14d');

  const analytics = useMemo(() => {
    const now = new Date();
    const cutoff = range === 'all' ? null : new Date(now.getTime() - ({ '7d': 7, '14d': 14, '30d': 30 }[range]) * 86400000);

    const filtered = cutoff ? allSessions.filter(s => new Date(s.created_at) >= cutoff) : allSessions;

    // ── Daily trend ──
    const dailyMap = new Map<string, { sessions: number; looks: number; videos: number; measurements: number; gens: number }>();
    const hourCounts = new Array(24).fill(0);

    for (const s of filtered) {
      const d = new Date(s.created_at);
      const day = d.toISOString().slice(0, 10);
      const hour = d.getHours();
      hourCounts[hour]++;

      const entry = dailyMap.get(day) || { sessions: 0, looks: 0, videos: 0, measurements: 0, gens: 0 };
      entry.sessions++;
      entry.gens += s.generation_count;
      if (s.generated_look_url) entry.looks++;
      if (s.generated_video_url) entry.videos++;
      if (s.body_measurements) entry.measurements++;
      dailyMap.set(day, entry);
    }

    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    // ── Size distribution ──
    const sizeMap = new Map<string, number>();
    for (const s of filtered) {
      const size = s.body_measurements?.recommended_size;
      if (size) sizeMap.set(size, (sizeMap.get(size) || 0) + 1);
    }
    const sizes = Array.from(sizeMap.entries()).sort(([, a], [, b]) => b - a);

    // ── Cost estimates ──
    const totalGens = filtered.reduce((a, s) => a + s.generation_count, 0);
    const totalLooks = filtered.filter(s => s.generated_look_url).length;
    const totalVideos = filtered.filter(s => s.generated_video_url).length;
    const totalMeas = filtered.filter(s => s.body_measurements).length;

    const costBreakdown = {
      gemini: totalGens * COST.geminiPerCall,
      video: totalVideos * COST.veoPerVideo,
      measurements: totalMeas * COST.measurePerCall,
      storage: (totalLooks * COST.avgImageMB + totalVideos * COST.avgVideoMB) * COST.storagePerMB,
    };
    const totalCost = costBreakdown.gemini + costBreakdown.video + costBreakdown.measurements + costBreakdown.storage;
    const costPerSession = filtered.length > 0 ? totalCost / filtered.length : 0;

    // ── Processing time estimate (created_at → updated_at diff) ──
    const times: number[] = [];
    for (const s of filtered) {
      if (s.generated_look_url) {
        const diff = (new Date(s.updated_at).getTime() - new Date(s.created_at).getTime()) / 1000;
        if (diff > 0 && diff < 600) times.push(diff);
      }
    }
    times.sort((a, b) => a - b);
    const p50 = times.length > 0 ? times[Math.floor(times.length * 0.5)] : 0;
    const p95 = times.length > 0 ? times[Math.floor(times.length * 0.95)] : 0;

    return { daily, hourCounts, sizes, filtered, costBreakdown, totalCost, costPerSession, p50, p95, totalGens, totalLooks, totalVideos, totalMeas };
  }, [allSessions, range]);

  // Peak hour
  const peakHour = analytics.hourCounts.indexOf(Math.max(...analytics.hourCounts));
  const maxHour = Math.max(...analytics.hourCounts, 1);
  const maxDaily = Math.max(...analytics.daily.map(d => d.sessions), 1);

  return (
    <div style={{ padding: 24 }}>
      {/* Range selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Analytics Dashboard</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['7d', '14d', '30d', 'all'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, border: 'none', cursor: 'pointer',
              background: range === r ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
              color: range === r ? '#818cf8' : '#888',
            }}>{r === 'all' ? 'All time' : `Last ${r.replace('d', ' days')}`}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
        <KPI label="Sessions" value={analytics.filtered.length} />
        <KPI label="Generations" value={analytics.totalGens} />
        <KPI label="Looks" value={analytics.totalLooks} />
        <KPI label="Videos" value={analytics.totalVideos} />
        <KPI label="Est. Cost" value={`₹${analytics.totalCost.toFixed(0)}`} sub={`₹${analytics.costPerSession.toFixed(1)}/session`} />
        <KPI label="Avg Time" value={`${analytics.p50.toFixed(0)}s`} sub={`p95: ${analytics.p95.toFixed(0)}s`} />
      </div>

      {/* Daily trend chart */}
      <div style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Daily Try-Ons</div>
        {analytics.daily.length === 0 ? (
          <div style={{ color: '#666', fontSize: 13, padding: 20, textAlign: 'center' }}>No data for this period</div>
        ) : (
          <div style={{ position: 'relative', height: 200 }}>
            <svg width="100%" height="200" viewBox={`0 0 ${Math.max(analytics.daily.length * 48, 400)} 200`} preserveAspectRatio="none">
              {/* Grid lines */}
              {[0.25, 0.5, 0.75, 1].map(f => (
                <line key={f} x1="0" x2="100%" y1={200 - f * 170} y2={200 - f * 170} stroke="rgba(255,255,255,0.04)" />
              ))}
              {/* Bars */}
              {analytics.daily.map((d, i) => {
                const x = i * 48 + 4;
                const barH = (d.sessions / maxDaily) * 170;
                const lookH = (d.looks / maxDaily) * 170;
                return (
                  <g key={d.date}>
                    <rect x={x} y={200 - barH} width={18} height={barH} rx={3} fill="rgba(99,102,241,0.5)" />
                    <rect x={x + 20} y={200 - lookH} width={18} height={lookH} rx={3} fill="rgba(34,197,94,0.5)" />
                    <text x={x + 18} y={196} fontSize="9" fill="#666" textAnchor="middle">
                      {d.date.slice(5)}
                    </text>
                    <title>{`${d.date}: ${d.sessions} sessions, ${d.looks} looks, ${d.videos} videos`}</title>
                  </g>
                );
              })}
            </svg>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#888' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'rgba(99,102,241,0.5)', marginRight: 4 }} />Sessions</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'rgba(34,197,94,0.5)', marginRight: 4 }} />Looks Generated</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Peak hours */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Peak Hours</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>Busiest: {peakHour}:00–{peakHour + 1}:00 ({analytics.hourCounts[peakHour]} sessions)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
            {analytics.hourCounts.map((c, h) => (
              <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: '100%', height: Math.max((c / maxHour) * 70, 2), borderRadius: 2,
                  background: h === peakHour ? '#f59e0b' : c > 0 ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.04)',
                  transition: 'height 0.3s',
                }} title={`${h}:00 — ${c} sessions`} />
                {h % 4 === 0 && <span style={{ fontSize: 9, color: '#666', marginTop: 2 }}>{h}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Size distribution */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Size Distribution</div>
          {analytics.sizes.length === 0 ? (
            <div style={{ color: '#666', fontSize: 13, padding: 12 }}>No size data yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {analytics.sizes.map(([size, count]) => {
                const max = analytics.sizes[0][1];
                return (
                  <div key={size} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, width: 32, color: '#fff' }}>{size}</span>
                    <div style={{ flex: 1, height: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(count / max) * 100}%`, background: 'rgba(168,85,247,0.4)', borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                        <span style={{ fontSize: 11, color: '#e5e5e5' }}>{count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cost breakdown */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Cost Breakdown (Est.)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Gemini VTO', analytics.costBreakdown.gemini, '#6366f1'],
              ['Veo Video', analytics.costBreakdown.video, '#22c55e'],
              ['Measurements', analytics.costBreakdown.measurements, '#f59e0b'],
              ['Storage', analytics.costBreakdown.storage, '#8b5cf6'],
            ].map(([label, cost, color]) => (
              <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: String(color) }} />
                  <span style={{ color: '#ccc' }}>{String(label)}</span>
                </div>
                <span style={{ fontWeight: 600, color: '#fff' }}>₹{Number(cost).toFixed(1)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
              <span style={{ color: '#ccc' }}>Total</span>
              <span style={{ color: '#fff' }}>₹{analytics.totalCost.toFixed(0)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Funnel Tab ──────────────────────────────────────────────────────────────

function FunnelTab({ allSessions }: { allSessions: Session[] }) {
  const funnel = useMemo(() => {
    const total = allSessions.length;
    const withSelfie = allSessions.filter(s => s.selfie_url).length;
    const withFullBody = allSessions.filter(s => s.full_body_url).length;
    const withGarment = allSessions.filter(s => s.garment_url).length;
    const withLook = allSessions.filter(s => s.generated_look_url).length;
    const withVideo = allSessions.filter(s => s.generated_video_url).length;
    const withMeasure = allSessions.filter(s => s.body_measurements).length;
    const multiGen = allSessions.filter(s => s.generation_count > 1).length;

    return [
      { label: 'Session Created', count: total, color: '#6366f1' },
      { label: 'Selfie Captured', count: withSelfie, color: '#818cf8' },
      { label: 'Full Body Captured', count: withFullBody, color: '#8b5cf6' },
      { label: 'Garment Selected', count: withGarment, color: '#a78bfa' },
      { label: 'VTO Look Generated', count: withLook, color: '#22c55e' },
      { label: 'Video Generated', count: withVideo, color: '#16a34a' },
      { label: 'Measurements Taken', count: withMeasure, color: '#f59e0b' },
      { label: 'Repeat Try-On (>1 gen)', count: multiGen, color: '#ec4899' },
    ];
  }, [allSessions]);

  const maxCount = Math.max(funnel[0]?.count || 1, 1);

  // Failure analysis
  const failures = useMemo(() => {
    const noSelfie = allSessions.filter(s => !s.selfie_url && !s.full_body_url).length;
    const noGarment = allSessions.filter(s => s.full_body_url && !s.garment_url).length;
    const noLook = allSessions.filter(s => s.garment_url && !s.generated_look_url).length;
    const stuck = allSessions.filter(s => s.registration_status === 'generating').length;
    return [
      { label: 'Abandoned before capture', count: noSelfie, severity: noSelfie > 3 ? 'high' : 'low' },
      { label: 'No garment selected', count: noGarment, severity: noGarment > 2 ? 'med' : 'low' },
      { label: 'VTO generation failed', count: noLook, severity: noLook > 1 ? 'high' : 'low' },
      { label: 'Currently stuck', count: stuck, severity: stuck > 0 ? 'high' : 'low' },
    ];
  }, [allSessions]);

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 24 }}>User Journey Funnel</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Funnel visualization */}
        <div style={{ ...cardStyle, padding: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {funnel.map((step, i) => {
              const pct = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
              const dropoff = i > 0 && funnel[i - 1].count > 0
                ? ((funnel[i - 1].count - step.count) / funnel[i - 1].count * 100).toFixed(0)
                : null;
              return (
                <div key={step.label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 2 }}>
                    <div style={{ width: 160, fontSize: 13, color: '#ccc', textAlign: 'right' }}>{step.label}</div>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <div style={{
                        height: 32, borderRadius: 6, background: step.color, opacity: 0.6,
                        width: `${Math.max(pct, 3)}%`, transition: 'width 0.5s ease',
                        display: 'flex', alignItems: 'center', paddingLeft: 10,
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>
                          {step.count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                    {dropoff && Number(dropoff) > 0 && (
                      <span style={{ fontSize: 11, color: '#ef4444', width: 60, textAlign: 'right' }}>-{dropoff}%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Failure analysis */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Drop-off Analysis</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {failures.map(f => (
              <div key={f.label} style={{
                padding: '12px 16px', borderRadius: 8, fontSize: 13,
                background: f.severity === 'high' ? 'rgba(239,68,68,0.08)' : f.severity === 'med' ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${f.severity === 'high' ? 'rgba(239,68,68,0.15)' : f.severity === 'med' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#ccc' }}>{f.label}</span>
                  <span style={{
                    fontWeight: 700, fontSize: 18,
                    color: f.severity === 'high' ? '#ef4444' : f.severity === 'med' ? '#f59e0b' : '#888',
                  }}>{f.count}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Completion rate */}
          <div style={{ marginTop: 20, padding: '16px 20px', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Overall Completion Rate</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>
              {allSessions.length > 0
                ? `${((allSessions.filter(s => s.generated_look_url).length / allSessions.length) * 100).toFixed(0)}%`
                : '—'}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Sessions → VTO Look</div>
          </div>

          {/* Engagement rate */}
          <div style={{ marginTop: 12, padding: '16px 20px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Repeat Try-On Rate</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#818cf8' }}>
              {allSessions.length > 0
                ? `${((allSessions.filter(s => s.generation_count > 1).length / allSessions.length) * 100).toFixed(0)}%`
                : '—'}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Users who tried &gt;1 garment</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Quality Tab ─────────────────────────────────────────────────────────────

interface RatingRow {
  id: string;
  session_id: string;
  rating_type: string;
  rating: number;
  thumbs: string;
  issues: string[] | null;
  prompt_key: string | null;
  prompt_version: string | null;
  garment_category: string | null;
  customer_profile: Record<string, any> | null;
  created_at: string;
}

function QualityTab() {
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/vto_ratings?select=*&order=created_at.desc&limit=200`, { headers: hdrs });
        if (res.ok) setRatings(await res.json());
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const totalRatings = ratings.length;
  const avgRating = totalRatings > 0 ? (ratings.reduce((s, r) => s + r.rating, 0) / totalRatings).toFixed(1) : '—';
  const thumbsUp = ratings.filter(r => r.thumbs === 'up').length;
  const thumbsOk = ratings.filter(r => r.thumbs === 'ok').length;
  const thumbsDown = ratings.filter(r => r.thumbs === 'down').length;
  const satisfaction = totalRatings > 0 ? Math.round((thumbsUp / totalRatings) * 100) : 0;

  // Issues breakdown
  const issueCount: Record<string, number> = {};
  ratings.forEach(r => { (r.issues || []).forEach(i => { issueCount[i] = (issueCount[i] || 0) + 1; }); });
  const sortedIssues = Object.entries(issueCount).sort((a, b) => b[1] - a[1]);

  // By category
  const catStats: Record<string, { total: number; sum: number }> = {};
  ratings.forEach(r => {
    const cat = r.garment_category || 'unknown';
    if (!catStats[cat]) catStats[cat] = { total: 0, sum: 0 };
    catStats[cat].total++;
    catStats[cat].sum += r.rating;
  });

  // By skin tone (from customer_profile in ratings)
  const skinStats: Record<string, { total: number; sum: number }> = {};
  ratings.forEach(r => {
    const tone = r.customer_profile?.skin_tone || 'unknown';
    if (!skinStats[tone]) skinStats[tone] = { total: 0, sum: 0 };
    skinStats[tone].total++;
    skinStats[tone].sum += r.rating;
  });

  const cardStyle = { background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '20px 24px' };
  const labelStyle = { fontSize: 11, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 600, marginBottom: 4 };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>Loading quality data...</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 4 }}>Quality & Feedback Analytics</h2>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Customer ratings, issue tracking, and quality metrics across categories and demographics.</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>Total Ratings</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{totalRatings}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Avg Rating</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{avgRating}<span style={{ fontSize: 14, color: '#666' }}>/5</span></div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Satisfaction</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: satisfaction >= 70 ? '#22c55e' : satisfaction >= 40 ? '#eab308' : '#ef4444' }}>{satisfaction}%</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Thumbs Distribution</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: 14 }}>👍 <b style={{ color: '#22c55e' }}>{thumbsUp}</b></span>
            <span style={{ fontSize: 14 }}>👌 <b style={{ color: '#eab308' }}>{thumbsOk}</b></span>
            <span style={{ fontSize: 14 }}>👎 <b style={{ color: '#ef4444' }}>{thumbsDown}</b></span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Top Issues */}
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#fff' }}>Top Issues Reported</div>
          {sortedIssues.length === 0 ? (
            <div style={{ fontSize: 13, color: '#666' }}>No issues reported yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sortedIssues.slice(0, 8).map(([issue, count]) => (
                <div key={issue} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#ccc' }}>{issue}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: Math.min(count / (sortedIssues[0]?.[1] || 1) * 80, 80), height: 6, borderRadius: 3, background: '#ef4444' }} />
                    <span style={{ fontSize: 12, color: '#888', minWidth: 20, textAlign: 'right' }}>{count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Category */}
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#fff' }}>Quality by Category</div>
          {Object.keys(catStats).length === 0 ? (
            <div style={{ fontSize: 13, color: '#666' }}>No data yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(catStats).map(([cat, s]) => {
                const avg = (s.sum / s.total).toFixed(1);
                return (
                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#ccc', textTransform: 'capitalize' }}>{cat.replace(/_/g, ' ')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ width: `${(Number(avg) / 5) * 100}%`, height: '100%', borderRadius: 3, background: Number(avg) >= 4 ? '#22c55e' : Number(avg) >= 3 ? '#eab308' : '#ef4444' }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#888', minWidth: 40, textAlign: 'right' }}>{avg}/5 ({s.total})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* By skin tone */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#fff' }}>Quality by Skin Tone</div>
        {Object.keys(skinStats).length === 0 ? (
          <div style={{ fontSize: 13, color: '#666' }}>No data yet — ratings will appear as customers use the system.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {Object.entries(skinStats).map(([tone, s]) => {
              const avg = (s.sum / s.total).toFixed(1);
              return (
                <div key={tone} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, color: '#888', textTransform: 'capitalize', marginBottom: 4 }}>{tone.replace(/-/g, ' ')}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: Number(avg) >= 4 ? '#22c55e' : Number(avg) >= 3 ? '#eab308' : '#ef4444' }}>{avg}<span style={{ fontSize: 12, color: '#666' }}>/5</span></div>
                  <div style={{ fontSize: 11, color: '#666' }}>{s.total} ratings</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent ratings table */}
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#fff' }}>Recent Ratings</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Time', 'Thumbs', 'Rating', 'Category', 'Skin Tone', 'Issues', 'Prompt'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#888', textTransform: 'uppercase', fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ratings.slice(0, 20).map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px 12px', color: '#888' }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 16 }}>{r.thumbs === 'up' ? '👍' : r.thumbs === 'ok' ? '👌' : '👎'}</span>
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: r.rating >= 4 ? '#22c55e' : r.rating >= 3 ? '#eab308' : '#ef4444' }}>{r.rating}/5</td>
                  <td style={{ padding: '8px 12px', color: '#ccc', textTransform: 'capitalize' }}>{(r.garment_category || '—').replace(/_/g, ' ')}</td>
                  <td style={{ padding: '8px 12px', color: '#ccc', textTransform: 'capitalize' }}>{(r.customer_profile?.skin_tone || '—').replace(/-/g, ' ')}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {(r.issues || []).map(i => (
                      <span key={i} style={{ display: 'inline-block', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 4, padding: '2px 6px', marginRight: 4, fontSize: 10 }}>{i}</span>
                    ))}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#888', fontSize: 10 }}>{r.prompt_version || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Prompts Tab ─────────────────────────────────────────────────────────────

interface PromptVersion {
  id: string;
  prompt_key: string;
  version: string;
  prompt: string;
  description: string | null;
  is_active: boolean;
  traffic_weight: number;
  total_uses: number;
  avg_rating: number | null;
  created_at: string;
  updated_at: string;
}

function PromptsTab() {
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'legacy' | 'adaptive'>('adaptive');

  useEffect(() => { fetchPrompts(); fetchVersions(); }, []);

  const fetchPrompts = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompts?select=*&order=key`, { headers: hdrs });
      if (res.ok) setPrompts(await res.json());
    } catch {}
  };

  const fetchVersions = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompt_versions?select=*&order=prompt_key,version`, { headers: hdrs });
      if (res.ok) setVersions(await res.json());
    } catch {}
  };

  const startEdit = (key: string, prompt: string) => { setEditing(key); setEditValue(prompt); setStatus(null); };
  const cancelEdit = () => { setEditing(null); setEditValue(''); setStatus(null); };

  const savePrompt = async (key: string) => {
    setSaving(true); setStatus(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompts?key=eq.${key}`, {
        method: 'PATCH',
        headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ prompt: editValue, updated_at: new Date().toISOString() }),
      });
      if (res.ok) { setStatus('Saved!'); setEditing(null); fetchPrompts(); }
      else setStatus(`Error saving: ${res.status}`);
    } catch (e) { setStatus(`Error: ${e}`); }
    setSaving(false);
  };

  const saveVersion = async (id: string) => {
    setSaving(true); setStatus(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompt_versions?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ prompt: editValue, updated_at: new Date().toISOString() }),
      });
      if (res.ok) { setStatus('Saved!'); setEditing(null); fetchVersions(); }
      else setStatus(`Error: ${res.status}`);
    } catch (e) { setStatus(`Error: ${e}`); }
    setSaving(false);
  };

  const toggleVersionActive = async (v: PromptVersion) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/vto_prompt_versions?id=eq.${v.id}`, {
        method: 'PATCH',
        headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ is_active: !v.is_active }),
      });
      fetchVersions();
    } catch {}
  };

  const updateWeight = async (v: PromptVersion, weight: number) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/vto_prompt_versions?id=eq.${v.id}`, {
        method: 'PATCH',
        headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ traffic_weight: weight }),
      });
      fetchVersions();
    } catch {}
  };

  const labelMap: Record<string, string> = {
    vto_3image: 'VTO Image (3-image flow)',
    vto_2image: 'VTO Image (2-image flow)',
    video: 'Video Generation',
    measurements: 'Body Measurements',
    profile_detect: 'Customer Profile Detection',
    vto_western_upper: 'Western Topwear',
    vto_western_lower: 'Western Bottomwear',
    vto_ethnic: 'Indian Ethnic Wear',
    vto_footwear: 'Footwear',
    measurements_male: 'Measurements (Male)',
    measurements_female: 'Measurements (Female)',
    video_ethnic: 'Video (Ethnic)',
    video_western: 'Video (Western)',
  };

  // Group versions by prompt_key
  const groupedVersions: Record<string, PromptVersion[]> = {};
  versions.forEach(v => {
    if (!groupedVersions[v.prompt_key]) groupedVersions[v.prompt_key] = [];
    groupedVersions[v.prompt_key].push(v);
  });

  const VARIABLES_REF = '{gender}, {age_range}, {skin_tone}, {skin_undertone}, {body_type}, {hair}, {distinctive_features}, {ethnicity_region}, {categoryLabel}, {garmentDescription}';

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 4 }}>Prompt Management</h2>
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Edit prompts used by the VTO pipeline. Adaptive prompts use customer profile variables for personalized results.</p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setViewMode('adaptive')} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
            background: viewMode === 'adaptive' ? 'rgba(255,255,255,0.1)' : 'transparent', color: viewMode === 'adaptive' ? '#fff' : '#888',
          }}>Adaptive (A/B)</button>
          <button onClick={() => setViewMode('legacy')} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
            background: viewMode === 'legacy' ? 'rgba(255,255,255,0.1)' : 'transparent', color: viewMode === 'legacy' ? '#fff' : '#888',
          }}>Legacy</button>
        </div>
      </div>

      {/* Available variables reference */}
      <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 8, fontSize: 12, background: 'rgba(59,130,246,0.08)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.15)' }}>
        <b>Available variables:</b> {VARIABLES_REF}
      </div>

      {status && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 8, fontSize: 13, background: status.includes('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: status.includes('Error') ? '#ef4444' : '#22c55e', border: `1px solid ${status.includes('Error') ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
          {status}
        </div>
      )}

      {viewMode === 'adaptive' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(groupedVersions).map(([key, vers]) => (
            <div key={key} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{labelMap[key] || key}</div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{vers.length} version{vers.length > 1 ? 's' : ''} — A/B testing {vers.filter(v => v.is_active).length > 1 ? 'active' : 'single version'}</div>
              </div>
              {vers.map(v => (
                <div key={v.id} style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#ccc' }}>{v.version}</span>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: v.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
                        color: v.is_active ? '#22c55e' : '#666',
                      }}>{v.is_active ? 'Active' : 'Inactive'}</span>
                      {v.avg_rating != null && (
                        <span style={{ fontSize: 11, color: v.avg_rating >= 4 ? '#22c55e' : v.avg_rating >= 3 ? '#eab308' : '#ef4444' }}>
                          ★ {v.avg_rating.toFixed(1)} ({v.total_uses} uses)
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, color: '#666' }}>Weight:</label>
                      <input
                        type="number" min={0} max={100} value={v.traffic_weight}
                        onChange={e => updateWeight(v, Number(e.target.value))}
                        style={{ width: 50, padding: '3px 6px', borderRadius: 4, fontSize: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', textAlign: 'center' }}
                      />
                      <button onClick={() => toggleVersionActive(v)} style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, border: '1px solid rgba(255,255,255,0.1)',
                        background: 'transparent', color: v.is_active ? '#ef4444' : '#22c55e', cursor: 'pointer',
                      }}>{v.is_active ? 'Disable' : 'Enable'}</button>
                      <button onClick={() => startEdit(v.id, v.prompt)} style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, border: '1px solid rgba(255,255,255,0.15)',
                        background: 'rgba(255,255,255,0.05)', color: '#ccc', cursor: 'pointer',
                      }}>Edit</button>
                    </div>
                  </div>
                  {editing === v.id ? (
                    <div>
                      <textarea value={editValue} onChange={e => setEditValue(e.target.value)} style={{
                        width: '100%', minHeight: 200, padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6,
                        fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e5e5e5', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                      }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                        <button onClick={cancelEdit} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#888', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={() => saveVersion(v.id)} disabled={saving || editValue === v.prompt} style={{
                          padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: saving ? 'wait' : 'pointer',
                          background: editValue === v.prompt ? 'rgba(255,255,255,0.05)' : '#22c55e', color: editValue === v.prompt ? '#666' : '#000',
                        }}>{saving ? 'Saving...' : 'Save'}</button>
                      </div>
                    </div>
                  ) : (
                    <pre style={{ fontSize: 11, lineHeight: 1.5, color: '#888', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'monospace', maxHeight: 120, overflow: 'auto' }}>{v.prompt}</pre>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        /* Legacy prompts view */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {prompts.map(p => (
            <div key={p.key} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{labelMap[p.key] || p.key}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{p.description} — last updated {new Date(p.updated_at).toLocaleString()}</div>
                </div>
                {editing !== p.key && (
                  <button onClick={() => startEdit(p.key, p.prompt)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#ccc', cursor: 'pointer' }}>
                    Edit
                  </button>
                )}
              </div>
              {editing === p.key ? (
                <div style={{ padding: 16 }}>
                  <textarea value={editValue} onChange={e => setEditValue(e.target.value)} style={{
                    width: '100%', minHeight: 240, padding: 14, borderRadius: 8, fontSize: 13, lineHeight: 1.6,
                    fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e5e5e5', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button onClick={cancelEdit} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#888', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => savePrompt(p.key)} disabled={saving || editValue === p.prompt} style={{
                      padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: saving ? 'wait' : 'pointer',
                      background: editValue === p.prompt ? 'rgba(255,255,255,0.05)' : '#22c55e', color: editValue === p.prompt ? '#666' : '#000',
                    }}>{saving ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 20px', maxHeight: 180, overflow: 'auto' }}>
                  <pre style={{ fontSize: 12, lineHeight: 1.6, color: '#999', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'monospace' }}>{p.prompt}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Monitor Tab ─────────────────────────────────────────────────────────────

function MonitorTab({ health, runHealthCheck, logs, addLog }: {
  health: HealthStatus; runHealthCheck: () => void; logs: string[]; addLog: (msg: string) => void;
}) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[['Supabase API', health.supabaseApi], ['Edge Function (VTO)', health.edgeFunction], ['Last Check', true]].map(([label, ok]) => (
          <div key={String(label)} style={{
            background: ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', borderRadius: 12,
            border: `1px solid ${ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`, padding: '20px 24px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444' }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{String(label)}</div>
              <div style={{ fontSize: 12, color: ok ? '#22c55e' : '#ef4444' }}>
                {String(label) === 'Last Check' ? (health.lastCheck ? new Date(health.lastCheck).toLocaleTimeString() : 'never') : (ok ? 'Healthy' : 'Down')}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={runHealthCheck} style={{ ...btn, marginBottom: 16 }}>Run Health Check Now</button>

      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, margin: 0 }}>Stuck Sessions (status = "generating")</h3>
        <StuckList addLog={addLog} />
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, margin: 0 }}>Activity Log</h3>
        <div style={{ maxHeight: 400, overflow: 'auto', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8 }}>
          {logs.length === 0 && <span style={{ color: '#666' }}>No events yet...</span>}
          {logs.map((log, i) => (
            <div key={i} style={{ color: log.includes('FAIL') || log.includes('ERROR') ? '#ef4444' : log.includes('OK') ? '#22c55e' : '#999' }}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shared Sub-components ───────────────────────────────────────────────────

function KPI({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  const pub = toPublicUrl(url);
  if (!pub) return <span style={{ color: '#444' }}>—</span>;
  return <img src={pub} alt="" style={{ width: 36, height: 48, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }} />;
}

function StuckList({ addLog }: { addLog: (msg: string) => void }) {
  const [stuck, setStuck] = useState<Session[]>([]);
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/vto_sessions?registration_status=eq.generating&select=id,session_token,registration_status,created_at,updated_at`, { headers: hdrs });
        if (r.ok) { const data = await r.json(); setStuck(data); if (data.length > 0) addLog(`Found ${data.length} stuck session(s)`); }
      } catch {}
    };
    check();
    const i = setInterval(check, 30_000);
    return () => clearInterval(i);
  }, [addLog]);

  if (stuck.length === 0) return <div style={{ color: '#22c55e', fontSize: 13, marginTop: 8 }}>None — all clear</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {stuck.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, fontSize: 13 }}>
          <span>{s.id.substring(0, 12)}... stuck since {fmtTime(s.updated_at)}</span>
          <button onClick={async () => {
            await fetch(`${SUPABASE_URL}/rest/v1/vto_sessions?id=eq.${s.id}`, {
              method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ registration_status: 'registered' })
            });
            addLog(`Reset stuck session ${s.id.substring(0, 8)}`);
            setStuck(prev => prev.filter(x => x.id !== s.id));
          }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>
            Reset
          </button>
        </div>
      ))}
    </div>
  );
}

function SessionModal({ s, onClose }: { s: Session; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#111118', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', maxWidth: 900, width: '90%', maxHeight: '90vh', overflow: 'auto', padding: 32 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Session Detail</h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#ccc', cursor: 'pointer' }}>Close</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24, fontSize: 13 }}>
          <div><span style={{ color: '#888' }}>ID:</span> {s.id}</div>
          <div><span style={{ color: '#888' }}>Status:</span> {s.registration_status}</div>
          <div><span style={{ color: '#888' }}>Created:</span> {new Date(s.created_at).toLocaleString()}</div>
          <div><span style={{ color: '#888' }}>Generations:</span> {s.generation_count}</div>
          <div><span style={{ color: '#888' }}>User:</span> {s.full_name || '—'}</div>
          <div><span style={{ color: '#888' }}>Phone:</span> {s.phone || '—'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[['Selfie', s.selfie_url], ['Full Body', s.full_body_url], ['Garment', s.garment_url], ['VTO Result', s.generated_look_url]].map(([label, url]) => {
            const pub = toPublicUrl(url as string | null);
            return (
            <div key={String(label)}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{String(label)}</div>
              {pub ? <img src={pub} alt={String(label)} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
                : <div style={{ width: '100%', height: 200, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 13 }}>No image</div>}
            </div>
            );
          })}
        </div>
        {s.generated_video_url && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Generated Video</div>
            <video src={toPublicUrl(s.generated_video_url)!} controls autoPlay loop muted style={{ maxHeight: 300, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
        )}
        {s.body_measurements && (
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Body Measurements</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 13 }}>
              {Object.entries(s.body_measurements).map(([k, v]) => (
                <div key={k} style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 8 }}>
                  <span style={{ color: '#888' }}>{k.replace(/_/g, ' ')}:</span> <span style={{ color: '#fff', fontWeight: 500 }}>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Shared styles ───────────────────────────────────────────────────────────
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle' };
const btn: React.CSSProperties = { padding: '6px 14px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#ccc', cursor: 'pointer' };
const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '16px 20px' };
const labelStyle: React.CSSProperties = { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };

const ModelComparisonWithAuth: React.FC = () => (
  <PinGate><ModelComparison /></PinGate>
);

export default ModelComparisonWithAuth;
