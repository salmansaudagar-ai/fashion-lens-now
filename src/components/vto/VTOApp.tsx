import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useVTO } from '@/contexts/VTOContext';
import { WelcomeStep } from './WelcomeStep';
import { QRWaitStep } from './QRWaitStep';
import { SelfieCaptureStep } from './SelfieCaptureStep';
import { FullBodyCaptureStep } from './FullBodyCaptureStep';
import { BigScreenHandoffStep } from './BigScreenHandoffStep';
import { OutfitSelectionStep } from './OutfitSelectionStep';
import { VirtualLookStep } from './VirtualLookStep';
import { OutfitItem } from '@/types/vto';

export const VTOApp: React.FC = () => {
  const {
    currentStep, setCurrentStep,
    selectOutfitItem, capturedImages, setCapturedImages,
    setPendingTryItem, setSessionId, setSessionToken, setExcludedCategory,
  } = useVTO();
  const location = useLocation();

  // Synchronously detect incoming tryItem so we can suppress the welcome flash
  const locationState = location.state as { tryItem?: OutfitItem; restoreCatalog?: boolean; tryMoreFrom?: string } | null;
  const hasIncomingTryItem = !!locationState?.tryItem || !!locationState?.restoreCatalog;

  // When navigating back from product detail with a "Try This Look" action
  useEffect(() => {
    const state = location.state as { tryItem?: OutfitItem; restoreCatalog?: boolean; tryMoreFrom?: string } | null;

    // Back to catalog — jump straight to outfit selection step
    if (state?.restoreCatalog) {
      const storedSessionId = sessionStorage.getItem('vto_session_id');
      const storedSessionToken = sessionStorage.getItem('vto_session_token');
      if (storedSessionId) setSessionId(storedSessionId);
      if (storedSessionToken) setSessionToken(storedSessionToken);
      // If coming from "Try More Clothes", exclude the already-tried category
      if (state.tryMoreFrom) {
        setExcludedCategory(state.tryMoreFrom as import('@/types/vto').OutfitCategory);
      } else {
        setExcludedCategory(null);
      }
      setCurrentStep(3);
      window.history.replaceState({}, '');
      return;
    }

    if (state?.tryItem) {
      // Restore session tokens — they reset when VTOProvider remounts after navigation
      const storedSessionId = sessionStorage.getItem('vto_session_id');
      const storedSessionToken = sessionStorage.getItem('vto_session_token');
      if (storedSessionId) setSessionId(storedSessionId);
      if (storedSessionToken) setSessionToken(storedSessionToken);

      // Restore images
      const storedFullBody = sessionStorage.getItem('vto_full_body');
      const storedSelfie = sessionStorage.getItem('vto_selfie_preview');

      selectOutfitItem(state.tryItem);
      setPendingTryItem(state.tryItem);

      // Always jump to outfit step when Try On is requested;
      // OutfitSelectionStep can fetch full-body from session if not in local storage
      setCapturedImages({ selfie: storedSelfie, fullBody: storedFullBody });
      setCurrentStep(3);

      // Clear state so refresh doesn't re-trigger
      window.history.replaceState({}, '');
    }
  }, []);

  // Suppress welcome flash while the useEffect above hasn't fired yet
  if (hasIncomingTryItem && currentStep === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Full-screen steps (no header/footer)
  if (currentStep === 1.5) return <QRWaitStep />;
  if (currentStep === 2) return <SelfieCaptureStep />;
  if (currentStep === 2.75) return <BigScreenHandoffStep />;

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <WelcomeStep />;
      case 3: return <OutfitSelectionStep />;
      case 4: return <VirtualLookStep />;
      default: return <WelcomeStep />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-card/50">
      <main className="flex-1 flex flex-col w-full min-h-0">
        {renderStep()}
      </main>
    </div>
  );
};
