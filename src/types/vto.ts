export type OutfitCategory = 'topwear' | 'bottomwear' | 'footwear';

export interface ColorVariant {
  name: string;
  hex: string;
}

export interface OutfitItem {
  id: string;
  name: string;
  category: OutfitCategory;
  imageUrl: string;
  colorVariants: ColorVariant[];
  selectedColor?: string;
  price?: number;
  brand?: string;
  sizes?: string[];
  actualPrice?: number;
  sellingPrice?: number;
  countryOfOrigin?: string;
}

export interface SelectedOutfit {
  topwear: OutfitItem | null;
  bottomwear: OutfitItem | null;
  footwear: OutfitItem | null;
}

export interface CapturedImages {
  selfie: string | null;
  fullBody: string | null;
}

export type VTOStep = 1 | 1.25 | 1.5 | 2 | 2.5 | 2.75 | 3 | 4;
