import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAllCatalogItems, CatalogItem } from '@/hooks/useCatalog';
import { ProductDialog } from './ProductDialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Pencil, Trash2, Plus, ShirtIcon, CircleDot, Footprints } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CatalogTabProps {
  adminPin: string;
}

const FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type TabCategory = 'topwear' | 'bottomwear' | 'footwear';
const tabs: { id: TabCategory; label: string; icon: React.ElementType }[] = [
  { id: 'topwear', label: 'Topwear', icon: ShirtIcon },
  { id: 'bottomwear', label: 'Bottomwear', icon: CircleDot },
  { id: 'footwear', label: 'Footwear', icon: Footprints },
];

export const CatalogTab: React.FC<CatalogTabProps> = ({ adminPin }) => {
  const { data: items = [], isLoading, error } = useAllCatalogItems();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabCategory>('topwear');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<CatalogItem | null>(null);

  const filtered = items.filter(i => i.category === activeTab);

  const headers = {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    'x-admin-pin': adminPin,
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['catalog-admin-all'] });
    queryClient.invalidateQueries({ queryKey: ['catalog'] });
  };

  const handleSave = async (data: Partial<CatalogItem>) => {
    const isEdit = !!data.id;
    try {
      const res = await fetch(`${FUNCTION_BASE}/admin-catalog`, {
        method: isEdit ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        console.error('Save failed:', json);
        toast.error(json.error || 'Failed to save');
        throw new Error(json.error);
      }
      toast.success(isEdit ? 'Product updated' : 'Product added');
      invalidate();
    } catch (err) {
      console.error('handleSave error:', err);
      toast.error('Failed to save product. Please try again.');
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    const res = await fetch(`${FUNCTION_BASE}/admin-catalog?id=${encodeURIComponent(deleteItem.id)}`, {
      method: 'DELETE',
      headers,
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || 'Failed to delete'); return; }
    toast.success('Product deleted');
    invalidate();
    setDeleteItem(null);
  };

  const handleToggleActive = async (item: CatalogItem) => {
    const res = await fetch(`${FUNCTION_BASE}/admin-catalog`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
    });
    if (!res.ok) { toast.error('Failed to update'); return; }
    invalidate();
  };

  if (error) return <p className="text-destructive p-4">Failed to load catalog.</p>;

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="flex gap-2 border-b pb-3">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              <span className="ml-1 text-xs opacity-70">({items.filter(i => i.category === tab.id).length})</span>
            </button>
          );
        })}
        <Button
          className="ml-auto gradient-champagne"
          size="sm"
          onClick={() => { setEditItem(null); setDialogOpen(true); }}
        >
          <Plus className="w-4 h-4 mr-1" /> Add Product
        </Button>
      </div>

      {/* Product grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-muted rounded-lg h-48 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No products in this category yet.</p>
          <Button variant="outline" className="mt-3" onClick={() => { setEditItem(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add first product
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(item => (
            <div
              key={item.id}
              className={cn(
                'border rounded-lg overflow-hidden bg-card transition-opacity',
                !item.is_active && 'opacity-50'
              )}
            >
              <div className="relative aspect-square bg-muted">
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={() => { setEditItem(item); setDialogOpen(true); }}
                    className="bg-background/90 rounded-md p-1.5 hover:bg-background shadow-sm"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteItem(item)}
                    className="bg-background/90 rounded-md p-1.5 hover:bg-destructive hover:text-destructive-foreground shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-sm font-medium leading-tight truncate">{item.name}</p>
                {item.price != null && item.price > 0 && (
                  <p className="text-xs font-semibold text-primary">
                    ₹{item.price.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {item.color_variants.slice(0, 4).map((v, i) => (
                      <span key={i} className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: v.hex }} title={v.name} />
                    ))}
                  </div>
                  <Switch checked={item.is_active} onCheckedChange={() => handleToggleActive(item)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProductDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditItem(null); }}
        onSave={handleSave}
        initial={editItem}
        defaultCategory={activeTab}
      />

      <AlertDialog open={!!deleteItem} onOpenChange={v => !v && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteItem?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the product from the catalog. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
