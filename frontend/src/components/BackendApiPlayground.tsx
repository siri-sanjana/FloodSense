'use client';

import React, { useState, useEffect } from 'react';
import {
  Server,
  Cpu,
  Layers,
  Activity,
  Split,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Upload,
  Image as ImageIcon,
  ExternalLink,
  Zap,
  Clock,
  Compass,
  ArrowRight
} from 'lucide-react';
import {
  api,
  BACKEND_URL,
  BackendStatus,
  ModelInfo,
  SampleItem,
  SegmentResponse,
  DepthResponse,
  AnalyzeResponse
} from '../lib/api';

export const BackendApiPlayground: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'status' | 'models' | 'samples' | 'segment' | 'depth' | 'analyze'>('status');

  // Status State
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [pingMs, setPingMs] = useState<number | null>(null);

  // Models State
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Samples State
  const [samples, setSamples] = useState<SampleItem[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(false);

  // Segment State
  const [selectedSampleId, setSelectedSampleId] = useState<string>('10169');
  const [selectedModel, setSelectedModel] = useState<string>('segformer');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [segmentResult, setSegmentResult] = useState<SegmentResponse | null>(null);
  const [segmentLoading, setSegmentLoading] = useState(false);

  // Depth State
  const [depthResult, setDepthResult] = useState<DepthResponse | null>(null);
  const [depthLoading, setDepthLoading] = useState(false);

  // Analyze State
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Load status, models, samples on mount
  useEffect(() => {
    fetchStatus();
    fetchModels();
    fetchSamples();
  }, []);

  const fetchStatus = async () => {
    setStatusLoading(true);
    const t0 = performance.now();
    try {
      const res = await api.getStatus();
      setStatus(res);
      setPingMs(Math.round(performance.now() - t0));
      setApiError(null);
    } catch (error) {
      setStatus(null);
      setApiError(error instanceof Error ? error.message : 'Backend is unavailable.');
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchModels = async () => {
    setModelsLoading(true);
    try {
      const res = await api.getModels();
      setModels(res);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Could not load backend models.');
    } finally {
      setModelsLoading(false);
    }
  };

  const fetchSamples = async () => {
    setSamplesLoading(true);
    try {
      const res = await api.getSamples();
      setSamples(res);
      if (res.length > 0 && !selectedSampleId) {
        setSelectedSampleId(res[0].id);
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Could not load backend samples.');
    } finally {
      setSamplesLoading(false);
    }
  };

  const handleRunSegment = async () => {
    setSegmentLoading(true);
    setSegmentResult(null);
    setApiError(null);
    try {
      const res = await api.segment({
        image: uploadedFile || undefined,
        sample_id: uploadedFile ? undefined : selectedSampleId,
        model: selectedModel as any,
      });
      setSegmentResult(res);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Segmentation request failed.');
    } finally {
      setSegmentLoading(false);
    }
  };

  const handleRunDepth = async () => {
    setDepthLoading(true);
    setDepthResult(null);
    setApiError(null);
    try {
      const res = await api.depth({
        image: uploadedFile || undefined,
        sample_id: uploadedFile ? undefined : selectedSampleId,
      });
      setDepthResult(res);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Depth request failed.');
    } finally {
      setDepthLoading(false);
    }
  };

  const handleRunAnalyze = async () => {
    setAnalyzeLoading(true);
    setAnalyzeResult(null);
    setApiError(null);
    try {
      const res = await api.analyze({
        image: uploadedFile || undefined,
        sample_id: uploadedFile ? undefined : selectedSampleId,
        model: selectedModel,
        use_recommended: true,
      });
      setAnalyzeResult(res);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Analysis request failed.');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden font-mono text-xs select-none">
      {/* ── TOP HEADER: BASE URL & CONNECTION STATUS ── */}
      <div className="flex flex-wrap items-center justify-between px-5 py-4 bg-slate-50 border-b border-slate-200 gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-900 font-sans text-sm">FloodSense Backend API</span>
              <span className={`px-2 py-0.5 border text-[10px] font-semibold rounded ${
                status?.status === 'online'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {statusLoading && !status ? 'CHECKING' : status?.status?.toUpperCase() || 'OFFLINE'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center space-x-2">
              <span>Base URL:</span>
              <code className="text-cyan-800 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                {BACKEND_URL}
              </code>
              {pingMs !== null && (
                <span className="text-slate-400">({pingMs}ms ping)</span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => { fetchStatus(); fetchModels(); fetchSamples(); }}
          className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg flex items-center space-x-1.5 transition-colors shadow-2xs"
          title="Refresh Backend Status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
          <span>Ping Status</span>
        </button>
      </div>

      {/* ── ENDPOINT TABS ── */}
      <div className="flex items-center space-x-1 px-4 py-2 bg-white border-b border-slate-200 overflow-x-auto text-[11px]">
        {[
          { id: 'status', label: 'GET /api/status', icon: Activity },
          { id: 'models', label: 'GET /api/models', icon: Cpu },
          { id: 'samples', label: 'GET /api/samples', icon: ImageIcon },
          { id: 'segment', label: 'POST /api/segment', icon: Split },
          { id: 'depth', label: 'POST /api/depth', icon: Layers },
          { id: 'analyze', label: 'POST /api/analyze', icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all shrink-0 border ${
                isActive
                  ? 'bg-slate-900 border-slate-900 text-white font-bold shadow-xs'
                  : 'bg-white border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5 text-cyan-400" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="p-5 space-y-4">
        {apiError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700" role="alert">
            {apiError}
          </div>
        )}
        {/* TAB 1: GET /api/status */}
        {activeTab === 'status' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-900 text-xs">System Health &amp; Model Availability</span>
              <span className="text-[10px] text-slate-500">Method: GET &bull; Response: JSON</span>
            </div>

            {status ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase">Status</span>
                  <div className="flex items-center space-x-1.5 text-emerald-600 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{status.status.toUpperCase()}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase">Version</span>
                  <div className="text-slate-900 font-bold text-sm">v{status.version}</div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase">Deployment Mode</span>
                  <div className="text-cyan-800 font-bold text-sm">{status.deployment_mode || 'vector_db'}</div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase">RAG Chunks Indexed</span>
                  <div className="text-slate-900 font-bold text-sm">{status.vector_store_chunks ?? 0} Protocol Sections</div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400">
                {statusLoading ? 'Checking backend status...' : 'Backend status unavailable.'}
              </div>
            )}

            <div className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] overflow-x-auto">
              <pre>{JSON.stringify(status, null, 2)}</pre>
            </div>
          </div>
        )}

        {/* TAB 2: GET /api/models */}
        {activeTab === 'models' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-900 text-xs">Available Benchmarked Computer Vision Models</span>
              <span className="text-[10px] text-slate-500">Method: GET &bull; Count: {models.length}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {models.map((m) => (
                <div
                  key={m.id}
                  className={`p-4 rounded-xl border space-y-2.5 transition-all ${
                    m.recommended
                      ? 'bg-cyan-50/40 border-cyan-300 shadow-xs'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 font-sans text-xs">{m.name}</span>
                    {m.recommended && (
                      <span className="px-2 py-0.5 bg-cyan-600 text-white text-[9px] font-bold rounded">
                        RECOMMENDED
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
                    {m.description}
                  </p>
                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      mIoU: <strong className="text-slate-900">
                        {m.mIoU == null ? 'Not measured' : `${(m.mIoU * 100).toFixed(1)}%`}
                      </strong>
                    </span>
                    <span className="text-slate-500">
                      Latency: <strong className="text-cyan-800">{m.latency_ms == null ? 'Not measured' : `${m.latency_ms}ms`}</strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: GET /api/samples */}
        {activeTab === 'samples' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-900 text-xs">Pre-Indexed Aerial Flood UAV Samples</span>
              <span className="text-[10px] text-slate-500">Method: GET &bull; Count: {samples.length}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {samples.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setSelectedSampleId(s.id); setUploadedFile(null); }}
                  className={`p-3 bg-white border rounded-xl space-y-2 cursor-pointer transition-all hover:border-cyan-500 ${
                    selectedSampleId === s.id ? 'border-cyan-600 ring-2 ring-cyan-100 shadow-xs' : 'border-slate-200'
                  }`}
                >
                  <div className="aspect-[16/10] bg-slate-100 rounded-lg overflow-hidden border border-slate-200 relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.image_url} alt={s.id} className="w-full h-full object-cover" />
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-slate-900/80 text-white text-[9px] rounded font-mono">
                      Sector {s.id}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-slate-900">Sample {s.id}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSampleId(s.id);
                        setActiveTab('segment');
                      }}
                      className="text-cyan-700 hover:text-cyan-900 font-semibold"
                    >
                      Run Segment &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: POST /api/segment */}
        {activeTab === 'segment' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-900 text-xs">Run Live Multi-Class Semantic Segmentation</span>
              <span className="text-[10px] text-slate-500">POST /api/segment &bull; multipart image OR sample_id</span>
            </div>

            {/* Input Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-semibold mb-1">Select Sample</label>
                <select
                  value={selectedSampleId}
                  onChange={(e) => { setSelectedSampleId(e.target.value); setUploadedFile(null); }}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {samples.map((s) => (
                    <option key={s.id} value={s.id}>Sector {s.id} ({s.image_file})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-semibold mb-1">Model Selection</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="segformer">OneFormer / SegFormer (Transformer)</option>
                  <option value="classical">Classical CV (HSV + LAB Thresholding)</option>
                  <option value="sam">SAM (Segment Anything Model)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-semibold mb-1">Or Upload Drone Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadedFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:bg-cyan-50 file:text-cyan-700"
                />
              </div>
            </div>

            <button
              onClick={handleRunSegment}
              disabled={segmentLoading}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-bold rounded-lg flex items-center space-x-2 transition-colors shadow-xs"
            >
              <Zap className={`w-3.5 h-3.5 ${segmentLoading ? 'animate-spin' : ''}`} />
              <span>{segmentLoading ? 'Inference Running...' : 'Execute POST /api/segment'}</span>
            </button>

            {/* Results Display */}
            {segmentResult && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-700 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Inference Succeeded &bull; Model: {segmentResult.model_display_name}</span>
                  </div>
                  <span className="text-cyan-800 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                    Latency: {segmentResult.timings.inference_ms}ms
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block mb-1">
                      Generated Overlay Mask (GET {segmentResult.overlay_url})
                    </span>
                    <div className="aspect-[16/10] bg-black rounded-lg overflow-hidden border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={api.getOverlayUrl(segmentResult.overlay_url)}
                        alt="Segmentation Overlay"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 text-[11px]">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block mb-1">Damage Extraction Metrics</span>
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Damage Severity:</span>
                        <strong className="text-red-600">
                          {segmentResult.damage_metrics?.damage_summary?.severity_label} image-class proxy ({segmentResult.damage_metrics?.damage_summary?.damage_severity_score} / 100)
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Flooded Buildings:</span>
                        <strong className="text-slate-900">
                          {segmentResult.damage_metrics?.buildings?.flooded_building_count} of {segmentResult.damage_metrics?.buildings?.total_building_count} units
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Flooded Road Coverage:</span>
                        <strong className="text-slate-900">
                          {segmentResult.damage_metrics?.roads?.flooded_road_coverage_pct}%
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Inundation Area:</span>
                        <strong className="text-cyan-800">
                          {segmentResult.damage_metrics?.damage_summary?.total_flood_area_px?.toLocaleString()} flood-class pixels
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: POST /api/depth */}
        {activeTab === 'depth' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-900 text-xs">Relative Scene Depth Estimation</span>
              <span className="text-[10px] text-slate-500">POST /api/depth &bull; multipart image OR sample_id</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-semibold mb-1">Select Sample</label>
                <select
                  value={selectedSampleId}
                  onChange={(e) => { setSelectedSampleId(e.target.value); setUploadedFile(null); }}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {samples.map((s) => (
                    <option key={s.id} value={s.id}>Sector {s.id} ({s.image_file})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-semibold mb-1">Or Upload Custom Aerial Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadedFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:bg-cyan-50 file:text-cyan-700"
                />
              </div>
            </div>

            <button
              onClick={handleRunDepth}
              disabled={depthLoading}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-bold rounded-lg flex items-center space-x-2 transition-colors shadow-xs"
            >
              <Zap className={`w-3.5 h-3.5 ${depthLoading ? 'animate-spin' : ''}`} />
              <span>{depthLoading ? 'Computing Depth Map...' : 'Execute POST /api/depth'}</span>
            </button>

            {depthResult && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-700 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Relative Scene Depth Extracted</span>
                  </div>
                  <span className="text-cyan-800 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                    Latency: {depthResult.timings.inference_ms}ms
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block mb-1">
                      Relative Scene Depth Map (Thermal Palette)
                    </span>
                    <div className="aspect-[16/10] bg-black rounded-lg overflow-hidden border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={api.getOverlayUrl(depthResult.depth_map_url)}
                        alt="Depth Map"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-white rounded-lg border border-slate-200 space-y-2 text-[11px]">
                    <div className="text-xs font-bold text-slate-900 pb-1 border-b border-slate-100">
                      {depthResult.model} — relative depth only
                    </div>
                    <p className="text-slate-600">
                      This estimates relative camera-to-surface depth across the whole image. It does not estimate floodwater depth; that requires terrain elevation and a measured water level.
                    </p>
                    <p className="pt-2 text-[10px] text-slate-500 leading-relaxed">
                      {depthResult.note}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: POST /api/analyze */}
        {activeTab === 'analyze' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-900 text-xs">End-to-End Multimodal SITREP Pipeline</span>
              <span className="text-[10px] text-slate-500">POST /api/analyze &bull; CV + RAG + LLM Report</span>
            </div>

            <button
              onClick={handleRunAnalyze}
              disabled={analyzeLoading}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-lg flex items-center space-x-2 transition-colors shadow-xs"
            >
              <Zap className={`w-3.5 h-3.5 ${analyzeLoading ? 'animate-spin' : ''}`} />
              <span>{analyzeLoading ? 'Synthesizing Multimodal Report...' : 'Execute POST /api/analyze'}</span>
            </button>

            {analyzeResult && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-900">Recommended Model: {analyzeResult.recommended_model}</span>
                  <span className="text-slate-500">Total Pipeline: {analyzeResult.timings?.total_latency_ms}ms</span>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs font-sans leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {analyzeResult.markdown_report}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
