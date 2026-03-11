import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CatalogTab } from '@/components/admin/CatalogTab';
import { UsersTab } from '@/components/admin/UsersTab';
import { ConfigurationsTab } from '@/components/admin/ConfigurationsTab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShirtIcon, Users, Lock, Eye, EyeOff, Settings2 } from 'lucide-react';
import trendsLogo from '@/assets/trends-logo.png';
import { toast } from 'sonner';

const FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const SESSION_KEY = 'trends_admin_pin';

export default function Admin() {
  const [adminPin, setAdminPin] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY));
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleLogin = async () => {
    if (!pinInput.trim()) return;
    setChecking(true);
    try {
      const res = await fetch(`${FUNCTION_BASE}/validate-admin-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ pin: pinInput.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        sessionStorage.setItem(SESSION_KEY, pinInput.trim());
        setAdminPin(pinInput.trim());
      } else {
        toast.error('Incorrect PIN. Please try again.');
        setPinInput('');
      }
    } catch {
      toast.error('Failed to validate PIN. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setAdminPin(null);
    setPinInput('');
  };

  // PIN Gate
  if (!adminPin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-8 text-center">
          <img src={trendsLogo} alt="Trends" className="h-12 mx-auto" />
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-semibold">Admin Panel</h1>
            <p className="text-muted-foreground text-sm">Enter your PIN to continue</p>
          </div>
          <div className="space-y-3">
            <div className="relative">
              <Input
                type={showPin ? 'text' : 'password'}
                value={pinInput}
                onChange={e => setPinInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Enter PIN"
                className="text-center text-lg tracking-widest pr-10"
                maxLength={10}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              onClick={handleLogin}
              disabled={checking || !pinInput.trim()}
              className="w-full gradient-champagne"
            >
              {checking ? 'Verifying…' : 'Unlock'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Admin Shell
  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={trendsLogo} alt="Trends" className="h-8" />
          <span className="text-sm font-medium text-muted-foreground">Admin Panel</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Sign Out
        </Button>
      </header>

      {/* Content */}
      <main className="p-6 max-w-6xl mx-auto">
        <Tabs defaultValue="catalog">
          <TabsList className="mb-6">
            <TabsTrigger value="catalog" className="flex items-center gap-2">
              <ShirtIcon className="w-4 h-4" /> Catalog
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" /> Users
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Configurations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="catalog">
            <CatalogTab adminPin={adminPin} />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab adminPin={adminPin} />
          </TabsContent>
          <TabsContent value="config">
            <ConfigurationsTab adminPin={adminPin} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
