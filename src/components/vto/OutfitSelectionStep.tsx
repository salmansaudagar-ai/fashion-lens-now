import React, { useState } from 'react';
import { useVTO } from '@/contexts/VTOContext';
import { OutfitCategory, OutfitItem } from '@/types/vto';
import { useCatalog } from '@/hooks/useCatalog';
import { OutfitCard } from './OutfitCard';
import { cn } from '@/lib/utils';
import { Sparkles, Search, SlidersHorizontal, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { updateSessionGeneratedLook } from '@/hooks/useVTOSession';
import trendsLogo from '@/assets/trends-logo.png';

const ALL_CATEGORY = 'all' as const;
type FilterCategory = typeof ALL_CATEGORY | OutfitCategory;

const categoryFilters: { id: FilterCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'topwear', label: 'Topwear' },
  { id: 'bottomwear', label: 'Bottomwear' },
  { id: 'footwear', label: 'Footwear' },
];

const imageUrlToBase64 = async (imageUrl: string): Promise<string> => {
  const fullUrl = imageUrl.startsWith('/') ? `${window.location.origin}${imageUrl}` : imageUrl;
  const response = await fetch(fullUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const OutfitSelectionStep: React.FC = () => {
  const { selectedOutfit, selectOutfitItem, setCurrentStep, setGeneratedLook, capturedImages, sessionToken, sessionId, pendingTryItem, setPendingTryItem, excludedCategory, setExcludedCategory } = useVTO();
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');

  // Persist selfie to sessionStorage so ProductDetail (outside VTOProvider) can read it
  React.useEffect(() => {
    if (capturedImages.selfie) {
      sessionStorage.setItem('vto_selfie_preview', capturedImages.selfie);
    }
  }, [capturedImages.selfie]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [cartCount] = useState(0);
  const [pendingItem, setPendingItem] = useState<OutfitItem | null>(pendingTryItem);

  // For "all" we fetch all three categories and merge; otherwise fetch single
  const { data: topwearItems = [], isLoading: topLoading } = useCatalog('topwear');
  const { data: bottomwearItems = [], isLoading: bottomLoading } = useCatalog('bottomwear');
  const { data: footwearItems = [], isLoading: footLoading } = useCatalog('footwear');

  const isLoading = topLoading || bottomLoading || footLoading;

  // Build visible items, excluding the category that was already tried (for "Try More Clothes" flow)
  const allItems = [...topwearItems, ...bottomwearItems, ...footwearItems]
    .filter(i => !excludedCategory || i.category !== excludedCategory);

  // Available category pills — remove excluded category and "all" label stays
  const visibleCategoryFilters = categoryFilters.filter(
    f => f.id === 'all' || !excludedCategory || f.id !== excludedCategory
  );

  const filteredItems = (() => {
    let base = activeFilter === 'all' ? allItems : allItems.filter(i => i.category === activeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(i => i.name.toLowerCase().includes(q) || i.brand?.toLowerCase().includes(q));
    }
    return base;
  })();

  const selectedItem = selectedOutfit.topwear || selectedOutfit.bottomwear || selectedOutfit.footwear;

  const handleTryLook = async (item: OutfitItem) => {
    // Priority: layered base (from "Try More Clothes") > local full body > sessionStorage > DB
    const layeredBaseRaw = sessionStorage.getItem('vto_layered_base');

    // If the layered base is a URL (signed storage URL), convert it to base64 first
    let layeredBase: string | null = null;
    if (layeredBaseRaw) {
      if (layeredBaseRaw.startsWith('http')) {
        try {
          console.log('[VTO] Converting layered base URL to base64...');
          layeredBase = await imageUrlToBase64(layeredBaseRaw);
          console.log('[VTO] Layered base converted, length:', layeredBase?.length);
        } catch (err) {
          console.error('[VTO] Failed to convert layered base URL:', err);
          layeredBase = null;
        }
      } else {
        // Already base64 data URL
        layeredBase = layeredBaseRaw;
      }
    }

    let fullBodyImage = layeredBase || capturedImages.fullBody || sessionStorage.getItem('vto_full_body');

    if (!fullBodyImage) {
      // Images were captured on the big screen — fetch the signed URL from the session record
      const activeSessionId = sessionId || sessionStorage.getItem('vto_session_id');
      const activeToken = sessionToken || sessionStorage.getItem('vto_session_token');
      console.log('[VTO] No local full body, fetching from DB. sessionId:', activeSessionId, 'hasToken:', !!activeToken);
      if (activeSessionId && activeToken) {
        try {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/vto_sessions?id=eq.${activeSessionId}&select=full_body_url`,
            {
              headers: {
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                'x-session-token': activeToken,
              },
            }
          );
          const rows = await res.json();
          const fullBodyUrl = rows?.[0]?.full_body_url;
          console.log('[VTO] DB full_body_url:', fullBodyUrl ? fullBodyUrl.substring(0, 80) + '...' : 'null');
          if (fullBodyUrl) {
            fullBodyImage = await imageUrlToBase64(fullBodyUrl);
            console.log('[VTO] Converted full body URL to base64, length:', fullBodyImage?.length);
          }
        } catch (err) {
          console.error('[VTO] Failed to fetch full body from session:', err);
        }
      }
    }

    if (!fullBodyImage) {
      toast.error('No full body image found. Please go back and capture your photo.');
      return;
    }

    setIsGenerating(true);
    const activeToken = sessionToken || sessionStorage.getItem('vto_session_token');
    const activeSessionId = sessionId || sessionStorage.getItem('vto_session_id');

    // Signal the display screen that generation is in progress
    if (activeToken) {
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: activeToken, updates: { registration_status: 'generating' } }),
        });
      } catch (_) { /* non-critical */ }
    }

    try {
      const outfitImageBase64 = await imageUrlToBase64(item.imageUrl);

      // Store images in sessionStorage for the /compare page
      sessionStorage.setItem('vto_garment_image', item.imageUrl.startsWith('/') ? `${window.location.origin}${item.imageUrl}` : item.imageUrl);
      if (fullBodyImage) sessionStorage.setItem('vto_full_body', fullBodyImage);

      console.log('[VTO] Calling multi-model generate-virtual-tryon...');

      // Also send selfie for multi-image models (OmniGen)
      const selfieImage = capturedImages.selfie || sessionStorage.getItem('vto_selfie_preview') || null;

      // Use AbortController to timeout after 180s (multi-model takes longer)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180_000);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-virtual-tryon`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'x-session-token': activeToken || '',
          },
          body: JSON.stringify({
            fullBodyImage: fullBodyImage,
            selfieImage: selfieImage,
            outfitImageUrls: [outfitImageBase64],
            category: item.category === 'bottomwear' ? 'lower_body' : item.category === 'footwear' ? 'lower_body' : 'upper_body',
            garmentDescription: item.name,
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      console.log('[VTO] Response status:', response.status);
      const raw = await response.text();
      let data: any = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          console.error('[VTO] Non-JSON response from generate-virtual-tryon:', raw.slice(0, 300));
        }
      }

      if (!response.ok) {
        if (response.status === 429) toast.error('Rate limit exceeded. Please try again in a moment.');
        else if (response.status === 402) toast.error('AI credits exhausted. Please add credits to continue.');
        else toast.error(data.error || 'Failed to generate virtual try-on');

        if (activeToken) {
          try {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-session`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionToken: activeToken, updates: { registration_status: 'registered' } }),
            });
          } catch (_) { /* non-critical */ }
        }
        return;
      }

      if (data.success && data.imageUrl) {
        // Clear the layered base after successful generation — subsequent tries use original full body
        sessionStorage.removeItem('vto_layered_base');
        setExcludedCategory(null);
        setGeneratedLook(data.imageUrl);

        // Store multi-model comparison info for the result screen & comparison page
        if (data.winner) {
          sessionStorage.setItem('vto_model_winner', data.winner);
          sessionStorage.setItem('vto_model_reasoning', data.reasoning || '');
          sessionStorage.setItem('vto_model_results', JSON.stringify(data.modelResults || []));
          sessionStorage.setItem('vto_model_scores', JSON.stringify(data.scores || {}));
        }

        if (activeSessionId && activeToken) {
          await updateSessionGeneratedLook(activeSessionId, activeToken, data.imageUrl);
        }
        setCurrentStep(4);
      } else {
        toast.error('Failed to generate image. Please try again.');

        if (activeToken) {
          try {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-session`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionToken: activeToken, updates: { registration_status: 'registered' } }),
            });
          } catch (_) { /* non-critical */ }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error('[VTO] Generation timed out after 120s');
        toast.error('Generation timed out. Please try again.');
      } else {
        console.error('[VTO] Generation error:', error);
        toast.error('An error occurred. Please try again.');
      }

      if (activeToken) {
        try {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken: activeToken, updates: { registration_status: 'registered' } }),
          });
        } catch (_) { /* non-critical */ }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-trigger generation when arriving from ProductDetail "Try On" button
  React.useEffect(() => {
    const fullBody = capturedImages.fullBody || sessionStorage.getItem('vto_full_body');
    const activeSessionId = sessionId || sessionStorage.getItem('vto_session_id');
    const activeToken = sessionToken || sessionStorage.getItem('vto_session_token');
    const canGenerateFromSession = Boolean(activeSessionId && activeToken);

    if (pendingItem && (fullBody || canGenerateFromSession)) {
      setPendingTryItem(null);
      setPendingItem(null);
      const itemToTry = pendingItem;

      if (!capturedImages.fullBody && fullBody) {
        setTimeout(() => handleTryLook(itemToTry), 50);
      } else {
        handleTryLook(itemToTry);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedImages.fullBody]);

  if (isGenerating) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 animate-fade-in bg-background">
        <div className="text-center space-y-8">
          <div className="relative w-32 h-32 mx-auto">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 to-primary/40 animate-pulse" />
            <div className="absolute inset-4 rounded-full bg-gradient-to-r from-primary/30 to-primary/60 animate-pulse-slow" />
            <div className="absolute inset-8 rounded-full gradient-champagne flex items-center justify-center animate-float">
              <Sparkles className="w-10 h-10 text-primary-foreground" />
            </div>
            <div className="absolute inset-0 animate-spin-slow">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary/60" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary/80" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary/40" />
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="text-3xl font-display font-semibold text-foreground">Creating Your Look</h2>
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              Creating your look using your photos and selected outfit — no changes to your appearance or outfit design.
            </p>
          </div>
          <div className="w-64 mx-auto">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full gradient-champagne rounded-full"
                   style={{ animation: 'progress 15s ease-in-out forwards' }} />
            </div>
          </div>
          <style>{`@keyframes progress { 0% { width: 0%; } 30% { width: 40%; } 70% { width: 80%; } 90% { width: 92%; } 100% { width: 100%; } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-h-0 overflow-hidden w-full">

      {/* ── Top Nav ─────────────────────────────────────────────────── */}
      <header className="flex-none flex items-center justify-between px-4 md:px-8 py-3 md:py-4 bg-background border-b border-border">
        {/* Logo — click to go back to welcome */}
        <button
          className="flex items-center gap-2 hover:opacity-70 transition-opacity"
          onClick={() => setCurrentStep(1)}
          aria-label="Go to home"
        >
          <img src={trendsLogo} alt="Trends" className="h-5 md:h-6 opacity-70" />
          <span className="hidden sm:block text-[9px] font-semibold tracking-widest text-muted-foreground uppercase">Infinite Studio</span>
        </button>

        {/* Step nav — hidden on small screens */}
        <nav className="hidden sm:flex items-center gap-1">
          {[
            { label: 'Browse', active: true },
            { label: 'Try', active: false },
            { label: 'Buy', active: false },
            { label: 'Deliver', active: false },
          ].map((step, i) => (
            <React.Fragment key={step.label}>
              {i > 0 && <span className="text-muted-foreground/40 text-xs mx-1">›</span>}
              <span
                className={cn(
                  'px-3 md:px-5 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-semibold transition-colors',
                  step.active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </React.Fragment>
          ))}
        </nav>

        {/* Cart */}
        <button className="relative p-2 rounded-xl border border-border bg-background hover:bg-muted transition-colors">
          <ShoppingBag className="w-5 h-5 text-foreground" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: 'hsl(25 95% 53%)', color: 'hsl(0 0% 100%)' }}>
              {cartCount}
            </span>
          )}
        </button>
      </header>

      {/* ── Hero + Search ────────────────────────────────────────────── */}
      <div className="flex-none flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 px-4 md:px-8 pt-5 md:pt-8 pb-4 md:pb-6 bg-background">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground leading-tight">Infinite Aisle</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">50,000+ styles at your fingertips</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search styles..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 md:pl-11 pr-4 md:pr-5 py-2.5 md:py-3 rounded-full border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-56 md:w-72 transition-shadow"
            />
          </div>
          <button className="p-2.5 md:p-3 rounded-full border border-border bg-background hover:bg-muted transition-colors flex-shrink-0">
            <SlidersHorizontal className="w-4 h-4 text-foreground" />
          </button>
        </div>
      </div>

      {/* ── Category Pills ───────────────────────────────────────────── */}
      <div className="flex-none flex items-center gap-2 px-4 md:px-8 pb-4 md:pb-5 overflow-x-auto scrollbar-none">
        {excludedCategory && (
          <span className="px-4 py-1.5 rounded-full text-xs font-medium border border-dashed border-border text-muted-foreground bg-muted/50 mr-1">
            Layering on your look ✨
          </span>
        )}
        {visibleCategoryFilters.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveFilter(cat.id)}
            className={cn(
              'px-5 py-2 rounded-full text-sm font-semibold border transition-all',
              activeFilter === cat.id
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-border hover:border-foreground/30'
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ── Product Grid ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-muted aspect-[3/4] animate-pulse" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Search className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No styles found</p>
            <p className="text-sm mt-1">Try a different search or category</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-5">
            {filteredItems.map(item => (
              <OutfitCard
                key={item.id}
                item={item}
                isSelected={selectedItem?.id === item.id}
                onSelect={selectOutfitItem}
                onTryLook={handleTryLook}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
