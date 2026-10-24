'use client';

import React, { useState, useRef, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  UploadCloud,
  Send,
  Paperclip,
  Download,
  X,
  Crosshair,
  ArrowRight,
  ShieldAlert,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  Activity,
  Image as ImageIcon
} from 'lucide-react';
import { MaskViewer } from '../../../../components/MaskViewer';
import { SitrepStream } from '../../../../components/SitrepStream';
import { DamageTable } from '../../../../components/DamageTable';
import { CitationDrawer } from '../../../../components/CitationDrawer';
import { ChatMessage, CitationClause, DamageStats, RegionContext } from '../../../../lib/types';
import { api, type DamageMetrics } from '../../../../lib/api';
import {
  FLOODNET_SAMPLES,
  loadFloodNetSampleImage,
  type FloodNetSampleId,
} from '../../../../lib/floodnet-samples';
import { exportSitrep } from '../../../../lib/sitrep-export';
import type { PassabilityMetrics, SafeCorridorResult } from '../../../../lib/passability';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

const FLOODNET_CLASSES = [
  { name: 'background', color: '#000000' },
  { name: 'building-flooded', color: '#ff0000' },
  { name: 'building-non-flooded', color: '#b47878' },
  { name: 'road-flooded', color: '#a09614' },
  { name: 'road-non-flooded', color: '#8c8c8c' },
  { name: 'water', color: '#0284C7' },
  { name: 'tree', color: '#0052ff' },
  { name: 'vehicle', color: '#ff00f5' },
  { name: 'pool', color: '#ffeb00' },
  { name: 'grass', displayName: 'Grass -> Water', color: '#0284C7' },
];

function mapDamageStats(metrics: DamageMetrics): DamageStats {
  const summary = metrics.damage_summary || {};
  const buildings = metrics.buildings || {};
  const roads = metrics.roads || {};
  const distribution = metrics.class_pixel_distribution_pct || {};
  const totalAreaPixels = Number(summary.total_flood_area_px) || 0;
  const floodCoverage = Number(summary.flood_coverage_pct) || 0;
  const severityScore = (Number(summary.damage_severity_score) || 0) / 10;
  const severityLabel = String(summary.severity_label || '').toUpperCase();
  const severityLevel =
    severityLabel === 'CRITICAL' || severityLabel === 'SEVERE'
      ? 'CRITICAL'
      : severityLabel === 'MODERATE'
      ? 'MODERATE'
      : 'LOW';

  return {
    severity_score: severityScore,
    severity_level: severityLevel,
    total_inundated_area_m2: null,
    total_inundated_pixels: totalAreaPixels,
    flood_coverage_pct: floodCoverage,
    flooded_buildings_count: Number(buildings.flooded_building_count) || 0,
    safe_buildings_count: Number(buildings.non_flooded_building_count) || 0,
    flooded_roads_km: null,
    flooded_roads_coverage_pct: Number(roads.flooded_road_coverage_pct) || 0,
    safe_roads_km: null,
    flood_depth_estimated_m: null,
    classes: FLOODNET_CLASSES.map((floodClass, id) => {
      const pixelCount = metrics.class_pixel_counts?.[floodClass.name] ??
        Math.round(((Number(distribution[floodClass.name]) || 0) / 100) * 512 * 512);
      return {
        id,
        name: (floodClass.displayName || floodClass.name)
          .replaceAll('-', ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase()),
        color: floodClass.color,
        pixel_count: pixelCount,
        area_m2: null,
        percentage: (pixelCount / (512 * 512)) * 100,
        is_flooded: [1, 3, 5, 8, 9].includes(id),
      };
    }),
  };
}

export default function ChatPage({ params }: ChatPageProps) {
  const resolvedParams = use(params);
  const threadId = resolvedParams.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSampleId = searchParams.get('sample_id');
  const isFloodNetSampleId = (value: string | null | undefined): value is FloodNetSampleId =>
    typeof value === 'string' && Object.hasOwn(FLOODNET_SAMPLES, value);

  const [currentThread, setCurrentThread] = useState<{
    id: string;
    title: string;
    location_tag: string;
    severity?: 'LOW' | 'MODERATE' | 'CRITICAL' | 'CATASTROPHIC';
  }>({
    id: threadId,
    title: 'Flood image analysis',
    location_tag: 'Location not provided',
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachedRegion, setAttachedRegion] = useState<RegionContext | null>(null);
  const [activeCitation, setActiveCitation] = useState<CitationClause | null>(null);
  const [activeSector, setActiveSector] = useState<'10169' | '10815' | '6423'>('10169');
  const [exportError, setExportError] = useState<string | null>(null);
  const [publishedMessageIds, setPublishedMessageIds] = useState<Set<string>>(new Set());
  const [pendingAnalysisMessage, setPendingAnalysisMessage] = useState<ChatMessage | null>(null);
  const [pendingSampleId, setPendingSampleId] = useState<'10169' | '10815' | '6423' | null>(null);
  const [passabilityActiveMessages, setPassabilityActiveMessages] = useState<Record<string, boolean>>({});
  const [passabilityMetricsMap, setPassabilityMetricsMap] = useState<Record<string, PassabilityMetrics>>({});
  const [safeCorridorResults, setSafeCorridorResults] = useState<Record<string, SafeCorridorResult | null>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const SECTOR_SCENARIOS = [
    FLOODNET_SAMPLES['10169'],
    FLOODNET_SAMPLES['10815'],
    FLOODNET_SAMPLES['6423'],
  ];

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  useEffect(() => {
    let active = true;
    const loadThread = async () => {
      try {
        const [thread, savedMessages] = await Promise.all([
          api.getChat(threadId),
          api.getChatMessages(threadId),
        ]);
        if (!active) return;
        if (!thread) {
          const created = await api.createChat({
            title: 'Flood image analysis',
            location_tag: 'Location not provided',
          });
          router.replace(`/app/chat/${created.id}`);
          return;
        }
        setCurrentThread({
          id: thread.id,
          title: thread.title,
          location_tag: thread.location_tag || 'Location not provided',
          severity: thread.severity,
        });
        setMessages(savedMessages);
        if (
          savedMessages.length === 0 &&
          isFloodNetSampleId(requestedSampleId)
        ) {
          setPendingSampleId(requestedSampleId);
          return;
        }
        const lastMessage = savedMessages[savedMessages.length - 1];
        const lastUserMessage = [...savedMessages]
          .reverse()
          .find((message) => message.role === 'user');
        if (lastUserMessage) {
          const sampleMatch = lastUserMessage.raw_image_url?.match(/\/samples\/(10169|10815|6423)\./);
          if (sampleMatch) setActiveSector(sampleMatch[1] as '10169' | '10815' | '6423');

          let restoredFile: File | undefined;
          if (lastUserMessage.raw_image_storage_path) {
            restoredFile = await api.downloadChatImage(lastUserMessage.raw_image_storage_path);
          } else if (sampleMatch) {
            restoredFile = await loadFloodNetSampleImage(sampleMatch[1] as FloodNetSampleId);
          }
          if (!active) return;

          const hydratedLastUserMessage = restoredFile
            ? { ...lastUserMessage, image_file: restoredFile }
            : lastUserMessage;
          if (restoredFile) {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === lastUserMessage.id
                  ? hydratedLastUserMessage
                  : message,
              ),
            );
          }
          if (lastMessage?.id === lastUserMessage.id) {
            if (restoredFile) {
              setSelectedFile(restoredFile);
              setSelectedImage(lastUserMessage.raw_image_url || null);
              setSelectedFileName(restoredFile.name);
            }
            setPendingAnalysisMessage(hydratedLastUserMessage);
          }
        }
      } catch (error) {
        if (active) {
          setValidationError(error instanceof Error ? error.message : 'Could not load this conversation.');
        }
      }
    };
    void loadThread();
    return () => {
      active = false;
    };
  }, [threadId, router, requestedSampleId]);

  const handleImageFile = (file: File) => {
    setValidationError(null);
    const validFormats = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validFormats.includes(file.type)) {
      setValidationError('Invalid file format. Please upload JPEG, PNG, or WebP images.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setValidationError('File size exceeds 20MB limit. Please upload an optimized aerial capture.');
      return;
    }

    const url = URL.createObjectURL(file);
    setSelectedImage(url);
    setSelectedFile(file);
    setSelectedFileName(file.name);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleSelectSector = (secId: '10169' | '10815' | '6423') => {
    setActiveSector(secId);
    const sec = SECTOR_SCENARIOS.find((s) => s.id === secId)!;
    setSelectedImage(null);
    setSelectedFile(null);
    setSelectedFileName(null);
    void submitPrompt(`Analyze ${sec.title}`, null, secId);
  };

  const submitPrompt = async (
    customText?: string,
    imageFile: File | null = selectedFile,
    sampleId?: string,
    imagePreview: string | null = selectedImage,
    existingUserMessage?: ChatMessage,
  ) => {
    const textToSend = customText !== undefined ? customText : inputText;
    if (!textToSend.trim() && !imagePreview) return;
    setValidationError(null);

    const previousImageMessage = [...messages]
      .reverse()
      .find((message) =>
        message.role === 'user' &&
        (message.image_file || message.raw_image_storage_path || message.raw_image_url),
      );
    const sourceImageFile = imageFile || (!sampleId ? previousImageMessage?.image_file : null);
    const sourceImageUrl =
      imagePreview ||
      (sampleId
        ? SECTOR_SCENARIOS.find((sector) => sector.id === sampleId)?.image
        : previousImageMessage?.raw_image_url);
    const sourceSampleMatch = sourceImageUrl?.match(/\/samples\/(10169|10815|6423)\./);
    const sourceSampleId = isFloodNetSampleId(sampleId)
      ? sampleId
      : sourceSampleMatch && isFloodNetSampleId(sourceSampleMatch[1])
        ? sourceSampleMatch[1]
        : undefined;
    const analysisImage = sourceImageFile ||
      (sourceSampleId ? await loadFloodNetSampleImage(sourceSampleId) : undefined);
    if (!analysisImage) {
      setValidationError('Upload an image or choose a sample before starting image analysis.');
      return;
    }

    const userMsg: ChatMessage = existingUserMessage
      ? { ...existingUserMessage, image_file: analysisImage }
      : {
          id: `msg-${Date.now()}`,
          thread_id: threadId,
          role: 'user',
          content: textToSend || 'Initiating automated UAV sensor pass analysis.',
          raw_image_url: imageFile
            ? imagePreview || sourceImageUrl
            : !sampleId
              ? previousImageMessage?.raw_image_storage_path || sourceImageUrl || undefined
              : sourceImageUrl || undefined,
          image_file: imageFile || undefined,
          region_context: attachedRegion || undefined,
          created_at: new Date().toISOString(),
        };

    setInputText('');
    setSelectedImage(null);
    setSelectedFile(null);
    setSelectedFileName(null);
    setAttachedRegion(null);
    setIsProcessing(true);

    try {
      const savedUserMessage = existingUserMessage
        ? userMsg
        : await api.saveChatMessage(userMsg);
      const displayUserMessage = {
        ...savedUserMessage,
        image_file: analysisImage,
      };
      setMessages((previous) =>
        existingUserMessage
          ? previous.map((message) => message.id === userMsg.id ? displayUserMessage : message)
          : [...previous, displayUserMessage],
      );
      const analysis = await api.analyze({
        image: analysisImage,
        model: 'segformer',
        use_recommended: false,
        question: textToSend.trim() || undefined,
      });
      const citations: CitationClause[] = (analysis.retrieved_protocols || []).map((item) => ({
        id: item.citation_tag.replace(/^\[+|\]+$/g, ''),
        document: item.source_doc,
        clause: item.section,
        excerpt: item.snippet,
        relevance: item.similarity_score,
      }));
      const assistantMsg: ChatMessage = {
        id: `msg-resp-${Date.now()}`,
        thread_id: threadId,
        role: 'assistant',
        content: analysis.markdown_report || 'The backend returned no situation report.',
        raw_image_url: savedUserMessage.raw_image_storage_path || savedUserMessage.raw_image_url,
        mask_image_url: analysis.overlay_url,
        damage_stats: mapDamageStats(analysis.damage_metrics),
        citations,
        created_at: new Date().toISOString(),
      };
      const savedAssistantMessage = await api.saveChatMessage(assistantMsg);
      setMessages((prev) => [...prev, savedAssistantMessage]);
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : 'Backend analysis failed.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!pendingAnalysisMessage) return;
    if (pendingAnalysisMessage.raw_image_storage_path && !selectedFile) return;
    const pending = pendingAnalysisMessage;
    setPendingAnalysisMessage(null);
    void submitPrompt(
      pending.content,
      selectedFile,
      undefined,
      pending.raw_image_url || null,
      pending,
    );
  }, [pendingAnalysisMessage, selectedFile]);

  useEffect(() => {
    if (!pendingSampleId) return;
    const sample = SECTOR_SCENARIOS.find((sector) => sector.id === pendingSampleId);
    if (!sample) return;
    setPendingSampleId(null);
    setActiveSector(pendingSampleId);
    void submitPrompt(`Analyze ${sample.title}`, null, sample.id, null);
  }, [pendingSampleId]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    submitPrompt();
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePublishReport = async (message: ChatMessage) => {
    try {
      await api.publishReport(
        message.id,
        currentThread.title,
        currentThread.location_tag,
      );
      setPublishedMessageIds((previous) => new Set(previous).add(message.id));
      setValidationError(null);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Could not publish this report.');
    }
  };

  const handleExportReport = async (content: string | undefined, format: 'pdf' | 'docx') => {
    if (!content) {
      setExportError('Run an analysis first to generate a report for export.');
      return;
    }
    setExportError(null);
    try {
      await exportSitrep(content, format);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : `Could not export ${format.toUpperCase()} report.`);
    }
  };

  useEffect(() => {
    const handleExportEvent = (event: Event) => {
      const format = (event as CustomEvent<{ format?: 'pdf' | 'docx' }>).detail?.format;
      if (format === 'pdf' || format === 'docx') {
        const latestReport = [...messages].reverse().find((message) => message.role === 'assistant');
        void handleExportReport(latestReport?.content, format);
      }
    };
    window.addEventListener('floodsense:export-sitrep', handleExportEvent);
    return () => window.removeEventListener('floodsense:export-sitrep', handleExportEvent);
  }, [messages]);

  const handleRegenerate = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      void submitPrompt(
        lastUserMsg.content,
        lastUserMsg.image_file || null,
        undefined,
        lastUserMsg.raw_image_url || null,
        lastUserMsg,
      );
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 flex flex-col h-full overflow-hidden bg-white font-sans relative text-slate-800"
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-xs border-2 border-dashed border-cyan-600 flex flex-col items-center justify-center p-6 text-center space-y-2 pointer-events-none">
          <UploadCloud className="w-12 h-12 text-cyan-600 animate-bounce" />
          <div className="text-base font-bold font-sans text-slate-900">
            Drop Aerial Imagery Here
          </div>
          <div className="text-xs font-mono text-slate-500">
            Supports JPEG, PNG, WebP (up to 20MB)
          </div>
        </div>
      )}

      {/* ────────────────────────── TITLEBAR ────────────────────────── */}
      <div className="relative z-10 h-13 px-4 sm:px-6 border-b border-slate-200 bg-white flex items-center justify-between shrink-0 font-mono text-xs">
        <div className="flex items-center space-x-3 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 shrink-0" />
          <h2 className="font-semibold text-slate-900 text-xs truncate max-w-xs sm:max-w-md font-sans">
            {currentThread.title}
          </h2>
          <span className="text-slate-300 hidden sm:inline-block">&bull;</span>
          <span className="text-slate-500 text-[11px] hidden md:inline-block truncate">
            {currentThread.location_tag}
          </span>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          <Link
            href="/app/3d"
            className="flex items-center space-x-1 px-2.5 py-1 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-800 rounded-lg text-[11px] transition-colors font-medium"
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">3D Twin</span>
          </Link>

          <button
            onClick={() => {
              const latestReport = [...messages].reverse().find((message) => message.role === 'assistant');
              void handleExportReport(latestReport?.content, 'pdf');
            }}
            className="flex items-center space-x-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-[11px] text-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden md:inline">Export PDF</span>
          </button>
        </div>
      </div>

      {/* ────────────────── PASS SELECTOR ────────────────── */}
      <div className="relative z-10 px-4 sm:px-6 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-mono overflow-x-auto gap-3">
        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
            Flight Passes:
          </span>
          {SECTOR_SCENARIOS.map((sec) => (
            <button
              key={sec.id}
              onClick={() => handleSelectSector(sec.id)}
              className={`px-3 py-1 text-[11px] rounded-lg transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer border ${
                activeSector === sec.id
                  ? 'bg-white border-cyan-500 text-cyan-900 font-semibold shadow-2xs'
                  : 'bg-white/60 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-white'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  activeSector === sec.id ? 'bg-cyan-600' : 'bg-slate-400'
                }`}
              />
              <span>{sec.title}</span>
            </button>
          ))}
        </div>
        <div className="text-[10px] text-slate-500 hidden lg:flex items-center space-x-2 shrink-0">
          <span>10-Class Semantic Segmentation Active</span>
        </div>
      </div>

      {exportError && (
        <div role="alert" className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:mx-8">
          {exportError}
          <button type="button" onClick={() => setExportError(null)} className="ml-3 font-semibold underline">Dismiss</button>
        </div>
      )}

      {/* ────────────────── MESSAGE STREAM ────────────────── */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-8 bg-white">
        {messages.map((msg) => {
          const sourceImageMessage = msg.role === 'assistant'
            ? [...messages].reverse().find((message) =>
                message.role === 'user' &&
                (message.raw_image_storage_path === msg.raw_image_url ||
                  message.raw_image_url === msg.raw_image_url),
              )
            : undefined;
          return (
            <div key={msg.id} className="max-w-6xl mx-auto space-y-4">
            {/* User Message */}
            {msg.role === 'user' && (
              <div className="flex flex-col items-end space-y-1.5">
                <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-500">
                  <span>FIELD OPERATOR</span>
                  <span>&bull;</span>
                  <span>
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {msg.raw_image_url && (
                  <div className="w-72 aspect-video bg-slate-100 rounded-lg border border-slate-200 overflow-hidden shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={msg.raw_image_url}
                      alt="Uploaded capture"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {msg.region_context && (
                  <div className="px-2 py-1 bg-cyan-50 border border-cyan-200 rounded-md text-[10px] font-mono text-cyan-800 flex items-center space-x-1.5">
                    <Crosshair className="w-3 h-3 text-cyan-600" />
                    <span>
                      Zone: {msg.region_context.class_name} ({msg.region_context.coordinates.x}% X,{' '}
                      {msg.region_context.coordinates.y}% Y)
                    </span>
                  </div>
                )}

                <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-900 max-w-xl font-sans leading-relaxed shadow-2xs">
                  {msg.content}
                </div>
              </div>
            )}

            {/* Assistant Response */}
            {msg.role === 'assistant' && (
              <div className="space-y-5 pt-1">
                <div className="grid grid-cols-1 gap-6 items-start">
                  {/* Segmentation result */}
                  {msg.raw_image_url && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-xs">
                      <MaskViewer
                        rawImageUrl={msg.raw_image_url}
                        maskImageUrl={msg.mask_image_url}
                        sampleId={activeSector}
                        imageFile={msg.image_file || sourceImageMessage?.image_file}
                        classes={msg.damage_stats?.classes || []}
                        showPassability={passabilityActiveMessages[msg.id] ?? false}
                        onPassabilityChange={(metrics) => {
                          setPassabilityMetricsMap((prev) => ({ ...prev, [msg.id]: metrics }));
                        }}
                        safeCorridorActive={passabilityActiveMessages[msg.id] ?? false}
                        onSafeCorridorComputed={(corridor) => {
                          setSafeCorridorResults((prev) => ({ ...prev, [msg.id]: corridor }));
                          if (corridor) {
                            const bld = corridor.targetBuildingId ? `from ${corridor.targetBuildingId} ` : '';
                            setInputText(
                              `Evacuation corridor routed ${bld}(${corridor.lengthMeters}m to boundary): ${
                                corridor.isIsolated ? 'Obstruction detected, pathway isolated by floodwaters.' : 'Contiguous passable route identified.'
                              } Assess passability for high-clearance rescue vehicles.`
                            );
                          }
                        }}
                        onDamageMetricsChange={(metrics) => {
                          setMessages((previous) => previous.map((message) =>
                            message.id === msg.id
                              ? { ...message, damage_stats: mapDamageStats(metrics) }
                              : message,
                          ));
                        }}
                        onError={setValidationError}
                        onRegionSelect={(region) => {
                          setAttachedRegion(region);
                          setInputText(
                            `Evaluate flood depth and structural passability at this ${region.class_name} zone.`
                          );
                        }}
                      />
                    </div>
                  )}

                  {/* Right: SITREP Stream */}
                  <div>
                    <SitrepStream
                      content={msg.content}
                      citations={msg.citations}
                      proactiveNotes={msg.proactive_notes}
                      onCitationClick={(cite) => setActiveCitation(cite)}
                      onExportPDF={() => void handleExportReport(msg.content, 'pdf')}
                      onExportDOCX={() => void handleExportReport(msg.content, 'docx')}
                    />
                  </div>
                </div>

                {/* 10-Class Damage Distribution Table & Passability Analysis */}
                {msg.damage_stats && (
                  <div className="w-full">
                    <DamageTable
                      stats={msg.damage_stats}
                      passabilityMetrics={passabilityMetricsMap[msg.id]}
                      isPassabilityActive={passabilityActiveMessages[msg.id] ?? false}
                      onAssessPassability={() => {
                        setPassabilityActiveMessages((prev) => ({
                          ...prev,
                          [msg.id]: !prev[msg.id],
                        }));
                      }}
                    />
                  </div>
                )}

                {/* Action Bar: Copy & Regenerate */}
                <div className="flex items-center gap-3 pt-2 font-mono text-[11px] border-t border-slate-100">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => void handlePublishReport(msg)}
                      disabled={publishedMessageIds.has(msg.id)}
                      className="flex items-center space-x-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-600 transition-colors shadow-2xs disabled:opacity-50"
                      title="Publish this report to the community feed"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-cyan-700" />
                      <span>{publishedMessageIds.has(msg.id) ? 'Published' : 'Publish report'}</span>
                    </button>
                    <button
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="flex items-center space-x-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition-colors shadow-2xs"
                      title="Copy response text"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-medium">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleRegenerate}
                      disabled={isProcessing}
                      className="flex items-center space-x-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition-colors shadow-2xs disabled:opacity-50"
                      title="Regenerate SITREP assessment"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isProcessing ? 'animate-spin' : ''}`} />
                      <span>Regenerate</span>
                    </button>
                  </div>

                </div>
              </div>
            )}
            </div>
          );
        })}

        {isProcessing && (
          <div className="max-w-6xl mx-auto space-y-3 pt-2">
            <div className="flex items-center space-x-2 font-mono text-xs text-cyan-700">
              <span className="w-2 h-2 rounded-full bg-cyan-600 animate-pulse" />
              <span>Analyzing UAV imagery and computing inundation contours...</span>
            </div>
            <div className="w-full h-36 bg-slate-50 border border-slate-200 rounded-xl animate-pulse" />
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* ────────────────── CHAT COMPOSER ────────────────── */}
      <div className="relative z-10 p-4 bg-white border-t border-slate-200 space-y-2.5">
        <div className="max-w-5xl mx-auto space-y-2">
          {/* Quick Prompt Starter Pills */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-[11px] font-mono scrollbar-none">
            <button
              onClick={() => submitPrompt('Summarize the visible flood damage.')}
              className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg flex items-center space-x-1.5 transition-colors shrink-0"
            >
              <span>Summarize visible damage</span>
            </button>
          </div>

          {/* Validation Error Banner */}
          {validationError && (
            <div className="flex items-center justify-between p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-mono">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
              <button
                onClick={() => setValidationError(null)}
                className="text-red-600 hover:text-red-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Active Attachments Bar */}
          {(selectedImage || attachedRegion) && (
            <div className="flex items-center space-x-3 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono">
              {selectedImage && (
                <div className="flex items-center space-x-2 text-slate-800">
                  <img
                    src={selectedImage}
                    alt="Upload preview"
                    className="w-10 h-10 object-cover rounded border border-slate-200"
                  />
                  <div className="text-[11px]">
                    <div className="font-semibold text-cyan-800">Image Attached:</div>
                    <div className="text-slate-500 truncate max-w-xs">{selectedFileName || 'aerial_pass.jpg'}</div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedImage(null);
                      setSelectedFile(null);
                      setSelectedFileName(null);
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                    title="Remove attachment"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {attachedRegion && (
                <div className="flex items-center space-x-2 text-cyan-800">
                  <Crosshair className="w-3.5 h-3.5 text-cyan-600" />
                  <span>
                    Targeted: {attachedRegion.class_name} ({attachedRegion.coordinates.x}% X,{' '}
                    {attachedRegion.coordinates.y}% Y)
                  </span>
                  <button
                    onClick={() => setAttachedRegion(null)}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Form Composer */}
          <form
            onSubmit={handleSendMessage}
            className="flex items-end space-x-2 bg-slate-50 border border-slate-300 rounded-xl p-2 focus-within:border-cyan-600 focus-within:bg-white transition-colors"
          >
            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleImageFile(e.target.files[0]);
                }
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-slate-500 hover:text-cyan-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Upload aerial UAV drone imagery (.jpg, .png, .webp)"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <textarea
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask a question about your flood image... (e.g. 'What areas appear to be flooded?')"
              className="flex-1 bg-transparent text-xs text-slate-900 placeholder-slate-400 focus:outline-none resize-none py-1 font-sans leading-relaxed"
            />

            <button
              type="submit"
              disabled={isProcessing || (!inputText.trim() && !selectedImage)}
              className="p-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 rounded-lg text-white font-medium transition-colors shadow-xs"
              title="Send inspection query"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <div className="flex flex-col sm:flex-row justify-between items-center text-[10px] font-mono text-slate-400 px-1 gap-1">
            <span>Drag &amp; drop drone images directly into chat &bull; Click any mask region to query</span>
            <span>Enter to send &bull; Shift+Enter for newline</span>
          </div>
        </div>
      </div>

      <CitationDrawer
        citation={activeCitation}
        onClose={() => setActiveCitation(null)}
      />
    </div>
  );
}
