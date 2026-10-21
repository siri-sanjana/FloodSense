/**
 * FloodSense Centralized API Client & Service Layer
 * Fully configured for:
 * Base URL: http://localhost:5050
 *
 * Endpoints:
 * - GET  /api/status            — check backend status
 * - GET  /api/models            — list available models
 * - GET  /api/samples           — get sample images
 * - POST /api/segment           — segmentation (multipart image OR sample_id; optional model=segformer|classical|sam)
 * - POST /api/depth             — relative depth (multipart image OR sample_id)
 * - POST /api/analyze           — legacy combined analysis/report
 * - GET  /api/overlay/<filename>— fetch generated mask/depth image
 */

export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5050'
)
  .replace(/\/+$/, '')
  .replace(/\/api$/i, '');

export const API_BASE_URL = BACKEND_URL;

export interface BackendStatus {
  status: 'online' | 'offline' | string;
  system: string;
  version: string;
  vector_store_chunks?: number;
  gpu_available?: boolean;
  deployment_mode?: string;
}

export interface ModelInfo {
  id: 'segformer' | 'classical' | 'sam' | 'ground_truth' | string;
  name: string;
  description: string;
  mIoU: number;
  macro_f1: number;
  latency_ms: number | null;
  recommended: boolean;
}

export interface SampleItem {
  id: string;
  image_file: string;
  mask_file: string;
  image_url: string;
  mask_url: string;
}

export interface SegmentParams {
  image?: File | Blob;
  sample_id?: string;
  model?: 'segformer' | 'classical' | 'sam' | 'ground_truth' | string;
}

export interface SegmentResponse {
  status: 'success' | 'error';
  model_used: string;
  model_display_name: string;
  image_size: { width: number; height: number };
  mask_encoding: { class_mask: string; binary_mask: string };
  class_mapping: Record<string, string>;
  timings: { inference_ms: number };
  damage_metrics: Record<string, any>;
  class_mask_url: string;
  binary_mask_url: string;
  overlay_url: string;
  error?: string;
}

export interface DepthParams {
  image?: File | Blob;
  sample_id?: string;
}

export interface DepthResponse {
  status: 'success' | 'error';
  model: string;
  depth_type: 'relative';
  units: null;
  calibrated: false;
  image_size: { width: number; height: number };
  timings: { inference_ms: number };
  depth_map_url: string;
  note: string;
  error?: string;
}

export interface AnalyzeParams {
  image?: File | Blob;
  sample_id?: string;
  model?: string;
  use_recommended?: boolean;
}

export interface AnalyzeResponse {
  status: 'success' | 'error';
  model_used: string;
  model_display_name: string;
  recommended_model: string;
  recommendation_reason: string;
  overlay_url: string;
  overlay_base64?: string;
  depth_status: 'success' | 'error';
  depth_error?: string;
  depth_url?: string | null;
  depth_model?: string | null;
  damage_metrics: any;
  retrieved_protocols: Array<{
    citation_tag: string;
    source_doc: string;
    section: string;
    similarity_score: number;
    snippet: string;
  }>;
  sitrep_report: any;
  markdown_report: string;
  timings: {
    cv_inference_ms: number;
    depth_inference_ms: number;
    rag_retrieval_ms: number;
    llm_synthesis_ms: number;
    total_latency_ms: number;
  };
  error?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url?: string;
  preferred_theme?: 'dark' | 'light' | 'system';
  created_at: string;
}

export interface ChatThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  location_tag?: string;
  severity?: 'LOW' | 'MODERATE' | 'CRITICAL';
  preview_text?: string;
}

// Local Storage Keys
const TOKEN_KEY = 'floodsense_auth_token';
const USER_KEY = 'floodsense_current_user';
const CHATS_KEY = 'floodsense_saved_chats';

export class ApiService {
  public baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  private async postMultipart<T>(endpoint: string, formData: FormData): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      body: formData,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        payload && typeof payload === 'object' && 'error' in payload
          ? String(payload.error)
          : response.statusText;
      throw new Error(`Backend request failed (${response.status}): ${detail}`);
    }
    return payload as T;
  }

  private resolveBackendUrl(path: string): string {
    return /^https?:\/\//i.test(path)
      ? path
      : new URL(path, `${this.baseUrl}/`).toString();
  }

  private getAuthHeader(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // Generic Request Helper
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data: T | null; error: string | null; isDemoFallback?: boolean }> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeader(),
      ...(options.headers as Record<string, string> || {}),
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return { data: null, error: `HTTP ${response.status}: ${errorText || response.statusText}` };
      }

      const json = await response.json();
      return { data: json as T, error: null };
    } catch (err: any) {
      return {
        data: null,
        error: err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'Network error'),
        isDemoFallback: true
      };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ── CORE BACKEND API ENDPOINTS (http://localhost:5050) ──────────────────
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/status — check backend status.
   */
  async getStatus(): Promise<BackendStatus> {
    const res = await this.request<BackendStatus>('/api/status');
    if (res.data) return res.data;
    throw new Error(res.error || 'Could not read backend status.');
  }

  /**
   * GET /api/models — list available models.
   */
  async getModels(): Promise<ModelInfo[]> {
    const res = await this.request<{ models: ModelInfo[] }>('/api/models');
    if (res.data?.models) return res.data.models;
    throw new Error(res.error || 'Could not read available models.');
  }

  /**
   * GET /api/samples — get sample images.
   */
  async getSamples(): Promise<SampleItem[]> {
    const res = await this.request<{ samples: SampleItem[] }>('/api/samples');
    if (res.data?.samples) {
      return res.data.samples.map(s => ({
        ...s,
        image_url: this.resolveBackendUrl(s.image_url),
        mask_url: this.resolveBackendUrl(s.mask_url),
      }));
    }
    throw new Error(res.error || 'Could not read backend samples.');
  }

  /**
   * POST /api/segment — segmentation. Send multipart image OR sample_id; optional model=segformer|classical|sam.
   */
  async segment(params: SegmentParams): Promise<SegmentResponse> {
    if (!params.image && !params.sample_id) {
      throw new Error('Choose an image or a FloodNet sample before segmenting.');
    }
    const formData = new FormData();
    if (params.image) formData.append('image', params.image);
    if (params.sample_id) formData.append('sample_id', params.sample_id);
    if (params.model) formData.append('model', params.model);

    const result = await this.postMultipart<SegmentResponse>('/api/segment', formData);
    result.overlay_url = this.resolveBackendUrl(result.overlay_url);
    result.class_mask_url = this.resolveBackendUrl(result.class_mask_url);
    result.binary_mask_url = this.resolveBackendUrl(result.binary_mask_url);
    return result;
  }

  /**
   * POST /api/depth — relative depth. Send multipart image OR sample_id.
   */
  async depth(params: DepthParams): Promise<DepthResponse> {
    if (!params.image && !params.sample_id) {
      throw new Error('Choose an image or a FloodNet sample before estimating depth.');
    }
    const formData = new FormData();
    if (params.image) formData.append('image', params.image);
    if (params.sample_id) formData.append('sample_id', params.sample_id);

    const result = await this.postMultipart<DepthResponse>('/api/depth', formData);
    result.depth_map_url = this.resolveBackendUrl(result.depth_map_url);
    return result;
  }

  /**
   * POST /api/analyze — legacy combined analysis/report.
   */
  async analyze(params: AnalyzeParams): Promise<AnalyzeResponse> {
    if (!params.image && !params.sample_id) {
      throw new Error('Choose an image or a FloodNet sample before running analysis.');
    }
    const formData = new FormData();
    if (params.image) formData.append('image', params.image);
    if (params.sample_id) formData.append('sample_id', params.sample_id);
    if (params.model) formData.append('model', params.model);
    if (params.use_recommended !== undefined) {
      formData.append('use_recommended', String(params.use_recommended));
    }

    const result = await this.postMultipart<AnalyzeResponse>('/api/analyze', formData);
    result.overlay_url = this.resolveBackendUrl(result.overlay_url);
    if (result.depth_url) {
      result.depth_url = this.resolveBackendUrl(result.depth_url);
    }
    return result;
  }

  /**
   * GET /api/overlay/<filename> — fetch a generated mask/depth image URL.
   */
  getOverlayUrl(filenameOrPath: string): string {
    if (!filenameOrPath) return '';
    if (filenameOrPath.startsWith('http://') || filenameOrPath.startsWith('https://') || filenameOrPath.startsWith('data:')) {
      return filenameOrPath;
    }
    const clean = filenameOrPath.replace(/^\/+/, '');
    if (clean.startsWith('api/overlay/')) {
      return `${this.baseUrl}/${clean}`;
    }
    if (clean.startsWith('overlay_') || clean.startsWith('segment_') || clean.startsWith('depth_')) {
      return this.resolveBackendUrl(filenameOrPath);
    }
    if (clean.startsWith('samples/')) {
      return `/${clean}`;
    }
    return `${this.baseUrl}/api/overlay/${clean}`;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ── AUTHENTICATION & SESSION PERSISTENCE ────────────────────────────────
  // ═════════════════════════════════════════════════════════════════════════

  async signup(data: { name: string; email: string; password: string }): Promise<{ user: User; token: string }> {
    const res = await this.request<{ user: User; token: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.data) {
      this.saveSession(res.data.user, res.data.token);
      return res.data;
    }

    const mockUser: User = {
      id: `usr-${Date.now().toString().slice(-6)}`,
      name: data.name,
      email: data.email,
      role: 'Emergency Response Analyst',
      created_at: new Date().toISOString(),
      preferred_theme: 'dark',
    };
    const mockToken = `tok_demo_${Date.now()}`;
    this.saveSession(mockUser, mockToken);
    return { user: mockUser, token: mockToken };
  }

  async login(data: { email: string; password: string }): Promise<{ user: User; token: string }> {
    const res = await this.request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.data) {
      this.saveSession(res.data.user, res.data.token);
      return res.data;
    }

    const mockUser: User = {
      id: 'usr-analyst-01',
      name: data.email.split('@')[0].toUpperCase(),
      email: data.email,
      role: 'Sector Commander',
      created_at: new Date().toISOString(),
      preferred_theme: 'dark',
    };
    const mockToken = `tok_demo_${Date.now()}`;
    this.saveSession(mockUser, mockToken);
    return { user: mockUser, token: mockToken };
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'POST' });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }

  async getCurrentUser(): Promise<User | null> {
    const res = await this.request<User>('/auth/me');
    if (res.data) return res.data;

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(USER_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  saveSession(user: User, token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ── CHAT THREADS & PREFERENCES ──────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════════════

  async getChats(): Promise<ChatThread[]> {
    const res = await this.request<ChatThread[]>('/chats');
    if (res.data) return res.data;

    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(CHATS_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }

    return [
      {
        id: 't-kochi-01',
        title: 'Sector 10169 — Marine Drive Canal Breach',
        created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        updated_at: new Date().toISOString(),
        location_tag: 'Kochi Marine Drive',
        severity: 'CRITICAL',
        preview_text: 'Water level reached +1.8m, submerging 16 residential units.',
      },
      {
        id: 't-silchar-03',
        title: 'Sector 10815 — North Embankment Inflow',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
        location_tag: 'Silchar River Basin',
        severity: 'CRITICAL',
        preview_text: 'Arterial bridge submerged past vehicle wading thresholds.',
      },
      {
        id: 't-guwahati-04',
        title: 'Sector 6423 — Western Highway Overpass',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        location_tag: 'Guwahati NH-27',
        severity: 'MODERATE',
        preview_text: 'Evacuation route via Western Ridge confirmed clear.',
      },
    ];
  }

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const res = await this.request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return {
      success: true,
      message: res.data?.message || `Password reset link dispatched to ${email}.`,
    };
  }

  async createChat(options: string | { title?: string; location_tag?: string; severity?: any } = 'New Flood Inspection'): Promise<ChatThread> {
    const title = typeof options === 'string' ? options : (options.title || 'New Flood Inspection');
    const location_tag = typeof options === 'object' && options.location_tag ? options.location_tag : 'Sector Coordinates Pending';
    const severity = typeof options === 'object' && options.severity ? options.severity : 'MODERATE';

    const newChat: ChatThread = {
      id: `t-${Date.now().toString().slice(-6)}`,
      title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      location_tag,
      severity,
    };

    const res = await this.request<ChatThread>('/chats', {
      method: 'POST',
      body: JSON.stringify(newChat),
    });

    if (res.data) return res.data;

    if (typeof window !== 'undefined') {
      const current = await this.getChats();
      const updated = [newChat, ...current];
      localStorage.setItem(CHATS_KEY, JSON.stringify(updated));
    }
    return newChat;
  }

  async deleteChat(chatId: string): Promise<boolean> {
    await this.request(`/chats/${chatId}`, { method: 'DELETE' });
    if (typeof window !== 'undefined') {
      const current = await this.getChats();
      const filtered = current.filter(c => c.id !== chatId);
      localStorage.setItem(CHATS_KEY, JSON.stringify(filtered));
    }
    return true;
  }

  async updatePreferences(prefs: Record<string, any>): Promise<void> {
    await this.request('/users/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    });

    if (typeof window !== 'undefined') {
      const user = await this.getCurrentUser();
      if (user) {
        const updated = { ...user, ...prefs };
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
      }
      if (prefs.preferred_theme) {
        localStorage.setItem('floodsense_theme', prefs.preferred_theme);
      }
    }
  }
}

export const api = new ApiService(BACKEND_URL);
