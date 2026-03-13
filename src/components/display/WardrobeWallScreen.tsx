import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import trendsLogo from '@/assets/trends-logo.png';

const WARDROBE_IMAGES = [
  '/images/catalog/mens/topwear/lavender-oxford-shirt.png',
  '/images/catalog/mens/topwear/olive-polo.png',
  '/images/catalog/mens/topwear/superman-tee.png',
  '/images/catalog/mens/topwear/teal-formal-shirt.png',
  '/images/catalog/mens/topwear/white-formal-shirt.png',
  '/images/catalog/mens/bottomwear/black-slim-jeans.png',
  '/images/catalog/mens/bottomwear/blue-denim-jeans.png',
  '/images/catalog/mens/bottomwear/green-cargo-pants.png',
  '/images/catalog/mens/bottomwear/navy-formal-trousers.png',
  '/images/catalog/mens/bottomwear/washed-denim-jeans.png',
  '/images/catalog/mens/footwear/black-combat-boots.png',
  '/images/catalog/mens/footwear/brown-oxford-shoes.png',
  '/images/catalog/mens/footwear/green-classic-sneakers.png',
  '/images/catalog/mens/footwear/high-top-sneakers.png',
  '/images/catalog/mens/footwear/orange-star-sneakers.png',
  '/images/catalog/mens/footwear/white-leather-sneakers.png',
  '/images/catalog/womens/topwear/blue-peplum-top.png',
  '/images/catalog/womens/topwear/brown-check-shirt.png',
  '/images/catalog/womens/topwear/grey-gap-hoodie.png',
  '/images/catalog/womens/topwear/maroon-ruched-top.png',
  '/images/catalog/womens/topwear/mauve-embroidered-top.png',
  '/images/catalog/womens/bottomwear/beige-flared-skirt.png',
  '/images/catalog/womens/bottomwear/beige-midi-skirt.png',
  '/images/catalog/womens/bottomwear/blue-wide-leg-jeans.png',
  '/images/catalog/womens/bottomwear/ivory-cotton-pants.png',
  '/images/catalog/womens/bottomwear/white-formal-trousers.png',
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildColumns(count: number): string[][] {
  const shuffled = shuffle(WARDROBE_IMAGES);
  const cols: string[][] = Array.from({ length: count }, () => []);
  const extended = [...shuffled, ...shuffled, ...shuffled];
  extended.forEach((img, i) => cols[i % count].push(img));
  return cols;
}

const WardrobeColumn: React.FC<{
  images: string[];
  duration: number;
  direction: 'up' | 'down';
  delay?: number;
}> = ({ images, duration, direction, delay = 0 }) => {
  const doubled = [...images, ...images];
  const animName = direction === 'up' ? 'scroll-up' : 'scroll-down';

  return (
    <div
      className="flex flex-col gap-3 overflow-hidden"
      style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)' }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          animation: `${animName} ${duration}s linear ${delay}s infinite`,
          willChange: 'transform',
        }}
      >
        {doubled.map((src, i) => (
          <div
            key={i}
            className="rounded-xl overflow-hidden flex-shrink-0 bg-card border border-white/5"
            style={{ aspectRatio: '3/4' }}
          >
            <img
              src={src}
              alt=""
              className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity duration-500"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export const WardrobeWallScreen: React.FC = () => {
  const [cols] = useState(() => buildColumns(5));
  const durations = [28, 22, 34, 25, 30];
  const directions: ('up' | 'down')[] = ['up', 'down', 'up', 'down', 'up'];
  const delays = [0, -8, -4, -12, -6];

  return (
    <div className="fixed inset-0 overflow-hidden bg-[hsl(var(--charcoal-deep))]">
      <style>{`
        @keyframes scroll-up {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes scroll-down {
          0% { transform: translateY(-50%); }
          100% { transform: translateY(0); }
        }
      `}</style>

      {/* Scrolling image grid */}
      <div className="absolute inset-0 grid gap-3 p-3" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {cols.map((colImages, i) => (
          <WardrobeColumn
            key={i}
            images={colImages}
            duration={durations[i]}
            direction={directions[i]}
            delay={delays[i]}
          />
        ))}
      </div>

      {/* Dark vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      {/* Centre glass panel */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div
          className="flex flex-col items-center gap-6 px-16 py-12 rounded-3xl"
          style={{
            background: 'rgba(10,10,10,0.72)',
            backdropFilter: 'blur(28px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          <img src={trendsLogo} alt="Trends" className="h-14 object-contain" />
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center space-y-3">
            <h1
              className="text-5xl font-display text-foreground tracking-tight"
              style={{ textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}
            >
              Digital Wardrobe Wall
            </h1>
            <p className="text-muted-foreground text-xl font-light tracking-wide">
              Discover your perfect look with AI
            </p>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <div
            className="flex items-center gap-2 px-6 py-3 rounded-full"
            style={{
              background: 'var(--gradient-champagne)',
              boxShadow: 'var(--shadow-glow)',
            }}
          >
            <Sparkles className="w-4 h-4 text-primary-foreground" />
            <span className="text-primary-foreground font-semibold text-base tracking-wide">
              Step up to the kiosk to try on outfits
            </span>
          </div>
        </div>
      </div>

      {/* Corner labels */}
      <div className="absolute top-6 left-6 opacity-20 pointer-events-none">
        <span className="text-xs text-foreground font-medium tracking-[0.3em] uppercase">Virtual Try-On</span>
      </div>
      <div className="absolute top-6 right-6 opacity-20 pointer-events-none">
        <span className="text-xs text-foreground font-medium tracking-[0.3em] uppercase">AI Powered</span>
      </div>
      <div className="absolute bottom-6 left-6 opacity-20 pointer-events-none">
        <span className="text-xs text-foreground font-medium tracking-[0.3em] uppercase">Men · Women · Kids</span>
      </div>
      <div className="absolute bottom-6 right-6 opacity-20 pointer-events-none">
        <span className="text-xs text-foreground font-medium tracking-[0.3em] uppercase">Trends Fashion</span>
      </div>
    </div>
  );
};
