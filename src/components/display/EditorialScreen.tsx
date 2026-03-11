import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import trendsLogo from '@/assets/trends-logo.png';

const SLIDES = [
  {
    image: '/images/banners/party-picks-banner.png',
    collection: 'Party Picks',
    tagline: 'Make every entrance unforgettable',
    accent: 'hsl(330, 70%, 65%)',
  },
  {
    image: '/images/banners/denim-banner.png',
    collection: 'Denim Edit',
    tagline: 'Effortless style, all day long',
    accent: 'hsl(210, 70%, 65%)',
  },
  {
    image: '/images/banners/wedding-banner.png',
    collection: 'Wedding Season',
    tagline: 'Dress for every special moment',
    accent: 'hsl(40, 80%, 70%)',
  },
];

const CATALOG_STRIP = [
  '/images/catalog/womens/topwear/mauve-embroidered-top.png',
  '/images/catalog/mens/topwear/teal-formal-shirt.png',
  '/images/catalog/womens/bottomwear/beige-flared-skirt.png',
  '/images/catalog/mens/footwear/brown-oxford-shoes.png',
  '/images/catalog/womens/topwear/blue-peplum-top.png',
  '/images/catalog/mens/bottomwear/navy-formal-trousers.png',
  '/images/catalog/mens/footwear/white-leather-sneakers.png',
  '/images/catalog/womens/topwear/maroon-ruched-top.png',
];

export const EditorialScreen: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [textVisible, setTextVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade text out, then swap slide, then fade back in
      setTextVisible(false);
      setTransitioning(true);

      setTimeout(() => {
        setCurrent(prev => (prev + 1) % SLIDES.length);
      }, 600);

      setTimeout(() => {
        setTransitioning(false);
        setTextVisible(true);
      }, 1200);
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  const slide = SLIDES[current];

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* ── Full-bleed background image with Ken Burns ── */}
      {SLIDES.map((s, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: i === current ? 1 : 0 }}
        >
          <img
            src={s.image}
            alt=""
            className="w-full h-full object-cover"
            style={{
              animation: i === current ? 'ken-burns 7s ease-out forwards' : 'none',
              transformOrigin: '60% 40%',
            }}
          />
        </div>
      ))}

      {/* ── Dark cinematic overlay ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 40%)',
        }}
      />

      {/* ── Left editorial content ── */}
      <div
        className="absolute left-0 top-0 bottom-0 flex flex-col justify-center px-16 max-w-xl"
        style={{
          opacity: textVisible ? 1 : 0,
          transform: textVisible ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}
      >
        {/* Logo */}
        <img src={trendsLogo} alt="Trends" className="h-10 object-contain object-left mb-12 opacity-90" />

        {/* Collection badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-[0.2em] uppercase mb-6 self-start"
          style={{
            background: `${slide.accent}22`,
            border: `1px solid ${slide.accent}55`,
            color: slide.accent,
          }}
        >
          <Sparkles className="w-3 h-3" />
          {slide.collection}
        </div>

        {/* Headline */}
        <h1
          className="text-6xl font-display text-white leading-tight mb-5"
          style={{ textShadow: '0 4px 32px rgba(0,0,0,0.6)' }}
        >
          {slide.tagline}
        </h1>

        {/* Divider */}
        <div
          className="w-16 h-0.5 mb-6 rounded-full"
          style={{ background: slide.accent }}
        />

        {/* CTA */}
        <p className="text-white/60 text-lg font-light tracking-wide">
          Step up to the kiosk to try it on with AI
        </p>
      </div>

      {/* ── Bottom catalog strip ── */}
      <div
        className="absolute bottom-0 left-0 right-0 px-8 pb-8"
        style={{
          opacity: textVisible ? 1 : 0,
          transition: 'opacity 0.5s ease 0.2s',
        }}
      >
        {/* Strip label */}
        <p className="text-white/30 text-xs tracking-[0.25em] uppercase mb-3 ml-1">Featured Pieces</p>
        <div className="flex gap-3">
          {CATALOG_STRIP.map((src, i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden flex-shrink-0"
              style={{
                width: '80px',
                height: '106px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                opacity: 0.85,
                transition: `opacity 0.3s ease ${i * 40}ms`,
              }}
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Slide dots ── */}
      <div
        className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-2"
        style={{ opacity: transitioning ? 0 : 0.6, transition: 'opacity 0.3s' }}
      >
        {SLIDES.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-500"
            style={{
              width: i === current ? '6px' : '4px',
              height: i === current ? '24px' : '4px',
              background: i === current ? 'white' : 'rgba(255,255,255,0.4)',
            }}
          />
        ))}
      </div>

      {/* ── Corner watermark ── */}
      <div className="absolute top-8 right-8 opacity-20 pointer-events-none">
        <span className="text-xs text-white font-medium tracking-[0.3em] uppercase">AI Virtual Try-On</span>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes ken-burns {
          0% { transform: scale(1) translate(0, 0); }
          100% { transform: scale(1.08) translate(-2%, -1%); }
        }
      `}</style>
    </div>
  );
};
