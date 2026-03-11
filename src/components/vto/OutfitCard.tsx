import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OutfitItem, ColorVariant } from '@/types/vto';
import { cn } from '@/lib/utils';

interface OutfitCardProps {
  item: OutfitItem;
  isSelected: boolean;
  onSelect: (item: OutfitItem) => void;
  onTryLook?: (item: OutfitItem) => void;
}

function calcDiscount(actual?: number, selling?: number): number | null {
  if (!actual || !selling || actual <= selling) return null;
  return Math.round(((actual - selling) / actual) * 100);
}

export const OutfitCard: React.FC<OutfitCardProps> = ({ item, isSelected }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const navigate = useNavigate();

  const discount = calcDiscount(item.actualPrice, item.sellingPrice);
  const displayPrice = item.sellingPrice ?? item.price;
  const originalPrice = item.actualPrice && item.actualPrice !== displayPrice ? item.actualPrice : null;

  return (
    <div
      onClick={() => navigate(`/product/${item.id}`)}
      className={cn(
        'group cursor-pointer rounded-2xl overflow-hidden bg-card border transition-all duration-200',
        isSelected
          ? 'border-primary shadow-lg ring-2 ring-primary/20'
          : 'border-border hover:border-border/80 hover:shadow-md'
      )}
    >
      {/* Image */}
      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        {!imageLoaded && <div className="absolute inset-0 animate-shimmer" />}
        <img
          src={item.imageUrl}
          alt={item.name}
          onLoad={() => setImageLoaded(true)}
          className={cn(
            'w-full h-full object-cover transition-all duration-500 group-hover:scale-105',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
        />

        {/* Discount badge */}
        {discount !== null && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold shadow" style={{ backgroundColor: 'hsl(25 95% 53%)', color: 'hsl(0 0% 100%)' }}>
            {discount}% OFF
          </div>
        )}

        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow">
            <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 12 12">
              <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-2 bg-background">
        {/* Brand */}
        {item.brand && (
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{item.brand}</p>
        )}

        {/* Name */}
        <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-2">{item.name}</h3>

        {/* Pricing */}
        {displayPrice != null && displayPrice > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-foreground">
              ₹{displayPrice.toLocaleString('en-IN')}
            </span>
            {originalPrice && (
              <span className="text-xs text-muted-foreground line-through">
                ₹{originalPrice.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
