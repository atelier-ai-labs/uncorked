export type WineType =
  | 'red'
  | 'white'
  | 'rose'
  | 'sparkling'
  | 'dessert'
  | 'fortified'
  | 'orange';

export interface Wine {
  id: number;
  producer: string;
  name: string;
  vintage: number | null;
  wine_type: WineType;
  region: string | null;
  sub_region: string | null;
  country: string | null;
  appellation: string | null;
  varietals: string[];
  abv: number | null;
  body: string | null;
  tannin: string | null;
  acidity: string | null;
  sweetness: string | null;
  tasting_notes: string[];
  summary: string | null;
  food_pairings: string[];
  serving_temp: string | null;
  decant_time: string | null;
  drinking_window: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WineLog {
  id: number;
  user_id: string;
  wine_id: number;
  rating: number | null;
  tasting_notes: string | null;
  price_paid: number | null;
  currency: string;
  purchase_location: string | null;
  photo_url: string | null;
  drank_at: string;
  created_at: string;
  updated_at: string;
  wines: Wine;
}

export interface ExtractedWineProfile {
  id?: number;
  producer: string;
  name: string;
  vintage: number | null;
  wine_type: WineType;
  region: string | null;
  sub_region: string | null;
  country: string | null;
  appellation: string | null;
  varietals: string[];
  abv: number | null;
  body: string | null;
  tannin: string | null;
  acidity: string | null;
  sweetness: string | null;
  tasting_notes: string[];
  summary: string | null;
  food_pairings: string[];
  serving_temp: string | null;
  decant_time: string | null;
  drinking_window: string | null;
}
