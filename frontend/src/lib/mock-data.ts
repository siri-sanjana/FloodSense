import { ChatMessage, ChatThread, DamageStats, PublishedReport, UserProfile } from './types';

export const CURRENT_USER: UserProfile = {
  id: 'usr_sarah_chen',
  name: 'Sarah Chen, Field Operations Lead',
  role: 'responder',
  region: 'Brahmaputra Basin, Assam & Coastal Kerala',
  prefs: {
    unit: 'metric',
    tone: 'concise_tactical',
    daylight_mode: false,
  },
};

export const INITIAL_THREADS: ChatThread[] = [
  {
    id: 't-kochi-01',
    user_id: 'usr_sarah_chen',
    title: 'Kochi Marine Drive Sector 4 Aerial Survey',
    location_tag: 'Kochi, Kerala (9.9816° N, 76.2750° E)',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // Today
    updated_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    last_message_preview: '3 flooded structures verified. Northern relief access severed at Chattoor Bridge.',
    severity: 'CRITICAL',
  },
  {
    id: 't-munar-02',
    user_id: 'usr_sarah_chen',
    title: 'Periyar Riverbank Inundation & Road Cutoff',
    location_tag: 'Aluva, Kerala (10.1076° N, 76.3516° E)',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), // Today
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    last_message_preview: 'Road-Flooded segment measures 2.4 km along the SH16 arterial feeder.',
    severity: 'MODERATE',
  },
  {
    id: 't-silchar-03',
    user_id: 'usr_sarah_chen',
    title: 'Silchar Urban Embankment Breach Assessment',
    location_tag: 'Silchar, Assam (24.8333° N, 92.7789° E)',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(), // Yesterday
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    last_message_preview: 'Over 14 residential units marooned. Air-drop supplies requested.',
    severity: 'CATASTROPHIC',
  },
  {
    id: 't-guwahati-04',
    user_id: 'usr_sarah_chen',
    title: 'Deepor Beel Overflow Zone Reconnaissance',
    location_tag: 'Guwahati, Assam (26.1264° N, 91.6560° E)',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(), // Last 7 days
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 90).toISOString(),
    last_message_preview: 'Water level stable at 54.2m above MSL. Submerged grassland clearance advised.',
    severity: 'LOW',
  },
];

export const SAMPLE_DAMAGE_STATS: DamageStats = {
  severity_score: 7.8,
  severity_level: 'CRITICAL',
  total_inundated_area_m2: 48620,
  flooded_buildings_count: 14,
  safe_buildings_count: 9,
  flooded_roads_km: 3.42,
  safe_roads_km: 1.85,
  flood_depth_estimated_m: 1.65,
  classes: [
    { id: 1, name: 'Building-Flooded', color: '#DC2626', pixel_count: 52400, area_m2: 7860, percentage: 16.2, is_flooded: true },
    { id: 2, name: 'Building-Safe', color: '#B45309', pixel_count: 38200, area_m2: 5730, percentage: 11.8, is_flooded: false },
    { id: 3, name: 'Road-Flooded', color: '#CA8A04', pixel_count: 64100, area_m2: 9615, percentage: 19.8, is_flooded: true },
    { id: 4, name: 'Road-Safe', color: '#6B7280', pixel_count: 22000, area_m2: 3300, percentage: 6.8, is_flooded: false },
    { id: 5, name: 'Standing Water', color: '#06B6D4', pixel_count: 104500, area_m2: 15675, percentage: 32.2, is_flooded: true },
    { id: 6, name: 'Tree Canopy', color: '#059669', pixel_count: 24800, area_m2: 3720, percentage: 7.6, is_flooded: false },
    { id: 7, name: 'Vehicle / Vessel', color: '#7C3AED', pixel_count: 4200, area_m2: 630, percentage: 1.3, is_flooded: true },
    { id: 8, name: 'Submerged Pool', color: '#EAB308', pixel_count: 5100, area_m2: 765, percentage: 1.6, is_flooded: true },
    { id: 9, name: 'Open Grassland', color: '#4ADE80', pixel_count: 8800, area_m2: 1320, percentage: 2.7, is_flooded: false },
  ],
};

export const INITIAL_MESSAGES: Record<string, ChatMessage[]> = {
  't-kochi-01': [
    {
      id: 'm-1',
      thread_id: 't-kochi-01',
      role: 'user',
      content: 'Uploading UAV high-resolution reconnaissance pass over Kochi Marine Drive Sector 4. Please segment damage zones and evaluate emergency evacuation passability.',
      raw_image_url: '/samples/10169.jpg',
      created_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    },
    {
      id: 'm-2',
      thread_id: 't-kochi-01',
      role: 'assistant',
      content: `### 🎯 Direct Operator Answer & Summary
> **DIRECT VERDICT:** Sector 4 is under CRITICAL inundation (Severity 7.8/10). Ground-floor water ingress reaches **1.65 meters**, isolating 14 multi-story buildings and submerging 3.42 km of roadways past vehicle wading limits. Safe evacuation corridor is restricted to the elevated Northern Feeder.

#### 📋 Descriptive Field Observations
- **Structural Compromise:** 14 multi-story buildings show ground-floor water ingress reaching **1.65 meters** [[NDMA-SOP-4.2]]. Structural isolation is confirmed for residential units adjacent to the canal overflow.
- **Arterial Transit Severed:** **3.42 km** of municipal road infrastructure is currently submerged [[NDRF-TAC-08]]. Depth profiles exceed safe transit limits for high-clearance utility vehicles (>0.5m depth).
- **Trapped Equipment & Vehicles:** 6 vehicles detected in deep standing water along the western embankment [[FEMA-FP-B]].
- **Primary Access Corridors:** Northern feeder road remains dry (+0.8m elevation above water table), providing the sole viable extraction axis.`,
      raw_image_url: '/samples/10169.jpg',
      mask_image_url: '/samples/10169_mask.png',
      damage_stats: SAMPLE_DAMAGE_STATS,
      citations: [
        {
          id: 'NDMA-SOP-4.2',
          document: 'NDMA National Disaster Management Guidelines — Management of Urban Flooding (Sec 4.2)',
          clause: 'Clause 4.2.1: Priority Rescue Operations in Inundated Multi-Occupancy Structures',
          excerpt: 'When water depth around residential premises exceeds 1.2 meters, ground electrical isolation must be verified within 60 minutes. Ground floor occupants must be staged on secondary elevation platforms or evacuated using rigid inflatable boats (RIBs).',
          relevance: 0.94,
          action_item: 'Deploy 2 NDRF motorized boats along Canal Axis B; issue immediate ground circuit de-energization notice.',
        },
        {
          id: 'NDRF-TAC-08',
          document: 'NDRF Standard Operating Procedure on Flood Rescue Operations (SOP 08/2022)',
          clause: 'Clause 8.4: Vehicle Transit Safety Thresholds',
          excerpt: 'Standing water depths exceeding 0.45 meters (18 inches) across asphalt roads are classified impassable for commercial response ambulances and light trucks due to hydro-buoyancy and concealed surface erosion risks.',
          relevance: 0.91,
          action_item: 'Establish roadblock at Chattoor Junction; divert civilian traffic onto Northern Bypass.',
        },
        {
          id: 'FEMA-FP-B',
          document: 'FEMA Emergency Rescue Protocol — Submerged Assets & Hazard Identification',
          clause: 'Section B.3: Secondary Contamination from Submerged Automotive Systems',
          excerpt: 'Vehicles submerged above wheel hub levels pose petrochemical leakage risks and navigation hazards for flat-bottom rescue craft.',
          relevance: 0.82,
          action_item: 'Affix high-visibility buoys to submerged vehicle clusters before nightfall.',
        },
      ],
      proactive_notes: [
        '3 residential buildings show ground-floor water ingress exceeding 1.2m. Issue motorized boat evacuation order?',
        'Southern arterial route is submerged under 1.6m water. Generate reroute note to Northern Bypass for ambulance control?',
      ],
      created_at: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
    },
  ],
};

export const GALLERY_ITEMS = [
  {
    id: 'gal-1',
    title: 'Kochi Sector 4 Canal Embankment',
    location: 'Kochi, Kerala',
    coordinates: '9.9816° N, 76.2750° E',
    date: '19 Oct 2026',
    severity_score: 7.8,
    severity_level: 'CRITICAL' as const,
    inundated_area_m2: 48620,
    raw_url: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'gal-2',
    title: 'Aluva River Crossing & Rail Viaduct',
    location: 'Aluva, Kerala',
    coordinates: '10.1076° N, 76.3516° E',
    date: '19 Oct 2026',
    severity_score: 5.2,
    severity_level: 'MODERATE' as const,
    inundated_area_m2: 24100,
    raw_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'gal-3',
    title: 'Silchar Ward 12 Residential Enclave',
    location: 'Silchar, Assam',
    coordinates: '24.8333° N, 92.7789° E',
    date: '18 Oct 2026',
    severity_score: 9.1,
    severity_level: 'CATASTROPHIC' as const,
    inundated_area_m2: 89400,
    raw_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'gal-4',
    title: 'Deepor Beel Northern Catchment',
    location: 'Guwahati, Assam',
    coordinates: '26.1264° N, 91.6560° E',
    date: '15 Oct 2026',
    severity_score: 2.4,
    severity_level: 'LOW' as const,
    inundated_area_m2: 9200,
    raw_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
  },
];

export const COMMUNITY_FEED: PublishedReport[] = [
  {
    id: 'pub-01',
    message_id: 'm-2',
    title: 'Marine Drive Sector 4 Urban Inundation SITREP',
    location: 'Kochi Central, Kerala',
    severity_score: 7.8,
    severity_level: 'CRITICAL',
    author_role: 'responder',
    raw_image_url: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80',
    mask_image_url: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80',
    summary: '14 multi-story buildings isolated by 1.6m floodwater. Arterial roads submerged. Northern evacuation corridor verified clear.',
    created_at: '2 hours ago',
    upvotes: 42,
  },
  {
    id: 'pub-02',
    message_id: 'm-silchar',
    title: 'Barak Valley Embankment Slump Analysis',
    location: 'Silchar, Assam',
    severity_score: 9.1,
    severity_level: 'CATASTROPHIC',
    author_role: 'researcher',
    raw_image_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80',
    mask_image_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80',
    summary: 'Embankment structural breach causing rapid 2.2m water rise across 14 residential units. Immediate air-support protocol active.',
    created_at: 'Yesterday',
    upvotes: 118,
  },
];
