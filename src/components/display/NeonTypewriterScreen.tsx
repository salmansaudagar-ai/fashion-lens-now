import React, { useState, useEffect } from 'react';
import trendsLogo from '@/assets/trends-logo.png';

const PHRASES = [
  'Try it on.',
  'Own the look.',
  'Step up.',
  'Be the trend.',
  'Style is yours.',
  'Virtual. Real. You.',
];

const ACCENT_COLORS = [
  'hsl(320 90% 65%)',   // pink-magenta
  'hsl(180 90% 55%)',   // cyan
  'hsl(55 100% 60%)',   // yellow
  'hsl(270 80% 70%)',   // purple
  'hsl(140 80% 55%)',   // green
  'hsl(20 95% 60%)',    // orange
];

const ALL_IMAGES = [
  '/images/catalog/mens/topwear/teal-formal-shirt.png',
  '/images/catalog/mens/topwear/lavender-oxford-shirt.png',
  '/images/catalog/womens/topwear/blue-peplum-top.png',
  '/images/catalog/womens/topwear/mauve-embroidered-top.png',
  '/images/catalog/mens/bottomwear/black-slim-jeans.png',
  '/images/catalog/womens/bottomwear/beige-flared-skirt.png',
  '/images/catalog/mens/footwear/orange-star-sneakers.png',
  '/images/catalog/womens/topwear/maroon-ruched-top.png',
  '/images/catalog/mens/footwear/high-top-sneakers.png',
];

export const NeonTypewriterScreen: React.FC = () => {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [typing, setTyping] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);

  const phrase = PHRASES[phraseIdx];
  const accent = ACCENT_COLORS[phraseIdx % ACCENT_COLORS.length];

  // Typewriter effect
  useEffect(() => {
    setDisplayed('');
    setTyping(true);
    let i = 0;
    const typeInterval = setInterval(() => {
      i++;
      setDisplayed(phrase.slice(0, i));
      if (i >= phrase.length) {
        clearInterval(typeInterval);
        setTyping(false);
        setTimeout(() => {
          setPhraseIdx(p => (p + 1) % PHRASES.length);
        }, 2800);
      }
    }, 70);
    return () => clearInterval(typeInterval);
  }, [phraseIdx]);

  // Image cycling
  useEffect(() => {
    const interval = setInterval(() => {
      setImgIdx(i => (i + 1) % ALL_IMAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black flex">
      {/* Left dark panel — text content */}
      <div
        className="relative z-10 flex flex-col justify-between px-16 py-12 w-1/2"
        style={{ background: 'linear-gradient(135deg, #000 60%, rgba(0,0,0,0.85) 100%)' }}
      >
        <img src={trendsLogo} alt="Trends" className="h-8 object-contain object-left opacity-80" />

        <div className="space-y-8">
          {/* Accent line */}
          <div
            className="w-16 h-1 rounded-full"
            style={{ background: accent, boxShadow: `0 0 20px ${accent}, 0 0 40px ${accent}55`, transition: 'background 0.6s, box-shadow 0.6s' }}
          />
          {/* Typewriter headline */}
          <h1
            className="text-7xl font-display font-black leading-none"
            style={{
              color: accent,
              textShadow: `0 0 40px ${accent}88, 0 0 80px ${accent}44`,
              minHeight: '6rem',
              transition: 'color 0.6s, text-shadow 0.6s',
            }}
          >
            {displayed}
            <span
              className="inline-block w-0.5 h-14 ml-1 align-middle"
              style={{
                background: accent,
                opacity: typing ? 1 : 0,
                transition: 'opacity 0.1s',
                verticalAlign: 'middle',
              }}
            />
          </h1>

          {/* Subtitle */}
          <p className="text-white/40 text-xl font-light tracking-widest uppercase">
            AI Virtual Try-On · Trends
          </p>

          {/* CTA pill */}
          <div
            className="inline-flex items-center gap-3 px-7 py-3 rounded-full text-base font-semibold tracking-wide border"
            style={{ borderColor: `${accent}55`, color: accent, background: `${accent}12` }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
            Step up to the kiosk
          </div>
        </div>

        <p className="text-white/20 text-xs tracking-[0.3em] uppercase">Virtual Try-On · Powered by AI</p>
      </div>

      {/* Right image showcase */}
      <div className="relative flex-1 overflow-hidden">
        {ALL_IMAGES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
            style={{ opacity: i === imgIdx ? 1 : 0 }}
          />
        ))}
        {/* Neon overlay gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(to right, #000 0%, transparent 30%, ${accent}11 100%)`,
            transition: 'background 0.6s',
          }}
        />
        {/* Top + bottom fades */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.4) 100%)' }} />

        {/* Floating accent badge */}
        <div
          className="absolute bottom-10 right-10 px-5 py-2.5 rounded-2xl text-sm font-semibold"
          style={{
            background: `${accent}22`,
            border: `1px solid ${accent}55`,
            color: accent,
            boxShadow: `0 0 24px ${accent}33`,
            backdropFilter: 'blur(8px)',
            transition: 'all 0.6s',
          }}
        >
          Try it on now →
        </div>
      </div>
    </div>
  );
};
