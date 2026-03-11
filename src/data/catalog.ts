import { OutfitItem, OutfitCategory } from '@/types/vto';

/**
 * Unified Generic Catalog
 * 
 * All items are merged into a single catalog without gender segmentation.
 * Items are categorized by type: Topwear, Bottomwear, Footwear
 */

export const catalogItems: OutfitItem[] = [
  // Topwear Collection
  {
    id: 'mc-top-001',
    name: 'Teal Formal Shirt',
    category: 'topwear',
    imageUrl: '/images/catalog/mens/topwear/teal-formal-shirt.png',
    colorVariants: [
      { name: 'Teal', hex: '#0D5C63' },
      { name: 'Navy', hex: '#1E3A5F' },
      { name: 'Black', hex: '#1A1A1A' },
    ],
  },
  {
    id: 'mc-top-002',
    name: 'Lavender Oxford Shirt',
    category: 'topwear',
    imageUrl: '/images/catalog/mens/topwear/lavender-oxford-shirt.png',
    colorVariants: [
      { name: 'Lavender', hex: '#E6E6FA' },
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Light Blue', hex: '#87CEEB' },
    ],
  },
  {
    id: 'mc-top-003',
    name: 'Man of Steel Graphic Tee',
    category: 'topwear',
    imageUrl: '/images/catalog/mens/topwear/superman-tee.png',
    colorVariants: [
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Grey', hex: '#9CA3AF' },
      { name: 'Black', hex: '#1A1A1A' },
    ],
  },
  {
    id: 'mc-top-004',
    name: 'Classic Polo Shirt',
    category: 'topwear',
    imageUrl: '/images/catalog/mens/topwear/olive-polo.png',
    colorVariants: [
      { name: 'Olive', hex: '#9CB071' },
      { name: 'Navy', hex: '#1E3A5F' },
      { name: 'White', hex: '#FFFFFF' },
    ],
  },
  {
    id: 'mc-top-005',
    name: 'White Formal Shirt',
    category: 'topwear',
    imageUrl: '/images/catalog/mens/topwear/white-formal-shirt.png',
    colorVariants: [
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Light Blue', hex: '#87CEEB' },
      { name: 'Cream', hex: '#FFFDD0' },
    ],
  },
  {
    id: 'f-top-1',
    name: 'Brown Check Shirt',
    category: 'topwear',
    imageUrl: '/images/catalog/womens/topwear/brown-check-shirt.png',
    colorVariants: [
      { name: 'Brown', hex: '#8B4513' },
    ],
  },
  {
    id: 'f-top-2',
    name: 'Mauve Embroidered Top',
    category: 'topwear',
    imageUrl: '/images/catalog/womens/topwear/mauve-embroidered-top.png',
    colorVariants: [
      { name: 'Mauve', hex: '#E0B0FF' },
    ],
  },
  {
    id: 'f-top-3',
    name: 'Maroon Ruched Top',
    category: 'topwear',
    imageUrl: '/images/catalog/womens/topwear/maroon-ruched-top.png',
    colorVariants: [
      { name: 'Maroon', hex: '#800000' },
    ],
  },
  {
    id: 'f-top-4',
    name: 'Blue Peplum Top',
    category: 'topwear',
    imageUrl: '/images/catalog/womens/topwear/blue-peplum-top.png',
    colorVariants: [
      { name: 'Light Blue', hex: '#ADD8E6' },
    ],
  },
  {
    id: 'f-top-5',
    name: 'Grey GAP Hoodie',
    category: 'topwear',
    imageUrl: '/images/catalog/womens/topwear/grey-gap-hoodie.png',
    colorVariants: [
      { name: 'Grey Melange', hex: '#9E9E9E' },
    ],
  },

  // Bottomwear Collection
  {
    id: 'mc-bot-001',
    name: 'Cargo Utility Pants',
    category: 'bottomwear',
    imageUrl: '/images/catalog/mens/bottomwear/green-cargo-pants.png',
    colorVariants: [
      { name: 'Sage Green', hex: '#9CAF88' },
      { name: 'Khaki', hex: '#C3B091' },
      { name: 'Black', hex: '#1A1A1A' },
    ],
  },
  {
    id: 'mc-bot-002',
    name: 'Navy Formal Trousers',
    category: 'bottomwear',
    imageUrl: '/images/catalog/mens/bottomwear/navy-formal-trousers.png',
    colorVariants: [
      { name: 'Navy', hex: '#374B5C' },
      { name: 'Black', hex: '#1A1A1A' },
      { name: 'Charcoal', hex: '#36454F' },
    ],
  },
  {
    id: 'mc-bot-003',
    name: 'Classic Blue Denim',
    category: 'bottomwear',
    imageUrl: '/images/catalog/mens/bottomwear/blue-denim-jeans.png',
    colorVariants: [
      { name: 'Medium Blue', hex: '#4A6FA5' },
      { name: 'Dark Blue', hex: '#1E3A5F' },
      { name: 'Light Wash', hex: '#A4C8E1' },
    ],
  },
  {
    id: 'mc-bot-004',
    name: 'Black Slim Fit Jeans',
    category: 'bottomwear',
    imageUrl: '/images/catalog/mens/bottomwear/black-slim-jeans.png',
    colorVariants: [
      { name: 'Black', hex: '#1A1A1A' },
      { name: 'Charcoal', hex: '#36454F' },
      { name: 'Grey', hex: '#6B6B6B' },
    ],
  },
  {
    id: 'mc-bot-005',
    name: 'Washed Denim Jeans',
    category: 'bottomwear',
    imageUrl: '/images/catalog/mens/bottomwear/washed-denim-jeans.png',
    colorVariants: [
      { name: 'Indigo', hex: '#3F5D7D' },
      { name: 'Medium Blue', hex: '#4A6FA5' },
      { name: 'Dark Wash', hex: '#2C3E50' },
    ],
  },
  {
    id: 'f-bottom-1',
    name: 'Beige Midi Skirt',
    category: 'bottomwear',
    imageUrl: '/images/catalog/womens/bottomwear/beige-midi-skirt.png',
    colorVariants: [
      { name: 'Beige', hex: '#D2B48C' },
    ],
  },
  {
    id: 'f-bottom-2',
    name: 'Blue Wide Leg Jeans',
    category: 'bottomwear',
    imageUrl: '/images/catalog/womens/bottomwear/blue-wide-leg-jeans.png',
    colorVariants: [
      { name: 'Blue Denim', hex: '#4A6FA5' },
    ],
  },
  {
    id: 'f-bottom-3',
    name: 'Beige Flared Skirt',
    category: 'bottomwear',
    imageUrl: '/images/catalog/womens/bottomwear/beige-flared-skirt.png',
    colorVariants: [
      { name: 'Beige', hex: '#F5DEB3' },
    ],
  },
  {
    id: 'f-bottom-4',
    name: 'Ivory Cotton Pants',
    category: 'bottomwear',
    imageUrl: '/images/catalog/womens/bottomwear/ivory-cotton-pants.png',
    colorVariants: [
      { name: 'Ivory', hex: '#FFFFF0' },
    ],
  },
  {
    id: 'f-bottom-5',
    name: 'White Formal Trousers',
    category: 'bottomwear',
    imageUrl: '/images/catalog/womens/bottomwear/white-formal-trousers.png',
    colorVariants: [
      { name: 'White', hex: '#FFFFFF' },
    ],
  },

  // Footwear Collection
  {
    id: 'mc-foot-001',
    name: 'Brown Oxford Dress Shoes',
    category: 'footwear',
    imageUrl: '/images/catalog/mens/footwear/brown-oxford-shoes.png',
    colorVariants: [
      { name: 'Cognac', hex: '#9A5B2D' },
      { name: 'Brown', hex: '#8B4513' },
      { name: 'Black', hex: '#1A1A1A' },
    ],
  },
  {
    id: 'mc-foot-002',
    name: 'White Leather Sneakers',
    category: 'footwear',
    imageUrl: '/images/catalog/mens/footwear/white-leather-sneakers.png',
    colorVariants: [
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Off-White', hex: '#FAF0E6' },
      { name: 'Red Accent', hex: '#C41E3A' },
    ],
  },
  {
    id: 'mc-foot-003',
    name: 'Black Combat Boots',
    category: 'footwear',
    imageUrl: '/images/catalog/mens/footwear/black-combat-boots.png',
    colorVariants: [
      { name: 'Black', hex: '#1A1A1A' },
      { name: 'Brown', hex: '#8B4513' },
    ],
  },
  {
    id: 'mc-foot-004',
    name: 'Star Retro Sneakers',
    category: 'footwear',
    imageUrl: '/images/catalog/mens/footwear/orange-star-sneakers.png',
    colorVariants: [
      { name: 'Orange/White', hex: '#FF7F00' },
      { name: 'Blue/White', hex: '#4A90D9' },
      { name: 'Green/White', hex: '#4CAF50' },
    ],
  },
  {
    id: 'mc-foot-005',
    name: 'High-Top Basketball Sneakers',
    category: 'footwear',
    imageUrl: '/images/catalog/mens/footwear/high-top-sneakers.png',
    colorVariants: [
      { name: 'Black/Red', hex: '#1A1A1A' },
      { name: 'White/Blue', hex: '#FFFFFF' },
      { name: 'Grey/Black', hex: '#6B6B6B' },
    ],
  },
  {
    id: 'mc-foot-006',
    name: 'Green Classic Sneakers',
    category: 'footwear',
    imageUrl: '/images/catalog/mens/footwear/green-classic-sneakers.png',
    colorVariants: [
      { name: 'Green', hex: '#2E6B4D' },
    ],
  },
];

/**
 * Get catalog items by category
 * @param category - Optional category filter (topwear, bottomwear, footwear)
 * @returns Filtered array of catalog items
 */
export const getCatalogByCategory = (category?: OutfitCategory): OutfitItem[] => {
  if (!category) {
    return catalogItems;
  }
  return catalogItems.filter(item => item.category === category);
};
