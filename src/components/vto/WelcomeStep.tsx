import React, { useState } from 'react';
import { useVTO } from '@/contexts/VTOContext';
import { QrCode, Phone, Loader2 } from 'lucide-react';
import { createVTOSession } from '@/hooks/useVTOSession';
import { toast } from 'sonner';
import trendsLogo from '@/assets/trends-logo.png';

export const WelcomeStep: React.FC = () => {
  const { setCurrentStep, setSessionId, setSessionToken } = useVTO();
  const [loadingQR, setLoadingQR] = useState(false);
  const [loadingSkip, setLoadingSkip] = useState(false);

  const createSession = async () => {
    // Clear stale data from any previous session
    sessionStorage.removeItem('vto_full_body');
    sessionStorage.removeItem('vto_selfie_preview');
    sessionStorage.removeItem('vto_session_id');
    sessionStorage.removeItem('vto_session_token');

    const kioskId = localStorage.getItem('trends_kiosk_id');
    const result = await createVTOSession(kioskId);
    if (!result) {
      toast.error('Failed to start session. Please try again.');
      return null;
    }
    setSessionId(result.id);
    setSessionToken(result.sessionToken);
    // Persist to sessionStorage so OutfitSelectionStep can fetch full_body_url from DB
    sessionStorage.setItem('vto_session_id', result.id);
    sessionStorage.setItem('vto_session_token', result.sessionToken);
    return result;
  };

  const handleScanQR = async () => {
    setLoadingQR(true);
    try {
      const result = await createSession();
      if (result) setCurrentStep(1.5);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoadingQR(false);
    }
  };

  const handleSkip = async () => {
    setLoadingSkip(true);
    try {
      const result = await createSession();
      if (result) setCurrentStep(1.25);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoadingSkip(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-between py-12 px-8 animate-fade-in">
      {/* Top logo */}
      <div className="flex items-center justify-center">
        <img src={trendsLogo} alt="Trends" className="h-7 object-contain" />
      </div>

      {/* Center content */}
      <div className="w-full max-w-2xl flex flex-col items-center gap-12">
        {/* Heading */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-semibold text-foreground leading-tight">
            Welcome to<br />Infinite Studio
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground font-light">
            Experience virtual try-on with our AI-powered styling assistant
          </p>
        </div>

        {/* Buttons */}
        <div className="w-full flex flex-col gap-4">
          {/* Primary — Scan QR */}
          <button
            onClick={handleScanQR}
            disabled={loadingQR || loadingSkip}
            className="w-full flex items-center justify-center gap-3 bg-foreground text-background rounded-full py-6 text-xl font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-150 disabled:opacity-60"
          >
            {loadingQR ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <QrCode className="w-6 h-6" />
            )}
            {loadingQR ? 'Starting…' : 'Scan QR to Register'}
          </button>

          {/* Secondary — Skip */}
          <button
            onClick={handleSkip}
            disabled={loadingQR || loadingSkip}
            className="w-full flex items-center justify-center gap-3 bg-white/5 border-2 border-white/20 text-white/90 rounded-full py-6 text-xl font-medium hover:bg-white/10 hover:border-white/30 active:scale-[0.98] transition-all duration-150 disabled:opacity-60"
          >
            {loadingSkip ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Phone className="w-6 h-6" />
            )}
            {loadingSkip ? 'Starting…' : 'Skip — start without phone'}
          </button>
        </div>
      </div>

      {/* Bottom note */}
      <p className="text-sm text-muted-foreground/70 text-center">
        Your data is securely handled and used only for this session
      </p>
    </div>
  );
};
