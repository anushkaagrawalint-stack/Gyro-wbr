/** Shared types for the WBR app. Pure data, safe to import from browser and server code. */

export type Role = 'admin' | 'client' | 'location';

export interface Person {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Only used when role === 'location': the locations this person may see. */
  locations: string[];
  salt: string;
  hash: string;
}

/** What the browser is allowed to know about a person (never salt/hash). */
export interface PublicPerson {
  id: string;
  email: string;
  name: string;
  role: Role;
  locations: string[];
}

export interface LocationConfig {
  name: string;
  hidden: boolean;
  /** Review/delivery platforms this location has, e.g. ['Google','Uber Eats','DoorDash','Yelp']. */
  platforms: string[];
  /** Other spellings that appear in uploads (e.g. Spring is "Klein" in the review sheets). */
  aliases: string[];
}

export interface MappingLine {
  name: string;
  /** Raw Toast dining-option names merged into this line. */
  options: string[];
}
export interface MappingCategory {
  name: string;
  color: string;
  lines: MappingLine[];
}
export interface Mapping {
  categories: MappingCategory[];
}

export type FormatOp = '<' | '<=' | '>' | '>=' | '=' | 'between';
export interface FormatRule {
  op: FormatOp;
  v: number;
  v2?: number;
  /** green | amber | red | purple | grey, or a #rrggbb colour. */
  color: string;
}
export interface FormatConfig {
  table: string;
  column: string;
  axis: 'column' | 'row';
  mode: 'pill' | 'cell' | 'text';
  rules: FormatRule[];
}

export const PERIODS = ['weekly', 'ptd', 'mtd', 'quarterly', 'ytd'] as const;
export type PeriodKey = (typeof PERIODS)[number];
export type Kind = 'actual' | 'ly';

/** One Toast row: [dining option, sales category (null on the dining-option subtotal row), net sales]. */
export type ToastRow = [string, string | null, number];

export type ReviewRow = [string, string, string, number, number, number, number, number];
export interface ReviewsData {
  /** [platform, location, weekStartISO, n5, n4, n3, n2, n1] */
  so7_90: ReviewRow[];
  so30: ReviewRow[];
}
export interface LoyaltyLocation {
  sales: number | null;
  salesVar: number | null;
  activeUsers: number;
  activeMembers: number;
  totalUsers: number;
  totalMembers: number;
  loyaltyPct: number;
  newMembers: number;
  newApp: number;
  newWeb: number;
}
export interface LoyaltyData {
  locations: Record<string, LoyaltyLocation>;
  campaigns: { name: string; generated: number; redeemed: number; discount: number; sales: number }[];
}
export interface ApolloRow {
  name: string;
  sent: number;
  delivered: number;
  bounced: number;
  spamBlocked: number;
  unsubscribed: number;
  opened: number;
  replied: number;
}
export interface MarketingData {
  apollo: Record<'7' | '30', ApolloRow[]>;
}

/** One Uber Eats ad campaign for one shop, from the "UE ADS" tab. Rates are in percent. newCustomers is null when the tab has no such column. */
export interface UeAdRow {
  campaign: string;
  location: string;
  sales: number;
  spend: number;
  roas: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  orders: number;
  conv: number | null;
  cpo: number | null;
  newCustomers: number | null;
}

/** Everything stored for one reporting week. Sections other than toast may be absent. */
export interface WeekData {
  weekStart: string; // ISO Monday
  uploadedAt: string;
  workbook?: string;
  /** toast[period][kind][location] = raw rows. 'All Locations' is the overall sheet. */
  toast: Partial<Record<PeriodKey, Partial<Record<Kind, Record<string, ToastRow[]>>>>>;
  reviews?: ReviewsData;
  loyalty?: LoyaltyData;
  marketing?: MarketingData;
  ueAds?: UeAdRow[];
  /** Not built from the workbook yet: carried from the reference HTML. */
  tpd?: unknown;
  catering?: unknown;
}

export interface WeekIndexEntry {
  weekStart: string;
  uploadedAt: string;
  sections: string[];
}

export const ALL = 'All Locations';
