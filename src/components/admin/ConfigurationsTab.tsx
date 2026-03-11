import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, RotateCcw, Monitor, Check } from 'lucide-react';
import { toast } from 'sonner';

interface AppSetting {
  key: string;
  value: string;
  label: string;
  description: string;
  type: string;
  updated_at: string;
}

interface ConfigurationsTabProps {
  adminPin: string;
}

const FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Non-screen settings grouped by category
const SETTING_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Display Screen', keys: ['display_duration_ms'] },
  { label: 'Welcome Screen', keys: ['vto_welcome_title', 'vto_welcome_subtitle'] },
  { label: 'Generation', keys: ['generation_timeout_ms'] },
];

// Screen options for the visual picker
const SCREEN_OPTIONS = [
  {
    id: '1',
    name: 'Wardrobe Wall',
    description: 'Animated catalog grid with parallax columns',
    previewType: 'grid',
    preview: [
      '/images/catalog/mens/topwear/teal-formal-shirt.png',
      '/images/catalog/womens/topwear/mauve-embroidered-top.png',
      '/images/catalog/mens/bottomwear/blue-denim-jeans.png',
      '/images/catalog/womens/bottomwear/beige-flared-skirt.png',
    ],
    bg: 'hsl(0 0% 8%)',
    accent: 'hsl(0 0% 60%)',
  },
  {
    id: '2',
    name: 'Cinematic Editorial',
    description: 'Full-screen banner slideshow with Ken Burns effect',
    previewType: 'banner',
    preview: ['/images/banners/party-picks-banner.png'],
    bg: 'hsl(220 30% 10%)',
    accent: 'hsl(330 70% 65%)',
  },
  {
    id: '3',
    name: 'Neon Typewriter',
    description: 'Bold neon type animation with product image showcase',
    previewType: 'split',
    preview: ['/images/catalog/mens/topwear/teal-formal-shirt.png'],
    bg: 'hsl(0 0% 0%)',
    accent: 'hsl(320 90% 65%)',
  },
  {
    id: '4',
    name: 'Mosaic Splash',
    description: 'Dynamic mosaic product grid with spotlight highlighting',
    previewType: 'mosaic',
    preview: [
      '/images/catalog/mens/topwear/teal-formal-shirt.png',
      '/images/catalog/womens/topwear/mauve-embroidered-top.png',
      '/images/catalog/mens/bottomwear/navy-formal-trousers.png',
      '/images/catalog/womens/bottomwear/beige-flared-skirt.png',
      '/images/catalog/mens/footwear/white-leather-sneakers.png',
      '/images/catalog/womens/topwear/blue-peplum-top.png',
    ],
    bg: 'hsl(0 0% 6%)',
    accent: 'hsl(var(--primary))',
  },
  {
    id: '5',
    name: 'Spotlight Carousel',
    description: 'Full-screen product spotlight with animated details',
    previewType: 'spotlight',
    preview: ['/images/catalog/mens/footwear/orange-star-sneakers.png'],
    bg: 'hsl(0 0% 0%)',
    accent: 'hsl(25 95% 60%)',
  },
];

export const ConfigurationsTab: React.FC<ConfigurationsTabProps> = ({ adminPin }) => {
  const queryClient = useQueryClient();
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [switchingScreen, setSwitchingScreen] = useState(false);

  const { data: settings, isLoading, error } = useQuery<AppSetting[]>({
    queryKey: ['admin-config'],
    queryFn: async () => {
      const res = await fetch(`${FUNCTION_BASE}/admin-config`, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          'x-admin-pin': adminPin,
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch settings');
      return json.settings as AppSetting[];
    },
  });

  useEffect(() => {
    if (settings) {
      const vals: Record<string, string> = {};
      settings.forEach(s => { vals[s.key] = s.value; });
      setLocalValues(vals);
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => {
    setLocalValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key: string) => {
    setSavingKeys(prev => new Set(prev).add(key));
    try {
      const res = await fetch(`${FUNCTION_BASE}/admin-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({ key, value: localValues[key] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      toast.success('Setting saved');
      queryClient.invalidateQueries({ queryKey: ['admin-config'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save setting');
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleScreenSwitch = async (screenId: string) => {
    if (localValues['display_idle_screen'] === screenId) return;
    setSwitchingScreen(true);
    try {
      const res = await fetch(`${FUNCTION_BASE}/admin-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({ key: 'display_idle_screen', value: screenId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to switch screen');
      setLocalValues(prev => ({ ...prev, display_idle_screen: screenId }));
      toast.success(`Switched to Screen ${screenId}`);
      queryClient.invalidateQueries({ queryKey: ['admin-config'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to switch screen');
    } finally {
      setSwitchingScreen(false);
    }
  };

  const handleReset = (key: string) => {
    const original = settings?.find(s => s.key === key);
    if (original) setLocalValues(prev => ({ ...prev, [key]: original.value }));
  };

  const isDirty = (key: string) => {
    const original = settings?.find(s => s.key === key);
    return original ? localValues[key] !== original.value : false;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) return <p className="text-destructive p-4">Failed to load configurations.</p>;

  const settingMap = Object.fromEntries((settings ?? []).map(s => [s.key, s]));
  const activeScreen = localValues['display_idle_screen'] ?? '1';

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Display Screen Picker ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="w-4 h-4 text-muted-foreground" />
            Idle Display Screen
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Choose which screen is shown on the /display wall when idle. Changes take effect within 30 seconds.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {SCREEN_OPTIONS.map(screen => {
              const isActive = activeScreen === screen.id;
              return (
                <button
                  key={screen.id}
                  onClick={() => handleScreenSwitch(screen.id)}
                  disabled={switchingScreen}
                  className="relative text-left rounded-xl border-2 overflow-hidden transition-all duration-200 focus:outline-none"
                  style={{
                    borderColor: isActive ? screen.accent : 'hsl(var(--border))',
                    boxShadow: isActive ? `0 0 0 1px ${screen.accent}44, 0 4px 20px ${screen.accent}22` : undefined,
                  }}
                >
                  {/* Mini preview */}
                  <div
                    className="h-24 relative overflow-hidden"
                    style={{ background: screen.bg }}
                  >
                    {screen.previewType === 'grid' ? (
                      <div className="absolute inset-0 grid grid-cols-4 gap-0.5 p-1 opacity-70">
                        {screen.preview.map((src, i) => (
                          <div key={i} className="rounded overflow-hidden" style={{ aspectRatio: '3/4' }}>
                            <img src={src} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : screen.previewType === 'mosaic' ? (
                      <div className="absolute inset-0 grid gap-0.5 p-1 opacity-70" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }}>
                        {screen.preview.slice(0, 6).map((src, i) => (
                          <div key={i} className="rounded overflow-hidden">
                            <img src={src} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : screen.previewType === 'split' ? (
                      <div className="absolute inset-0 flex">
                        <div className="w-1/2 flex items-center justify-center">
                          <div className="w-1 h-6 rounded-full" style={{ background: screen.accent }} />
                        </div>
                        <img src={screen.preview[0]} alt="" className="w-1/2 h-full object-cover opacity-80" />
                      </div>
                    ) : (
                      <img src={screen.preview[0]} alt="" className="w-full h-full object-cover opacity-70" />
                    )}
                    {/* Vignette */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                    {/* Screen number badge */}
                    <div
                      className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: screen.accent, color: 'hsl(var(--background))' }}
                    >
                      {screen.id}
                    </div>

                    {/* Active check */}
                    {isActive && (
                      <div
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: screen.accent }}
                      >
                        <Check className="w-3 h-3" style={{ color: 'hsl(var(--background))' }} />
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  <div className="px-2.5 py-2 bg-card">
                    <p className="text-xs font-semibold text-foreground leading-tight">{screen.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{screen.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Other settings groups ── */}
      {SETTING_GROUPS.map(group => {
        const groupSettings = group.keys.map(k => settingMap[k]).filter(Boolean);
        if (!groupSettings.length) return null;

        return (
          <Card key={group.label}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{group.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {groupSettings.map(setting => (
                <div key={setting.key} className="space-y-1.5">
                  <Label htmlFor={setting.key} className="font-medium">
                    {setting.label}
                  </Label>
                  {setting.description && (
                    <p className="text-xs text-muted-foreground">{setting.description}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      id={setting.key}
                      type={setting.type === 'number' ? 'number' : 'text'}
                      value={localValues[setting.key] ?? setting.value}
                      onChange={e => handleChange(setting.key, e.target.value)}
                      className="flex-1"
                    />
                    {isDirty(setting.key) && (
                      <Button variant="ghost" size="icon" onClick={() => handleReset(setting.key)} title="Reset">
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleSave(setting.key)}
                      disabled={!isDirty(setting.key) || savingKeys.has(setting.key)}
                    >
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      {savingKeys.has(setting.key) ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                  {setting.type === 'number' && (
                    <p className="text-xs text-muted-foreground">
                      = {(Number(localValues[setting.key] ?? setting.value) / 1000).toFixed(0)}s
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
