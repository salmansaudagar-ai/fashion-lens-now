import { useQuery } from '@tanstack/react-query';
import { OutfitItem, OutfitCategory } from '@/types/vto';

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  image_url: string;
  price: number;
  brand: string;
  sizes: string[];
  actual_price: number;
  selling_price: number;
  country_of_origin: string;
  color_variants: Array<{ name: string; hex: string }>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function toOutfitItem(item: CatalogItem): OutfitItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category as OutfitCategory,
    imageUrl: item.image_url,
    colorVariants: item.color_variants,
    price: item.price,
    brand: item.brand,
    sizes: item.sizes,
    actualPrice: item.actual_price,
    sellingPrice: item.selling_price,
    countryOfOrigin: item.country_of_origin,
  };
}

async function fetchCatalog(category?: OutfitCategory): Promise<OutfitItem[]> {
  const params = category ? `?category=${category}` : '';
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-catalog${params}`,
    {
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch catalog');
  return (data.items as CatalogItem[])
    .filter(item => item.is_active)
    .map(toOutfitItem);
}

export function useCatalog(category?: OutfitCategory) {
  return useQuery({
    queryKey: ['catalog', category],
    queryFn: () => fetchCatalog(category),
    staleTime: 1000 * 60 * 5, // 5 min cache
  });
}

// Admin: fetch ALL items (including inactive)
async function fetchAllCatalogItems(): Promise<CatalogItem[]> {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-catalog`,
    {
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch catalog');
  return data.items as CatalogItem[];
}

export function useAllCatalogItems() {
  return useQuery({
    queryKey: ['catalog-admin-all'],
    queryFn: fetchAllCatalogItems,
    staleTime: 0,
  });
}
