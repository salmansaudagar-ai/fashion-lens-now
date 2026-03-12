/**
 * Seed the Supabase catalog_items table with real Trends catalog data.
 *
 * Usage:
 *   npx tsx scripts/seed-catalog.ts
 *
 * Or set env vars manually:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-catalog.ts
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qfumhgipfhzubmorymbd.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

interface CatalogItem {
  id: string;
  name: string;
  category: 'topwear' | 'bottomwear' | 'footwear';
  image_url: string;
  price: number;
  actual_price: number;
  selling_price: number;
  brand: string;
  sizes: string[];
  country_of_origin: string;
  color_variants: Array<{ name: string; hex: string }>;
  is_active: boolean;
  sort_order: number;
}

// Real Trends catalog — brands carried by Reliance Trends stores
const catalogItems: CatalogItem[] = [
  // ─── TOPWEAR ─────────────────────────────────────────────────
  {
    id: 'trends-top-001',
    name: 'Teal Formal Shirt',
    category: 'topwear',
    image_url: '/images/catalog/mens/topwear/teal-formal-shirt.png',
    brand: 'Allen Solly',
    actual_price: 1799,
    selling_price: 1349,
    price: 1349,
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Teal', hex: '#0D5C63' },
      { name: 'Navy', hex: '#1E3A5F' },
      { name: 'Black', hex: '#1A1A1A' },
    ],
    is_active: true,
    sort_order: 1,
  },
  {
    id: 'trends-top-002',
    name: 'Lavender Oxford Shirt',
    category: 'topwear',
    image_url: '/images/catalog/mens/topwear/lavender-oxford-shirt.png',
    brand: 'Van Heusen',
    actual_price: 2299,
    selling_price: 1599,
    price: 1599,
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Lavender', hex: '#E6E6FA' },
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Light Blue', hex: '#87CEEB' },
    ],
    is_active: true,
    sort_order: 2,
  },
  {
    id: 'trends-top-003',
    name: 'Man of Steel Graphic Tee',
    category: 'topwear',
    image_url: '/images/catalog/mens/topwear/superman-tee.png',
    brand: 'Free Authority',
    actual_price: 899,
    selling_price: 599,
    price: 599,
    sizes: ['S', 'M', 'L', 'XL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Grey', hex: '#9CA3AF' },
      { name: 'Black', hex: '#1A1A1A' },
    ],
    is_active: true,
    sort_order: 3,
  },
  {
    id: 'trends-top-004',
    name: 'Classic Polo Shirt',
    category: 'topwear',
    image_url: '/images/catalog/mens/topwear/olive-polo.png',
    brand: 'Peter England',
    actual_price: 1499,
    selling_price: 999,
    price: 999,
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Olive', hex: '#9CB071' },
      { name: 'Navy', hex: '#1E3A5F' },
      { name: 'White', hex: '#FFFFFF' },
    ],
    is_active: true,
    sort_order: 4,
  },
  {
    id: 'trends-top-005',
    name: 'White Formal Shirt',
    category: 'topwear',
    image_url: '/images/catalog/mens/topwear/white-formal-shirt.png',
    brand: 'Louis Philippe',
    actual_price: 2499,
    selling_price: 1899,
    price: 1899,
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Light Blue', hex: '#87CEEB' },
      { name: 'Cream', hex: '#FFFDD0' },
    ],
    is_active: true,
    sort_order: 5,
  },
  {
    id: 'trends-top-006',
    name: 'Brown Check Shirt',
    category: 'topwear',
    image_url: '/images/catalog/womens/topwear/brown-check-shirt.png',
    brand: 'Avaasa',
    actual_price: 1299,
    selling_price: 899,
    price: 899,
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Brown', hex: '#8B4513' },
    ],
    is_active: true,
    sort_order: 6,
  },
  {
    id: 'trends-top-007',
    name: 'Mauve Embroidered Top',
    category: 'topwear',
    image_url: '/images/catalog/womens/topwear/mauve-embroidered-top.png',
    brand: 'AND',
    actual_price: 1999,
    selling_price: 1399,
    price: 1399,
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Mauve', hex: '#E0B0FF' },
    ],
    is_active: true,
    sort_order: 7,
  },
  {
    id: 'trends-top-008',
    name: 'Maroon Ruched Top',
    category: 'topwear',
    image_url: '/images/catalog/womens/topwear/maroon-ruched-top.png',
    brand: 'Global Desi',
    actual_price: 1599,
    selling_price: 1099,
    price: 1099,
    sizes: ['XS', 'S', 'M', 'L'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Maroon', hex: '#800000' },
    ],
    is_active: true,
    sort_order: 8,
  },
  {
    id: 'trends-top-009',
    name: 'Blue Peplum Top',
    category: 'topwear',
    image_url: '/images/catalog/womens/topwear/blue-peplum-top.png',
    brand: 'Honey by Pantaloons',
    actual_price: 1199,
    selling_price: 799,
    price: 799,
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Light Blue', hex: '#ADD8E6' },
    ],
    is_active: true,
    sort_order: 9,
  },
  {
    id: 'trends-top-010',
    name: 'Grey GAP Hoodie',
    category: 'topwear',
    image_url: '/images/catalog/womens/topwear/grey-gap-hoodie.png',
    brand: 'GAP',
    actual_price: 3499,
    selling_price: 2499,
    price: 2499,
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Grey Melange', hex: '#9E9E9E' },
    ],
    is_active: true,
    sort_order: 10,
  },

  // ─── BOTTOMWEAR ──────────────────────────────────────────────
  {
    id: 'trends-bot-001',
    name: 'Cargo Utility Pants',
    category: 'bottomwear',
    image_url: '/images/catalog/mens/bottomwear/green-cargo-pants.png',
    brand: 'Netplay',
    actual_price: 1999,
    selling_price: 1399,
    price: 1399,
    sizes: ['28', '30', '32', '34', '36', '38'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Sage Green', hex: '#9CAF88' },
      { name: 'Khaki', hex: '#C3B091' },
      { name: 'Black', hex: '#1A1A1A' },
    ],
    is_active: true,
    sort_order: 11,
  },
  {
    id: 'trends-bot-002',
    name: 'Navy Formal Trousers',
    category: 'bottomwear',
    image_url: '/images/catalog/mens/bottomwear/navy-formal-trousers.png',
    brand: 'Van Heusen',
    actual_price: 2499,
    selling_price: 1799,
    price: 1799,
    sizes: ['28', '30', '32', '34', '36', '38'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Navy', hex: '#374B5C' },
      { name: 'Black', hex: '#1A1A1A' },
      { name: 'Charcoal', hex: '#36454F' },
    ],
    is_active: true,
    sort_order: 12,
  },
  {
    id: 'trends-bot-003',
    name: 'Classic Blue Denim',
    category: 'bottomwear',
    image_url: '/images/catalog/mens/bottomwear/blue-denim-jeans.png',
    brand: 'Dnmx',
    actual_price: 1799,
    selling_price: 1199,
    price: 1199,
    sizes: ['28', '30', '32', '34', '36'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Medium Blue', hex: '#4A6FA5' },
      { name: 'Dark Blue', hex: '#1E3A5F' },
      { name: 'Light Wash', hex: '#A4C8E1' },
    ],
    is_active: true,
    sort_order: 13,
  },
  {
    id: 'trends-bot-004',
    name: 'Black Slim Fit Jeans',
    category: 'bottomwear',
    image_url: '/images/catalog/mens/bottomwear/black-slim-jeans.png',
    brand: 'Pepe Jeans',
    actual_price: 2999,
    selling_price: 2099,
    price: 2099,
    sizes: ['28', '30', '32', '34', '36'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Black', hex: '#1A1A1A' },
      { name: 'Charcoal', hex: '#36454F' },
      { name: 'Grey', hex: '#6B6B6B' },
    ],
    is_active: true,
    sort_order: 14,
  },
  {
    id: 'trends-bot-005',
    name: 'Washed Denim Jeans',
    category: 'bottomwear',
    image_url: '/images/catalog/mens/bottomwear/washed-denim-jeans.png',
    brand: 'Flying Machine',
    actual_price: 2299,
    selling_price: 1599,
    price: 1599,
    sizes: ['28', '30', '32', '34', '36', '38'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Indigo', hex: '#3F5D7D' },
      { name: 'Medium Blue', hex: '#4A6FA5' },
      { name: 'Dark Wash', hex: '#2C3E50' },
    ],
    is_active: true,
    sort_order: 15,
  },
  {
    id: 'trends-bot-006',
    name: 'Beige Midi Skirt',
    category: 'bottomwear',
    image_url: '/images/catalog/womens/bottomwear/beige-midi-skirt.png',
    brand: 'AND',
    actual_price: 1999,
    selling_price: 1399,
    price: 1399,
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Beige', hex: '#D2B48C' },
    ],
    is_active: true,
    sort_order: 16,
  },
  {
    id: 'trends-bot-007',
    name: 'Blue Wide Leg Jeans',
    category: 'bottomwear',
    image_url: '/images/catalog/womens/bottomwear/blue-wide-leg-jeans.png',
    brand: 'Dnmx',
    actual_price: 1799,
    selling_price: 1299,
    price: 1299,
    sizes: ['26', '28', '30', '32', '34'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Blue Denim', hex: '#4A6FA5' },
    ],
    is_active: true,
    sort_order: 17,
  },
  {
    id: 'trends-bot-008',
    name: 'Beige Flared Skirt',
    category: 'bottomwear',
    image_url: '/images/catalog/womens/bottomwear/beige-flared-skirt.png',
    brand: 'Avaasa',
    actual_price: 1499,
    selling_price: 999,
    price: 999,
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Beige', hex: '#F5DEB3' },
    ],
    is_active: true,
    sort_order: 18,
  },
  {
    id: 'trends-bot-009',
    name: 'Ivory Cotton Pants',
    category: 'bottomwear',
    image_url: '/images/catalog/womens/bottomwear/ivory-cotton-pants.png',
    brand: 'Global Desi',
    actual_price: 1899,
    selling_price: 1299,
    price: 1299,
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Ivory', hex: '#FFFFF0' },
    ],
    is_active: true,
    sort_order: 19,
  },
  {
    id: 'trends-bot-010',
    name: 'White Formal Trousers',
    category: 'bottomwear',
    image_url: '/images/catalog/womens/bottomwear/white-formal-trousers.png',
    brand: 'Allen Solly Woman',
    actual_price: 2199,
    selling_price: 1599,
    price: 1599,
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'White', hex: '#FFFFFF' },
    ],
    is_active: true,
    sort_order: 20,
  },

  // ─── FOOTWEAR ────────────────────────────────────────────────
  {
    id: 'trends-foot-001',
    name: 'Brown Oxford Dress Shoes',
    category: 'footwear',
    image_url: '/images/catalog/mens/footwear/brown-oxford-shoes.png',
    brand: 'Arrow',
    actual_price: 3499,
    selling_price: 2499,
    price: 2499,
    sizes: ['6', '7', '8', '9', '10', '11'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Cognac', hex: '#9A5B2D' },
      { name: 'Brown', hex: '#8B4513' },
      { name: 'Black', hex: '#1A1A1A' },
    ],
    is_active: true,
    sort_order: 21,
  },
  {
    id: 'trends-foot-002',
    name: 'White Leather Sneakers',
    category: 'footwear',
    image_url: '/images/catalog/mens/footwear/white-leather-sneakers.png',
    brand: 'Forca',
    actual_price: 1999,
    selling_price: 1399,
    price: 1399,
    sizes: ['6', '7', '8', '9', '10', '11'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Off-White', hex: '#FAF0E6' },
      { name: 'Red Accent', hex: '#C41E3A' },
    ],
    is_active: true,
    sort_order: 22,
  },
  {
    id: 'trends-foot-003',
    name: 'Black Combat Boots',
    category: 'footwear',
    image_url: '/images/catalog/mens/footwear/black-combat-boots.png',
    brand: 'Ajio Own',
    actual_price: 2799,
    selling_price: 1999,
    price: 1999,
    sizes: ['6', '7', '8', '9', '10', '11'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Black', hex: '#1A1A1A' },
      { name: 'Brown', hex: '#8B4513' },
    ],
    is_active: true,
    sort_order: 23,
  },
  {
    id: 'trends-foot-004',
    name: 'Star Retro Sneakers',
    category: 'footwear',
    image_url: '/images/catalog/mens/footwear/orange-star-sneakers.png',
    brand: 'Performax',
    actual_price: 1499,
    selling_price: 999,
    price: 999,
    sizes: ['6', '7', '8', '9', '10', '11'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Orange/White', hex: '#FF7F00' },
      { name: 'Blue/White', hex: '#4A90D9' },
      { name: 'Green/White', hex: '#4CAF50' },
    ],
    is_active: true,
    sort_order: 24,
  },
  {
    id: 'trends-foot-005',
    name: 'High-Top Basketball Sneakers',
    category: 'footwear',
    image_url: '/images/catalog/mens/footwear/high-top-sneakers.png',
    brand: 'Skechers',
    actual_price: 4999,
    selling_price: 3499,
    price: 3499,
    sizes: ['7', '8', '9', '10', '11'],
    country_of_origin: 'Vietnam',
    color_variants: [
      { name: 'Black/Red', hex: '#1A1A1A' },
      { name: 'White/Blue', hex: '#FFFFFF' },
      { name: 'Grey/Black', hex: '#6B6B6B' },
    ],
    is_active: true,
    sort_order: 25,
  },
  {
    id: 'trends-foot-006',
    name: 'Green Classic Sneakers',
    category: 'footwear',
    image_url: '/images/catalog/mens/footwear/green-classic-sneakers.png',
    brand: 'Forca',
    actual_price: 1799,
    selling_price: 1199,
    price: 1199,
    sizes: ['6', '7', '8', '9', '10'],
    country_of_origin: 'India',
    color_variants: [
      { name: 'Green', hex: '#2E6B4D' },
    ],
    is_active: true,
    sort_order: 26,
  },
];

async function seedCatalog() {
  console.log(`Seeding ${catalogItems.length} items into catalog_items table...`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);

  // First, clear existing items
  console.log('Clearing existing catalog items...');
  const deleteRes = await fetch(
    `${SUPABASE_URL}/rest/v1/catalog_items?id=neq.NONE`,
    {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
    }
  );
  console.log('Delete response:', deleteRes.status);

  // Insert in batches
  const batchSize = 10;
  for (let i = 0; i < catalogItems.length; i += batchSize) {
    const batch = catalogItems.slice(i, i + batchSize);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/catalog_items`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(batch),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.error(`Batch ${i / batchSize + 1} failed:`, data);
    } else {
      console.log(`Batch ${i / batchSize + 1}: Inserted ${Array.isArray(data) ? data.length : 1} items`);
    }
  }

  console.log('Done! Catalog seeded with real Trends data.');
}

seedCatalog().catch(console.error);
