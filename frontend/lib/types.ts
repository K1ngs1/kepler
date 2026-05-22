export interface Auction {
  id: number;
  title: string;
  sub: string;
  bg: string;
  live: boolean;
}

export interface Lot {
  id: number;
  title: string;
  price: number;
  bids: number;
  timer: string;
  grade: string;
  gradeLabel: string;
  set: string;
  image_url?: string;
}

export interface LotDetail extends Lot {
  premium: number;
  endsShort: string;
  endsFull: string;
  interval: string;
}

export interface SidebarItem {
  label: string;
  n: number;
}

export interface CatalogCard {
  id: string;
  name: string;
  set_name: string;
  set_code: string;
  number: string;
  rarity: string | null;
  image_url: string | null;
  tcgdex_id: string;
}

export interface UserCard {
  id: string;
  user_id: string;
  catalog_card_id: string;
  condition: string;
  quantity: number;
  for_trade: boolean;
  wanted: boolean;
  card?: CatalogCard;
}

export interface TradeOffer {
  id: string;
  initiator_id: string;
  recipient_id: string;
  status: 'proposed' | 'countered' | 'accepted' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  location: string | null;
  reputation_score: number;
}

export interface KeplerUser {
  name: string;
  email: string;
}
