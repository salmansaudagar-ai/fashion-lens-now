import React, { useState } from 'react';
import { OutfitItem, ColorVariant } from '@/types/vto';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, X, ShirtIcon, CircleDot, Footprints } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductDetailModalProps {
  item: OutfitItem | null;
  onClose: () => void;
  onTryLook: (item: OutfitItem) => void;
}

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

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ item, onClose, onTryLook }) => {
  const [selectedColor, setSelectedColor] = useState<ColorVariant | null>(
    item?.colorVariants?.[0] ?? null
  );

  if (!item) return null;

  const CategoryIcon = categoryIcon[item.category] ?? ShirtIcon;

  const handleTryLook = () => {
    onTryLook({ ...item, selectedColor: selectedColor?.name });
    onClose();
  };

  return (
    <Dialog open={!!item} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl gap-0">
        <div className="grid md:grid-cols-2">
          {/* Image */}
          <div className="relative bg-muted aspect-[3/4] md:aspect-auto min-h-[320px]">
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
            />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 bg-background/80 backdrop-blur-sm rounded-full p-1.5 hover:bg-background transition-colors md:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Details */}
          <div className="p-6 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Badge variant="secondary" className="mb-2 gap-1 text-xs">
                  <CategoryIcon className="w-3 h-3" />
                  {categoryLabel[item.category] ?? item.category}
                </Badge>
                <h2 className="text-2xl font-display font-semibold text-foreground leading-tight">
                  {item.name}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="hidden md:flex bg-muted rounded-full p-1.5 hover:bg-muted/80 transition-colors flex-shrink-0 mt-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Price */}
            {item.price !== undefined && item.price > 0 && (
              <div>
                <span className="text-3xl font-bold text-foreground">
                  ₹{item.price.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                </span>
              </div>
            )}

            {/* Color Variants */}
            {item.colorVariants && item.colorVariants.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Color: <span className="text-foreground">{selectedColor?.name || 'Select'}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.colorVariants.map((color) => (
                    <button
                      key={color.name}
                      onClick={() => setSelectedColor(color)}
                      title={color.name}
                      className={cn(
                        'w-8 h-8 rounded-full border-2 transition-all duration-200',
                        selectedColor?.name === color.name
                          ? 'border-primary scale-110 shadow-md'
                          : 'border-border hover:border-foreground/40'
                      )}
                      style={{ backgroundColor: color.hex }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1" />

            {/* CTA */}
            <Button
              onClick={handleTryLook}
              className="w-full gradient-champagne text-primary-foreground font-semibold py-5 text-base gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Try This Look
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
