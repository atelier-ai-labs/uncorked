export type WineType =
  | 'red'
  | 'white'
  | 'rose'
  | 'sparkling'
  | 'dessert'
  | 'fortified'
  | 'orange';

export type WineLogStatus = 'cellar' | 'tasted' | 'wishlist';

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
  bottles_on_hand: number;
  status: WineLogStatus;
  flavor_tags: string[];
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

export type CorkyActionStatus = 'pending' | 'confirmed' | 'cancelled';

export interface ProposedUncorkAction {
  id: string;
  type: 'uncork_bottle';
  logId: number;
  wineId: number;
  producer: string;
  name: string;
  vintage: number | null;
  wineType: WineType;
  region: string | null;
  currentBottlesOnHand: number;
  nextBottlesOnHand: number;
  nextStatus: WineLogStatus;
  rating: number | null;
  flavorTags: string[];
  tastingNotes: string | null;
}

export interface ProposedWishlistAction {
  id: string;
  type: 'add_to_wishlist';
  wineId: number | null;
  producer: string;
  name: string;
  vintage: number | null;
  wineType: WineType;
  region: string | null;
  country: string | null;
  varietals: string[];
  pricePaid: number | null;
  purchaseLocation: string | null;
  notes: string | null;
}

export interface ProposedStockChangeAction {
  id: string;
  type: 'update_stock';
  logId: number;
  wineId: number;
  producer: string;
  name: string;
  vintage: number | null;
  wineType: WineType;
  region: string | null;
  currentBottlesOnHand: number;
  nextBottlesOnHand: number;
  currentStatus: WineLogStatus;
  nextStatus: WineLogStatus;
  delta: number;
  reason: string | null;
}

export type CorkyProposedAction =
  | ProposedUncorkAction
  | ProposedWishlistAction
  | ProposedStockChangeAction;

export interface CorkyMessage {
  id: number | string;
  user_id?: string;
  role: 'user' | 'assistant';
  content: string;
  tools_used: string[];
  created_at: string;
  proposed_actions?: CorkyProposedAction[];
}
