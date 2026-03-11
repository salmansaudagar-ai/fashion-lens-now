import React, { useState, useEffect } from 'react';
import { useVTO } from '@/contexts/VTOContext';
import { RefreshCw, Shirt, Download, Bell, ArrowRight, Sparkles, Video, Image as ImageIcon, Loader2, User, CheckCircle2, Ruler, Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { updateSessionGeneratedLook } from '@/hooks/useVTOSession';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { extractBodyMeasurements, BodyMeasurements } from '@/hooks/useBodyMeasurements';

interface ModelResultInfo {
  model: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

export const VirtualLookStep: React.FC = () => {
  const { generatedLook, selectedOutfit, setCurrentStep, setGeneratedLook, resetFlow, capturedImages, sessionToken, sessionId } = useVTO();
  const navigate = useNavigate();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [showTabs, setShowTabs] = useState(false);
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('video');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hasAutoTriggeredVideo, setHasAutoTriggeredVideo] = useState(false);

  // User details form state
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  // Multi-model info
  const [modelWinner, setModelWinner] = useState<string | null>(null);
  const [modelReasoning, setModelReasoning] = useState<string>('');
  const [modelResults, setModelResults] = useState<ModelResultInfo[]>([]);

  // Body measurements
  const [measurements, setMeasurements] = useState<BodyMeasurements | null>(null);
  const [measuringInProgress, setMeasuringInProgress] = useState(false);

  // Load model comparison info from sessionStorage
  useEffect(() => {
    const winner = sessionStorage.getItem('vto_model_winner');
    const reasoning = sessionStorage.getItem('vto_model_reasoning');
    const results = sessionStorage.getItem('vto_model_results');
    if (winner) setModelWinner(winner);
    if (reasoning) setModelReasoning(reasoning);
    if (results) {
      try { setModelResults(JSON.parse(results)); } catch {}
    }
  }, []);

  // Auto-extract body measurements from full-body photo
  useEffect(() => {
    const fullBody = capturedImages.fullBody || sessionStorage.getItem('vto_full_body');
    if (!fullBody || measurements || measuringInProgress) return;

    setMeasuringInProgress(true);
    extractBodyMeasurements(fullBody, 170).then((m) => {
      if (m) {
        setMeasurements(m);
        sessionStorage.setItem('vto_measurements', JSON.stringify(m));
      }
      setMeasuringInProgress(false);
    });
  }, [capturedImages.fullBody]);

  // Play completion sound
  const playCompletionSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Pleasant completion chime
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
    oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  // Auto-trigger video generation 2 seconds after image is generated
  useEffect(() => {
    if (!generatedLook) return;
    if (hasAutoTriggeredVideo) return;
    if (isRegenerating) return;
    if (showTabs) return; // Already showing video tabs
    if (!sessionId) return;

    const timer = setTimeout(() => {
      console.log('Auto-triggering video generation after 2 seconds');
      setHasAutoTriggeredVideo(true);
      
      // Trigger video generation
      setIsGeneratingVideo(true);
      setShowTabs(true);
      setActiveTab('video');
      
      // Call n8n webhook
      fetch('https://geekblooded1996.app.n8n.cloud/webhook/trends-tryon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'no-cors',
        body: JSON.stringify({
          id: sessionId,
          generated_look_url: generatedLook,
        }),
      })
        .then(() => {
          toast.success('360 video generation started! Please wait...');
          console.log('Video generation webhook auto-triggered for session:', sessionId);
        })
        .catch((error) => {
          console.error('Auto video generation error:', error);
          toast.error('Failed to trigger video generation.');
          setIsGeneratingVideo(false);
        });
    }, 2000);

    return () => clearTimeout(timer);
  }, [generatedLook, hasAutoTriggeredVideo, isRegenerating, showTabs, sessionId]);

  // Poll for video URL when generating
  useEffect(() => {
    if (!showTabs) return;
    if (videoUrl) return;
    if (!sessionId || !sessionToken) return;

    console.log('Starting video polling for session:', sessionId);

    const pollInterval = setInterval(async () => {
      try {
        // Use fetch with session token header for RLS
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/vto_sessions?id=eq.${sessionId}&select=generated_video_url`,
          {
            headers: {
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              'x-session-token': sessionToken,
            },
          }
        );

        const data = await response.json();
        console.log('Poll result:', data);

        if (data && data[0]?.generated_video_url) {
          console.log('Video URL found:', data[0].generated_video_url);
          setVideoUrl(data[0].generated_video_url);
          setIsGeneratingVideo(false);
          playCompletionSound();
          toast.success('360° video is ready!');
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [showTabs, sessionId, sessionToken, videoUrl]);

  // Helper function to convert image URL to base64
  const imageUrlToBase64 = async (imageUrl: string): Promise<string> => {
    try {
      // Handle relative URLs
      const fullUrl = imageUrl.startsWith('/') 
        ? `${window.location.origin}${imageUrl}` 
        : imageUrl;
      
      const response = await fetch(fullUrl);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image to base64:', error);
      throw error;
    }
  };

  const handleRegenerate = async () => {
    // Check sessionStorage fallback as well (images captured on big screen)
    const fullBodyImage = capturedImages.fullBody || sessionStorage.getItem('vto_full_body');
    if (!fullBodyImage) {
      toast.error('No full body image found.');
      return;
    }

    setIsRegenerating(true);
    setGeneratedLook(null);
    // Reset video state so auto-trigger can fire again for new image
    setHasAutoTriggeredVideo(false);
    setShowTabs(false);
    setVideoUrl(null);
    setIsGeneratingVideo(false);
    
    try {
      // Get selected items with their image URLs
      const selectedItems = [
        selectedOutfit.topwear,
        selectedOutfit.bottomwear,
        selectedOutfit.footwear,
      ].filter(Boolean);

      const outfitItems = selectedItems.map(item => ({
        name: item!.name,
        category: item!.category,
        selectedColor: item!.selectedColor || item!.colorVariants[0]?.name,
      }));

      // Convert outfit images to base64
      const outfitImageUrls = await Promise.all(
        selectedItems.map(item => imageUrlToBase64(item!.imageUrl))
      );

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-virtual-tryon`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'x-session-token': sessionToken || '',
          },
          body: JSON.stringify({
            fullBodyImage: fullBodyImage,
            outfitItems,
            outfitImageUrls,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Failed to regenerate');
        return;
      }

      if (data.success && data.imageUrl) {
        setGeneratedLook(data.imageUrl);
        
        // Save generated look URL to database
        if (sessionId && sessionToken) {
          await updateSessionGeneratedLook(sessionId, sessionToken, data.imageUrl);
        }
        
        toast.success('Look regenerated successfully!');
      }
    } catch (error) {
      console.error('Regeneration error:', error);
      toast.error('Failed to regenerate. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleChangeOutfit = () => {
    setGeneratedLook(null);
    setCurrentStep(3);
  };

  const handleTryAnother = () => {
    resetFlow();
    navigate('/register');
  };

  const handleGenerate360Video = async () => {
    if (!generatedLook) {
      toast.error('No generated look available');
      return;
    }

    if (!sessionId) {
      toast.error('Session not found');
      return;
    }

    setIsGeneratingVideo(true);
    setShowTabs(true);
    setActiveTab('video');
    
    try {
      // Call n8n webhook with session id and generated look URL
      const response = await fetch(
        'https://geekblooded1996.app.n8n.cloud/webhook/trends-tryon',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          mode: 'no-cors',
          body: JSON.stringify({
            id: sessionId,
            generated_look_url: generatedLook,
          }),
        }
      );

      toast.success('360 video generation started! Please wait...');
      console.log('Video generation webhook triggered for session:', sessionId);
    } catch (error) {
      console.error('Video generation error:', error);
      toast.error('Failed to trigger video generation. Please try again.');
      setIsGeneratingVideo(false);
    }
  };

  const handleDownload = () => {
    if (!generatedLook) return;
    
    // Create a download link for the generated image
    const link = document.createElement('a');
    link.href = generatedLook;
    link.download = 'my-virtual-look.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Image downloaded!');
  };

  const handleSaveDetails = async () => {
    if (!sessionId || !sessionToken) {
      toast.error('Session not found');
      return;
    }
    setSavingDetails(true);
    try {
      const { error } = await supabase
        .from('vto_sessions')
        .update({
          full_name: userName.trim() || 'Guest',
          email: userEmail.trim() || null,
          phone: userPhone.trim() || null,
        })
        .eq('session_token', sessionToken);
      if (error) throw error;
      setDetailsSaved(true);
      toast.success('Details saved!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save details. Please try again.');
    } finally {
      setSavingDetails(false);
    }
  };

  const selectedItems = [
    selectedOutfit.topwear,
    selectedOutfit.bottomwear,
    selectedOutfit.footwear,
  ].filter(Boolean);

  const renderMediaContent = () => {
    if (!showTabs) {
      // Original image view — tap/click full image to return to catalog
      return (
        <div
          className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted cursor-pointer"
          onClick={() => setCurrentStep(3)}
          title="Browse catalog"
        >
          {generatedLook ? (
            <img
              src={generatedLook}
              alt="Your Virtual Look"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-muted-foreground">Regenerating...</p>
              </div>
            </div>
          )}

          {/* Outfit badges */}
          {generatedLook && (
            <div className="absolute bottom-4 left-4 right-4">
              <div className="flex flex-wrap gap-2">
                {selectedItems.map((item) => (
                  <div
                    key={item!.id}
                    className="bg-background/90 backdrop-blur-sm text-foreground px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2"
                  >
                    <img
                      src={item!.imageUrl}
                      alt={item!.name}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                    {item!.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Tabbed view
      return (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'image' | 'video')} className="w-full">
        <TabsList className="w-full mb-4 bg-secondary/50">
          <TabsTrigger value="image" className="flex-1 gap-2">
            <ImageIcon className="w-4 h-4" />
            Image
          </TabsTrigger>
          <TabsTrigger value="video" className="flex-1 gap-2">
            <Video className="w-4 h-4" />
            Video
            {isGeneratingVideo && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="image" className="mt-0">
          <div
            className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted cursor-pointer"
            onClick={() => setCurrentStep(3)}
            title="Browse catalog"
          >
            {generatedLook && (
              <img
                src={generatedLook}
                alt="Your Virtual Look"
                className="w-full h-full object-cover"
              />
            )}
            {/* Outfit badges */}
            {generatedLook && (
              <div className="absolute bottom-4 left-4 right-4">
                <div className="flex flex-wrap gap-2">
                  {selectedItems.map((item) => (
                    <div
                      key={item!.id}
                      className="bg-background/90 backdrop-blur-sm text-foreground px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2"
                    >
                      <img
                        src={item!.imageUrl}
                        alt={item!.name}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                      {item!.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="video" className="mt-0">
          <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted">
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                autoPlay
                loop
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
                <div className="text-center space-y-6 p-8">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-primary/30 rounded-full mx-auto" />
                    <div className="absolute inset-0 w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    <Video className="absolute inset-0 m-auto w-8 h-8 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-medium text-foreground">Generating 360° Video</p>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                      Creating your rotating video. This may take a minute...
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Processing with AI
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    );
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-fade-in">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">AI Generated</span>
          </div>
          <h1 className="text-4xl font-display font-semibold text-foreground mb-2">
            Your Virtual Look
          </h1>
          <p className="text-lg text-muted-foreground">
            Here's how you'll look in this outfit
          </p>
        </div>

        <div className="flex gap-8">
          {/* Main Image/Video */}
          <div className="flex-1">
            <div className="glass-card-elevated rounded-3xl p-4 glow-champagne">
              {renderMediaContent()}
            </div>
          </div>

          {/* Actions Sidebar */}
          <div className="w-80 space-y-4">
            {/* Quick Actions */}
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <h3 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h3>
              
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="btn-secondary-vto w-full flex items-center justify-center gap-3"
              >
                <RefreshCw className={`w-5 h-5 ${isRegenerating ? 'animate-spin' : ''}`} />
                {isRegenerating ? 'Regenerating...' : 'Regenerate'}
              </button>

              <button
                onClick={handleChangeOutfit}
                disabled={isRegenerating}
                className="btn-secondary-vto w-full flex items-center justify-center gap-3"
              >
                <Shirt className="w-5 h-5" />
                Change Outfit
              </button>

              <button
                onClick={handleDownload}
                disabled={!generatedLook || isRegenerating}
                className="btn-secondary-vto w-full flex items-center justify-center gap-3"
              >
                <Download className="w-5 h-5" />
                Save Look
              </button>

            </div>

            {/* Model Winner Badge */}
            {modelWinner && (
              <div className="glass-card rounded-2xl p-4 border border-amber-500/30 bg-amber-50/5">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-semibold text-foreground">AI Model: {modelWinner}</h3>
                </div>
                {modelReasoning && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{modelReasoning}</p>
                )}
                {modelResults.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {modelResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className={`font-medium ${r.model === modelWinner ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {r.model}
                        </span>
                        <span className={r.success ? 'text-green-600' : 'text-red-400'}>
                          {r.success ? `${(r.durationMs / 1000).toFixed(1)}s` : 'Failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Body Measurements */}
            {(measurements || measuringInProgress) && (
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Ruler className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Estimated Measurements</h3>
                </div>
                {measuringInProgress && !measurements ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Analyzing body proportions...
                  </div>
                ) : measurements ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Shoulder</span><span className="font-medium">{measurements.shoulderWidth} cm</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Chest</span><span className="font-medium">{measurements.chestEstimate} cm</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Waist</span><span className="font-medium">{measurements.waistEstimate} cm</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Hip</span><span className="font-medium">{measurements.hipWidth} cm</span></div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <div className="flex-1 bg-primary/10 rounded-lg px-3 py-1.5 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Top</p>
                        <p className="text-sm font-bold text-primary">{measurements.topSize}</p>
                      </div>
                      <div className="flex-1 bg-primary/10 rounded-lg px-3 py-1.5 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Bottom</p>
                        <p className="text-sm font-bold text-primary">{measurements.bottomSize}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Selected Items */}
            <div className="glass-card rounded-2xl p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Selected Items</h3>
              <div className="space-y-2">
                {selectedItems.map((item) => (
                  <div
                    key={item!.id}
                    className="flex items-center gap-3 p-2 rounded-xl bg-secondary/50"
                  >
                    <img
                      src={item!.imageUrl}
                      alt={item!.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item!.name}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {item!.category}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Primary Actions */}
            <div className="space-y-3">
              {!showTabs && (
                <button
                  onClick={handleGenerate360Video}
                  disabled={!generatedLook || isGeneratingVideo || isRegenerating}
                  className="btn-primary-vto w-full flex items-center justify-center gap-3"
                >
                  <Video className={`w-5 h-5 ${isGeneratingVideo ? 'animate-pulse' : ''}`} />
                  {isGeneratingVideo ? 'Generating Video...' : 'Generate 360 Video'}
                </button>
              )}

              <button
                onClick={handleTryAnother}
                className="btn-secondary-vto w-full flex items-center justify-center gap-3"
              >
                Try Another Look
                <ArrowRight className="w-5 h-5" />
              </button>

              <button
                className="btn-secondary-vto w-full flex items-center justify-center gap-3 border-primary/30"
              >
                <Bell className="w-5 h-5" />
                Call Store Assistant
              </button>
            </div>

            {/* User Details Card */}
            {generatedLook && !detailsSaved && (
              <div className="glass-card rounded-2xl p-5 border border-primary/20 space-y-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Save Your Look</h3>
                </div>
                <p className="text-xs text-muted-foreground">Enter your details to receive this look.</p>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Name *</Label>
                    <Input value={userName} onChange={e => setUserName(e.target.value)} placeholder="Your name" className="h-8 text-sm mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Email <span className="text-muted-foreground">(optional)</span></Label>
                    <Input value={userEmail} onChange={e => setUserEmail(e.target.value)} placeholder="email@example.com" type="email" className="h-8 text-sm mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Phone <span className="text-muted-foreground">(optional)</span></Label>
                    <Input value={userPhone} onChange={e => setUserPhone(e.target.value)} placeholder="+1 234 567 8900" type="tel" className="h-8 text-sm mt-1" />
                  </div>
                </div>
                <Button
                  onClick={handleSaveDetails}
                  disabled={savingDetails || !userName.trim()}
                  className="w-full gradient-champagne h-8 text-sm"
                >
                  {savingDetails ? 'Saving…' : 'Save Details'}
                </Button>
              </div>
            )}

            {detailsSaved && (
              <div className="glass-card rounded-2xl p-4 border border-success/30 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
                <p className="text-sm text-foreground">Details saved! Thank you, {userName}.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
