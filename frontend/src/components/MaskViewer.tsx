import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Sliders, Split, Maximize2, Crosshair, Zap, Compass, BatteryCharging, Radio, Layers, Navigation, Route } from 'lucide-react';
import { RegionContext, SegmentationClass } from '../lib/types';
import { api, type DamageMetrics } from '../lib/api';
import {
  analyzeRoadPassability,
  createSyntheticRoadGrid,
  extractRoadGridFromImage,
  findShortestPassableCorridor,
  getRoadVectorOverlays,
  type PassabilityMetrics,
  type RoadGridData,
  type SafeCorridorResult,
} from '../lib/passability';

interface MaskViewerProps {
  rawImageUrl?: string;
  imageUrl?: string;
  maskImageUrl?: string;
  maskUrl?: string;
  sampleId?: string;
  imageFile?: File;
  classes?: SegmentationClass[];
  damageMetrics?: DamageMetrics;
  onDamageMetricsChange?: (metrics: DamageMetrics) => void;
  isScanning?: boolean;
  onRegionSelect?: (region: RegionContext) => void;
  onError?: (message: string) => void;
  showPassability?: boolean;
  onPassabilityChange?: (metrics: PassabilityMetrics) => void;
  safeCorridorActive?: boolean;
  onSafeCorridorComputed?: (result: SafeCorridorResult | null) => void;
}

interface StructuralCentroid {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  flooded: boolean;
}

export const MaskViewer: React.FC<MaskViewerProps> = ({
  rawImageUrl,
  imageUrl,
  maskImageUrl,
  maskUrl,
  sampleId = '10169',
  imageFile,
  classes = [],
  damageMetrics,
  onDamageMetricsChange,
  isScanning = false,
  onRegionSelect,
  onError,
  showPassability = false,
  onPassabilityChange,
  safeCorridorActive = false,
  onSafeCorridorComputed,
}) => {
  const finalRawUrl = rawImageUrl || imageUrl || '/samples/10169.jpg';
  const initialMaskUrl = maskImageUrl || maskUrl || '/samples/10169_mask.png';

  const [opacity, setOpacity] = useState<number>(85);
  const [viewMode, setViewMode] = useState<'blend' | 'swipe' | 'loupe'>('swipe');
  const [filterMode, setFilterMode] = useState<'normal' | 'thermal' | 'nightvision'>('normal');
  const [activeLayer, setActiveLayer] = useState<'segment' | 'depth'>('segment');
  const [selectedModel, setSelectedModel] = useState<'segformer' | 'classical' | 'sam'>('segformer');
  const [showHud, setShowHud] = useState<boolean>(true);
  const [activeDamageMetrics, setActiveDamageMetrics] = useState<DamageMetrics | undefined>(damageMetrics);

  const [liveOverlayUrl, setLiveOverlayUrl] = useState<string>(initialMaskUrl);
  const [isInferring, setIsInferring] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [splitPos, setSplitPos] = useState<number>(50);
  const [selectedPin, setSelectedPin] = useState<{ x: number; y: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [pixelPos, setPixelPos] = useState<{ x: number; y: number }>({ x: 300, y: 200 });
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [isDraggingDivider, setIsDraggingDivider] = useState<boolean>(false);
  const pointerStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasDraggedRef = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dynamic photogrammetric ground distance covered by scale bar (meters)
  const scaleMeters = 50 / zoomLevel;

  // Road network passability analyzer state
  const [isPassabilityActive, setIsPassabilityActive] = useState<boolean>(showPassability);
  const [isSafeCorridorMode, setIsSafeCorridorMode] = useState<boolean>(safeCorridorActive);
  const [activeSafeCorridor, setActiveSafeCorridor] = useState<SafeCorridorResult | null>(null);
  const [roadGrid, setRoadGrid] = useState<RoadGridData>(() =>
    createSyntheticRoadGrid(128, 85, sampleId === '10169' ? 0.62 : 0.72)
  );
  const [passabilityMetrics, setPassabilityMetrics] = useState<PassabilityMetrics>(() =>
    analyzeRoadPassability(createSyntheticRoadGrid(128, 85, sampleId === '10169' ? 0.62 : 0.72))
  );

  const vectorOverlays = useMemo(() => getRoadVectorOverlays(sampleId), [sampleId]);

  useEffect(() => {
    setIsPassabilityActive(showPassability);
  }, [showPassability]);

  useEffect(() => {
    setIsSafeCorridorMode(safeCorridorActive);
  }, [safeCorridorActive]);

  // Analyze road grid whenever liveOverlayUrl or sampleId changes
  useEffect(() => {
    if (typeof window !== 'undefined' && liveOverlayUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const grid = extractRoadGridFromImage(img, 128, 85);
        setRoadGrid(grid);
        const metrics = analyzeRoadPassability(grid);
        setPassabilityMetrics(metrics);
        onPassabilityChange?.(metrics);
      };
      img.onerror = () => {
        const grid = createSyntheticRoadGrid(128, 85, sampleId === '10169' ? 0.62 : 0.72);
        setRoadGrid(grid);
        const metrics = analyzeRoadPassability(grid);
        setPassabilityMetrics(metrics);
        onPassabilityChange?.(metrics);
      };
      img.src = liveOverlayUrl;
    }
  }, [liveOverlayUrl, sampleId]);

  // Sync damageMetrics prop if it updates externally
  useEffect(() => {
    if (damageMetrics) {
      setActiveDamageMetrics(damageMetrics);
    }
  }, [damageMetrics]);

  // Derived engineering structural centroids for feature callout
  const detectedStructures = useMemo<StructuralCentroid[]>(() => {
    if (sampleId === '10169') {
      return [
        { id: 'STR-101', x: 26, y: 31, w: 15, h: 13, flooded: true },
        { id: 'STR-102', x: 52, y: 20, w: 16, h: 14, flooded: true },
        { id: 'STR-103', x: 15, y: 64, w: 13, h: 11, flooded: false },
        { id: 'STR-104', x: 69, y: 54, w: 15, h: 13, flooded: true },
      ];
    }
    if (sampleId === '10815') {
      return [
        { id: 'STR-201', x: 33, y: 36, w: 16, h: 14, flooded: true },
        { id: 'STR-202', x: 67, y: 26, w: 14, h: 12, flooded: false },
        { id: 'STR-203', x: 18, y: 50, w: 15, h: 13, flooded: true },
        { id: 'STR-204', x: 49, y: 66, w: 16, h: 14, flooded: true },
      ];
    }
    // Dynamic fallback based on damage extraction metrics
    const floodedCount = activeDamageMetrics?.buildings?.flooded_building_count ?? 2;
    const nonFloodedCount = activeDamageMetrics?.buildings?.non_flooded_building_count ?? 1;
    const slots = [
      { x: 28, y: 32, w: 15, h: 13 },
      { x: 54, y: 22, w: 16, h: 14 },
      { x: 68, y: 56, w: 15, h: 13 },
      { x: 18, y: 62, w: 14, h: 12 },
    ];
    const items: StructuralCentroid[] = [];
    let counter = 101;
    for (let i = 0; i < floodedCount && i < slots.length; i++) {
      items.push({ id: `STR-${counter++}`, ...slots[i], flooded: true });
    }
    for (let i = floodedCount; i < floodedCount + nonFloodedCount && i < slots.length; i++) {
      items.push({ id: `STR-${counter++}`, ...slots[i], flooded: false });
    }
    return items;
  }, [sampleId, activeDamageMetrics]);

  // Update initial mask if prop changes
  useEffect(() => {
    if (activeLayer === 'segment') {
      setLiveOverlayUrl(maskImageUrl || maskUrl || '/samples/10169_mask.png');
    }
  }, [maskImageUrl, maskUrl, activeLayer]);

  // Execute live segmentation when model changes
  const runLiveSegmentation = async (model: 'segformer' | 'classical' | 'sam') => {
    setSelectedModel(model);
    setActiveLayer('segment');
    setIsInferring(true);
    try {
      const res = await api.segment({
        image: imageFile,
        sample_id: imageFile ? undefined : sampleId,
        model,
      });
      if (res.overlay_url) {
        setLiveOverlayUrl(api.getOverlayUrl(res.overlay_url));
      }
      setActiveDamageMetrics(res.damage_metrics);
      onDamageMetricsChange?.(res.damage_metrics);
      setLatencyMs(res.timings.inference_ms);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Segmentation request failed.');
    } finally {
      setIsInferring(false);
    }
  };

  // Execute live relative depth estimation
  const runLiveDepth = async () => {
    setIsInferring(true);
    setLatencyMs(null);
    try {
      const res = await api.depth({
        image: imageFile,
        sample_id: imageFile ? undefined : sampleId,
      });
      if (res.depth_map_url) {
        setLiveOverlayUrl(api.getOverlayUrl(res.depth_map_url));
      }
      setActiveLayer('depth');
      setLatencyMs(res.timings.inference_ms);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Depth request failed.');
    } finally {
      setIsInferring(false);
    }
  };

  // Track pointer coordinates for HUD, curtain split, and circular inspection loupe
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    hasDraggedRef.current = false;
    if (viewMode === 'swipe' && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
      if (Math.abs(xPercent - splitPos) < 8) {
        setIsDraggingDivider(true);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const xPercent = (px / rect.width) * 100;
    const yPercent = (py / rect.height) * 100;

    setPixelPos({ x: px, y: py });
    setMousePos({ x: xPercent, y: yPercent });
    setIsHovering(true);

    if (Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y) > 6) {
      hasDraggedRef.current = true;
    }

    if (viewMode === 'swipe' && (isDraggingDivider || (e.buttons === 1 && hasDraggedRef.current))) {
      setSplitPos(Math.min(95, Math.max(5, xPercent)));
    }
  };

  const handlePointerUp = () => {
    setIsDraggingDivider(false);
  };

  // Handle click on the image for "Ask the Image" (ignoring divider drags)
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (hasDraggedRef.current || isDraggingDivider) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Safe Evacuation Corridor Computation Mode
    if (isSafeCorridorMode) {
      // Find if clicked near an identified building centroid
      const clickedStructure = detectedStructures.find(
        (s) => Math.hypot(s.x + s.w / 2 - x, s.y + s.h / 2 - y) < 16
      );
      const startPt = clickedStructure
        ? { x: clickedStructure.x + clickedStructure.w / 2, y: clickedStructure.y + clickedStructure.h / 2 }
        : { x, y };

      const corridor = findShortestPassableCorridor(roadGrid, startPt, clickedStructure?.id);
      setActiveSafeCorridor(corridor);
      onSafeCorridorComputed?.(corridor);
      return;
    }

    setSelectedPin({ x, y });

    const matchedClass = classes.find(c => c.is_flooded) || classes[0] || {
      id: 1,
      name: 'Flooded Zone',
      color: '#DC2626',
      pixel_count: 0,
      area_m2: 0,
      percentage: 0,
      is_flooded: true,
    };

    if (onRegionSelect) {
      onRegionSelect({
        region_id: matchedClass.id,
        class_name: matchedClass.name,
        coordinates: { x: Math.round(x), y: Math.round(y), width: 10, height: 10 },
        note: `Targeted coordinates: ${x.toFixed(1)}% X, ${y.toFixed(1)}% Y [Class: ${matchedClass.name}]`,
      });
    }
  };

  return (
    <div className="flex flex-col w-full bg-slate-900 hairline-all border-slate-700 shadow-depth">
      {/* ────────────────── TOP HUD TELEMETRY BAR ────────────────── */}
      <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-900/95 hairline-b border-slate-800 text-[11px] font-mono gap-2 select-none">
        {/* Left: Drone live feed indicator & Active Inference Badge */}
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-slate-800 hairline-all border-slate-700 text-slate-300 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>IMAGE PREVIEW</span>
          </div>

          <span className="text-slate-300 font-semibold tracking-wide hidden sm:inline">IMAGE ANALYSIS</span>

          {latencyMs !== null && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 bg-cyan-950/80 border border-cyan-700 text-cyan-300 text-[10px] rounded">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>{latencyMs}ms ({activeLayer === 'depth' ? 'Scene depth' : selectedModel})</span>
            </div>
          )}
        </div>

        {/* Center/Right: CV Model & Depth Layer Selectors */}
        <div className="flex items-center space-x-2">
          {/* Layer Selector: Segment vs Depth */}
          <div className="flex items-center border border-slate-700 bg-slate-950 text-[10px] rounded overflow-hidden">
            <button
              onClick={() => runLiveSegmentation(selectedModel)}
              className={`px-2 py-0.5 transition-colors ${
                activeLayer === 'segment' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mask
            </button>
            <button
              onClick={runLiveDepth}
              className={`px-2 py-0.5 transition-colors ${
                activeLayer === 'depth' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Scene depth
            </button>
          </div>

          {/* Model Switcher for Segmentation */}
          {activeLayer === 'segment' && (
            <div className="hidden md:flex items-center border border-slate-700 bg-slate-950 text-[10px] rounded overflow-hidden">
              {(['segformer', 'classical', 'sam'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => runLiveSegmentation(m)}
                  disabled={isInferring}
                  className={`px-1.5 py-0.5 transition-colors capitalize ${
                    selectedModel === m ? 'bg-slate-700 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m === 'segformer' ? 'SegFormer' : m === 'classical' ? 'CV Edge' : 'SAM'}
                </button>
              ))}
            </div>
          )}

          {/* 3D Simulator Button */}
          <a
            href="/3d"
            className="px-2 py-0.5 bg-cyan-950/80 hover:bg-cyan-900 hairline-all border-cyan-700/80 text-cyan-300 text-[10px] flex items-center space-x-1 transition-all hover:scale-105 shrink-0"
            title="Launch 3D Simulator"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>3D SIMULATOR</span>
          </a>

          {/* Inspection HUD Toggle */}
          <button
            type="button"
            onClick={() => setShowHud(!showHud)}
            className={`px-2 py-0.5 border rounded flex items-center space-x-1 text-[10px] font-mono transition-colors ${
              showHud
                ? 'bg-slate-800 border-cyan-500 text-cyan-300 font-semibold'
                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle UAV Photogrammetry & Sensor Inspection HUD"
          >
            <Crosshair className="w-3 h-3 text-cyan-400" />
            <span>HUD</span>
          </button>

          {/* Road Network Passability Toggle */}
          <button
            type="button"
            onClick={() => setIsPassabilityActive(!isPassabilityActive)}
            className={`px-2 py-0.5 border rounded flex items-center space-x-1 text-[10px] font-mono transition-colors ${
              isPassabilityActive
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-semibold shadow-xs'
                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Road Network Passability Overlay"
          >
            <Route className="w-3 h-3 text-emerald-400" />
            <span className="hidden sm:inline">Passability</span>
          </button>

          {/* Safe Corridor Evacuation Mode Toggle */}
          {isPassabilityActive && (
            <button
              type="button"
              onClick={() => setIsSafeCorridorMode(!isSafeCorridorMode)}
              className={`px-2 py-0.5 border rounded flex items-center space-x-1 text-[10px] font-mono transition-colors ${
                isSafeCorridorMode
                  ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 font-semibold shadow-xs'
                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Identify Safe Evacuation Corridor: click building to route to boundary"
            >
              <Navigation className="w-3 h-3 text-cyan-400" />
              <span className="hidden sm:inline">Safe Corridor</span>
              {activeSafeCorridor && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
            </button>
          )}

          {/* Zoom toggle */}
          <div className="hidden sm:flex items-center hairline-all border-slate-700 bg-slate-950 text-[10px]">
            {[1, 2, 4].map((z) => (
              <button
                key={z}
                onClick={() => setZoomLevel(z)}
                className={`px-1.5 py-0.5 transition-colors ${
                  zoomLevel === z ? 'bg-slate-700 text-slate-100 font-bold' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {z}x
              </button>
            ))}
          </div>

          {/* Opacity slider for Alpha Blend */}
          {viewMode === 'blend' && (
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 text-[10px]">Alpha:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-14 h-1 bg-slate-700 appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-slate-300 text-[10px] w-6">{opacity}%</span>
            </div>
          )}

          {/* GIS Comparison View Mode Selector */}
          <div className="flex items-center border border-slate-700 bg-slate-950 text-[10px] rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('blend')}
              className={`px-2 py-0.5 transition-colors flex items-center space-x-1 ${
                viewMode === 'blend' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Alpha Blend: standard opacity slider"
            >
              <Sliders className="w-3 h-3" />
              <span>Alpha Blend</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('swipe')}
              className={`px-2 py-0.5 transition-colors flex items-center space-x-1 ${
                viewMode === 'swipe' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Curtain Swipe: horizontal comparative split"
            >
              <Split className="w-3 h-3" />
              <span>Curtain Swipe</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('loupe')}
              className={`px-2 py-0.5 transition-colors flex items-center space-x-1 ${
                viewMode === 'loupe' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Inspection Loupe: circular local reveal lens (Ø 240px)"
            >
              <Eye className="w-3 h-3" />
              <span>Inspection Loupe</span>
            </button>
          </div>
        </div>
      </div>

      {/* ────────────────── MAIN INTERACTIVE DRONE HUD ────────────────── */}
      <div
        ref={containerRef}
        onClick={handleImageClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerEnter={() => setIsHovering(true)}
        onPointerLeave={() => setIsHovering(false)}
        onPointerCancel={() => {
          setIsDraggingDivider(false);
          setIsHovering(false);
        }}
        style={{ touchAction: 'none' }}
        className="relative w-full aspect-[16/10] bg-black overflow-hidden cursor-crosshair select-none group touch-none"
      >
        {/* Layer 1: Raw Drone Image with Tactical Filters & Zoom */}
        <div
          className={`absolute inset-0 w-full h-full transition-all duration-300 ${
            filterMode === 'thermal' ? 'filter-thermal' : filterMode === 'nightvision' ? 'filter-nightvision' : ''
          }`}
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={finalRawUrl}
            alt="Raw Aerial UAV Telemetry"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Layer 2: Alpha Blend Mode (10-Class Segmentation / Relative Depth Overlay) */}
        {liveOverlayUrl && viewMode === 'blend' && (
          <div
            className="absolute inset-0 w-full h-full mix-blend-screen pointer-events-none transition-opacity duration-150"
            style={{
              opacity: opacity / 100,
              transform: `scale(${zoomLevel})`,
              transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={liveOverlayUrl}
              alt="Multi-Class Mask / Depth Map"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Layer 2b: Curtain Swipe Mode with clipPath for perfect 1:1 pixel alignment */}
        {liveOverlayUrl && viewMode === 'swipe' && (
          <div
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              clipPath: `polygon(${splitPos}% 0, 100% 0, 100% 100%, ${splitPos}% 100%)`,
              transform: `scale(${zoomLevel})`,
              transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={liveOverlayUrl}
              alt="Segmentation / Depth Map Overlay"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Layer 2c: Inspection Loupe Mode (Circular local reveal lens pinned to cursor) */}
        {liveOverlayUrl && viewMode === 'loupe' && (
          <div
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              clipPath: `circle(120px at ${pixelPos.x}px ${pixelPos.y}px)`,
            }}
          >
            <div
              className="w-full h-full"
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={liveOverlayUrl}
                alt="Inspection Loupe Local Reveal"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {/* Layer 3: Engineering Feature Centroid Highlighting (Scales with Zoom) */}
        {showHud && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
            }}
          >
            {detectedStructures.map((s) => (
              <div
                key={s.id}
                className={`absolute transition-all ${
                  s.flooded
                    ? 'border-[1.5px] border-amber-400/90 bg-amber-500/10'
                    : 'border-[1.5px] border-emerald-400/80 bg-emerald-500/10'
                }`}
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  width: `${s.w}%`,
                  height: `${s.h}%`,
                }}
              >
                {/* Minimalist engineering label chip */}
                <div
                  className={`absolute -top-4 left-0 px-1 py-0.2 text-[8px] font-mono tracking-tight uppercase whitespace-nowrap border ${
                    s.flooded
                      ? 'bg-slate-950/95 border-amber-500/80 text-amber-300'
                      : 'bg-slate-950/95 border-emerald-500/80 text-emerald-300'
                  }`}
                >
                  ID: {s.id} | {s.flooded ? 'Inundated' : 'Intact'}
                </div>

                {/* Precision centroid crosshair mark */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`w-1 h-1 rounded-full ${s.flooded ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  <span className={`absolute w-2.5 h-px ${s.flooded ? 'bg-amber-400/60' : 'bg-emerald-400/60'}`} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Layer 4: Topological Road Network Passability Vector Overlay (Scales with Zoom) */}
        {isPassabilityActive && (
          <div
            className="absolute inset-0 pointer-events-none z-12"
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
            }}
          >
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                {/* Inundated roadway amber/red hazard hatch pattern */}
                <pattern
                  id="inundation-hazard-hatch"
                  width="4"
                  height="4"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line x1="0" y1="0" x2="0" y2="4" stroke="#dc2626" strokeWidth="1.6" opacity="0.8" />
                  <line x1="2" y1="0" x2="2" y2="4" stroke="#f59e0b" strokeWidth="0.8" opacity="0.6" />
                </pattern>
              </defs>

              {/* 1. Inundated Road Segments (Hatched Amber/Red Obstructed Pattern) */}
              {vectorOverlays.inundatedPolygons.map((pts, i) => (
                <polygon
                  key={`inundated-${i}`}
                  points={pts}
                  fill="url(#inundation-hazard-hatch)"
                  stroke="#ef4444"
                  strokeWidth="0.8"
                  strokeDasharray="1.5 1.5"
                  opacity="0.9"
                />
              ))}

              {/* 2. Passable Road Corridors (Clean Solid Green Contour, stroke: 2px, opacity: 0.8) */}
              {vectorOverlays.passablePolylines.map((pts, i) => (
                <polyline
                  key={`passable-${i}`}
                  points={pts}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeOpacity="0.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* 3. Computed Safe Corridor Evacuation Polyline */}
              {activeSafeCorridor && activeSafeCorridor.path.length > 1 && (
                <>
                  <polyline
                    points={activeSafeCorridor.path.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="#0891b2"
                    strokeWidth="4"
                    strokeOpacity="0.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={activeSafeCorridor.path.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2.5"
                    strokeDasharray={activeSafeCorridor.isIsolated ? '2 2' : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}
            </svg>

            {/* Safe Corridor Start & Exit Waypoint Markers */}
            {activeSafeCorridor && (
              <>
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center"
                  style={{ left: `${activeSafeCorridor.start.x}%`, top: `${activeSafeCorridor.start.y}%` }}
                >
                  <div className="w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white shadow-lg flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                  </div>
                  <div className="mt-0.5 px-1.5 py-0.2 bg-slate-950/95 border border-cyan-400 text-[8px] font-mono text-cyan-300 rounded whitespace-nowrap shadow-md">
                    EVAC START: {activeSafeCorridor.targetBuildingId || 'ORIGIN'}
                  </div>
                </div>

                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center"
                  style={{ left: `${activeSafeCorridor.exit.x}%`, top: `${activeSafeCorridor.exit.y}%` }}
                >
                  <div className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg flex items-center justify-center ${activeSafeCorridor.isIsolated ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                  <div className={`mt-0.5 px-1.5 py-0.2 bg-slate-950/95 border text-[8px] font-mono rounded whitespace-nowrap shadow-md ${activeSafeCorridor.isIsolated ? 'border-amber-400 text-amber-300' : 'border-emerald-400 text-emerald-300'}`}>
                    {activeSafeCorridor.isIsolated ? 'FLOOD BLOCKED' : `SCENE BOUNDARY EXIT (${activeSafeCorridor.lengthMeters}m)`}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Road Network Passability HUD Card */}
        {isPassabilityActive && (
          <div className="absolute top-16 right-3 z-20 pointer-events-none bg-slate-950/90 backdrop-blur-xs border border-emerald-500/60 p-2.5 rounded shadow-lg text-[9px] font-mono text-slate-300 w-56 space-y-1">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800 text-[8px] uppercase tracking-wider font-semibold">
              <span className="flex items-center space-x-1 text-emerald-400">
                <Route className="w-2.5 h-2.5 text-emerald-400" />
                <span>Road Passability</span>
              </span>
              <span className={`px-1 py-0.2 rounded text-[7px] font-bold ${
                passabilityMetrics.status === 'OPTIMAL' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' :
                passabilityMetrics.status === 'MODERATE' ? 'bg-amber-950 text-amber-300 border border-amber-700' :
                'bg-red-950 text-red-300 border border-red-700'
              }`}>
                {passabilityMetrics.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[8px] pt-0.5">
              <span className="text-slate-500">PASSABILITY INDEX:</span>
              <span className="text-emerald-400 text-right font-bold">{passabilityMetrics.networkPassabilityIndex}%</span>
              <span className="text-slate-500">TOTAL ROAD:</span>
              <span className="text-slate-200 text-right">{passabilityMetrics.totalRoadPixels.toLocaleString()} px</span>
              <span className="text-slate-500">INUNDATED ROAD:</span>
              <span className="text-red-400 text-right">{passabilityMetrics.inundatedRoadPixels.toLocaleString()} px</span>
              <span className="text-slate-500">8-CONN CUTS:</span>
              <span className="text-amber-300 text-right font-semibold">{passabilityMetrics.disconnectedSegmentsCount} segments</span>
            </div>
            {isSafeCorridorMode && (
              <div className="pt-1 border-t border-slate-800 text-[8px] text-cyan-300 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>Click building to route exit corridor</span>
              </div>
            )}
          </div>
        )}

        {/* Scene depth disclaimer (stacked above scale bar when HUD active) */}
        {activeLayer === 'depth' && (
          <div
            className={`absolute z-20 max-w-[80%] rounded bg-slate-950/90 border border-slate-800 px-2.5 py-1.5 text-[10px] font-mono text-amber-200 ${
              showHud ? 'bottom-16 left-3' : 'bottom-3 left-3'
            }`}
          >
            Scene depth relative to the camera. Water depth in meters is not measured; that requires terrain elevation and water-level data.
          </div>
        )}

        {/* Curtain Swipe Divider Line, Draggable Handle & GIS Status Pills */}
        {viewMode === 'swipe' && (
          <>
            {/* GIS Non-Intrusive Status Pills */}
            <div
              className={`absolute z-20 pointer-events-none px-2 py-0.5 bg-slate-900/90 border border-slate-700/80 text-[10px] font-mono text-slate-300 rounded shadow-xs select-none ${
                showHud ? 'top-14 left-3' : 'top-3 left-3'
              }`}
            >
              Optical Base Layer
            </div>
            <div
              className={`absolute z-20 pointer-events-none px-2 py-0.5 bg-cyan-950/90 border border-cyan-500/80 text-[10px] font-mono text-cyan-300 rounded font-medium shadow-xs select-none ${
                showHud ? 'top-32 right-3' : 'top-3 right-3'
              }`}
            >
              {activeLayer === 'depth' ? 'Relative Depth Layer' : 'Semantic Class Layer'}
            </div>

            {/* Vertical Divider with Pointer Capture & Smooth Touch Support */}
            <div
              className="absolute inset-y-0 w-0.5 bg-cyan-400 cursor-ew-resize z-20 shadow-[0_0_12px_rgba(0,212,255,0.8)] touch-none select-none"
              style={{ left: `${splitPos}%`, touchAction: 'none' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setIsDraggingDivider(true);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!isDraggingDivider || !containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                setSplitPos(Math.min(95, Math.max(5, x)));
              }}
              onPointerUp={(e) => {
                setIsDraggingDivider(false);
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {}
              }}
              onPointerCancel={() => setIsDraggingDivider(false)}
            >
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-2.5 py-1 bg-slate-950 border border-cyan-400 rounded-full text-cyan-300 flex items-center space-x-1.5 shadow-2xl text-[9px] font-mono font-bold tracking-wider hover:scale-110 active:scale-95 transition-transform cursor-ew-resize select-none"
                title="Drag to compare Optical Base Layer with Semantic/Depth Layer"
              >
                <span>&larr;</span>
                <span className="text-[8px] uppercase tracking-wider">SWIPE</span>
                <span>&rarr;</span>
              </div>
            </div>
          </>
        )}

        {/* Inspection Loupe Vector Ring & Reticle Overlay (Diameter 240px) */}
        {viewMode === 'loupe' && isHovering && (
          <div
            className="absolute pointer-events-none z-25 rounded-full border-2 border-cyan-400/90 shadow-[0_0_24px_rgba(0,0,0,0.85),inset_0_0_20px_rgba(6,182,212,0.15)] -translate-x-1/2 -translate-y-1/2"
            style={{
              width: '240px',
              height: '240px',
              left: `${pixelPos.x}px`,
              top: `${pixelPos.y}px`,
            }}
          >
            {/* Circumferential Reticle Tick Marks */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-0.5 h-2 bg-cyan-400" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-0.5 h-2 bg-cyan-400" />
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 h-0.5 w-2 bg-cyan-400" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 h-0.5 w-2 bg-cyan-400" />

            {/* Central Precision Crosshairs */}
            <div className="absolute inset-0 flex items-center justify-center opacity-40">
              <div className="w-5 h-px bg-cyan-300" />
              <div className="h-5 w-px bg-cyan-300 absolute" />
            </div>

            {/* Minimal GIS Loupe HUD Badge */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-950/95 border border-cyan-500/80 rounded text-[9px] font-mono text-cyan-300 whitespace-nowrap shadow-md flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>LOUPE: {activeLayer === 'depth' ? 'DEPTH LENS' : 'SEMANTIC MASK'} (Ø 240px)</span>
            </div>
          </div>
        )}

        {/* ────────────────── PROFESSIONAL UAV PHOTOGRAMMETRY & SENSOR HUD ────────────────── */}
        {showHud && (
          <>
            {/* Graticule Grid & Metric Coordinate Reticle */}
            <div className="absolute inset-0 pointer-events-none z-15">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                {/* Subtle 1px graticule lines */}
                <line x1="25%" y1="0" x2="25%" y2="100%" stroke="rgba(148, 163, 184, 0.15)" strokeWidth="1" strokeDasharray="4 6" />
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(148, 163, 184, 0.22)" strokeWidth="1" strokeDasharray="4 6" />
                <line x1="75%" y1="0" x2="75%" y2="100%" stroke="rgba(148, 163, 184, 0.15)" strokeWidth="1" strokeDasharray="4 6" />
                <line x1="0" y1="33.3%" x2="100%" y2="33.3%" stroke="rgba(148, 163, 184, 0.15)" strokeWidth="1" strokeDasharray="4 6" />
                <line x1="0" y1="66.6%" x2="100%" y2="66.6%" stroke="rgba(148, 163, 184, 0.15)" strokeWidth="1" strokeDasharray="4 6" />

                {/* Grid Intersection Crosshairs */}
                {[
                  { x: '25%', y: '33.3%' }, { x: '50%', y: '33.3%' }, { x: '75%', y: '33.3%' },
                  { x: '25%', y: '66.6%' }, { x: '50%', y: '66.6%' }, { x: '75%', y: '66.6%' },
                ].map((pt, i) => (
                  <g key={i} stroke="rgba(148, 163, 184, 0.4)" strokeWidth="1">
                    <line x1={`calc(${pt.x} - 4px)`} y1={pt.y} x2={`calc(${pt.x} + 4px)`} y2={pt.y} />
                    <line x1={pt.x} y1={`calc(${pt.y} - 4px)`} x2={pt.x} y2={`calc(${pt.y} + 4px)`} />
                  </g>
                ))}

                {/* Central Optical Survey Reticle */}
                <circle cx="50%" cy="50%" r="20" fill="none" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="1" />
                <circle cx="50%" cy="50%" r="2" fill="rgba(56, 189, 248, 0.8)" />
                <line x1="calc(50% - 28px)" y1="50%" x2="calc(50% - 8px)" y2="50%" stroke="rgba(56, 189, 248, 0.5)" strokeWidth="1" />
                <line x1="calc(50% + 8px)" y1="50%" x2="calc(50% + 28px)" y2="50%" stroke="rgba(56, 189, 248, 0.5)" strokeWidth="1" />
                <line x1="50%" y1="calc(50% - 28px)" x2="50%" y2="calc(50% - 8px)" stroke="rgba(56, 189, 248, 0.5)" strokeWidth="1" />
                <line x1="50%" y1="calc(50% + 8px)" x2="50%" y2="calc(50% + 28px)" stroke="rgba(56, 189, 248, 0.5)" strokeWidth="1" />
              </svg>

              {/* Metric Graticule Coordinate Labels */}
              <div className="absolute top-1 left-1/4 -translate-x-1/2 text-[8px] font-mono text-slate-500/80 bg-slate-950/70 px-1 rounded select-none">
                E 584,150m
              </div>
              <div className="absolute top-1 left-2/4 -translate-x-1/2 text-[8px] font-mono text-cyan-400/80 bg-slate-950/70 px-1 rounded select-none">
                E 584,200m [NADIR]
              </div>
              <div className="absolute top-1 left-3/4 -translate-x-1/2 text-[8px] font-mono text-slate-500/80 bg-slate-950/70 px-1 rounded select-none">
                E 584,250m
              </div>
              <div className="absolute left-1 top-1/3 -translate-y-1/2 text-[8px] font-mono text-slate-500/80 bg-slate-950/70 px-1 rounded select-none">
                N 3,842,150m
              </div>
              <div className="absolute left-1 top-2/3 -translate-y-1/2 text-[8px] font-mono text-slate-500/80 bg-slate-950/70 px-1 rounded select-none">
                N 3,842,100m
              </div>
            </div>

            {/* Vector North Arrow / Orientation Compass (Top-Left) */}
            <div className="absolute top-3 left-3 z-20 pointer-events-none flex items-center space-x-2 bg-slate-950/85 backdrop-blur-xs border border-slate-800 px-2 py-1.5 rounded shadow-sm text-[9px] font-mono text-slate-300">
              <div className="relative w-6 h-6 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10.5" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="1" />
                  <line x1="12" y1="1.5" x2="12" y2="3.5" stroke="#f43f5e" strokeWidth="1.5" />
                  <line x1="12" y1="20.5" x2="12" y2="22.5" stroke="rgba(148, 163, 184, 0.5)" strokeWidth="1" />
                  <line x1="1.5" y1="12" x2="3.5" y2="12" stroke="rgba(148, 163, 184, 0.5)" strokeWidth="1" />
                  <line x1="20.5" y1="12" x2="22.5" y2="12" stroke="rgba(148, 163, 184, 0.5)" strokeWidth="1" />
                  <polygon points="12,4 14.5,12 12,10.5 9.5,12" fill="#f43f5e" />
                  <polygon points="12,20 14.5,12 12,10.5 9.5,12" fill="rgba(148, 163, 184, 0.4)" />
                  <circle cx="12" cy="12" r="1" fill="#ffffff" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="font-bold text-slate-100 flex items-center space-x-1">
                  <span className="text-rose-400">000° N</span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-400">TRUE NORTH</span>
                </div>
                <div className="text-[8px] text-slate-500">NADIR ORTHO SURVEY</div>
              </div>
            </div>

            {/* Aerial Survey Telemetry Card (Top-Right) */}
            <div className="absolute top-3 right-3 z-20 pointer-events-none bg-slate-950/90 backdrop-blur-xs border border-slate-800 p-2 rounded shadow-md text-[9px] font-mono text-slate-300 w-52 space-y-1">
              <div className="flex items-center justify-between pb-1 border-b border-slate-800 text-[8px] text-slate-400 uppercase tracking-wider font-semibold">
                <span className="flex items-center space-x-1 text-cyan-400">
                  <Navigation className="w-2.5 h-2.5 text-cyan-400" />
                  <span>UAV Telemetry</span>
                </span>
                <span className="text-emerald-400 font-normal">STABLE AGL</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[8px] pt-0.5">
                <span className="text-slate-500">SENSOR:</span>
                <span className="text-slate-200 text-right">RGB CMOS 1/2.3&quot;</span>
                <span className="text-slate-500">FOCAL LEN:</span>
                <span className="text-slate-200 text-right">24mm eq.</span>
                <span className="text-slate-500">NOMINAL GSD:</span>
                <span className="text-cyan-300 text-right font-semibold">~2.5 cm/px</span>
                <span className="text-slate-500">ALTITUDE:</span>
                <span className="text-slate-200 text-right">80.0m AGL</span>
                <span className="text-slate-500">PERSPECTIVE:</span>
                <span className="text-slate-200 text-right">Nadir (90.0°)</span>
              </div>
            </div>

            {/* Dynamic Metric Scale Bar (Bottom-Left) */}
            <div
              className={`absolute z-20 pointer-events-none bg-slate-950/85 backdrop-blur-xs border border-slate-800 px-2 py-1.5 rounded shadow-sm text-slate-300 font-mono text-[9px] ${
                activeLayer === 'depth' ? 'bottom-12 left-3' : 'bottom-3 left-3'
              }`}
            >
              <div className="flex items-center justify-between text-[8px] text-slate-400 mb-0.5 px-0.5">
                <span>0</span>
                <span>{scaleMeters <= 15 ? (scaleMeters / 2).toFixed(1) : Math.round(scaleMeters / 2)}m</span>
                <span>{scaleMeters <= 15 ? scaleMeters.toFixed(1) : Math.round(scaleMeters)}m</span>
              </div>
              {/* Alternating standard photogrammetry scale bar segments */}
              <div className="flex h-1.5 w-32 border border-slate-600 bg-slate-950 overflow-hidden">
                <div className="w-1/2 bg-slate-200" />
                <div className="w-1/2 bg-slate-700" />
              </div>
              <div className="mt-1 flex items-center justify-between text-[8px] text-slate-400">
                <span>ZOOM {zoomLevel}X</span>
                <span className="text-slate-300">GSD: ~{(2.5 / zoomLevel).toFixed(1)} cm/px</span>
              </div>
            </div>

            {/* Corner Survey Registration Marks */}
            <div className="absolute inset-2.5 pointer-events-none z-20 flex flex-col justify-between opacity-50">
              <div className="flex justify-between">
                <span className="w-3 h-3 border-t border-l border-slate-500" />
                <span className="w-3 h-3 border-t border-r border-slate-500" />
              </div>
              <div className="flex justify-between">
                <span className="w-3 h-3 border-b border-l border-slate-500" />
                <span className="w-3 h-3 border-b border-r border-slate-500" />
              </div>
            </div>
          </>
        )}

        {/* Live Scan Line Sweep Reveal */}
        {(isScanning || isInferring) && <div className="scan-line pointer-events-none z-30" />}

        {/* "Ask the Image" Selection Pin */}
        {selectedPin && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 flex flex-col items-center"
            style={{ left: `${selectedPin.x}%`, top: `${selectedPin.y}%` }}
          >
            <div className="w-5 h-5 rounded-full border-2 border-cyan-400 bg-cyan-400/30 flex items-center justify-center animate-ping" />
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 border border-white shadow-lg -mt-3.5" />
            <span className="mt-1 px-1.5 py-0.5 bg-slate-950 border border-cyan-500/80 text-[9px] text-cyan-300 rounded font-mono shadow-md whitespace-nowrap">
              IMAGE POINT [{selectedPin.x.toFixed(0)}%, {selectedPin.y.toFixed(0)}%]
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
