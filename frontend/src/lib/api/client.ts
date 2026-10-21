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

import { getSupabaseClient } from '../supabase';
import type { ChatMessage, PublishedReport, RegionContext } from '../types';

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
  region?: string;
  prefs?: ProfileRow['prefs'];
  avatar_url?: string;
  preferred_theme?: 'dark' | 'light' | 'system';
  created_at: string;
}

export interface ChatThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  user_id?: string;
  location_tag?: string;
  severity?: 'LOW' | 'MODERATE' | 'CRITICAL' | 'CATASTROPHIC';
  preview_text?: string;
}

export interface GalleryItem {
  id: string;
  thread_id: string;
  title: string;
  location: string;
  coordinates: string;
  date: string;
  severity_score: number;
  severity_level: 'LOW' | 'MODERATE' | 'CRITICAL' | 'CATASTROPHIC';
  inundated_area_m2: number;
  raw_url: string;
}

interface ProfileRow {
  id: string;
  name: string;
  role: string;
  region: string | null;
  prefs: {
    unit?: 'metric' | 'imperial';
    tone?: 'concise_tactical' | 'comprehensive_analytical' | 'public_bulletin';
    daylight_mode?: boolean;
  };
  created_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  raw_image_url: string | null;
  mask_image_url: string | null;
  damage_stats: ChatMessage['damage_stats'] | null;
  citations: ChatMessage['citations'] | null;
  region_context: RegionContext | null;
  proactive_notes: string[] | null;
  created_at: string;
}

export class ApiService {
  public baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  private async requireUser() {
    const { data, error } = await getSupabaseClient().auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('Sign in to access FloodSense data.');
    return data.user;
  }

  private mapProfile(
    profile: ProfileRow | null,
    authUser: {
      id: string;
      email?: string;
      created_at?: string;
      user_metadata?: Record<string, unknown>;
    },
  ): User {
    const metadataName = authUser.user_metadata?.name;
    return {
      id: authUser.id,
      name:
        profile?.name ||
        (typeof metadataName === 'string'
          ? metadataName
          : authUser.email?.split('@')[0] || 'Operator'),
      email: authUser.email || '',
      role: profile?.role || 'responder',
      region: profile?.region || 'South Asia Riverine Basin',
      prefs: profile?.prefs || {},
      preferred_theme: profile?.prefs?.daylight_mode ? 'light' : 'dark',
      created_at: profile?.created_at || authUser.created_at || new Date().toISOString(),
    };
  }

  private async readProfile(authUser: {
    id: string;
    email?: string;
    created_at?: string;
    user_metadata?: Record<string, unknown>;
  }): Promise<User> {
    const { data, error } = await getSupabaseClient()
      .from('profiles')
      .select('id,name,role,region,prefs,created_at')
      .eq('id', authUser.id)
      .maybeSingle();
    if (error) throw error;
    return this.mapProfile(data as ProfileRow | null, authUser);
  }

  private async resolveStorageUrl(path: string | null): Promise<string | undefined> {
    if (!path) return undefined;
    if (/^(https?:|data:|blob:|\/)/i.test(path)) return path;
    if (!this.isFloodImageStoragePath(path)) return path;

    const { data, error } = await getSupabaseClient()
      .storage.from('flood-imagery')
      .createSignedUrl(path, 60 * 60);
    if (error) throw error;
    return data.signedUrl;
  }

  private isFloodImageStoragePath(path: string | null): path is string {
    return Boolean(path && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\//i.test(path));
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

  // Generic Request Helper
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data: T | null; error: string | null; isDemoFallback?: boolean }> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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

  async signup(data: { name: string; email: string; password: string }): Promise<{
    user: User;
    requiresEmailConfirmation: boolean;
  }> {
    const { data: result, error } = await getSupabaseClient().auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { name: data.name.trim() } },
    });
    if (error) throw error;
    if (!result.user) throw new Error('Supabase did not return a user after sign-up.');

    const user = this.mapProfile(null, result.user);
    return { user, requiresEmailConfirmation: !result.session };
  }

  async login(data: { email: string; password: string }): Promise<User> {
    const { data: result, error } = await getSupabaseClient().auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) throw error;
    if (!result.user) throw new Error('Supabase did not return a user after sign-in.');
    return this.readProfile(result.user);
  }

  async logout(): Promise<void> {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw error;
  }

  async getCurrentUser(): Promise<User | null> {
    const { data, error } = await getSupabaseClient().auth.getUser();
    if (error) throw error;
    if (!data.user) return null;
    return this.readProfile(data.user);
  }

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    return { success: true, message: `Password reset instructions were sent to ${email}.` };
  }

  async updatePassword(password: string, currentPassword?: string): Promise<void> {
    if (currentPassword) {
      const { data, error: userError } = await getSupabaseClient().auth.getUser();
      if (userError) throw userError;
      const email = data.user?.email;
      if (!email) throw new Error('Could not verify the signed-in account.');

      const { error: signInError } = await getSupabaseClient().auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInError) throw signInError;
    }
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    if (error) throw error;
  }

  async updatePreferences(prefs: Record<string, unknown>): Promise<void> {
    const user = await this.requireUser();
    const updates: Partial<ProfileRow> = {};
    if (typeof prefs.displayName === 'string') updates.name = prefs.displayName.trim();
    if (typeof prefs.role === 'string') updates.role = prefs.role;
    if (typeof prefs.region === 'string') updates.region = prefs.region;
    if (prefs.unit || prefs.tone || prefs.theme) {
      const { data, error } = await getSupabaseClient()
        .from('profiles')
        .select('prefs')
        .eq('id', user.id)
        .single();
      if (error) throw error;

      const savedPrefs = (data.prefs || {}) as ProfileRow['prefs'];
      updates.prefs = {
        ...savedPrefs,
        ...(prefs.unit ? { unit: prefs.unit as ProfileRow['prefs']['unit'] } : {}),
        ...(prefs.tone ? { tone: prefs.tone as ProfileRow['prefs']['tone'] } : {}),
        ...(prefs.theme
          ? { daylight_mode: prefs.theme === 'light' }
          : {}),
      };
    }

    if (!Object.keys(updates).length) return;
    const { error } = await getSupabaseClient()
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) throw error;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ── CHAT THREADS & PREFERENCES ──────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════════════

  async getChats(): Promise<ChatThread[]> {
    const user = await this.requireUser();
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('chat_threads')
      .select('id,user_id,title,location_tag,severity,created_at,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) throw error;

    const threads = data || [];
    if (!threads.length) return [];
    const { data: messages, error: messageError } = await client
      .from('chat_messages')
      .select('thread_id,content')
      .in('thread_id', threads.map((thread) => thread.id))
      .order('created_at', { ascending: false });
    if (messageError) throw messageError;

    const previews = new Map<string, string>();
    for (const message of messages || []) {
      if (!previews.has(message.thread_id)) previews.set(message.thread_id, message.content);
    }

    return threads.map((thread) => ({
      ...thread,
      severity: thread.severity || 'LOW',
      preview_text: previews.get(thread.id),
    }));
  }

  async getChat(chatId: string): Promise<ChatThread | null> {
    const user = await this.requireUser();
    const { data, error } = await getSupabaseClient()
      .from('chat_threads')
      .select('id,user_id,title,location_tag,severity,created_at,updated_at')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data ? { ...data, severity: data.severity || 'LOW' } : null;
  }

  async createChat(options: string | {
    title?: string;
    location_tag?: string;
    severity?: ChatThread['severity'];
  } = 'New Flood Inspection'): Promise<ChatThread> {
    const user = await this.requireUser();
    const title = typeof options === 'string' ? options : options.title || 'New Flood Inspection';
    const locationTag =
      typeof options === 'string' ? undefined : options.location_tag;
    const severity = typeof options === 'string' ? 'LOW' : options.severity || 'LOW';
    const { data, error } = await getSupabaseClient()
      .from('chat_threads')
      .insert({
        user_id: user.id,
        title,
        location_tag: locationTag || null,
        severity,
      })
      .select('id,user_id,title,location_tag,severity,created_at,updated_at')
      .single();
    if (error) throw error;
    return data;
  }

  async deleteChat(chatId: string): Promise<boolean> {
    const user = await this.requireUser();
    const client = getSupabaseClient();
    const { data: messages, error: messageError } = await client
      .from('chat_messages')
      .select('raw_image_url,mask_image_url')
      .eq('thread_id', chatId);
    if (messageError) throw messageError;

    const imagePaths = (messages || [])
      .flatMap((message) => [message.raw_image_url, message.mask_image_url])
      .filter((path): path is string => Boolean(path) && !/^(https?:|data:|blob:|\/)/i.test(path!))
      .filter((path) => path.startsWith(`${user.id}/`));
    if (imagePaths.length) {
      const { error: storageError } = await client.storage.from('flood-imagery').remove(imagePaths);
      if (storageError) throw storageError;
    }

    const { error } = await client
      .from('chat_threads')
      .delete()
      .eq('id', chatId)
      .eq('user_id', user.id);
    if (error) throw error;
    return true;
  }

  async deleteAllChats(): Promise<void> {
    const user = await this.requireUser();
    const { data: threads, error: listError } = await getSupabaseClient()
      .from('chat_threads')
      .select('id')
      .eq('user_id', user.id);
    if (listError) throw listError;

    for (const thread of threads || []) {
      await this.deleteChat(thread.id);
    }
  }

  async getChatMessages(threadId: string): Promise<ChatMessage[]> {
    await this.requireUser();
    const { data, error } = await getSupabaseClient()
      .from('chat_messages')
      .select('id,thread_id,role,content,raw_image_url,mask_image_url,damage_stats,citations,region_context,proactive_notes,created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    return Promise.all(
      ((data || []) as MessageRow[]).map(async (message) => ({
        ...message,
        damage_stats: message.damage_stats || undefined,
        citations: message.citations || undefined,
        region_context: message.region_context || undefined,
        proactive_notes: message.proactive_notes || undefined,
        raw_image_storage_path: this.isFloodImageStoragePath(message.raw_image_url)
          ? message.raw_image_url
          : undefined,
        raw_image_url: await this.resolveStorageUrl(message.raw_image_url),
        mask_image_url: await this.resolveStorageUrl(message.mask_image_url || null),
      })),
    );
  }

  async saveChatMessage(message: ChatMessage): Promise<ChatMessage> {
    const user = await this.requireUser();
    const client = getSupabaseClient();
    const uploadedPaths: string[] = [];
    let rawImagePath = message.raw_image_url || null;
    let maskImagePath = message.mask_image_url || null;
    let messageInserted = false;

    try {
      if (message.image_file) {
        const safeName = message.image_file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        rawImagePath = `${user.id}/${message.thread_id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await client.storage
          .from('flood-imagery')
          .upload(rawImagePath, message.image_file, {
            contentType: message.image_file.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        uploadedPaths.push(rawImagePath);
      }

      if (
        maskImagePath &&
        /^https?:\/\//i.test(maskImagePath) &&
        !this.isFloodImageStoragePath(maskImagePath)
      ) {
        const response = await fetch(maskImagePath);
        if (!response.ok) {
          throw new Error(`Could not retrieve the generated segmentation mask (${response.status}).`);
        }
        const maskBlob = await response.blob();
        const extension =
          maskBlob.type === 'image/jpeg'
            ? 'jpg'
            : maskBlob.type === 'image/webp'
              ? 'webp'
              : 'png';
        maskImagePath = `${user.id}/${message.thread_id}/${crypto.randomUUID()}-mask.${extension}`;
        const { error: uploadError } = await client.storage
          .from('flood-imagery')
          .upload(maskImagePath, maskBlob, {
            contentType: maskBlob.type || 'image/png',
            upsert: false,
          });
        if (uploadError) throw uploadError;
        uploadedPaths.push(maskImagePath);
      }

      const { data, error } = await client
        .from('chat_messages')
        .insert({
          thread_id: message.thread_id,
          role: message.role,
          content: message.content,
          raw_image_url: rawImagePath,
          mask_image_url: maskImagePath,
          damage_stats: message.damage_stats || null,
          citations: message.citations || null,
          region_context: message.region_context || null,
          proactive_notes: message.proactive_notes || null,
        })
        .select('id,thread_id,role,content,raw_image_url,mask_image_url,damage_stats,citations,region_context,proactive_notes,created_at')
        .single();
      if (error) throw error;
      messageInserted = true;

      const saved = data as MessageRow;
      return {
        ...saved,
        damage_stats: saved.damage_stats || undefined,
        citations: saved.citations || undefined,
        region_context: saved.region_context || undefined,
        proactive_notes: saved.proactive_notes || undefined,
        raw_image_storage_path: this.isFloodImageStoragePath(saved.raw_image_url)
          ? saved.raw_image_url
          : undefined,
        raw_image_url: await this.resolveStorageUrl(saved.raw_image_url),
        mask_image_url: await this.resolveStorageUrl(saved.mask_image_url),
      };
    } catch (error) {
      if (uploadedPaths.length && !messageInserted) {
        const { error: cleanupError } = await client.storage
          .from('flood-imagery')
          .remove(uploadedPaths);
        if (cleanupError) {
          const originalMessage =
            error instanceof Error ? error.message : 'Could not save the chat message.';
          throw new Error(`${originalMessage} Uploaded image cleanup failed: ${cleanupError.message}`);
        }
      }
      throw error;
    }
  }

  async downloadChatImage(storagePath: string): Promise<File> {
    await this.requireUser();
    const { data, error } = await getSupabaseClient()
      .storage.from('flood-imagery')
      .download(storagePath);
    if (error) throw error;
    const fileName = storagePath.split('/').at(-1) || 'flood-image';
    return new File([data], fileName, { type: data.type || 'application/octet-stream' });
  }

  async getGalleryItems(): Promise<GalleryItem[]> {
    await this.requireUser();
    const { data, error } = await getSupabaseClient()
      .from('chat_messages')
      .select('id,thread_id,raw_image_url,damage_stats,created_at,chat_threads!inner(title,location_tag,severity)')
      .eq('role', 'assistant')
      .not('raw_image_url', 'is', null)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return Promise.all(
      (data || []).map(async (row) => {
        const thread = row.chat_threads as unknown as {
          title: string;
          location_tag: string | null;
          severity: GalleryItem['severity_level'];
        };
        const stats = (row.damage_stats || {}) as {
          severity_score?: number;
          severity_level?: GalleryItem['severity_level'];
          total_inundated_area_m2?: number;
        };
        return {
          id: row.id,
          thread_id: row.thread_id,
          title: thread.title,
          location: thread.location_tag || 'Location not specified',
          coordinates: 'Not provided',
          date: new Date(row.created_at).toLocaleDateString(),
          severity_score: Number(stats.severity_score) || 0,
          severity_level: stats.severity_level || thread.severity || 'LOW',
          inundated_area_m2: Number(stats.total_inundated_area_m2) || 0,
          raw_url: (await this.resolveStorageUrl(row.raw_image_url)) || '',
        };
      }),
    );
  }

  async publishReport(messageId: string, title: string, location: string): Promise<void> {
    const user = await this.requireUser();
    const client = getSupabaseClient();
    const { data: existing, error: existingError } = await client
      .from('published_reports')
      .select('id')
      .eq('message_id', messageId)
      .eq('author_id', user.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return;

    const { data: message, error: messageError } = await client
      .from('chat_messages')
      .select('thread_id,content,raw_image_url,mask_image_url,damage_stats')
      .eq('id', messageId)
      .single();
    if (messageError) throw messageError;

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profileError) throw profileError;

    const stats = (message.damage_stats || {}) as {
      severity_score?: number;
      severity_level?: string;
    };
    const { error } = await client.from('published_reports').insert({
      message_id: messageId,
      author_id: user.id,
      title,
      location,
      author_role: profile.role,
      severity_score: Number(stats.severity_score) || 0,
      severity_level: stats.severity_level || 'LOW',
      raw_image_url: message.raw_image_url,
      mask_image_url: message.mask_image_url,
      summary: message.content,
    });
    if (error) throw error;
  }

  async getPublishedReports(): Promise<PublishedReport[]> {
    await this.requireUser();
    const { data, error } = await getSupabaseClient()
      .from('published_reports')
      .select('id,message_id,title,location,author_role,severity_score,severity_level,raw_image_url,mask_image_url,summary,created_at,upvotes')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return Promise.all(
      (data || []).map(async (report) => ({
        ...report,
        raw_image_url: (await this.resolveStorageUrl(report.raw_image_url)) || '',
        mask_image_url:
          (await this.resolveStorageUrl(report.mask_image_url)) || '',
      })),
    );
  }

  async upvotePublishedReport(reportId: string): Promise<number> {
    const { data, error } = await getSupabaseClient().rpc(
      'increment_published_report_upvotes',
      { report_id: reportId },
    );
    if (error) throw error;
    return Number(data);
  }
}

export const api = new ApiService(BACKEND_URL);
