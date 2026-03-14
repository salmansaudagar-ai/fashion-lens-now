import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  LayoutDashboard, Shirt, BarChart3, FolderOpen, Sparkles, Star,
  Settings, Activity, ChevronLeft, LogOut, Zap, Clock, Eye,
  Download, RefreshCw, ArrowUpRight, ArrowDownRight,
  X, CheckCircle2, Users, Video, Ruler, TrendingUp,
  AlertTriangle, Lock, Upload, Trash2, FileSpreadsheet,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  ComposedChart, Line,
} from 'recharts';
import * as XLSX from 'xlsx';
import trendsLogo from '@/assets/trends-logo.png';

// ── Constants ───────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FUNCTION_BASE = `${SUPABASE_URL}/functions/v1`;
const hdrs = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
const PIN_KEY = 'trends_admin_pin';

const COST = {
  geminiPerCall: 2.5, veoPerVideo: 8.0, measurePerCall: 0.5,
  storagePerMB: 0.15, avgImageMB: 0.4, avgVideoMB: 3.0,
};

const toPublicUrl = (url: string | null): string | null => {
  if (!url) return null;
  if (url.includes('/object/public/')) return url;
  const m = url.match(/\/object\/sign\/([^?]+)/);
  if (m) return `${SUPABASE_URL}/storage/v1/object/public/${m[1]}`;
  return url;
};

const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ── Types ───────────────────────────────────────────────────────
interface Session {
  id: string; session_token: string; registration_status: string;
  generation_count: number; selfie_url: string | null; full_body_url: string | null;
  generated_look_url: string | null; generated_video_url: string | null;
  garment_url: string | null; body_measurements: Record<string, any> | null;
  full_name: string | null; phone: string | null; email: string | null;
  kiosk_id: string | null; created_at: string; updated_at: string;
}

interface Generation {
  id: string; session_id: string; garment_url: string | null;
  garment_description: string | null; category: string | null;
  generated_look_url: string | null; generated_video_url: string | null;
  body_measurements: Record<string, any> | null;
  duration_ms: number | null; created_at: string;
}

interface PromptRow { key: string; prompt: string; description: string | null; updated_at: string; }
interface PromptVersion {
  id: string; prompt_key: string; version: string; prompt: string;
  description: string | null; is_active: boolean; traffic_weight: number;
  total_uses: number; avg_rating: number | null; created_at: string; updated_at: string;
}
interface RatingRow {
  id: string; session_id: string; rating_type: string; rating: number;
  thumbs: string; issues: string[] | null; prompt_key: string | null;
  prompt_version: string | null; garment_category: string | null;
  customer_profile: Record<string, any> | null; created_at: string;
}
interface HealthStatus { supabaseApi: boolean; edgeFunction: boolean; lastCheck: string; }
interface AppSetting { key: string; value: string; label: string; description: string; type: string; updated_at: string; }

type NavSection = 'overview' | 'tryons' | 'analytics' | 'catalog' | 'prompts' | 'quality' | 'settings';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ElementType; sub: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, sub: 'Weekly report & KPIs' },
  { id: 'tryons', label: 'Try-Ons', icon: Shirt, sub: 'All generations & sessions' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, sub: 'Trends, funnel & costs' },
  { id: 'catalog', label: 'Catalog', icon: FolderOpen, sub: 'Product management' },
  { id: 'prompts', label: 'Prompts', icon: Sparkles, sub: 'AI prompt management' },
  { id: 'quality', label: 'Quality', icon: Star, sub: 'Ratings & feedback' },
  { id: 'settings', label: 'Settings', icon: Settings, sub: 'Config & monitoring' },
];

const CHART_COLORS = ['#4f46e5', '#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#ec4899'];

// ── Animated Counter ────────────────────────────────────────────
function AnimNum({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setDisplay(Math.round(start + diff * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);
  return <>{display.toLocaleString()}</>;
}

// ── PIN Gate ───────────────────────────────────────────────────
function PinGate({ children }: { children: React.ReactNode }) {
  const [pin, setPin] = useState<string | null>(() => sessionStorage.getItem(PIN_KEY));
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!input.trim()) return;
    setChecking(true); setError('');
    try {
      const res = await fetch(`${FUNCTION_BASE}/validate-admin-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ pin: input.trim() }),
      });
      const data = await res.json();
      if (data.valid) { sessionStorage.setItem(PIN_KEY, input.trim()); setPin(input.trim()); }
      else { setError('Incorrect PIN'); setInput(''); }
    } catch { setError('Validation failed'); }
    finally { setChecking(false); }
  };

  if (pin) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 p-10 w-[380px]">
        <div className="flex flex-col items-center mb-8">
          <img src={trendsLogo} alt="Trends" className="h-7 mb-5" />
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mb-3">
            <Lock className="w-5 h-5 text-indigo-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Infinite Studio</h1>
          <p className="text-sm text-slate-400 mt-1">Enter PIN to access dashboard</p>
        </div>
        <div className="space-y-3">
          <input
            type="password" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Enter PIN" autoFocus
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-center text-lg tracking-[0.3em] placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
          />
          {error && <p className="text-red-500 text-xs text-center">{error}</p>}
          <button
            onClick={handleLogin} disabled={checking || !input.trim()}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 disabled:opacity-40 transition-all active:scale-[0.98]"
          >
            {checking ? 'Verifying...' : 'Unlock Dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ██ MAIN DASHBOARD LAYOUT (Light Mode)
// ═══════════════════════════════════════════════════════════════
function DashboardContent() {
  const [activeNav, setActiveNav] = useState<NavSection>('overview');
  const [collapsed, setCollapsed] = useState(false);

  // ── Global data ──
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [health, setHealth] = useState<HealthStatus>({ supabaseApi: false, edgeFunction: false, lastCheck: '' });
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 200));
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vto_sessions?order=created_at.desc&limit=20&select=*`, { headers: { ...hdrs, Prefer: 'count=exact' } });
      if (!res.ok) throw new Error(`${res.status}`);
      const range = res.headers.get('content-range');
      if (range) { const m = range.match(/\/(\d+)/); if (m) setTotalCount(parseInt(m[1])); }
      setSessions(await res.json());
    } catch (e) { addLog(`Fetch sessions failed: ${e}`); }
  }, [addLog]);

  const fetchAllSessions = useCallback(async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vto_sessions?order=created_at.desc&limit=1000&select=id,registration_status,generation_count,selfie_url,full_body_url,generated_look_url,generated_video_url,garment_url,body_measurements,full_name,phone,email,kiosk_id,created_at,updated_at`, { headers: hdrs });
      if (res.ok) setAllSessions(await res.json());
    } catch {}
  }, []);

  const runHealthCheck = useCallback(async () => {
    const status: HealthStatus = { supabaseApi: false, edgeFunction: false, lastCheck: new Date().toISOString() };
    try { const r = await fetch(`${SUPABASE_URL}/rest/v1/vto_sessions?limit=1&select=id`, { headers: hdrs }); status.supabaseApi = r.ok; addLog(`Supabase API: ${r.ok ? 'OK' : r.status}`); } catch (e) { addLog(`Supabase API: FAIL ${e}`); }
    try { const r = await fetch(`${SUPABASE_URL}/functions/v1/generate-virtual-tryon`, { method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: '__health_check__' }) }); status.edgeFunction = true; addLog(`Edge function: OK (${r.status})`); } catch (e) { addLog(`Edge function: FAIL ${e}`); }
    setHealth(status);
  }, [addLog]);

  useEffect(() => { fetchSessions(); fetchAllSessions(); runHealthCheck(); }, [fetchSessions, fetchAllSessions, runHealthCheck]);
  useEffect(() => {
    let tick = 0;
    const i = setInterval(() => { tick++; fetchSessions(); if (tick % 6 === 0) { runHealthCheck(); fetchAllSessions(); } }, 10_000);
    return () => clearInterval(i);
  }, [fetchSessions, fetchAllSessions, runHealthCheck]);

  const handleLogout = () => { sessionStorage.removeItem(PIN_KEY); window.location.reload(); };
  const allHealthy = health.supabaseApi && health.edgeFunction;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* ── Sidebar ── */}
      <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-white border-r border-slate-200 flex flex-col transition-all duration-200 flex-shrink-0`}>
        <div className="h-14 flex items-center px-3 border-b border-slate-100 gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {!collapsed && <div className="text-sm font-semibold text-slate-900 truncate">Infinite Studio</div>}
        </div>
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button key={item.id} onClick={() => setActiveNav(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-all ${
                  active ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}>
                <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-2 space-y-0.5">
          <button onClick={() => setCollapsed(c => !c)} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50">
            <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            {!collapsed && <span>Collapse</span>}
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-500 hover:bg-red-50">
            <LogOut className="w-4 h-4" /> {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900">{NAV_ITEMS.find(n => n.id === activeNav)?.label}</h1>
            <span className="text-slate-300">/</span>
            <span className="text-xs text-slate-400">{NAV_ITEMS.find(n => n.id === activeNav)?.sub}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${allHealthy ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${allHealthy ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {allHealthy ? 'All Systems Go' : 'Issues Detected'}
            </div>
            <span className="text-xs text-slate-400"><span className="font-semibold text-slate-600">{totalCount}</span> total sessions</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-slate-50">
          {activeNav === 'overview' && <OverviewTab sessions={sessions} allSessions={allSessions} totalCount={totalCount} health={health} />}
          {activeNav === 'tryons' && <TryOnsTab allSessions={allSessions} totalCount={totalCount} />}
          {activeNav === 'analytics' && <AnalyticsTab allSessions={allSessions} />}
          {activeNav === 'catalog' && <CatalogTabInline />}
          {activeNav === 'prompts' && <PromptsTab />}
          {activeNav === 'quality' && <QualityTab />}
          {activeNav === 'settings' && <SettingsTab health={health} runHealthCheck={runHealthCheck} logs={logs} addLog={addLog} />}
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ██ OVERVIEW — Leadership Weekly Report
// ═══════════════════════════════════════════════════════════════
function OverviewTab({ sessions, allSessions, totalCount, health }: {
  sessions: Session[]; allSessions: Session[]; totalCount: number; health: HealthStatus;
}) {
  const report = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

    const thisWeek = allSessions.filter(s => new Date(s.created_at) >= weekAgo);
    const lastWeek = allSessions.filter(s => { const d = new Date(s.created_at); return d >= twoWeeksAgo && d < weekAgo; });
    const today = allSessions.filter(s => s.created_at.startsWith(todayStr));

    // This week metrics
    const twSessions = thisWeek.length;
    const twGens = thisWeek.reduce((a, s) => a + s.generation_count, 0);
    const twLooks = thisWeek.filter(s => s.generated_look_url).length;
    const twVideos = thisWeek.filter(s => s.generated_video_url).length;
    const twMeas = thisWeek.filter(s => s.body_measurements).length;
    const twRegistered = thisWeek.filter(s => s.registration_status === 'registered' && (s.phone || s.email)).length;
    const twRepeat = thisWeek.filter(s => s.generation_count > 1).length;
    const twCompletion = twSessions > 0 ? Math.round((twLooks / twSessions) * 100) : 0;
    const twEngagement = twSessions > 0 ? Math.round((twRepeat / twSessions) * 100) : 0;
    const twGensPerSession = twSessions > 0 ? (twGens / twSessions).toFixed(1) : '0';

    // Last week for comparison
    const lwSessions = lastWeek.length;
    const lwLooks = lastWeek.filter(s => s.generated_look_url).length;
    const lwCompletion = lwSessions > 0 ? Math.round((lwLooks / lwSessions) * 100) : 0;

    // Cost
    const totalCost = twGens * COST.geminiPerCall + twVideos * COST.veoPerVideo + twMeas * COST.measurePerCall + (twLooks * COST.avgImageMB + twVideos * COST.avgVideoMB) * COST.storagePerMB;
    const costPerSession = twSessions > 0 ? totalCost / twSessions : 0;

    // Active now
    const active = allSessions.filter(s => (now.getTime() - new Date(s.updated_at).getTime()) / 60000 < 10).length;

    // Daily trend (last 14 days)
    const dailyMap = new Map<string, { sessions: number; looks: number; gens: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
      dailyMap.set(d, { sessions: 0, looks: 0, gens: 0 });
    }
    for (const s of allSessions) {
      const d = s.created_at.slice(0, 10);
      if (dailyMap.has(d)) {
        const e = dailyMap.get(d)!;
        e.sessions++; e.gens += s.generation_count;
        if (s.generated_look_url) e.looks++;
      }
    }
    const daily = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date: new Date(date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
      shortDate: date.slice(5),
      ...data,
    }));

    // Peak hours
    const hourCounts = new Array(24).fill(0);
    thisWeek.forEach(s => hourCounts[new Date(s.created_at).getHours()]++);
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    // Size distribution
    const sizeMap = new Map<string, number>();
    thisWeek.forEach(s => { const size = s.body_measurements?.recommended_size; if (size) sizeMap.set(size, (sizeMap.get(size) || 0) + 1); });
    const sizes = Array.from(sizeMap.entries()).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));

    const sessionsDelta = lwSessions > 0 ? Math.round(((twSessions - lwSessions) / lwSessions) * 100) : 0;
    const completionDelta = lwCompletion > 0 ? twCompletion - lwCompletion : 0;

    return {
      today: today.length, active, twSessions, twGens, twLooks, twVideos, twMeas,
      twRegistered, twCompletion, twEngagement, twGensPerSession,
      totalCost, costPerSession, sessionsDelta, completionDelta,
      daily, hourCounts, peakHour, sizes,
    };
  }, [allSessions]);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Report Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Weekly Performance Report</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {new Date(Date.now() - 7 * 86400000).toLocaleDateString([], { month: 'short', day: 'numeric' })} — {new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${health.supabaseApi && health.edgeFunction ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            <div className={`w-2 h-2 rounded-full ${health.supabaseApi && health.edgeFunction ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            System {health.supabaseApi && health.edgeFunction ? 'Healthy' : 'Degraded'}
          </span>
        </div>
      </div>

      {/* Executive KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">This Week</p>
          <p className="text-2xl font-bold text-slate-900 mt-1"><AnimNum value={report.twSessions} /></p>
          <Delta value={report.sessionsDelta} label="vs last week" />
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Today</p>
          <p className="text-2xl font-bold text-slate-900 mt-1"><AnimNum value={report.today} /></p>
          <p className="text-xs text-indigo-500 mt-1 font-medium">{report.active} active now</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Completion Rate</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{report.twCompletion}%</p>
          <Delta value={report.completionDelta} label="pts vs last week" />
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">VTO Looks</p>
          <p className="text-2xl font-bold text-slate-900 mt-1"><AnimNum value={report.twLooks} /></p>
          <p className="text-xs text-slate-400 mt-1">{report.twVideos} videos</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Engagement</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{report.twEngagement}%</p>
          <p className="text-xs text-slate-400 mt-1">{report.twGensPerSession} tries/session</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Est. Cost</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">₹{report.totalCost.toFixed(0)}</p>
          <p className="text-xs text-slate-400 mt-1">₹{report.costPerSession.toFixed(1)}/session</p>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">14-Day Activity Trend</h3>
          <p className="text-xs text-slate-400 mb-4">Sessions (bars) vs Completed Looks (line)</p>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={report.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="shortDate" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <RTooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Bar dataKey="sessions" fill="#e0e7ff" radius={[4, 4, 0, 0]} name="Sessions" />
                <Line type="monotone" dataKey="looks" stroke="#4f46e5" strokeWidth={2.5} dot={{ fill: '#4f46e5', r: 3, stroke: '#fff', strokeWidth: 2 }} name="Looks" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-4">
          {/* Key Highlights */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Key Highlights</h3>
            <div className="space-y-3">
              <Highlight icon={Users} label="Registered Users" value={report.twRegistered} color="text-indigo-600" bg="bg-indigo-50" />
              <Highlight icon={Eye} label="VTO Looks Generated" value={report.twLooks} color="text-emerald-600" bg="bg-emerald-50" />
              <Highlight icon={Video} label="Videos Created" value={report.twVideos} color="text-violet-600" bg="bg-violet-50" />
              <Highlight icon={Ruler} label="Measurements Taken" value={report.twMeas} color="text-amber-600" bg="bg-amber-50" />
            </div>
          </Card>

          {/* Peak Hours Mini */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Peak Hours</h3>
            <p className="text-xs text-slate-400 mb-3">Busiest: {report.peakHour}:00–{report.peakHour + 1}:00</p>
            <div className="flex items-end gap-[3px] h-16">
              {report.hourCounts.map((c, h) => {
                const max = Math.max(...report.hourCounts, 1);
                return (
                  <div key={h} className="flex-1 flex flex-col items-center justify-end" title={`${h}:00 — ${c} sessions`}>
                    <div className={`w-full rounded-sm transition-all ${h === report.peakHour ? 'bg-amber-400' : c > 0 ? 'bg-indigo-200' : 'bg-slate-100'}`}
                      style={{ height: `${Math.max((c / max) * 100, 4)}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-slate-300 mt-1 px-0.5">
              <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Bottom row: size + recent sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sizes */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Size Distribution (This Week)</h3>
          {report.sizes.length === 0 ? (
            <p className="text-xs text-slate-300 text-center py-6">No size data</p>
          ) : (
            <div className="space-y-2.5">
              {report.sizes.map(({ name, value }) => {
                const max = report.sizes[0]?.value || 1;
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="w-8 text-sm font-bold text-slate-700">{name}</span>
                    <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                      <div className="h-full rounded bg-violet-200 flex items-center px-2" style={{ width: `${(value / max) * 100}%` }}>
                        <span className="text-[10px] font-medium text-violet-700">{value}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent Sessions */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Recent Sessions</h3>
            <span className="text-xs text-slate-400">Last 8</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                {['Time', 'Status', 'User', 'Selfie', 'Full Body', 'Look', 'Video', 'Size'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 8).map(s => (
                <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2 text-xs text-slate-500">{fmtTime(s.created_at)}</td>
                  <td className="px-4 py-2"><StatusPill status={s.registration_status} /></td>
                  <td className="px-4 py-2 text-xs text-slate-600">{s.full_name || s.phone || '—'}</td>
                  <td className="px-4 py-2"><ThumbLight url={s.selfie_url} /></td>
                  <td className="px-4 py-2"><ThumbLight url={s.full_body_url} /></td>
                  <td className="px-4 py-2"><ThumbLight url={s.generated_look_url} /></td>
                  <td className="px-4 py-2">{s.generated_video_url ? <span className="text-emerald-600 text-xs font-medium">Yes</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2 text-xs font-medium text-slate-700">{s.body_measurements?.recommended_size || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ██ TRY-ONS TAB
// ═══════════════════════════════════════════════════════════════
function TryOnsTab({ allSessions, totalCount }: { allSessions: Session[]; totalCount: number }) {
  const [view, setView] = useState<'generations' | 'sessions'>('generations');
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [page, setPage] = useState(0);
  const [pagedSessions, setPagedSessions] = useState<Session[]>([]);
  const PAGE_SIZE = 20;

  useEffect(() => {
    if (view !== 'generations') return;
    setGenLoading(true);
    fetch(`${SUPABASE_URL}/rest/v1/vto_generations?order=created_at.desc&limit=200&select=id,session_id,garment_url,garment_description,category,generated_look_url,generated_video_url,body_measurements,duration_ms,created_at`, { headers: hdrs })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setGenerations(d); })
      .catch(() => {}).finally(() => setGenLoading(false));
  }, [view]);

  useEffect(() => {
    if (view !== 'sessions') return;
    fetch(`${SUPABASE_URL}/rest/v1/vto_sessions?order=created_at.desc&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&select=*`, { headers: hdrs })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setPagedSessions(d); }).catch(() => {});
  }, [view, page]);

  const exportCSV = () => {
    const rows = allSessions.map(s => ({ id: s.id, status: s.registration_status, name: s.full_name || '', phone: s.phone || '', generations: s.generation_count, has_look: s.generated_look_url ? 'yes' : 'no', has_video: s.generated_video_url ? 'yes' : 'no', size: s.body_measurements?.recommended_size || '', created_at: s.created_at }));
    const header = Object.keys(rows[0] || {}).join(',');
    const csv = [header, ...rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `vto-data-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-white rounded-lg border border-slate-200 p-0.5">
          {(['generations', 'sessions'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${view === v ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}>
              {v === 'generations' ? 'Try-Ons' : 'Sessions'}
            </button>
          ))}
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-500 hover:text-slate-700">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50">
              {(view === 'generations'
                ? ['Time', 'Garment', 'Category', 'VTO Result', 'Video', 'Size', 'Duration', 'Description']
                : ['Time', 'Status', 'User', 'Selfie', 'Full Body', 'Garment', 'VTO Result', 'Video', 'Size', 'Gens']
              ).map(h => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-medium text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view === 'generations' ? (
              genLoading ? <tr><td colSpan={8} className="p-10 text-center text-slate-300">Loading...</td></tr>
              : generations.length === 0 ? <tr><td colSpan={8} className="p-10 text-center text-slate-300">No try-ons yet</td></tr>
              : generations.map(g => (
                <tr key={g.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 text-xs text-slate-500">{fmtTime(g.created_at)}</td>
                  <td className="px-4 py-2.5"><ThumbLight url={g.garment_url} /></td>
                  <td className="px-4 py-2.5"><CatPill category={g.category} /></td>
                  <td className="px-4 py-2.5"><ThumbLight url={g.generated_look_url} /></td>
                  <td className="px-4 py-2.5">{g.generated_video_url ? <span className="text-emerald-600 text-xs font-medium">Yes</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-slate-700">{g.body_measurements?.recommended_size || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{g.duration_ms ? `${(g.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[160px] truncate">{g.garment_description || '—'}</td>
                </tr>
              ))
            ) : (
              pagedSessions.map(s => (
                <tr key={s.id} onClick={() => setSelectedSession(s)} className="border-t border-slate-50 hover:bg-slate-50/50 cursor-pointer">
                  <td className="px-4 py-2.5 text-xs text-slate-500">{fmtTime(s.created_at)}</td>
                  <td className="px-4 py-2.5"><StatusPill status={s.registration_status} /></td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{s.full_name || s.phone || '—'}</td>
                  <td className="px-4 py-2.5"><ThumbLight url={s.selfie_url} /></td>
                  <td className="px-4 py-2.5"><ThumbLight url={s.full_body_url} /></td>
                  <td className="px-4 py-2.5"><ThumbLight url={s.garment_url} /></td>
                  <td className="px-4 py-2.5"><ThumbLight url={s.generated_look_url} /></td>
                  <td className="px-4 py-2.5">{s.generated_video_url ? <span className="text-emerald-600 text-xs font-medium">Yes</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-slate-700">{s.body_measurements?.recommended_size || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{s.generation_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {view === 'sessions' && (
        <div className="flex justify-between items-center text-xs text-slate-400">
          <span>Page {page + 1} of {Math.ceil(totalCount / PAGE_SIZE) || 1} ({totalCount} total)</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 disabled:opacity-30">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= totalCount} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 disabled:opacity-30">Next</button>
          </div>
        </div>
      )}
      {selectedSession && <SessionModal s={selectedSession} onClose={() => setSelectedSession(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ██ ANALYTICS TAB
// ═══════════════════════════════════════════════════════════════
function AnalyticsTab({ allSessions }: { allSessions: Session[] }) {
  const [range, setRange] = useState<'7d' | '14d' | '30d' | 'all'>('14d');

  const a = useMemo(() => {
    const now = new Date();
    const cutoff = range === 'all' ? null : new Date(now.getTime() - ({ '7d': 7, '14d': 14, '30d': 30 }[range]) * 86400000);
    const filtered = cutoff ? allSessions.filter(s => new Date(s.created_at) >= cutoff) : allSessions;

    const dailyMap = new Map<string, { sessions: number; looks: number; videos: number; gens: number }>();
    const hourCounts = new Array(24).fill(0);
    for (const s of filtered) {
      const d = new Date(s.created_at); const day = d.toISOString().slice(0, 10); hourCounts[d.getHours()]++;
      const e = dailyMap.get(day) || { sessions: 0, looks: 0, videos: 0, gens: 0 };
      e.sessions++; e.gens += s.generation_count;
      if (s.generated_look_url) e.looks++; if (s.generated_video_url) e.videos++;
      dailyMap.set(day, e);
    }
    const daily = Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({ date: date.slice(5), ...data }));

    const totalGens = filtered.reduce((a, s) => a + s.generation_count, 0);
    const totalLooks = filtered.filter(s => s.generated_look_url).length;
    const totalVideos = filtered.filter(s => s.generated_video_url).length;
    const totalMeas = filtered.filter(s => s.body_measurements).length;
    const totalCost = totalGens * COST.geminiPerCall + totalVideos * COST.veoPerVideo + totalMeas * COST.measurePerCall + (totalLooks * COST.avgImageMB + totalVideos * COST.avgVideoMB) * COST.storagePerMB;

    const times: number[] = [];
    for (const s of filtered) { if (s.generated_look_url) { const diff = (new Date(s.updated_at).getTime() - new Date(s.created_at).getTime()) / 1000; if (diff > 0 && diff < 600) times.push(diff); } }
    times.sort((a, b) => a - b);
    const p50 = times.length > 0 ? times[Math.floor(times.length * 0.5)] : 0;

    const funnel = [
      { label: 'Session Created', count: filtered.length, color: '#4f46e5' },
      { label: 'Selfie Captured', count: filtered.filter(s => s.selfie_url).length, color: '#6366f1' },
      { label: 'Full Body Captured', count: filtered.filter(s => s.full_body_url).length, color: '#7c3aed' },
      { label: 'Garment Selected', count: filtered.filter(s => s.garment_url).length, color: '#8b5cf6' },
      { label: 'Look Generated', count: totalLooks, color: '#059669' },
      { label: 'Video Generated', count: totalVideos, color: '#047857' },
      { label: 'Repeat Try-On', count: filtered.filter(s => s.generation_count > 1).length, color: '#dc2626' },
    ];

    const costPie = [
      { name: 'Gemini VTO', value: totalGens * COST.geminiPerCall, color: '#4f46e5' },
      { name: 'Veo Video', value: totalVideos * COST.veoPerVideo, color: '#059669' },
      { name: 'Measurements', value: totalMeas * COST.measurePerCall, color: '#d97706' },
      { name: 'Storage', value: (totalLooks * COST.avgImageMB + totalVideos * COST.avgVideoMB) * COST.storagePerMB, color: '#7c3aed' },
    ];

    const sizeMap = new Map<string, number>();
    filtered.forEach(s => { const sz = s.body_measurements?.recommended_size; if (sz) sizeMap.set(sz, (sizeMap.get(sz) || 0) + 1); });
    const sizes = Array.from(sizeMap.entries()).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));

    return { filtered, daily, hourCounts, totalGens, totalLooks, totalVideos, totalMeas, totalCost, p50, funnel, costPie, sizes, peakHour: hourCounts.indexOf(Math.max(...hourCounts)) };
  }, [allSessions, range]);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Analytics</h2>
        <div className="flex gap-1 bg-white rounded-lg border border-slate-200 p-0.5">
          {(['7d', '14d', '30d', 'all'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${range === r ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400'}`}>
              {r === 'all' ? 'All' : r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[['Sessions', a.filtered.length], ['Generations', a.totalGens], ['Looks', a.totalLooks], ['Videos', a.totalVideos], ['Cost', `₹${a.totalCost.toFixed(0)}`], ['Avg Time', `${a.p50.toFixed(0)}s`]].map(([label, value]) => (
          <Card key={String(label)} className="p-3">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{String(label)}</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{typeof value === 'number' ? <AnimNum value={value} /> : value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Daily Trend</h3>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={a.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
              <RTooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
              <Bar dataKey="sessions" fill="#e0e7ff" radius={[4, 4, 0, 0]} name="Sessions" />
              <Line type="monotone" dataKey="looks" stroke="#4f46e5" strokeWidth={2.5} dot={{ fill: '#4f46e5', r: 3, stroke: '#fff', strokeWidth: 2 }} name="Looks" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">User Journey Funnel</h3>
          <div className="space-y-2">
            {a.funnel.map((step, i) => {
              const maxC = Math.max(a.funnel[0]?.count || 1, 1);
              const pct = (step.count / maxC) * 100;
              const drop = i > 0 && a.funnel[i - 1].count > 0 ? ((a.funnel[i - 1].count - step.count) / a.funnel[i - 1].count * 100).toFixed(0) : null;
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <span className="w-[130px] text-xs text-slate-500 text-right truncate">{step.label}</span>
                  <div className="flex-1 h-7 bg-slate-50 rounded overflow-hidden relative">
                    <div className="h-full rounded flex items-center px-2.5" style={{ width: `${Math.max(pct, 4)}%`, background: `${step.color}22` }}>
                      <span className="text-xs font-semibold" style={{ color: step.color }}>{step.count} ({pct.toFixed(0)}%)</span>
                    </div>
                  </div>
                  {drop && Number(drop) > 0 && <span className="text-xs text-red-500 w-10 text-right">-{drop}%</span>}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Cost Breakdown</h3>
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={a.costPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={65} strokeWidth={0}>
                  {a.costPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <RTooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} formatter={(val: number) => `₹${val.toFixed(1)}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-base font-bold text-slate-900 mb-3">₹{a.totalCost.toFixed(0)}</p>
          <div className="space-y-1.5">
            {a.costPie.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: item.color }} /><span className="text-slate-500">{item.name}</span></div>
                <span className="text-slate-700 font-medium">₹{item.value.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Peak Hours</h3>
          <p className="text-xs text-slate-400 mb-3">Busiest: {a.peakHour}:00–{a.peakHour + 1}:00</p>
          <div className="h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.hourCounts.map((count, hour) => ({ hour: `${hour}`, count }))}>
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {a.hourCounts.map((_, i) => <Cell key={i} fill={i === a.peakHour ? '#d97706' : '#c7d2fe'} />)}
                </Bar>
                <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} interval={3} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Size Distribution</h3>
          {a.sizes.length === 0 ? <p className="text-xs text-slate-300 text-center py-6">No data</p> : (
            <div className="space-y-2.5">
              {a.sizes.map(({ name, value }) => {
                const max = a.sizes[0]?.value || 1;
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="w-8 text-sm font-bold text-slate-700">{name}</span>
                    <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                      <div className="h-full rounded bg-violet-200 flex items-center px-2" style={{ width: `${(value / max) * 100}%` }}>
                        <span className="text-[10px] font-medium text-violet-700">{value}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ██ CATALOG TAB
// ═══════════════════════════════════════════════════════════════
/** Parse Fynd-format Excel: row0=headers, row1=attribute names, rows2+=data grouped by "Grouped SKU" */
function parseFyndExcel(workbook: XLSX.WorkBook): any[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (raw.length < 3) return [];
  const headerRow = raw[0] as string[];
  const colIdx: Record<string, number> = {};
  headerRow.forEach((h, i) => { if (h) colIdx[String(h).trim()] = i; });
  const attrRow = raw[1];
  const attrMap: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    if (h && (String(h).startsWith('L1-') || String(h).startsWith('L2-') || String(h).startsWith('L3-'))) {
      const an = attrRow?.[i];
      if (an && typeof an === 'string') attrMap[an.trim()] = i;
    }
  });
  const groups: Record<string, any[][]> = {};
  for (let r = 2; r < raw.length; r++) {
    const row = raw[r];
    if (!row || row.every((c: any) => c == null)) continue;
    const gsku = row[colIdx['Grouped SKU']] || `row-${r}`;
    if (!groups[gsku]) groups[gsku] = [];
    groups[gsku].push(row);
  }
  const ga = (row: any[], name: string) => { const i = attrMap[name]; return i != null ? row[i] : null; };
  const colorHexMap: Record<string, string> = { blue:'#1E3A5F', red:'#C62828', green:'#2E7D32', black:'#212121', white:'#F5F5F5', navy:'#0D1B2A', grey:'#616161', gray:'#616161', brown:'#5D4037', beige:'#D7CCC8', pink:'#E91E63', purple:'#7B1FA2', yellow:'#F9A825', orange:'#EF6C00', cream:'#FFF8E1', maroon:'#800000', teal:'#00796B', olive:'#827717', lavender:'#B39DDB', coral:'#FF7043', khaki:'#BDB76B', rust:'#BF360C', wine:'#880E4F', gold:'#FFD600', silver:'#BDBDBD', charcoal:'#37474F', mint:'#00897B', peach:'#FFAB91', ivory:'#FFFFF0', tan:'#D2B48C' };
  const products: any[] = [];
  for (const [gsku, rows] of Object.entries(groups)) {
    const f = rows[0];
    const sizes: string[] = [];
    for (const row of rows) { const s = ga(row, 'Standard Size') || ga(row, 'Size'); if (s != null) sizes.push(String(s)); }
    const brand = ga(f, 'Brand Name') || ga(f, 'Brand') || f[colIdx['Product Label']] || '';
    const name = ga(f, 'Product Title') || ga(f, 'Product Name') || `${brand} Product`;
    const mrp = Number(ga(f, 'MRP')) || 0;
    const lp = Number(ga(f, 'List Price')) || mrp;
    const imgUrl = ga(f, 'MODEL') || ga(f, 'MODEL2') || '';
    const color = ga(f, 'Primary Color') || ga(f, 'Color Family') || '';
    const country = ga(f, 'Country of Origin') || 'India';
    const catTree = f[colIdx['Category Tree']] || '';
    let cat = 'topwear';
    const cl = String(catTree).toLowerCase();
    if (cl.includes('footwear') || cl.includes('shoes') || cl.includes('sneaker')) cat = 'footwear';
    else if (cl.includes('bottom') || cl.includes('jeans') || cl.includes('trouser') || cl.includes('pant') || cl.includes('shorts')) cat = 'bottomwear';
    const hex = colorHexMap[color.toLowerCase()] || '#808080';
    products.push({
      id: String(gsku).replace(/[^a-zA-Z0-9_-]/g, '-'),
      name: String(name), category: cat, image_url: String(imgUrl), price: mrp,
      brand: String(brand), sizes: sizes.length > 0 ? sizes : ['Free'],
      actual_price: mrp, selling_price: lp > 0 ? lp : mrp,
      country_of_origin: String(country),
      color_variants: [{ name: String(color), hex }],
      is_active: true, sort_order: products.length + 1,
    });
  }
  return products;
}

function CatalogTabInline() {
  const pin = sessionStorage.getItem(PIN_KEY) || '';
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'topwear' | 'bottomwear' | 'footwear'>('topwear');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ count: number; names: string[] } | null>(null);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [clearOnUpload, setClearOnUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`${FUNCTION_BASE}/admin-catalog`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
      const data = await res.json();
      if (res.ok && data.items) setItems(data.items);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const filtered = items.filter(i => i.category === activeCategory);

  const handleToggle = async (item: any) => {
    await fetch(`${FUNCTION_BASE}/admin-catalog`, { method: 'PUT', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'x-admin-pin': pin }, body: JSON.stringify({ id: item.id, is_active: !item.is_active }) });
    fetchItems();
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    await fetch(`${FUNCTION_BASE}/admin-catalog?id=${item.id}`, { method: 'DELETE', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'x-admin-pin': pin } });
    toast.success('Deleted');
    fetchItems();
  };

  const handleUpload = async (file: File) => {
    if (!file.name.match(/\.xlsx?$/i)) { toast.error('Only .xlsx files are supported'); return; }
    setUploading(true);
    setUploadResult(null);
    try {
      // Parse Excel client-side using SheetJS
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const products = parseFyndExcel(workbook);
      if (products.length === 0) { toast.error('No products found in file. Check format.'); setUploading(false); return; }
      // Send parsed products as JSON to edge function
      const res = await fetch(`${FUNCTION_BASE}/catalog-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'x-admin-pin': pin },
        body: JSON.stringify({ products, clear: clearOnUpload }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUploadResult({ count: data.count, names: (data.products || []).map((p: any) => p.name) });
        toast.success(`Uploaded ${data.count} product${data.count > 1 ? 's' : ''}`);
        fetchItems();
      } else {
        toast.error(data.error || 'Upload failed');
      }
    } catch (e) { toast.error('Upload failed: ' + (e as Error).message); }
    finally { setUploading(false); }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {[{ id: 'topwear' as const, label: 'Topwear' }, { id: 'bottomwear' as const, label: 'Bottomwear' }, { id: 'footwear' as const, label: 'Footwear' }].map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeCategory === cat.id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-slate-400 hover:text-slate-600 border border-transparent'}`}>
              {cat.label} <span className="text-xs opacity-50">({items.filter(i => i.category === cat.id).length})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{items.length} total products</span>
          <button onClick={() => setShowUploadPanel(!showUploadPanel)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${showUploadPanel ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'}`}>
            <Upload className="w-4 h-4" />
            Upload Catalog
          </button>
        </div>
      </div>

      {/* Upload Panel */}
      {showUploadPanel && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-semibold text-slate-800">Upload Fynd Catalog (.xlsx)</span>
            </div>
            <button onClick={() => setShowUploadPanel(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5">
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'}`}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }} />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-600">Processing Excel file...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-slate-300" />
                  <p className="text-sm text-slate-600">Drop your Fynd catalog Excel file here, or click to browse</p>
                  <p className="text-xs text-slate-400">Supports the standard Fynd product export format with L1/L2/L3 attributes</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={clearOnUpload} onChange={e => setClearOnUpload(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-xs text-slate-500">Replace all existing products on upload</span>
              </label>
              <p className="text-[10px] text-slate-400">Webhook: POST /functions/v1/catalog-upload</p>
            </div>
            {uploadResult && (
              <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Successfully uploaded {uploadResult.count} product{uploadResult.count > 1 ? 's' : ''}
                </div>
                {uploadResult.names.length > 0 && (
                  <p className="text-xs text-emerald-600 mt-1">{uploadResult.names.join(', ')}</p>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="bg-slate-100 rounded-xl h-64 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Upload className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">No products in {activeCategory}.</p>
          <p className="text-xs text-slate-300 mt-1">Upload a catalog file or add products manually.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((item: any) => (
            <Card key={item.id} className={`overflow-hidden group ${!item.is_active ? 'opacity-40' : ''}`}>
              <div className="aspect-square bg-slate-50 relative overflow-hidden">
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f1f5f9" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%2394a3b8" font-size="10">No image</text></svg>'; }} />
                <button onClick={() => handleDelete(item)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-3 space-y-1">
                <p className="text-xs text-slate-400">{item.brand}</p>
                <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-600">₹{item.selling_price?.toLocaleString()}</span>
                  {item.actual_price > item.selling_price && <span className="text-[10px] text-slate-300 line-through">₹{item.actual_price?.toLocaleString()}</span>}
                </div>
                {item.sizes?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.sizes.slice(0, 6).map((s: string, i: number) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{s}</span>
                    ))}
                    {item.sizes.length > 6 && <span className="text-[9px] text-slate-300">+{item.sizes.length - 6}</span>}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex gap-1">
                    {(item.color_variants || []).slice(0, 4).map((v: any, i: number) => (
                      <span key={i} className="w-3.5 h-3.5 rounded-full border border-slate-200" style={{ backgroundColor: v.hex }} title={v.name} />
                    ))}
                  </div>
                  <button onClick={() => handleToggle(item)} className={`w-8 h-4 rounded-full transition-colors ${item.is_active ? 'bg-indigo-500' : 'bg-slate-200'}`}>
                    <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${item.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ██ PROMPTS TAB
// ═══════════════════════════════════════════════════════════════
function PromptsTab() {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'adaptive' | 'legacy'>('adaptive');

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/vto_prompts?select=*&order=key`, { headers: hdrs }).then(r => r.json()).then(d => { if (Array.isArray(d)) setPrompts(d); }).catch(() => {});
    fetch(`${SUPABASE_URL}/rest/v1/vto_prompt_versions?select=*&order=prompt_key,version`, { headers: hdrs }).then(r => r.json()).then(d => { if (Array.isArray(d)) setVersions(d); }).catch(() => {});
  }, []);

  const labelMap: Record<string, string> = { vto_3image: 'VTO Image (3-image)', vto_2image: 'VTO Image (2-image)', video: 'Video Generation', measurements: 'Body Measurements', profile_detect: 'Customer Profile', vto_western_upper: 'Western Topwear', vto_western_lower: 'Western Bottomwear', vto_ethnic: 'Indian Ethnic', vto_footwear: 'Footwear', measurements_male: 'Measurements (Male)', measurements_female: 'Measurements (Female)', video_ethnic: 'Video (Ethnic)', video_western: 'Video (Western)' };

  const grouped: Record<string, PromptVersion[]> = {};
  versions.forEach(v => { if (!grouped[v.prompt_key]) grouped[v.prompt_key] = []; grouped[v.prompt_key].push(v); });

  const saveVersion = async (id: string) => {
    setSaving(true);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompt_versions?id=eq.${id}`, { method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ prompt: editValue, updated_at: new Date().toISOString() }) });
    if (res.ok) { toast.success('Saved'); setEditing(null); const r = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompt_versions?select=*&order=prompt_key,version`, { headers: hdrs }); if (r.ok) setVersions(await r.json()); }
    else toast.error('Failed'); setSaving(false);
  };

  const saveLegacy = async (key: string) => {
    setSaving(true);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompts?key=eq.${key}`, { method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ prompt: editValue, updated_at: new Date().toISOString() }) });
    if (res.ok) { toast.success('Saved'); setEditing(null); const r = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompts?select=*&order=key`, { headers: hdrs }); if (r.ok) setPrompts(await r.json()); }
    else toast.error('Failed'); setSaving(false);
  };

  const toggleActive = async (v: PromptVersion) => {
    await fetch(`${SUPABASE_URL}/rest/v1/vto_prompt_versions?id=eq.${v.id}`, { method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ is_active: !v.is_active }) });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompt_versions?select=*&order=prompt_key,version`, { headers: hdrs }); if (r.ok) setVersions(await r.json());
  };

  const updateWeight = async (v: PromptVersion, w: number) => {
    await fetch(`${SUPABASE_URL}/rest/v1/vto_prompt_versions?id=eq.${v.id}`, { method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ traffic_weight: w }) });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/vto_prompt_versions?select=*&order=prompt_key,version`, { headers: hdrs }); if (r.ok) setVersions(await r.json());
  };

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Prompt Management</h2>
          <p className="text-xs text-slate-400 mt-0.5">Edit AI prompts for the VTO pipeline</p>
        </div>
        <div className="flex gap-1 bg-white rounded-lg border border-slate-200 p-0.5">
          {(['adaptive', 'legacy'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === m ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400'}`}>{m === 'adaptive' ? 'Adaptive (A/B)' : 'Legacy'}</button>
          ))}
        </div>
      </div>

      <div className="px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-600">
        <strong>Variables:</strong> {'{gender}, {age_range}, {skin_tone}, {skin_undertone}, {body_type}, {hair}, {distinctive_features}, {ethnicity_region}, {categoryLabel}, {garmentDescription}'}
      </div>

      {viewMode === 'adaptive' ? Object.entries(grouped).map(([key, vers]) => (
        <Card key={key} className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-800">{labelMap[key] || key}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{vers.length} version{vers.length > 1 ? 's' : ''}</p>
          </div>
          {vers.map(v => (
            <div key={v.id} className="px-5 py-3 border-b border-slate-50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">{v.version}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${v.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{v.is_active ? 'Active' : 'Inactive'}</span>
                  {v.avg_rating != null && <span className={`text-[10px] ${v.avg_rating >= 4 ? 'text-emerald-600' : v.avg_rating >= 3 ? 'text-amber-600' : 'text-red-600'}`}>★ {v.avg_rating.toFixed(1)} ({v.total_uses})</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">Weight:</span>
                  <input type="number" min={0} max={100} value={v.traffic_weight} onChange={e => updateWeight(v, Number(e.target.value))} className="w-12 px-1.5 py-0.5 rounded text-xs bg-slate-50 border border-slate-200 text-center" />
                  <button onClick={() => toggleActive(v)} className={`px-2 py-0.5 rounded text-[10px] border ${v.is_active ? 'border-red-200 text-red-500' : 'border-emerald-200 text-emerald-600'}`}>{v.is_active ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => { setEditing(v.id); setEditValue(v.prompt); }} className="px-2 py-0.5 rounded text-[10px] border border-slate-200 text-slate-500">Edit</button>
                </div>
              </div>
              {editing === v.id ? (
                <div>
                  <textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full min-h-[200px] p-3 rounded-lg text-xs font-mono bg-slate-50 border border-slate-200 text-slate-700 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-200">Cancel</button>
                    <button onClick={() => saveVersion(v.id)} disabled={saving || editValue === v.prompt} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white disabled:opacity-30">{saving ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>
              ) : (
                <pre className="text-[11px] text-slate-400 font-mono whitespace-pre-wrap break-words max-h-24 overflow-auto">{v.prompt}</pre>
              )}
            </div>
          ))}
        </Card>
      )) : prompts.map(p => (
        <Card key={p.key} className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div><p className="text-sm font-semibold text-slate-800">{labelMap[p.key] || p.key}</p><p className="text-[10px] text-slate-400 mt-0.5">{p.description}</p></div>
            {editing !== p.key && <button onClick={() => { setEditing(p.key); setEditValue(p.prompt); }} className="px-3 py-1 rounded-lg text-xs border border-slate-200 text-slate-500">Edit</button>}
          </div>
          {editing === p.key ? (
            <div className="p-4">
              <textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full min-h-[240px] p-3 rounded-lg text-xs font-mono bg-slate-50 border border-slate-200 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-200">Cancel</button>
                <button onClick={() => saveLegacy(p.key)} disabled={saving || editValue === p.prompt} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white disabled:opacity-30">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          ) : (
            <div className="p-4 max-h-44 overflow-auto"><pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-words">{p.prompt}</pre></div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ██ QUALITY TAB
// ═══════════════════════════════════════════════════════════════
function QualityTab() {
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/vto_ratings?select=*&order=created_at.desc&limit=200`, { headers: hdrs })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setRatings(d); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const s = useMemo(() => {
    const total = ratings.length;
    const avgRating = total > 0 ? ratings.reduce((s, r) => s + r.rating, 0) / total : 0;
    const thumbsUp = ratings.filter(r => r.thumbs === 'up').length;
    const thumbsDown = ratings.filter(r => r.thumbs === 'down').length;
    const satisfaction = total > 0 ? Math.round((thumbsUp / total) * 100) : 0;
    const issueCount: Record<string, number> = {};
    ratings.forEach(r => (r.issues || []).forEach(i => { issueCount[i] = (issueCount[i] || 0) + 1; }));
    const sortedIssues = Object.entries(issueCount).sort((a, b) => b[1] - a[1]);
    const catStats: Record<string, { total: number; sum: number }> = {};
    ratings.forEach(r => { const cat = r.garment_category || 'unknown'; if (!catStats[cat]) catStats[cat] = { total: 0, sum: 0 }; catStats[cat].total++; catStats[cat].sum += r.rating; });
    return { total, avgRating, thumbsUp, thumbsDown, satisfaction, sortedIssues, catStats };
  }, [ratings]);

  if (loading) return <div className="p-10 text-center text-slate-400">Loading quality data...</div>;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4"><p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Total Ratings</p><p className="text-2xl font-bold text-slate-900 mt-1"><AnimNum value={s.total} /></p></Card>
        <Card className="p-4"><p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Avg Rating</p><p className="text-2xl font-bold text-slate-900 mt-1">{s.avgRating.toFixed(1)}<span className="text-sm text-slate-300">/5</span></p></Card>
        <Card className="p-4"><p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Satisfaction</p><p className={`text-2xl font-bold mt-1 ${s.satisfaction >= 70 ? 'text-emerald-600' : s.satisfaction >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{s.satisfaction}%</p></Card>
        <Card className="p-4"><p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Thumbs</p><div className="flex items-center gap-3 mt-2"><span className="text-sm">👍 <span className="font-bold text-emerald-600">{s.thumbsUp}</span></span><span className="text-sm">👎 <span className="font-bold text-red-600">{s.thumbsDown}</span></span></div></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Top Issues</h3>
          {s.sortedIssues.length === 0 ? <p className="text-xs text-slate-300">No issues reported</p> : (
            <div className="space-y-2.5">
              {s.sortedIssues.slice(0, 8).map(([issue, count]) => {
                const max = s.sortedIssues[0]?.[1] || 1;
                return (
                  <div key={issue} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 truncate">{issue}</span>
                    <div className="flex items-center gap-2"><div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-red-300" style={{ width: `${(count / max) * 100}%` }} /></div><span className="text-xs text-slate-400 w-6 text-right">{count}</span></div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Quality by Category</h3>
          {Object.keys(s.catStats).length === 0 ? <p className="text-xs text-slate-300">No data yet</p> : (
            <div className="space-y-2.5">
              {Object.entries(s.catStats).map(([cat, st]) => {
                const avg = st.sum / st.total;
                return (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 capitalize">{cat.replace(/_/g, ' ')}</span>
                    <div className="flex items-center gap-2"><div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(avg / 5) * 100}%`, background: avg >= 4 ? '#059669' : avg >= 3 ? '#d97706' : '#dc2626' }} /></div><span className="text-xs text-slate-400 w-16 text-right">{avg.toFixed(1)}/5 ({st.total})</span></div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-900">Recent Ratings</h3></div>
        <table className="w-full text-xs">
          <thead><tr className="bg-slate-50">{['Time', 'Thumbs', 'Rating', 'Category', 'Issues', 'Prompt'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>
            {ratings.slice(0, 15).map(r => (
              <tr key={r.id} className="border-t border-slate-50">
                <td className="px-4 py-2.5 text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-base">{r.thumbs === 'up' ? '👍' : r.thumbs === 'ok' ? '👌' : '👎'}</td>
                <td className={`px-4 py-2.5 font-semibold ${r.rating >= 4 ? 'text-emerald-600' : r.rating >= 3 ? 'text-amber-600' : 'text-red-600'}`}>{r.rating}/5</td>
                <td className="px-4 py-2.5 text-slate-500 capitalize">{(r.garment_category || '—').replace(/_/g, ' ')}</td>
                <td className="px-4 py-2.5">{(r.issues || []).map(i => <span key={i} className="inline-block bg-red-50 text-red-500 rounded px-1.5 py-0.5 mr-1 text-[10px]">{i}</span>)}</td>
                <td className="px-4 py-2.5 text-slate-400">{r.prompt_version || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ██ SETTINGS TAB
// ═══════════════════════════════════════════════════════════════
function SettingsTab({ health, runHealthCheck, logs, addLog }: { health: HealthStatus; runHealthCheck: () => void; logs: string[]; addLog: (msg: string) => void; }) {
  const [sub, setSub] = useState<'config' | 'users' | 'monitoring'>('config');
  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex gap-1 bg-white rounded-lg border border-slate-200 p-0.5 w-fit">
        {(['config', 'users', 'monitoring'] as const).map(v => (
          <button key={v} onClick={() => setSub(v)} className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${sub === v ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400'}`}>{v}</button>
        ))}
      </div>
      {sub === 'config' && <ConfigSection />}
      {sub === 'users' && <UsersSection />}
      {sub === 'monitoring' && <MonitorSection health={health} runHealthCheck={runHealthCheck} logs={logs} addLog={addLog} />}
    </div>
  );
}

function ConfigSection() {
  const pin = sessionStorage.getItem(PIN_KEY) || '';
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`${FUNCTION_BASE}/admin-config`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'x-admin-pin': pin } })
      .then(r => r.json()).then(d => { if (d.settings) { setSettings(d.settings); const v: Record<string, string> = {}; d.settings.forEach((s: AppSetting) => { v[s.key] = s.value; }); setLocalValues(v); } }).catch(() => {}).finally(() => setLoading(false));
  }, [pin]);

  const handleSave = async (key: string) => {
    setSavingKeys(prev => new Set(prev).add(key));
    try { const res = await fetch(`${FUNCTION_BASE}/admin-config`, { method: 'PUT', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'x-admin-pin': pin }, body: JSON.stringify({ key, value: localValues[key] }) }); if (res.ok) toast.success('Saved'); else toast.error('Failed'); }
    catch { toast.error('Failed'); } finally { setSavingKeys(prev => { const n = new Set(prev); n.delete(key); return n; }); }
  };

  if (loading) return <div className="text-center py-10 text-slate-400">Loading settings...</div>;
  return (
    <div className="space-y-4 max-w-2xl">
      {settings.filter(s => s.key !== 'display_idle_screen').map(s => {
        const dirty = localValues[s.key] !== s.value;
        return (
          <Card key={s.key} className="p-4">
            <label className="text-sm font-medium text-slate-700">{s.label}</label>
            {s.description && <p className="text-xs text-slate-400 mt-0.5">{s.description}</p>}
            <div className="flex items-center gap-2 mt-2">
              <input type={s.type === 'number' ? 'number' : 'text'} value={localValues[s.key] ?? s.value} onChange={e => setLocalValues(p => ({ ...p, [s.key]: e.target.value }))} className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              <button onClick={() => handleSave(s.key)} disabled={!dirty || savingKeys.has(s.key)} className="px-3 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white disabled:opacity-30">{savingKeys.has(s.key) ? 'Saving...' : 'Save'}</button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function UsersSection() {
  const pin = sessionStorage.getItem(PIN_KEY) || '';
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${FUNCTION_BASE}/admin-users`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'x-admin-pin': pin } })
      .then(r => r.json()).then(d => { if (d.users) setUsers(d.users); }).catch(() => {}).finally(() => setLoading(false));
  }, [pin]);

  const exportCSV = () => {
    const h = ['Name', 'Email', 'Phone', 'Date', 'Gens'];
    const rows = users.map(u => [u.full_name || 'Guest', u.email || '', u.phone || '', new Date(u.created_at).toLocaleString(), u.generation_count]);
    const csv = [h, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `vto-users-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <div className="text-center py-10 text-slate-400">Loading users...</div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{users.length} user{users.length !== 1 ? 's' : ''}</span>
        <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-500 hover:text-slate-700"><Download className="w-3.5 h-3.5" /> Export</button>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50">{['Name', 'Email', 'Phone', 'Look', 'Date', 'Gens'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id} className="border-t border-slate-50">
              <td className="px-4 py-2.5 text-xs font-medium text-slate-700">{u.full_name || '—'}</td>
              <td className="px-4 py-2.5 text-xs text-slate-400">{u.email || '—'}</td>
              <td className="px-4 py-2.5 text-xs text-slate-400">{u.phone || '—'}</td>
              <td className="px-4 py-2.5"><ThumbLight url={u.generated_look_url} /></td>
              <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(u.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-2.5 text-xs text-slate-500">{u.generation_count}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}

function MonitorSection({ health, runHealthCheck, logs, addLog }: { health: HealthStatus; runHealthCheck: () => void; logs: string[]; addLog: (msg: string) => void; }) {
  const [stuck, setStuck] = useState<any[]>([]);
  useEffect(() => {
    const check = async () => { try { const r = await fetch(`${SUPABASE_URL}/rest/v1/vto_sessions?registration_status=eq.generating&select=id,session_token,registration_status,created_at,updated_at`, { headers: hdrs }); if (r.ok) { const d = await r.json(); setStuck(d); if (d.length > 0) addLog(`Found ${d.length} stuck`); } } catch {} };
    check(); const i = setInterval(check, 30_000); return () => clearInterval(i);
  }, [addLog]);

  const resetStuck = async (id: string) => {
    await fetch(`${SUPABASE_URL}/rest/v1/vto_sessions?id=eq.${id}`, { method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ registration_status: 'registered' }) });
    addLog(`Reset ${id.substring(0, 8)}`); setStuck(p => p.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[{ label: 'Supabase API', ok: health.supabaseApi }, { label: 'Edge Functions', ok: health.edgeFunction }, { label: 'Last Check', ok: true, value: health.lastCheck ? new Date(health.lastCheck).toLocaleTimeString() : 'never' }].map(item => (
          <Card key={item.label} className={`p-4 border ${item.ok ? 'border-emerald-200' : 'border-red-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${item.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <div><p className="text-sm font-medium text-slate-700">{item.label}</p><p className={`text-xs ${item.ok ? 'text-emerald-600' : 'text-red-600'}`}>{item.value || (item.ok ? 'Healthy' : 'Down')}</p></div>
            </div>
          </Card>
        ))}
      </div>
      <button onClick={runHealthCheck} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-500 hover:text-slate-700"><RefreshCw className="w-3.5 h-3.5" /> Run Health Check</button>
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Stuck Sessions</h3>
        {stuck.length === 0 ? <div className="text-xs text-emerald-600 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" /> All clear</div> : (
          <div className="space-y-2">{stuck.map(s => (
            <div key={s.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg">
              <span className="text-xs text-slate-500">{s.id.substring(0, 12)}... since {fmtTime(s.updated_at)}</span>
              <button onClick={() => resetStuck(s.id)} className="px-2 py-1 rounded text-xs text-red-500 border border-red-200 hover:bg-red-50">Reset</button>
            </div>
          ))}</div>
        )}
      </Card>
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Activity Log</h3>
        <div className="max-h-80 overflow-auto font-mono text-xs leading-relaxed">
          {logs.length === 0 && <span className="text-slate-300">No events yet...</span>}
          {logs.map((log, i) => <div key={i} className={log.includes('FAIL') || log.includes('ERROR') ? 'text-red-500' : log.includes('OK') ? 'text-emerald-600' : 'text-slate-400'}>{log}</div>)}
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ██ SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-slate-200 rounded-xl shadow-sm ${className}`}>{children}</div>;
}

function Delta({ value, label }: { value: number; label: string }) {
  if (value === 0) return <p className="text-xs text-slate-400 mt-1">No change {label}</p>;
  return (
    <div className="flex items-center gap-1 mt-1">
      {value > 0 ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-red-500" />}
      <span className={`text-xs font-medium ${value > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{Math.abs(value)}%</span>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

function Highlight({ icon: Icon, label, value, color, bg }: { icon: React.ElementType; label: string; value: number; color: string; bg: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s: Record<string, string> = { registered: 'bg-emerald-50 text-emerald-700', generating: 'bg-amber-50 text-amber-700', pending: 'bg-slate-100 text-slate-500', completed: 'bg-blue-50 text-blue-700' };
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${s[status] || 'bg-slate-100 text-slate-400'}`}>{status}</span>;
}

function CatPill({ category }: { category: string | null }) {
  if (!category) return <span className="text-slate-300">—</span>;
  return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{category}</span>;
}

function ThumbLight({ url }: { url: string | null }) {
  const pub = toPublicUrl(url);
  if (!pub) return <span className="text-slate-300">—</span>;
  return <img src={pub} alt="" className="w-9 h-12 object-cover rounded-md border border-slate-200 hover:scale-110 transition-transform cursor-pointer" />;
}

function SessionModal({ s, onClose }: { s: Session; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-[90%] max-h-[90vh] overflow-auto p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-slate-900">Session Detail</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
          <div className="text-slate-400">ID: <span className="text-slate-700">{s.id}</span></div>
          <div className="text-slate-400">Status: <StatusPill status={s.registration_status} /></div>
          <div className="text-slate-400">Created: <span className="text-slate-700">{new Date(s.created_at).toLocaleString()}</span></div>
          <div className="text-slate-400">Generations: <span className="text-slate-700">{s.generation_count}</span></div>
          <div className="text-slate-400">User: <span className="text-slate-700">{s.full_name || '—'}</span></div>
          <div className="text-slate-400">Phone: <span className="text-slate-700">{s.phone || '—'}</span></div>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[['Selfie', s.selfie_url], ['Full Body', s.full_body_url], ['Garment', s.garment_url], ['VTO Result', s.generated_look_url]].map(([label, url]) => {
            const pub = toPublicUrl(url as string | null);
            return (
              <div key={String(label)}>
                <p className="text-xs text-slate-400 mb-2">{String(label)}</p>
                {pub ? <img src={pub} alt={String(label)} className="w-full h-48 object-cover rounded-xl border border-slate-200" />
                  : <div className="w-full h-48 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-center text-slate-300 text-xs">No image</div>}
              </div>
            );
          })}
        </div>
        {s.generated_video_url && (
          <div className="mb-6"><p className="text-xs text-slate-400 mb-2">Generated Video</p><video src={toPublicUrl(s.generated_video_url)!} controls autoPlay loop muted className="max-h-72 rounded-xl border border-slate-200" /></div>
        )}
        {s.body_measurements && (
          <div><p className="text-xs text-slate-400 mb-2">Body Measurements</p>
            <div className="grid grid-cols-4 gap-2">{Object.entries(s.body_measurements).map(([k, v]) => (
              <div key={k} className="bg-slate-50 rounded-lg p-2.5"><span className="text-[10px] text-slate-400">{k.replace(/_/g, ' ')}</span><div className="text-xs font-medium text-slate-700 mt-0.5">{String(v)}</div></div>
            ))}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Export ───────────────────────────────────────────────────
const DashboardPage: React.FC = () => <PinGate><DashboardContent /></PinGate>;
export default DashboardPage;
