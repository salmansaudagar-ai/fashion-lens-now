import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, X } from 'lucide-react';
import { CatalogItem } from '@/hooks/useCatalog';

interface ColorVariant {
  name: string;
  hex: string;
}

interface ProductDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<CatalogItem>) => Promise<void>;
  initial?: CatalogItem | null;
  defaultCategory?: string;
}

const SIZE_PRESETS = {
  topwear: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  bottomwear: ['28', '30', '32', '34', '36', '38'],
  footwear: ['6', '7', '8', '9', '10', '11'],
};

export const ProductDialog: React.FC<ProductDialogProps> = ({ open, onClose, onSave, initial, defaultCategory }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState(defaultCategory || 'topwear');
  const [imageUrl, setImageUrl] = useState('');
  const [brand, setBrand] = useState('');
  const [actualPrice, setActualPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('');
  const [sizes, setSizes] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [colorVariants, setColorVariants] = useState<ColorVariant[]>([{ name: '', hex: '#000000' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return; // only reset when dialog opens
    if (initial) {
      setName(initial.name);
      setCategory(initial.category);
      setImageUrl(initial.image_url);
      setBrand(initial.brand ?? '');
      setActualPrice(initial.actual_price > 0 ? String(initial.actual_price) : '');
      setSellingPrice(initial.selling_price > 0 ? String(initial.selling_price) : (initial.price > 0 ? String(initial.price) : ''));
      setCountryOfOrigin(initial.country_of_origin ?? '');
      setSizes(initial.sizes ?? []);
      setIsActive(initial.is_active);
      setColorVariants(initial.color_variants.length > 0 ? initial.color_variants : [{ name: '', hex: '#000000' }]);
    } else {
      setName('');
      setCategory(defaultCategory || 'topwear');
      setImageUrl('');
      setBrand('');
      setActualPrice('');
      setSellingPrice('');
      setCountryOfOrigin('');
      setSizes([]);
      setIsActive(true);
      setColorVariants([{ name: '', hex: '#000000' }]);
    }
  }, [initial?.id, open, defaultCategory]); // use initial.id (stable) not entire object

  const handleSave = async () => {
    if (!name.trim() || !imageUrl.trim()) return;
    setSaving(true);
    const sp = sellingPrice ? parseFloat(sellingPrice) : 0;
    const ap = actualPrice ? parseFloat(actualPrice) : 0;
    try {
      await onSave({
        ...(initial ? { id: initial.id } : {}),
        name: name.trim(),
        category,
        image_url: imageUrl.trim(),
        brand: brand.trim(),
        actual_price: ap,
        selling_price: sp,
        price: sp || ap,
        country_of_origin: countryOfOrigin.trim(),
        sizes,
        color_variants: colorVariants.filter(v => v.name.trim()),
        is_active: isActive,
      });
      onClose(); // only close on success
    } catch {
      // error already toasted by CatalogTab.handleSave — stay open so user can retry
    } finally {
      setSaving(false);
    }
  };

  const updateVariant = (i: number, field: keyof ColorVariant, value: string) => {
    setColorVariants(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: value } : v));
  };

  const addVariant = () => setColorVariants(prev => [...prev, { name: '', hex: '#000000' }]);
  const removeVariant = (i: number) => setColorVariants(prev => prev.filter((_, idx) => idx !== i));

  const toggleSize = (s: string) => {
    setSizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const presets = SIZE_PRESETS[category as keyof typeof SIZE_PRESETS] ?? SIZE_PRESETS.topwear;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Product' : 'Add Product'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Product name" />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="topwear">Topwear</SelectItem>
                <SelectItem value="bottomwear">Bottomwear</SelectItem>
                <SelectItem value="footwear">Footwear</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Image URL */}
          <div className="space-y-1.5">
            <Label>Image URL *</Label>
            <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="/images/catalog/..." />
            {imageUrl && (
              <div className="mt-2 border rounded-md overflow-hidden w-24 h-24 bg-muted">
                <img src={imageUrl} alt="preview" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.opacity = '0.2')} />
              </div>
            )}
          </div>

          {/* Brand */}
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Input value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Levi's, Nike" />
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Actual Price / MRP (₹)</Label>
              <Input type="number" min="0" step="1" value={actualPrice} onChange={e => setActualPrice(e.target.value)} placeholder="e.g. 2999" />
            </div>
            <div className="space-y-1.5">
              <Label>Selling Price (₹)</Label>
              <Input type="number" min="0" step="1" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} placeholder="e.g. 1999" />
            </div>
          </div>

          {/* Sizes */}
          <div className="space-y-2">
            <Label>Sizes</Label>
            <div className="flex flex-wrap gap-2">
              {presets.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSize(s)}
                  className={`px-3 py-1 rounded-md border text-sm font-medium transition-colors ${
                    sizes.includes(s)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-foreground/40'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Country of Origin */}
          <div className="space-y-1.5">
            <Label>Country of Origin</Label>
            <Input value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} placeholder="e.g. India" />
          </div>

          {/* Color Variants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Color Variants</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addVariant}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
            {colorVariants.map((v, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="color"
                  value={v.hex}
                  onChange={e => updateVariant(i, 'hex', e.target.value)}
                  className="w-10 h-9 rounded border border-input cursor-pointer"
                />
                <Input
                  value={v.name}
                  onChange={e => updateVariant(i, 'name', e.target.value)}
                  placeholder="Color name"
                  className="flex-1"
                />
                {colorVariants.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeVariant(i)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="active-switch" />
            <Label htmlFor="active-switch">Active (visible in catalog)</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !imageUrl.trim()} className="gradient-champagne">
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
