import React, { useState, useEffect } from 'react';
import trendsLogo from '@/assets/trends-logo.png';

interface Product {
  src: string;
  name: string;
  category: string;
  price: string;
  color: string; // HSL accent color
}

const PRODUCTS: Product[] = [
  { src: '/images/catalog/mens/topwear/teal-formal-shirt.png', name: 'Teal Formal Shirt', category: 'Men · Topwear', price: '₹1,299', color: 'hsl(180 70% 55%)' },
  { src: '/images/catalog/womens/topwear/mauve-embroidered-top.png', name: 'Mauve Embroidered Top', category: 'Women · Topwear', price: '₹899', color: 'hsl(300 50% 70%)' },
  { src: '/images/catalog/mens/footwear/orange-star-sneakers.png', name: 'Orange Star Sneakers', category: 'Men · Footwear', price: '₹2,499', color: 'hsl(25 95% 60%)' },
  { src: '/images/catalog/womens/bottomwear/beige-flared-skirt.png', name: 'Beige Flared Skirt', category: 'Women · Bottomwear', price: '₹749', color: 'hsl(40 60% 70%)' },
  { src: '/images/catalog/mens/bottomwear/green-cargo-pants.png', name: 'Green Cargo Pants', category: 'Men · Bottomwear', price: '₹1,099', color: 'hsl(130 50% 50%)' },
  { src: '/images/catalog/womens/topwear/blue-peplum-top.png', name: 'Blue Peplum Top', category: 'Women · Topwear', price: '₹799', color: 'hsl(215 75% 60%)' },
  { src: '/images/catalog/mens/footwear/high-top-sneakers.png', name: 'High Top Sneakers', category: 'Men · Footwear', price: '₹2,199', color: 'hsl(250 60% 65%)' },
  { src: '/images/catalog/womens/topwear/maroon-ruched-top.png', name: 'Maroon Ruched Top', category: 'Women · Topwear', price: '₹699', color: 'hsl(345 65% 50%)' },
];

// Thumbnail strip — items adjacent to current
const getStrip = (cur: number) => {
  const total = PRODUCTS.length;
  return [-2, -1, 0, 1, 2].map(offset => (cur + total + offset) % total);
};

export const SpotlightCarouselScreen: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrent(c => (c + 1) % PRODUCTS.length);
        setVisible(true);
      }, 400);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const product = PRODUCTS[current];
  const strip = getStrip(current);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Blurred background of current product */}
      {PRODUCTS.map((p, i) => (
        <img
          key={p.src}
          src={p.src}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          style={{
            opacity: i === current ? 0.18 : 0,
            filter: 'blur(40px) saturate(1.5)',
            transform: 'scale(1.1)',
          }}
        />
      ))}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* Main layout */}
      <div className="absolute inset-0 flex items-center">

        {/* Left: Product info */}
        <div
          className="flex flex-col justify-center px-16 w-[45%] gap-6"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateX(0)' : 'translateX(-20px)',
            transition: 'opacity 0.4s ease, transform 0.4s ease',
          }}
        >
          <img src={trendsLogo} alt="Trends" className="h-7 object-contain object-left opacity-70 mb-4" />

          {/* Category badge */}
          <div
            className="inline-flex items-center self-start px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase"
            style={{ background: `${product.color}22`, border: `1px solid ${product.color}55`, color: product.color }}
          >
            {product.category}
          </div>

          {/* Product name */}
          <h1
            className="text-6xl font-display font-black leading-tight text-white"
            style={{ textShadow: `0 4px 32px ${product.color}44` }}
          >
            {product.name}
          </h1>

          {/* Price */}
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold" style={{ color: product.color }}>
              {product.price}
            </span>
          </div>

          {/* Accent line */}
          <div
            className="w-24 h-1 rounded-full"
            style={{ background: product.color, boxShadow: `0 0 16px ${product.color}88` }}
          />

          <p className="text-white/50 text-lg font-light">
            Step up to the kiosk to try this on with AI
          </p>
        </div>

        {/* Right: Hero product image */}
        <div className="flex-1 flex justify-center items-center pr-12">
          <div
            className="relative"
            style={{
              height: '78vh',
              width: 'calc(78vh * 3 / 4)',
              opacity: visible ? 1 : 0,
              transform: visible ? 'scale(1)' : 'scale(0.96)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}
          >
            {/* Glow behind image */}
            <div
              className="absolute -inset-4 rounded-3xl blur-2xl opacity-30"
              style={{ background: product.color }}
            />
            <div className="relative w-full h-full rounded-3xl overflow-hidden border border-white/10">
              <img src={product.src} alt={product.name} className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom thumbnail strip */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-end gap-3">
        {strip.map((idx, pos) => {
          const isCurrent = idx === current;
          const p = PRODUCTS[idx];
          return (
            <div
              key={idx}
              className="relative overflow-hidden rounded-xl transition-all duration-400"
              style={{
                width: isCurrent ? '64px' : '44px',
                height: isCurrent ? '80px' : '56px',
                border: isCurrent ? `2px solid ${product.color}` : '1px solid rgba(255,255,255,0.12)',
                boxShadow: isCurrent ? `0 0 16px ${product.color}55` : 'none',
                opacity: Math.abs(pos - 2) === 2 ? 0.4 : 1,
              }}
            >
              <img src={p.src} alt="" className="w-full h-full object-cover" />
            </div>
          );
        })}
      </div>

      {/* Slide counter */}
      <div className="absolute top-8 right-8 flex items-center gap-3">
        <span className="text-white/30 text-sm font-mono tabular-nums">
          {String(current + 1).padStart(2, '0')} / {String(PRODUCTS.length).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
};
