import React, { useState, useEffect } from 'react';
import trendsLogo from '@/assets/trends-logo.png';

const GRID_IMAGES = [
  '/images/catalog/mens/topwear/teal-formal-shirt.png',
  '/images/catalog/womens/topwear/mauve-embroidered-top.png',
  '/images/catalog/mens/bottomwear/navy-formal-trousers.png',
  '/images/catalog/womens/topwear/blue-peplum-top.png',
  '/images/catalog/mens/footwear/white-leather-sneakers.png',
  '/images/catalog/womens/bottomwear/beige-flared-skirt.png',
  '/images/catalog/mens/topwear/lavender-oxford-shirt.png',
  '/images/catalog/womens/topwear/maroon-ruched-top.png',
  '/images/catalog/mens/footwear/brown-oxford-shoes.png',
  '/images/catalog/womens/bottomwear/blue-wide-leg-jeans.png',
  '/images/catalog/mens/bottomwear/green-cargo-pants.png',
  '/images/catalog/womens/topwear/grey-gap-hoodie.png',
  '/images/catalog/mens/footwear/high-top-sneakers.png',
  '/images/catalog/mens/topwear/olive-polo.png',
  '/images/catalog/womens/topwear/brown-check-shirt.png',
  '/images/catalog/mens/footwear/orange-star-sneakers.png',
];

// 4×4 grid layout — each cell has an image index
const GRID_ROWS = 4;
const GRID_COLS = 4;

// Different sizes for mosaic feel using CSS grid areas
const CELL_CONFIG = [
  { row: 1, col: 1, rowSpan: 2, colSpan: 2 },  // big
  { row: 1, col: 3, rowSpan: 1, colSpan: 1 },
  { row: 1, col: 4, rowSpan: 1, colSpan: 1 },
  { row: 2, col: 3, rowSpan: 1, colSpan: 2 },  // wide
  { row: 3, col: 1, rowSpan: 1, colSpan: 1 },
  { row: 3, col: 2, rowSpan: 2, colSpan: 1 },  // tall
  { row: 3, col: 3, rowSpan: 1, colSpan: 2 },  // wide
  { row: 4, col: 1, rowSpan: 1, colSpan: 1 },
  { row: 4, col: 3, rowSpan: 1, colSpan: 1 },
  { row: 4, col: 4, rowSpan: 1, colSpan: 1 },
];

export const MosaicSplashScreen: React.FC = () => {
  const [activeCell, setActiveCell] = useState(-1);
  const [hoveredImg, setHoveredImg] = useState(0);

  // Cycle highlighted cell
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCell(prev => (prev + 1) % CELL_CONFIG.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  // Slowly cycle the central image
  useEffect(() => {
    const interval = setInterval(() => {
      setHoveredImg(i => (i + 1) % GRID_IMAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[hsl(var(--charcoal-deep))]">
      {/* Mosaic grid — fills the entire screen */}
      <div
        className="absolute inset-0"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
          gap: '4px',
          padding: '4px',
        }}
      >
        {CELL_CONFIG.map((cell, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-lg"
            style={{
              gridColumn: `${cell.col} / span ${cell.colSpan}`,
              gridRow: `${cell.row} / span ${cell.rowSpan}`,
              transition: 'transform 0.4s ease, box-shadow 0.4s ease',
              transform: activeCell === i ? 'scale(1.02)' : 'scale(1)',
              boxShadow: activeCell === i ? '0 0 0 2px hsl(var(--primary)), 0 8px 32px rgba(0,0,0,0.6)' : '0 2px 8px rgba(0,0,0,0.4)',
              zIndex: activeCell === i ? 2 : 1,
            }}
          >
            <img
              src={GRID_IMAGES[i % GRID_IMAGES.length]}
              alt=""
              className="w-full h-full object-cover"
              style={{
                opacity: activeCell === i ? 1 : 0.6,
                transition: 'opacity 0.4s ease, filter 0.4s ease',
                filter: activeCell === i ? 'none' : 'grayscale(20%)',
              }}
            />
          </div>
        ))}
      </div>

      {/* Full-screen overlay gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 100%)' }}
      />

      {/* Centre overlay panel */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div
          className="flex flex-col items-center gap-5 px-14 py-10 rounded-3xl text-center"
          style={{
            background: 'rgba(5,5,5,0.78)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <img src={trendsLogo} alt="Trends" className="h-10 object-contain mb-1" />

          <div className="w-12 h-px bg-white/10" />

          <div className="space-y-2">
            <h1 className="text-5xl font-display text-foreground tracking-tight">
              Every Look.<br />Made for You.
            </h1>
            <p className="text-muted-foreground text-lg font-light">
              26 curated styles · AI-powered try-on
            </p>
          </div>

          {/* Animated bar */}
          <div className="flex gap-1.5 mt-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-1.5 rounded-full"
                style={{
                  width: activeCell % 5 === i ? '32px' : '8px',
                  background: activeCell % 5 === i ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.15)',
                  transition: 'all 0.4s ease',
                }}
              />
            ))}
          </div>

          <div
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold"
            style={{
              background: 'var(--gradient-champagne)',
              boxShadow: 'var(--shadow-glow)',
              color: 'hsl(var(--primary-foreground))',
            }}
          >
            Step up to the kiosk to try on
          </div>
        </div>
      </div>

      {/* Corner label */}
      <div className="absolute bottom-5 right-6 opacity-20 pointer-events-none">
        <span className="text-xs text-foreground tracking-[0.3em] uppercase">Trends AI Try-On</span>
      </div>
    </div>
  );
};
