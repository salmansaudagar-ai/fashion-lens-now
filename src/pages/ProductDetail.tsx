import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { OutfitItem, ColorVariant } from '@/types/vto';
import { CatalogItem } from '@/hooks/useCatalog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sparkles, ArrowLeft, ShirtIcon, CircleDot, Footprints, Tag, Globe, Ruler, RotateCcw, ShoppingCart, Image, Film, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { updateSessionGeneratedLook } from '@/hooks/useVTOSession';
import trendsLogo from '@/assets/trends-logo.png';
import { useCart } from '@/contexts/CartContext';
import { CartDrawer } from '@/components/CartDrawer';

const categoryIcon: Record<string, React.ElementType> = {
  topwear: ShirtIcon,
  bottomwear: CircleDot,
  footwear: Footprints,
};

const categoryLabel: Record<string, string> = {
  topwear: 'Topwear',
  bottomwear: 'Bottomwear',
  footwear: 'Footwear',
};

async function fetchProductById(id: string): Promise<OutfitItem | null> {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-catalog`,
    {
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch');
  const item = (data.items as CatalogItem[]).find(i => i.id === id && i.is_active);
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    category: item.category as OutfitItem['category'],
    imageUrl: item.image_url,
    colorVariants: item.color_variants,
    price: item.price,
    brand: item.brand,
    sizes: item.sizes,
    actualPrice: item.actual_price,
    sellingPrice: item.selling_price,
    countryOfOrigin: item.country_of_origin,
  };
}

const formatPrice = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 });

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

type GenerationState = 'idle' | 'generating' | 'done';

const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem, totalCount } = useCart();
  const [cartOpen, setCartOpen] = useState(false);

  const { data: item, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => fetchProductById(id!),
    enabled: !!id,
  });

  const [selectedColor, setSelectedColor] = useState<ColorVariant | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [videoTriggered, setVideoTriggered] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');
  const videoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selfiePreview = sessionStorage.getItem('vto_selfie_preview');

  // Auto-trigger video generation via edge function 2s after image generation completes
  useEffect(() => {
    if (generationState === 'done' && generatedImageUrl && !videoTriggered) {
      const sessionId = sessionStorage.getItem('vto_session_id');
      videoTimerRef.current = setTimeout(() => {
        setVideoTriggered(true);
        // Fire-and-forget: edge function runs server-side, frontend polls for result
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-video`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ sessionId }),
        }).catch(err => console.error('[VTO] Video generation error:', err));
      }, 2000);
    }
    return () => {
      if (videoTimerRef.current) clearTimeout(videoTimerRef.current);
    };
  }, [generationState, generatedImageUrl, videoTriggered]);

  // Poll for video URL once webhook has fired
  useEffect(() => {
    if (!videoTriggered || videoUrl) return;
    const sessionId = sessionStorage.getItem('vto_session_id');
    const sessionToken = sessionStorage.getItem('vto_session_token');
    if (!sessionId || !sessionToken) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/vto_sessions?id=eq.${sessionId}&select=generated_video_url`,
          {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              'x-session-token': sessionToken,
            },
          }
        );
        const rows = await res.json();
        const url = rows?.[0]?.generated_video_url;
        if (url) {
          setVideoUrl(url);
          setActiveTab('video');
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [videoTriggered, videoUrl]);

  const handleAddToCart = () => {
    if (!item) return;
    if (item.sizes && item.sizes.length > 0 && !selectedSize) {
      toast.error('Please select a size before adding to cart.');
      document.getElementById('size-selector')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    addItem({
      id: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      brand: item.brand,
      price: item.price,
      sellingPrice: item.sellingPrice,
      size: selectedSize || 'One Size',
      color: resolvedColor?.name,
    });
    toast.success(`Added to cart!`);
    setCartOpen(true);
  };

  const resolvedColor = selectedColor ?? item?.colorVariants?.[0] ?? null;
  const CategoryIcon = item ? (categoryIcon[item.category] ?? ShirtIcon) : ShirtIcon;

  const hasDetailedPricing = item && (item.sellingPrice ?? 0) > 0;
  const displaySelling = hasDetailedPricing ? item!.sellingPrice! : (item?.price ?? 0);
  const displayActual = hasDetailedPricing && (item!.actualPrice ?? 0) > (item!.sellingPrice ?? 0)
    ? item!.actualPrice!
    : null;
  const discount = displayActual
    ? Math.round(((displayActual - displaySelling) / displayActual) * 100)
    : null;

  const handleTryLook = useCallback(async () => {
    if (!item) return;

    const activeSessionId = sessionStorage.getItem('vto_session_id');
    const activeToken = sessionStorage.getItem('vto_session_token');

    // Priority: layered base (from "Try More Clothes") > vto_full_body > DB
    const layeredBaseRaw = sessionStorage.getItem('vto_layered_base');
    let fullBodyImage: string | null = null;

    if (layeredBaseRaw) {
      if (layeredBaseRaw.startsWith('http')) {
        try {
          console.log('[VTO PDP] Converting layered base URL to base64...');
          fullBodyImage = await imageUrlToBase64(layeredBaseRaw);
          console.log('[VTO PDP] Layered base converted, length:', fullBodyImage?.length);
        } catch (err) {
          console.error('[VTO PDP] Failed to convert layered base URL:', err);
        }
      } else {
        fullBodyImage = layeredBaseRaw;
      }
    }

    if (!fullBodyImage) {
      fullBodyImage = sessionStorage.getItem('vto_full_body');
    }

    if (!fullBodyImage && activeSessionId && activeToken) {
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
        if (fullBodyUrl) {
          fullBodyImage = await imageUrlToBase64(fullBodyUrl);
        }
      } catch (err) {
        console.error('[VTO] Failed to fetch full body:', err);
      }
    }

    if (!fullBodyImage) {
      toast.error('No full body photo found. Please complete registration first.');
      return;
    }

    setGenerationState('generating');

    // Signal display screen
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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000);

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
            fullBodyImage,
            outfitImageUrls: [outfitImageBase64],
            garmentDescription: item.name,
            garmentMeta: {
              brand: item.brand,
              fabric: item.fabric,
              pattern: item.pattern,
              fit: item.fit,
              categoryTree: item.categoryTree,
              color: item.selectedColor || item.colorVariants?.[0]?.name,
              colorHex: item.colorVariants?.[0]?.hex,
              sizes: item.sizes,
              eanCodes: item.eanCodes,
              extraAttributes: item.extraAttributes,
            },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      const raw = await response.text();
      let data: any = {};
      try { data = JSON.parse(raw); } catch { /* ignore */ }

      if (!response.ok) {
        if (response.status === 429) toast.error('Rate limit exceeded. Please try again in a moment.');
        else if (response.status === 402) toast.error('AI credits exhausted. Please add credits to continue.');
        else toast.error(data.error || 'Failed to generate virtual try-on');
        setGenerationState('idle');

        if (activeToken) {
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken: activeToken, updates: { registration_status: 'registered' } }),
          }).catch(() => {});
        }
        return;
      }

      if (data.success && data.imageUrl) {
        setGeneratedImageUrl(data.imageUrl);
        setGenerationState('done');
        // Clear layered base so future try-ons start fresh
        sessionStorage.removeItem('vto_layered_base');
        if (activeSessionId && activeToken) {
          await updateSessionGeneratedLook(activeSessionId, activeToken, data.imageUrl);
        }
      } else {
        toast.error('Failed to generate image. Please try again.');
        setGenerationState('idle');

        if (activeToken) {
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken: activeToken, updates: { registration_status: 'registered' } }),
          }).catch(() => {});
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.error('Generation timed out. Please try again.');
      } else {
        console.error('[VTO] Generation error:', error);
        toast.error('An error occurred. Please try again.');
      }
      setGenerationState('idle');

      const tok = sessionStorage.getItem('vto_session_token');
      if (tok) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: tok, updates: { registration_status: 'registered' } }),
        }).catch(() => {});
      }
    }
  }, [item]);

  const renderLeftPanel = () => {
    if (generationState === 'generating') {
      return (
        <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[3/4] flex flex-col items-center justify-center gap-6 px-8">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse" />
            <div className="absolute inset-3 rounded-full bg-primary/30 animate-pulse" style={{ animationDelay: '0.3s' }} />
            <div className="absolute inset-6 rounded-full bg-primary/50 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary/50" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary/70" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary/30" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-display font-semibold text-foreground">Creating Your Look</h3>
            <p className="text-sm text-muted-foreground">AI is dressing you in this outfit...</p>
          </div>
          <div className="w-full max-w-48">
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ animation: 'progress 15s ease-in-out forwards' }} />
            </div>
          </div>
          <style>{`@keyframes progress { 0% { width: 0%; } 30% { width: 40%; } 70% { width: 80%; } 90% { width: 92%; } 100% { width: 100%; } }`}</style>
        </div>
      );
    }

    if (generationState === 'done' && generatedImageUrl) {
      return (
        <div className="flex flex-col gap-3">
          {/* Image / Video tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-muted border border-border">
            <button
              onClick={() => setActiveTab('image')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                activeTab === 'image'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Image className="w-4 h-4" />
              Image
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                activeTab === 'video'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Film className="w-4 h-4" />
              360° Video
              {!videoUrl && videoTriggered && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
            </button>
          </div>

          {/* Panel */}
          <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[3/4]">
            {activeTab === 'image' ? (
              <>
                <img src={generatedImageUrl} alt="Your virtual look" className="w-full h-full object-cover" />
                <button
                  onClick={() => { setGenerationState('idle'); setGeneratedImageUrl(null); setVideoTriggered(false); setVideoUrl(null); setActiveTab('image'); }}
                  className="absolute bottom-4 right-4 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-full bg-background/80 backdrop-blur-sm text-foreground opacity-80 hover:opacity-100 transition-opacity"
                >
                  <RotateCcw className="w-3 h-3" />
                  Try again
                </button>
              </>
            ) : videoUrl ? (
              <video
                src={videoUrl}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Generating 360° Video</p>
                  <p className="text-xs text-muted-foreground mt-1">This may take a minute...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // idle — product image
    return (
      <div
        className="relative rounded-2xl overflow-hidden bg-muted aspect-[3/4] cursor-pointer group"
        onClick={() => navigate('/', { state: { restoreCatalog: true } })}
        title="Back to catalog"
      >
        <img src={item!.imageUrl} alt={item!.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        {discount && (
          <div className="absolute top-3 left-3 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1 rounded-md">
            {discount}% OFF
          </div>
        )}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors duration-300 flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-2 px-4 py-2 rounded-full bg-background/80 backdrop-blur-sm text-sm font-medium text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Browse Catalog
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-card/50">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 md:px-8 py-3 md:py-4">
          <img src={trendsLogo} alt="Trends" className="h-7 md:h-8 object-contain" />
          {/* Cart icon */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="text-sm font-medium">Cart</span>
            {totalCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {totalCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Back button */}
      <div className="px-4 md:px-8 pt-4 md:pt-6">
        <button
          onClick={() => navigate('/', { state: { restoreCatalog: true } })}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to catalog
        </button>
      </div>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-4 md:px-8 py-4 md:py-8">
        {isLoading && (
          <div className="grid md:grid-cols-2 gap-12 max-w-4xl w-full">
            <div className="aspect-[3/4] rounded-2xl bg-muted animate-pulse" />
            <div className="space-y-4 pt-4">
              {[24, 48, 32, 20, 20].map((w, i) => (
                <div key={i} className={`h-5 w-${w} rounded bg-muted animate-pulse`} />
              ))}
            </div>
          </div>
        )}

        {!isLoading && !item && (
          <div className="text-center space-y-4 py-20">
            <p className="text-muted-foreground text-lg">Product not found.</p>
            <Button variant="outline" onClick={() => navigate('/')}>Go to Home</Button>
          </div>
        )}

        {!isLoading && item && (
          <div className="grid md:grid-cols-2 gap-12 max-w-4xl w-full animate-fade-in">
            {/* Left: image / generating / result */}
            {renderLeftPanel()}

            {/* Details */}
            <div className="flex flex-col gap-5 pt-2">
              {/* Category + Name */}
              <div>
                <Badge variant="secondary" className="mb-3 gap-1.5 text-xs">
                  <CategoryIcon className="w-3 h-3" />
                  {categoryLabel[item.category] ?? item.category}
                </Badge>
                <h1 className="text-3xl font-display font-semibold text-foreground leading-tight">
                  {item.name}
                </h1>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span className="text-foreground font-medium">{item.brand || '—'}</span>
                </p>
              </div>

              {/* Pricing */}
              <div className="flex items-center gap-3 flex-wrap">
                {displaySelling > 0 ? (
                  <>
                    <span className="text-3xl font-bold text-foreground">
                      {formatPrice(displaySelling)}
                    </span>
                    {displayActual && (
                      <span className="text-lg text-muted-foreground line-through">
                        {formatPrice(displayActual)}
                      </span>
                    )}
                    {discount && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: 'hsl(25 95% 53%)', color: 'hsl(0 0% 100%)' }}>
                        {discount}% OFF
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground text-base">Price not set</span>
                )}
              </div>

              <Separator />

              {/* Your Photo card */}
              {selfiePreview && (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/50 border border-border">
                  <img
                    src={selfiePreview}
                    alt="Your photo"
                    className="w-14 h-14 rounded-full object-cover object-top flex-shrink-0 border-2 border-border"
                  />
                  <div>
                    <p className="font-semibold text-foreground text-sm">Your photo</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Ready for virtual try-on</p>
                  </div>
                  <div className="ml-auto">
                    <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-border bg-background text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-success inline-block" />
                      Live
                    </span>
                  </div>
                </div>
              )}

              {/* Sizes */}
              <div id="size-selector" className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5" /> SELECT SIZE
                  {item.sizes && item.sizes.length > 0 && !selectedSize && generationState === 'done' && (
                    <span className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'hsl(25 95% 53% / 0.15)', color: 'hsl(25 95% 53%)' }}>
                      Required
                    </span>
                  )}
                </p>
                {item.sizes && item.sizes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {item.sizes.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSelectedSize(s)}
                        className={cn(
                          'px-3 py-1.5 rounded-md border text-sm font-medium transition-all duration-150',
                          selectedSize === s
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-foreground hover:border-foreground/40'
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>

              {/* Color Variants */}
              {item.colorVariants && item.colorVariants.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Color: <span className="text-foreground">{resolvedColor?.name || 'Select'}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {item.colorVariants.map((color) => (
                      <button
                        key={color.name}
                        onClick={() => setSelectedColor(color)}
                        title={color.name}
                        className={cn(
                          'w-8 h-8 rounded-full border-2 transition-all duration-200',
                          resolvedColor?.name === color.name
                            ? 'border-primary scale-110 shadow-md'
                            : 'border-border hover:border-foreground/40'
                        )}
                        style={{ backgroundColor: color.hex }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Country of Origin */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                Country of Origin:
                <span className="text-foreground font-medium">{item.countryOfOrigin || '—'}</span>
              </div>

              <div className="flex-1" />

              {/* CTAs */}
              {generationState === 'done' ? (
                <div className="flex flex-col gap-3">
                  {/* Add to Cart */}
                  <Button
                    onClick={handleAddToCart}
                    className="w-full font-semibold py-6 text-base gap-2 rounded-2xl bg-foreground text-background hover:bg-foreground/90"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    Add to Cart &amp; Checkout
                  </Button>

                  {/* Try More Clothes */}
                  <Button
                    onClick={() => {
                      if (generatedImageUrl) {
                        sessionStorage.setItem('vto_layered_base', generatedImageUrl);
                      }
                      navigate('/', { state: { restoreCatalog: true, tryMoreFrom: item.category } });
                    }}
                    className="w-full font-semibold py-6 text-base gap-2 rounded-2xl"
                    style={{ backgroundColor: 'hsl(25 95% 53%)', color: 'hsl(0 0% 100%)' }}
                  >
                    <Sparkles className="w-5 h-5" />
                    Try More Clothes
                  </Button>

                  {/* Try Another Look */}
                  <Button
                    variant="outline"
                    onClick={() => { setGenerationState('idle'); setGeneratedImageUrl(null); setVideoTriggered(false); setVideoUrl(null); setActiveTab('image'); }}
                    className="w-full font-semibold py-5 text-sm gap-2 rounded-2xl"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Try Another Look
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleTryLook}
                  disabled={generationState === 'generating'}
                  className="w-full font-semibold py-6 text-base gap-2 rounded-2xl"
                  style={{ backgroundColor: 'hsl(25 95% 53%)', color: 'hsl(0 0% 100%)' }}
                >
                  <Sparkles className="w-5 h-5" />
                  {generationState === 'generating' ? 'Creating Your Look...' : 'Try On This Outfit'}
                </Button>
              )}

              {/* Delivery info */}
              <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ backgroundColor: 'hsl(25 95% 53% / 0.1)', border: '1px solid hsl(25 95% 53% / 0.2)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'hsl(25 95% 53% / 0.15)' }}>
                  <span className="text-base">🛍️</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Standard Delivery</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ready to wear • 30-min delivery from Dark Store</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ProductDetail;
