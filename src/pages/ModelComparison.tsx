import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Clock, AlertCircle, CheckCircle2, Loader2, RefreshCw, RotateCcw, Database, Brain, TrendingUp, Image as ImageIcon } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Models: Gemini VTO (production) + CatVTON-FLUX (training)
const MODEL_NAMES = ['Gemini VTO', 'CatVTON-FLUX'];

interface ModelResult {
  model: string;
  success: boolean;
  error?: string | null;
  durationMs: number;
  imageUrl?: string | null;
}

interface ComparisonData {
  modelResults: ModelResult[];
  winner: string;
  reasoning: string;
  scores: Record<string, number>;
  generatedAt: string;
}

interface SessionRow {
  id: string;
  session_token: string;
  registration_status: string;
  selfie_url: string | null;
  full_body_url: string | null;
  garment_url: string | null;
  generated_look_url: string | null;
  model_comparison_data: ComparisonData | null;
  updated_at: string;
}

interface TrainingRecord {
  id: string;
  session_id: string;
  person_image_path: string;
  garment_image_path: string;
  selfie_image_path: string | null;
  result_image_path: string;
  category: string;
  garment_description: string;
  gemini_duration_ms: number;
  used_in_training: boolean;
  training_batch: string | null;
  created_at: string;
}

const ModelComparison: React.FC = () => {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [trainingData, setTrainingData] = useState<TrainingRecord[]>([]);
  const [trainingStats, setTrainingStats] = useState({ total: 0, used: 0, unused: 0, avgDuration: 0 });
  const [isPolling, setIsPolling] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'live' | 'training'>('training');
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const dismissedIds = useRef<Set<string>>(new Set());

  // Derived state from session
  const comparisonData = session?.model_comparison_data ?? null;
  const modelResults = comparisonData?.modelResults ?? [];
  const winner = comparisonData?.winner ?? null;
  const reasoning = comparisonData?.reasoning ?? '';
  const scores = comparisonData?.scores ?? {};
  const isGenerating = session?.registration_status === 'generating';

  // Build display models
  const displayModels = MODEL_NAMES.map((name) => {
    const result = modelResults.find(
      (r) => r.model.toLowerCase().replace(/\s+/g, '') === name.toLowerCase().replace(/\s+/g, '')
    );
    return {
      model: name,
      success: result?.success ?? false,
      error: result?.error ?? null,
      durationMs: result?.durationMs ?? 0,
      imageUrl: result?.imageUrl ?? null,
      hasResult: !!result,
    };
  });

  // Dataset milestones
  const milestones = [
    { count: 50, label: 'Basic learning', color: 'red' },
    { count: 200, label: 'Decent quality', color: 'yellow' },
    { count: 500, label: 'Near Gemini', color: 'blue' },
    { count: 1000, label: 'Production ready', color: 'green' },
  ];

  const currentMilestone = milestones.reduce((prev, m) =>
    trainingStats.total >= m.count ? m : prev, milestones[0]);
  const nextMilestone = milestones.find(m => trainingStats.total < m.count) ?? milestones[milestones.length - 1];
  const progressPct = Math.min(100, (trainingStats.total / nextMilestone.count) * 100);

  // Poll for data
  useEffect(() => {
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };

    const fetchAll = async () => {
      try {
        // Fetch latest session
        const sessRes = await fetch(
          `${SUPABASE_URL}/rest/v1/vto_sessions?updated_at=gte.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}&order=updated_at.desc&limit=1&select=id,session_token,registration_status,selfie_url,full_body_url,garment_url,generated_look_url,model_comparison_data,updated_at`,
          { headers }
        );
        if (sessRes.ok) {
          const data: SessionRow[] = await sessRes.json();
          if (data?.[0] && !dismissedIds.current.has(data[0].id)) {
            setSession(data[0]);
          }
        }

        // Fetch training data (latest 50 records)
        const trainRes = await fetch(
          `${SUPABASE_URL}/rest/v1/vto_training_data?order=created_at.desc&limit=50`,
          { headers }
        );
        if (trainRes.ok) {
          const data: TrainingRecord[] = await trainRes.json();
          setTrainingData(data);

          // Compute stats
          const total = data.length; // This is limited to 50, get actual count separately
          const used = data.filter(d => d.used_in_training).length;
          const avgDur = data.length > 0
            ? data.reduce((s, d) => s + (d.gemini_duration_ms || 0), 0) / data.length
            : 0;

          // Get total count
          const countRes = await fetch(
            `${SUPABASE_URL}/rest/v1/vto_training_data?select=id&limit=1`,
            { headers: { ...headers, 'Prefer': 'count=exact' } }
          );
          const totalCount = parseInt(countRes.headers.get('content-range')?.split('/')[1] ?? '0');

          setTrainingStats({
            total: totalCount || total,
            used,
            unused: (totalCount || total) - used,
            avgDuration: avgDur,
          });
        }

        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    fetchAll();
    pollRef.current = setInterval(fetchAll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (session?.id) dismissedIds.current.add(session.id);
    setSession(null);
    setLastUpdated('');
    setTimeout(() => {
      const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
      const refetch = async () => {
        try {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/vto_sessions?updated_at=gte.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}&order=updated_at.desc&limit=1&select=id,session_token,registration_status,selfie_url,full_body_url,garment_url,generated_look_url,model_comparison_data,updated_at`,
            { headers }
          );
          if (res.ok) {
            const data: SessionRow[] = await res.json();
            if (data?.[0] && !dismissedIds.current.has(data[0].id)) {
              setSession(data[0]);
              setLastUpdated(new Date().toLocaleTimeString());
            }
          }
        } catch {}
      };
      pollRef.current = setInterval(refetch, 5000);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold">VTO Dashboard</h1>
            <p className="text-sm text-gray-400">
              Gemini VTO + CatVTON-FLUX Training
              {lastUpdated && <span className="ml-2 text-gray-600">· {lastUpdated}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab switcher */}
          <div className="flex bg-white/5 rounded-full p-1">
            <button
              onClick={() => setActiveTab('training')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                activeTab === 'training' ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Brain className="w-3.5 h-3.5 inline mr-1.5" />Training
            </button>
            <button
              onClick={() => setActiveTab('live')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                activeTab === 'live' ? 'bg-amber-500/30 text-amber-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 inline mr-1.5" />Live
            </button>
          </div>
          <button onClick={handleReset} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm text-gray-400 hover:text-white transition">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <RefreshCw className={`w-3 h-3 ${isPolling ? 'animate-spin' : ''}`} />
          </div>
        </div>
      </div>

      <div className="p-6 lg:p-10 space-y-8 max-w-screen-2xl mx-auto">

        {/* ═══ TRAINING TAB ═══ */}
        {activeTab === 'training' && (
          <>
            {/* Training Stats Row */}
            <section>
              <h2 className="text-lg font-semibold text-gray-300 mb-4 flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-400" />
                Training Dataset
              </h2>
              <div className="grid grid-cols-4 gap-4">
                <StatCard
                  label="Total Samples"
                  value={trainingStats.total}
                  icon={<Database className="w-5 h-5" />}
                  color="purple"
                />
                <StatCard
                  label="Ready to Train"
                  value={trainingStats.unused}
                  icon={<TrendingUp className="w-5 h-5" />}
                  color="blue"
                />
                <StatCard
                  label="Already Trained"
                  value={trainingStats.used}
                  icon={<CheckCircle2 className="w-5 h-5" />}
                  color="green"
                />
                <StatCard
                  label="Avg Gemini Time"
                  value={`${(trainingStats.avgDuration / 1000).toFixed(1)}s`}
                  icon={<Clock className="w-5 h-5" />}
                  color="amber"
                />
              </div>
            </section>

            {/* Progress Toward Next Milestone */}
            <section>
              <h2 className="text-lg font-semibold text-gray-300 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                Model Quality Roadmap
              </h2>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
                {/* Milestone progress bar */}
                <div className="relative">
                  <div className="flex justify-between text-xs text-gray-500 mb-2">
                    <span>{trainingStats.total} samples</span>
                    <span>Next: {nextMilestone.count} ({nextMilestone.label})</span>
                  </div>
                  <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 bg-gradient-to-r from-purple-500 to-blue-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Milestone markers */}
                <div className="grid grid-cols-4 gap-3">
                  {milestones.map((m) => {
                    const reached = trainingStats.total >= m.count;
                    const isCurrent = m === currentMilestone && trainingStats.total > 0;
                    return (
                      <div
                        key={m.count}
                        className={`rounded-xl p-4 border transition ${
                          reached
                            ? 'bg-green-500/10 border-green-500/30'
                            : isCurrent
                            ? 'bg-blue-500/10 border-blue-500/30'
                            : 'bg-white/[0.02] border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {reached ? (
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-gray-700" />
                          )}
                          <span className={`text-lg font-bold ${reached ? 'text-green-400' : 'text-gray-500'}`}>
                            {m.count}
                          </span>
                        </div>
                        <p className={`text-xs ${reached ? 'text-green-300' : 'text-gray-600'}`}>{m.label}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Estimated timeline */}
                <div className="text-sm text-gray-400">
                  {trainingStats.total === 0 ? (
                    <p>Start generating try-ons via the kiosk to collect training data.</p>
                  ) : trainingStats.total < 50 ? (
                    <p>
                      At current pace, you need <strong className="text-white">{500 - trainingStats.total} more samples</strong> to
                      approach Gemini quality. Each kiosk session adds 1 training sample.
                    </p>
                  ) : trainingStats.total < 500 ? (
                    <p>
                      Good progress! <strong className="text-blue-300">{500 - trainingStats.total} more samples</strong> until CatVTON-FLUX
                      can match Gemini VTO quality. Ready to start training runs.
                    </p>
                  ) : (
                    <p className="text-green-300">
                      Dataset is large enough for production-quality fine-tuning! Run the training Colab notebook.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Recent Training Samples Grid */}
            <section>
              <h2 className="text-lg font-semibold text-gray-300 mb-4 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-amber-400" />
                Recent Training Samples
                <span className="text-xs text-gray-600 font-normal ml-2">(person → garment → Gemini result)</span>
              </h2>
              {trainingData.length === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded-xl p-10 text-center">
                  <Database className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-500">No training data yet. Generate try-ons via the kiosk!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trainingData.slice(0, 10).map((rec) => (
                    <TrainingSampleRow key={rec.id} record={rec} supabaseUrl={SUPABASE_URL} anonKey={SUPABASE_ANON_KEY} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* ═══ LIVE TAB ═══ */}
        {activeTab === 'live' && (
          <>
            {/* Input Images Row */}
            <section>
              <h2 className="text-lg font-semibold text-gray-300 mb-4">Input Images</h2>
              <div className="grid grid-cols-3 gap-4 max-w-4xl">
                <InputImageCard label="Selfie" url={session?.selfie_url} />
                <InputImageCard label="Full Body" url={session?.full_body_url} />
                <InputImageCard label="Garment" url={session?.garment_url} />
              </div>
            </section>

            {/* Model Output */}
            <section>
              <h2 className="text-lg font-semibold text-gray-300 mb-4">Model Outputs</h2>
              <div className="grid grid-cols-2 gap-6 max-w-3xl">
                {displayModels.map((result) => {
                  const isWinner = result.model === winner;
                  const score = scores[result.model];
                  return (
                    <div key={result.model} className={`rounded-2xl overflow-hidden border-2 transition ${
                      isWinner ? 'border-amber-500/60 bg-amber-500/5'
                        : result.hasResult && result.success ? 'border-white/10 bg-white/5'
                        : result.hasResult && !result.success ? 'border-red-500/30 bg-red-500/5'
                        : 'border-white/5 bg-white/[0.02]'
                    }`}>
                      <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
                        <div className="flex items-center gap-2">
                          {isWinner && <Trophy className="w-4 h-4 text-amber-400" />}
                          <span className="font-bold text-sm">{result.model}</span>
                          {result.model === 'CatVTON-FLUX' && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded-full">TRAINING</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {result.hasResult ? (
                            result.success ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                              : <AlertCircle className="w-4 h-4 text-red-400" />
                          ) : isGenerating ? (
                            <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-gray-700" />
                          )}
                          {result.hasResult && result.durationMs > 0 && (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <Clock className="w-3 h-3" />{(result.durationMs / 1000).toFixed(1)}s
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="aspect-[3/4] bg-gray-900">
                        {result.hasResult && result.success && result.imageUrl ? (
                          <img src={result.imageUrl} alt={`${result.model} output`} className="w-full h-full object-cover" />
                        ) : result.hasResult && !result.success ? (
                          <div className="w-full h-full flex items-center justify-center p-4">
                            <div className="text-center space-y-2">
                              <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                              <p className="text-sm text-red-300">Failed</p>
                              <p className="text-xs text-gray-500 max-w-[200px] truncate">{result.error}</p>
                            </div>
                          </div>
                        ) : isGenerating ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Loader2 className="w-10 h-10 text-gray-600 animate-spin" />
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="text-center space-y-2">
                              <div className="w-12 h-12 rounded-xl border-2 border-dashed border-gray-800 mx-auto flex items-center justify-center">
                                <span className="text-gray-700 text-lg">?</span>
                              </div>
                              <p className="text-xs text-gray-700">
                                {result.model === 'CatVTON-FLUX' ? 'Not yet trained' : 'Awaiting generation'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      {score !== undefined && (
                        <div className="px-4 py-2 border-t border-white/10">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">AI Score</span>
                            <span className={`text-sm font-bold ${isWinner ? 'text-amber-400' : 'text-gray-300'}`}>{score}/10</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Result */}
            <section className="max-w-3xl">
              <h2 className="text-lg font-semibold text-gray-300 mb-3">Result</h2>
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 min-h-[60px]">
                {reasoning ? (
                  <p className="text-sm text-gray-300 leading-relaxed">{reasoning}</p>
                ) : (
                  <p className="text-sm text-gray-700 italic">Reasoning will appear after generation...</p>
                )}
              </div>
            </section>
          </>
        )}

        {/* Session Info */}
        <section className="max-w-3xl">
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <span>Session: {session?.id?.slice(0, 8) ?? '—'}</span>
            <span>Status: {session?.registration_status ?? 'no session'}</span>
            {comparisonData?.generatedAt && (
              <span>Generated: {new Date(comparisonData.generatedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────

const StatCard: React.FC<{
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, icon, color }) => {
  const colorMap: Record<string, string> = {
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };
  const cls = colorMap[color] ?? colorMap.purple;

  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="flex items-center gap-2 mb-2 opacity-70">{icon}<span className="text-xs">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
};

const TrainingSampleRow: React.FC<{
  record: TrainingRecord;
  supabaseUrl: string;
  anonKey: string;
}> = ({ record, supabaseUrl, anonKey }) => {
  const imgUrl = (path: string) =>
    `${supabaseUrl}/storage/v1/object/authenticated/vto-images/${path}`;

  const time = new Date(record.created_at).toLocaleString();
  const duration = record.gemini_duration_ms ? `${(record.gemini_duration_ms / 1000).toFixed(1)}s` : '—';

  return (
    <div className={`flex items-center gap-4 bg-white/5 rounded-xl p-3 border ${
      record.used_in_training ? 'border-green-500/20' : 'border-white/10'
    }`}>
      {/* Thumbnails */}
      <div className="flex gap-2 flex-shrink-0">
        <div className="w-14 h-18 rounded-lg overflow-hidden bg-gray-800">
          <img src={imgUrl(record.person_image_path)} alt="Person" className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div className="text-gray-600 self-center">→</div>
        <div className="w-14 h-18 rounded-lg overflow-hidden bg-gray-800">
          <img src={imgUrl(record.garment_image_path)} alt="Garment" className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div className="text-gray-600 self-center">→</div>
        <div className="w-14 h-18 rounded-lg overflow-hidden bg-gray-800 border border-amber-500/30">
          <img src={imgUrl(record.result_image_path)} alt="Result" className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{time}</span>
          <span className="text-xs text-gray-600">|</span>
          <span className="text-xs text-gray-400">{record.category}</span>
          <span className="text-xs text-gray-600">|</span>
          <span className="text-xs text-gray-400">{duration}</span>
        </div>
        {record.garment_description && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{record.garment_description}</p>
        )}
      </div>

      {/* Status badge */}
      <div className="flex-shrink-0">
        {record.used_in_training ? (
          <span className="text-[10px] px-2 py-1 bg-green-500/20 text-green-400 rounded-full">Trained</span>
        ) : (
          <span className="text-[10px] px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full">Ready</span>
        )}
      </div>
    </div>
  );
};

const InputImageCard: React.FC<{ label: string; url: string | null | undefined }> = ({ label, url }) => (
  <div className="space-y-2">
    <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
    <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-800 border border-white/10">
      {url ? (
        <img src={url} alt={label} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="w-10 h-10 rounded-lg border-2 border-dashed border-gray-700 mx-auto flex items-center justify-center">
              <span className="text-gray-600 text-sm">+</span>
            </div>
            <p className="text-xs text-gray-600">Waiting...</p>
          </div>
        </div>
      )}
    </div>
  </div>
);

export default ModelComparison;
