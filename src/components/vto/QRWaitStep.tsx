import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useVTO } from '@/contexts/VTOContext';
import { ArrowRight, Loader2, Smartphone } from 'lucide-react';
import trendsLogo from '@/assets/trends-logo.png';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const QRWaitStep: React.FC = () => {
  const { sessionId, sessionToken, setCurrentStep, setCustomerName, setCustomerPhone } = useVTO();
  const [waiting, setWaiting] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build the registration URL the customer will open on their phone
  const registrationUrl = sessionToken
    ? `${window.location.origin}/register?token=${sessionToken}`
    : '';

  useEffect(() => {
    if (!sessionId || !sessionToken) return;

    // Poll every 3 seconds using the secure x-session-token header pattern
    // (Realtime postgres_changes is blocked by RLS since it can't pass custom headers)
    // Two-phase polling:
    // Phase 1 — wait for registration (phone scan)
    // Phase 2 — wait for both photos to be taken on the big screen
    const poll = async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/vto_sessions?id=eq.${sessionId}&select=registration_status,full_name,phone,selfie_url,full_body_url`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              'x-session-token': sessionToken,
            },
          }
        );
        if (!res.ok) return;
        const rows = await res.json();
        const row = rows?.[0];
        if (!row) return;

        // Phase 1: registration happened → advance to selfie capture on kiosk
        if (row.registration_status === 'registered' && waiting) {
          clearInterval(intervalRef.current!);
          setCustomerName(typeof row.full_name === 'string' ? row.full_name : '');
          setCustomerPhone(typeof row.phone === 'string' ? row.phone : '');
          setWaiting(false);
          setTimeout(() => setCurrentStep(2), 600);
        }
      } catch (err) {
        console.error('QR poll error:', err);
      }
    };

    intervalRef.current = setInterval(poll, 3000);
    // Also poll immediately
    poll();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sessionId, sessionToken, setCurrentStep, setCustomerName, setCustomerPhone]);

  const handleSkip = () => {
    setCurrentStep(3);
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background p-8 animate-fade-in">
      {/* Logo */}
      <div className="mb-8">
        <img src={trendsLogo} alt="Trends" className="h-10 object-contain" />
      </div>

      {waiting ? (
        <>
          {/* Instruction */}
          <div className="text-center mb-8 space-y-2">
            <div className="flex items-center justify-center gap-2 text-muted-foreground mb-3">
              <Smartphone className="w-5 h-5" />
              <span className="text-base font-medium tracking-wide uppercase">Scan to Register</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-display font-semibold text-foreground">
              Scan the QR code on your phone
            </h2>
            <p className="text-muted-foreground text-lg">
              Enter your name &amp; phone number to continue
            </p>
          </div>

          {/* QR Code */}
          <div className="relative bg-card border border-border rounded-2xl p-6 shadow-xl mb-8">
            {registrationUrl ? (
              <QRCodeSVG
                value={registrationUrl}
                size={240}
                bgColor="transparent"
                fgColor="hsl(var(--foreground))"
                level="M"
                includeMargin={false}
              />
            ) : (
              <div className="w-60 h-60 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Animated waiting ring */}
            <div className="absolute -inset-1 rounded-2xl border-2 border-primary/20 animate-pulse pointer-events-none" />
          </div>

          {/* Waiting indicator */}
          <div className="flex items-center gap-2 text-muted-foreground mb-10">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Waiting for registration…</span>
          </div>

          {/* Staff skip button */}
          <button
            onClick={handleSkip}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
          >
            Skip — start without phone
            <ArrowRight className="w-4 h-4" />
          </button>
        </>
      ) : (
        /* Registered — now waiting for photos on big screen */
        <div className="text-center animate-fade-in space-y-6 max-w-sm">
          <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-display font-semibold text-foreground">
              Registered!
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Please move to the <span className="text-foreground font-medium">big screen</span> to take your photos
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Waiting for photos…</span>
          </div>
        </div>
      )}
    </div>
  );
};
