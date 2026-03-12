import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Clock, AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// The 3 models we always show
const MODEL_NAMES = ['IDM-VTON', 'OmniGen', 'Vertex AI'];

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

const ModelComparison: React.FC = () => {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Derived state from session
  const comparisonData = session?.model_comparison_data ?? null;
  const modelResults = comparisonData?.modelResults ?? [];
  const winner = comparisonData?.winner ?? null;
  const reasoning = comparisonData?.reasoning ?? '';
  const scores = comparisonData?.scores ?? {};
  const isGenerating = session?.registration_status === 'generating';

  // Build display models: always show all 3 slots, merge with actual results
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

  // Poll Supabase for the latest session
  useEffect(() => {
    const fetchLatestSession = async () => {
      try {
        const headers = {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        };

        // Get the most recent session (within last 24h) that has at least started
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/vto_sessions?updated_at=gte.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}&order=updated_at.desc&limit=1&select=id,session_token,registration_status,selfie_url,full_body_url,garment_url,generated_look_url,model_comparison_data,updated_at`,
          { headers }
        );

        if (res.ok) {
          const data: SessionRow[] = await res.json();
          if (data?.[0]) {
            setSession(data[0]);
            setLastUpdated(new Date().toLocaleTimeString());
          }
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    fetchLatestSession();
    pollRef.current = setInterval(fetchLatestSession, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold">Model Comparison</h1>
            <p className="text-sm text-gray-400">
              Internal view — real-time input & output from all 3 models
              {lastUpdated && <span className="ml-2 text-gray-600">· updated {lastUpdated}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isGenerating && (
            <div className="flex items-center gap-2 bg-blue-500/20 border border-blue-500/40 px-4 py-2 rounded-full">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-sm font-semibold text-blue-300">Generating...</span>
            </div>
          )}
          {winner && (
            <div className="flex items-center gap-2 bg-amber-500/20 border border-amber-500/40 px-4 py-2 rounded-full">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-amber-300">Winner: {winner}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <RefreshCw className={`w-3 h-3 ${isPolling ? 'animate-spin' : ''}`} />
            <span>Live</span>
          </div>
        </div>
      </div>

      <div className="p-6 lg:p-10 space-y-8 max-w-screen-2xl mx-auto">
        {/* Input Images Row */}
        <section>
          <h2 className="text-lg font-semibold text-gray-300 mb-4">Input Images</h2>
          <div className="grid grid-cols-3 gap-4 max-w-4xl">
            <InputImageCard label="Selfie" url={session?.selfie_url} />
            <InputImageCard label="Full Body" url={session?.full_body_url} />
            <InputImageCard label="Garment" url={session?.garment_url} />
          </div>
        </section>

        {/* Model Outputs Row — always shows all 3 slots */}
        <section>
          <h2 className="text-lg font-semibold text-gray-300 mb-4">Model Outputs</h2>
          <div className="grid grid-cols-3 gap-6">
            {displayModels.map((result) => {
              const isWinner = result.model === winner;
              const score = scores[result.model];

              return (
                <div
                  key={result.model}
                  className={`rounded-2xl overflow-hidden border-2 transition ${
                    isWinner
                      ? 'border-amber-500/60 bg-amber-500/5'
                      : result.hasResult && result.success
                      ? 'border-white/10 bg-white/5'
                      : result.hasResult && !result.success
                      ? 'border-red-500/30 bg-red-500/5'
                      : 'border-white/5 bg-white/[0.02]'
                  }`}
                >
                  {/* Model Header */}
                  <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
                    <div className="flex items-center gap-2">
                      {isWinner && <Trophy className="w-4 h-4 text-amber-400" />}
                      <span className="font-bold text-sm">{result.model}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.hasResult ? (
                        result.success ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        )
                      ) : isGenerating ? (
                        <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-gray-700" />
                      )}
                      {result.hasResult && result.durationMs > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="w-3 h-3" />
                          {(result.durationMs / 1000).toFixed(1)}s
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Model Image */}
                  <div className="aspect-[3/4] bg-gray-900">
                    {result.hasResult && result.success && result.imageUrl ? (
                      <img
                        src={result.imageUrl}
                        alt={`${result.model} output`}
                        className="w-full h-full object-cover"
                      />
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
                        <div className="text-center space-y-3">
                          <Loader2 className="w-10 h-10 text-gray-600 animate-spin mx-auto" />
                          <p className="text-xs text-gray-600">Running model...</p>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center space-y-2">
                          <div className="w-12 h-12 rounded-xl border-2 border-dashed border-gray-800 mx-auto flex items-center justify-center">
                            <span className="text-gray-700 text-lg">?</span>
                          </div>
                          <p className="text-xs text-gray-700">Awaiting generation</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Score */}
                  {score !== undefined ? (
                    <div className="px-4 py-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">AI Score</span>
                        <span className={`text-sm font-bold ${isWinner ? 'text-amber-400' : 'text-gray-300'}`}>
                          {score}/10
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isWinner ? 'bg-amber-400' : 'bg-gray-500'}`}
                          style={{ width: `${(score / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">AI Score</span>
                        <span className="text-xs text-gray-700">—</span>
                      </div>
                      <div className="mt-1 h-1.5 bg-gray-800 rounded-full overflow-hidden" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* AI Reasoning */}
        <section className="max-w-3xl">
          <h2 className="text-lg font-semibold text-gray-300 mb-3">AI Judge Reasoning</h2>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 min-h-[60px]">
            {reasoning ? (
              <p className="text-sm text-gray-300 leading-relaxed">{reasoning}</p>
            ) : (
              <p className="text-sm text-gray-700 italic">Reasoning will appear after models are judged...</p>
            )}
          </div>
        </section>

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

// Reusable input image card
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
