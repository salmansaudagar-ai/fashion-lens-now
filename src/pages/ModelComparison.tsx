import React, { useState, useEffect, useCallback } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const hdrs = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

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

interface PromptRow {
  key: string;
  prompt: string;
  description: string | null;
  updated_at: string;
}

interface HealthStatus {
  supabaseApi: boolean;
  edgeFunction: boolean;
  lastCheck: string;
}

const ModelComparison: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<'sessions' | 'prompts' | 'monitor'>('sessions');
  const [health, setHealth] = useState<HealthStatus>({ supabaseApi: false, edgeFunction: false, lastCheck: '' });
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const PAGE_SIZE = 20;

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 200));
  }, []);

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

  const runHealthCheck = useCallback(async () => {
    const status: HealthStatus = { supabaseApi: false, edgeFunction: false, lastCheck: new Date().toISOString() };
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/vto_sessions?limit=1&select=id`, { headers: hdrs });
      status.supabaseApi = r.ok;
      addLog(`Supabase API: ${r.ok ? 'OK' : r.status}`);
    } catch (e) { addLog(`Supabase API: FAIL ${e}`); }
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/generate-virtual-tryon`, { method: 'OPTIONS', headers: hdrs });
      status.edgeFunction = r.ok;
      addLog(`Edge function: ${r.ok ? 'OK' : r.status}`);
    } catch (e) { addLog(`Edge function: FAIL ${e}`); }
    setHealth(status);
  }, [addLog]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useEffect(() => { runHealthCheck(); const i = setInterval(runHealthCheck, 60_000); return () => clearInterval(i); }, [runHealthCheck]);
  useEffect(() => { const i = setInterval(fetchSessions, 10_000); return () => clearInterval(i); }, [fetchSessions]);

  const totalGenerations = sessions.reduce((sum, s) => sum + s.generation_count, 0);
  const withLooks = sessions.filter(s => s.generated_look_url).length;
  const withVideos = sessions.filter(s => s.generated_video_url).length;
  const withMeasurements = sessions.filter(s => s.body_measurements).length;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e5e5e5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: health.supabaseApi && health.edgeFunction ? '#22c55e' : '#ef4444' }} />
          <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>VTO Command Centre</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['sessions', 'prompts', 'monitor'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
              background: tab === t ? 'rgba(255,255,255,0.1)' : 'transparent', color: tab === t ? '#fff' : '#888',
            }}>{t === 'sessions' ? 'Sessions & Try-Ons' : t === 'prompts' ? 'Prompts' : 'Monitoring'}</button>
          ))}
        </div>
      </div>

      {tab === 'prompts' ? (
        <PromptsTab />
      ) : tab === 'sessions' ? (
        <div style={{ padding: 24 }}>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
            {[['Total Sessions', totalCount], ['Generations', totalGenerations], ['Looks', withLooks], ['Videos', withVideos], ['Measurements', withMeasurements]].map(([l, v]) => (
              <div key={String(l)} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{String(l)}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{String(v)}</div>
              </div>
            ))}
          </div>

          {/* Table */}
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

          {selectedSession && <SessionModal s={selectedSession} onClose={() => setSelectedSession(null)} />}
        </div>
      ) : (
        <div style={{ padding: 24 }}>
          {/* Health */}
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

          {/* Stuck sessions */}
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, margin: 0 }}>Stuck Sessions (status = "generating")</h3>
            <StuckList addLog={addLog} />
          </div>

          {/* Log */}
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
      )}
    </div>
  );
};

// ─── Prompts Tab ─────────────────────────────────────────────────────────────

function PromptsTab() {
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompts?select=*&order=key`, { headers: hdrs });
      if (res.ok) setPrompts(await res.json());
    } catch {}
  };

  const startEdit = (p: PromptRow) => {
    setEditing(p.key);
    setEditValue(p.prompt);
    setStatus(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue('');
    setStatus(null);
  };

  const savePrompt = async (key: string) => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompts?key=eq.${key}`, {
        method: 'PATCH',
        headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ prompt: editValue, updated_at: new Date().toISOString() }),
      });
      if (res.ok) {
        setStatus('Saved! Changes will apply to new generations.');
        setEditing(null);
        fetchPrompts();
      } else {
        setStatus(`Error saving: ${res.status}`);
      }
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
    setSaving(false);
  };

  const labelMap: Record<string, string> = {
    vto_3image: 'VTO Image Generation (3-image flow)',
    vto_2image: 'VTO Image Generation (2-image flow)',
    video: 'Video Generation (Veo 3 Fast)',
    measurements: 'Body Measurements Extraction',
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 4 }}>Prompt Management</h2>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Edit prompts used by the VTO pipeline. Changes apply immediately to new generations.</p>
      </div>

      {status && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 8, fontSize: 13, background: status.includes('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: status.includes('Error') ? '#ef4444' : '#22c55e', border: `1px solid ${status.includes('Error') ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
          {status}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {prompts.map(p => (
          <div key={p.key} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{labelMap[p.key] || p.key}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{p.description} — last updated {new Date(p.updated_at).toLocaleString()}</div>
              </div>
              {editing !== p.key && (
                <button onClick={() => startEdit(p)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#ccc', cursor: 'pointer' }}>
                  Edit
                </button>
              )}
            </div>

            {editing === p.key ? (
              <div style={{ padding: 16 }}>
                <textarea
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  style={{
                    width: '100%', minHeight: 240, padding: 14, borderRadius: 8, fontSize: 13, lineHeight: 1.6,
                    fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e5e5e5', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button onClick={cancelEdit} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#888', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={() => savePrompt(p.key)} disabled={saving || editValue === p.prompt} style={{
                    padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: saving ? 'wait' : 'pointer',
                    background: editValue === p.prompt ? 'rgba(255,255,255,0.05)' : '#22c55e', color: editValue === p.prompt ? '#666' : '#000',
                  }}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '12px 20px', maxHeight: 180, overflow: 'auto' }}>
                <pre style={{ fontSize: 12, lineHeight: 1.6, color: '#999', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'monospace' }}>
                  {p.prompt}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Thumb({ url }: { url: string | null }) {
  if (!url) return <span style={{ color: '#444' }}>—</span>;
  return <img src={url} alt="" style={{ width: 36, height: 48, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }} />;
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
          {[['Selfie', s.selfie_url], ['Full Body', s.full_body_url], ['Garment', s.garment_url], ['VTO Result', s.generated_look_url]].map(([label, url]) => (
            <div key={String(label)}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{String(label)}</div>
              {url ? <img src={String(url)} alt={String(label)} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
                : <div style={{ width: '100%', height: 200, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 13 }}>No image</div>}
            </div>
          ))}
        </div>
        {s.generated_video_url && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Generated Video</div>
            <video src={s.generated_video_url} controls autoPlay loop muted style={{ maxHeight: 300, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
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

const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle' };
const btn: React.CSSProperties = { padding: '6px 14px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#ccc', cursor: 'pointer' };

export default ModelComparison;
