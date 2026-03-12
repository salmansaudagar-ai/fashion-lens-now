import React, { useState, useEffect } from 'react';
import { Trophy, Clock, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ModelResult {
  model: string;
  success: boolean;
  error?: string;
  durationMs: number;
  imageUrl?: string | null;
}

const ModelComparison: React.FC = () => {
  const navigate = useNavigate();
  const [modelResults, setModelResults] = useState<ModelResult[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [fullBodyUrl, setFullBodyUrl] = useState<string | null>(null);
  const [garmentUrl, setGarmentUrl] = useState<string | null>(null);
  const [winnerImageUrl, setWinnerImageUrl] = useState<string | null>(null);

  useEffect(() => {
    // Load all data from sessionStorage
    const results = sessionStorage.getItem('vto_model_results');
    const w = sessionStorage.getItem('vto_model_winner');
    const r = sessionStorage.getItem('vto_model_reasoning');
    const s = sessionStorage.getItem('vto_model_scores');
    const selfie = sessionStorage.getItem('vto_selfie');
    const fullBody = sessionStorage.getItem('vto_full_body');
    const garment = sessionStorage.getItem('vto_garment_image');
    const generatedLook = sessionStorage.getItem('vto_generated_look');

    if (results) {
      try { setModelResults(JSON.parse(results)); } catch {}
    }
    if (w) setWinner(w);
    if (r) setReasoning(r);
    if (s) {
      try { setScores(JSON.parse(s)); } catch {}
    }
    if (selfie) setSelfieUrl(selfie);
    if (fullBody) setFullBodyUrl(fullBody);
    if (garment) setGarmentUrl(garment);
    if (generatedLook) setWinnerImageUrl(generatedLook);
  }, []);

  const successfulModels = modelResults.filter(r => r.success);
  const failedModels = modelResults.filter(r => !r.success);

  if (modelResults.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-gray-500 mx-auto" />
          <h1 className="text-2xl font-bold">No Comparison Data</h1>
          <p className="text-gray-400 max-w-md">
            Generate a virtual try-on first. The comparison data will appear here after
            the models run.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition"
          >
            Go to Try-On
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Model Comparison</h1>
            <p className="text-sm text-gray-400">Internal view — input & output from all 3 models</p>
          </div>
        </div>
        {winner && (
          <div className="flex items-center gap-2 bg-amber-500/20 border border-amber-500/40 px-4 py-2 rounded-full">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">Winner: {winner}</span>
          </div>
        )}
      </div>

      <div className="p-6 space-y-8">
        {/* Input Images Row */}
        <section>
          <h2 className="text-lg font-semibold text-gray-300 mb-4">Input Images</h2>
          <div className="grid grid-cols-3 gap-4 max-w-3xl">
            <div className="space-y-2">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Selfie</span>
              <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-800 border border-white/10">
                {selfieUrl ? (
                  <img src={selfieUrl} alt="Selfie" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                    No selfie
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Full Body</span>
              <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-800 border border-white/10">
                {fullBodyUrl ? (
                  <img src={fullBodyUrl} alt="Full Body" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                    No full body
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Garment</span>
              <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-800 border border-white/10">
                {garmentUrl ? (
                  <img src={garmentUrl} alt="Garment" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                    No garment
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Model Outputs Row */}
        <section>
          <h2 className="text-lg font-semibold text-gray-300 mb-4">Model Outputs</h2>
          <div className="grid grid-cols-3 gap-6">
            {modelResults.map((result) => {
              const isWinner = result.model === winner;
              const score = scores[result.model];

              return (
                <div
                  key={result.model}
                  className={`rounded-2xl overflow-hidden border-2 transition ${
                    isWinner
                      ? 'border-amber-500/60 bg-amber-500/5'
                      : result.success
                      ? 'border-white/10 bg-white/5'
                      : 'border-red-500/30 bg-red-500/5'
                  }`}
                >
                  {/* Model Header */}
                  <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
                    <div className="flex items-center gap-2">
                      {isWinner && <Trophy className="w-4 h-4 text-amber-400" />}
                      <span className="font-bold text-sm">{result.model}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {(result.durationMs / 1000).toFixed(1)}s
                      </div>
                    </div>
                  </div>

                  {/* Model Image */}
                  <div className="aspect-[3/4] bg-gray-900">
                    {result.success && result.imageUrl ? (
                      <img
                        src={result.imageUrl}
                        alt={`${result.model} output`}
                        className="w-full h-full object-cover"
                      />
                    ) : result.success && !result.imageUrl ? (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm p-4 text-center">
                        Image generated but URL not saved.<br />
                        (Upgrade edge function to save all model images)
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-4">
                        <div className="text-center space-y-2">
                          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                          <p className="text-sm text-red-300">Failed</p>
                          <p className="text-xs text-gray-500">{result.error}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Score */}
                  {score !== undefined && (
                    <div className="px-4 py-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">AI Score</span>
                        <span className={`text-sm font-bold ${isWinner ? 'text-amber-400' : 'text-gray-300'}`}>
                          {score}/10
                        </span>
                      </div>
                      {/* Score bar */}
                      <div className="mt-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isWinner ? 'bg-amber-400' : 'bg-gray-500'}`}
                          style={{ width: `${(score / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* AI Reasoning */}
        {reasoning && (
          <section className="max-w-3xl">
            <h2 className="text-lg font-semibold text-gray-300 mb-3">AI Judge Reasoning</h2>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <p className="text-sm text-gray-300 leading-relaxed">{reasoning}</p>
            </div>
          </section>
        )}

        {/* Failed Models */}
        {failedModels.length > 0 && (
          <section className="max-w-3xl">
            <h2 className="text-lg font-semibold text-gray-300 mb-3">Failed Models</h2>
            <div className="space-y-2">
              {failedModels.map((r) => (
                <div key={r.model} className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-medium">{r.model}</span>
                  </div>
                  <span className="text-xs text-red-300">{r.error}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default ModelComparison;
