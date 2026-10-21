export type UserRole = 'responder' | 'researcher' | 'citizen' | 'journalist';

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  region: string;
  prefs: {
    unit: 'metric' | 'imperial';
    tone: 'concise_tactical' | 'comprehensive_analytical' | 'public_bulletin';
    daylight_mode: boolean;
  };
}

export interface SegmentationClass {
  id: number;
  name: string;
  color: string;
  pixel_count: number;
  area_m2: number | null;
  percentage: number;
  is_flooded: boolean;
}

export interface DamageStats {
  severity_score: number; // 0.0 to 10.0 (Tide Gauge)
  severity_level: 'LOW' | 'MODERATE' | 'CRITICAL' | 'CATASTROPHIC';
  total_inundated_area_m2: number;
  flooded_buildings_count: number;
  safe_buildings_count: number;
  flooded_roads_km: number | null;
  flooded_roads_coverage_pct?: number | null;
  safe_roads_km: number | null;
  flood_depth_estimated_m: number | null;
  classes: SegmentationClass[];
}

export interface CitationClause {
  id: string;
  document: string; // e.g. "NDMA Urban Flood SOP Section 4.2"
  clause: string;
  excerpt: string;
  relevance: number; // 0.0 to 1.0
  action_item?: string;
}

export interface RegionContext {
  region_id: number;
  class_name: string;
  coordinates: { x: number; y: number; width: number; height: number };
  note?: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  raw_image_url?: string;
  mask_image_url?: string;
  image_file?: File;
  damage_stats?: DamageStats;
  citations?: CitationClause[];
  region_context?: RegionContext;
  proactive_notes?: string[];
}

export interface ChatThread {
  id: string;
  user_id: string;
  title: string;
  location_tag?: string;
  created_at: string;
  updated_at: string;
  last_message_preview?: string;
  severity?: 'LOW' | 'MODERATE' | 'CRITICAL' | 'CATASTROPHIC';
}

export interface PublishedReport {
  id: string;
  message_id: string;
  title: string;
  location: string;
  severity_score: number;
  severity_level: 'LOW' | 'MODERATE' | 'CRITICAL' | 'CATASTROPHIC';
  author_role: UserRole;
  raw_image_url: string;
  mask_image_url: string;
  summary: string;
  created_at: string;
  upvotes: number;
}
