import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Sliders, Split, Zap, Layers } from 'lucide-react';
import { RegionContext, SegmentationClass } from '../lib/types';
import { api, type DamageMetrics } from '../lib/api';

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
}) => {
  const finalRawUrl = rawImageUrl || imageUrl || (sampleId ? `/samples/${sampleId}.jpg` : '/samples/10169.jpg');
  const initialMaskUrl = maskImageUrl || maskUrl || (sampleId ? `/samples/${sampleId}_mask.png` : '/samples/10169_mask.png');

  const [opacity, setOpacity] = useState<number>(85);
  const [viewMode, setViewMode] = useState<'blend' | 'swipe' | 'loupe'>('swipe');
  const [filterMode, setFilterMode] = useState<'normal' | 'thermal' | 'nightvision'>('normal');
  const [activeLayer, setActiveLayer] = useState<'segment' | 'depth'>('segment');
  const [selectedModel, setSelectedModel] = useState<'segformer' | 'classical' | 'sam'>('segformer');

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

  // Update initial mask if prop changes
  useEffect(() => {
    if (activeLayer === 'segment') {
      const targetMask = maskImageUrl || maskUrl || (sampleId ? `/samples/${sampleId}_mask.png` : '/samples/10169_mask.png');
      setLiveOverlayUrl(targetMask);
    }
  }, [maskImageUrl, maskUrl, activeLayer, sampleId]);

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

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (hasDraggedRef.current || isDraggingDivider) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setSelectedPin({ x, y });

    const matchedClass = classes.find((c) => c.is_flooded) || classes[0] || {
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
      {/* ────────────────── TOP TOOLBAR ────────────────── */}
      <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-900/95 hairline-b border-slate-800 text-[11px] font-mono gap-2 select-none">
        {/* Left: Feed indicator & Active Inference Badge */}
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
                {z}X
              </button>
            ))}
          </div>

          {/* View Mode Toggle: Swipe vs Blend vs Loupe */}
          <div className="flex items-center hairline-all border-slate-700 bg-slate-950 text-[10px]">
            <button
              onClick={() => setViewMode('swipe')}
              className={`p-1 transition-colors ${
                viewMode === 'swipe' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Swipe Divider Comparison"
            >
              <Split className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('blend')}
              className={`p-1 transition-colors ${
                viewMode === 'blend' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Alpha Blended Overlay"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('loupe')}
              className={`p-1 transition-colors ${
                viewMode === 'loupe' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Circular Magnifier Loupe"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Filter Mode Selector */}
          <div className="hidden lg:flex items-center hairline-all border-slate-700 bg-slate-950 text-[10px]">
            {(['normal', 'thermal', 'nightvision'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-1.5 py-0.5 transition-colors capitalize ${
                  filterMode === mode ? 'bg-slate-700 text-slate-100 font-medium' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {mode === 'nightvision' ? 'NVG' : mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Blend opacity slider (when in blend mode) */}
      {viewMode === 'blend' && (
        <div className="flex items-center space-x-2 px-3.5 py-1.5 bg-slate-950/80 border-b border-slate-800 text-[10px] font-mono text-slate-400">
          <Sliders className="w-3 h-3 text-cyan-400" />
          <span>Mask Opacity</span>
          <input
            type="range"
            min="10"
            max="100"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-32 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <span className="text-slate-200 font-bold">{opacity}%</span>
        </div>
      )}

      {/* ────────────────── MAIN IMAGE VIEWPORT ────────────────── */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleImageClick}
        onMouseLeave={() => {
          setIsHovering(false);
          setIsDraggingDivider(false);
        }}
        style={{ touchAction: 'none' }}
        className={`relative w-full aspect-[16/10] min-h-[360px] md:min-h-[480px] bg-slate-950 overflow-hidden select-none transition-all duration-300 ${
          isHovering && !isDraggingDivider ? 'cursor-crosshair' : ''
        }`}
      >
        {/* Layer 1: Base Aerial Image */}
        <div
          className={`absolute inset-0 transition-transform duration-100 ${
            filterMode === 'thermal'
              ? 'filter invert hue-rotate-180 contrast-125'
              : filterMode === 'nightvision'
              ? 'filter sepia-100 hue-rotate-90 brightness-110 contrast-125'
              : ''
          }`}
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
          }}
        >
          <img
            src={finalRawUrl}
            alt="Aerial capture base"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Layer 2: Live Segmentation Mask / Depth Overlay */}
        {viewMode === 'swipe' && (
          <div
            className={`absolute inset-0 pointer-events-none transition-transform duration-100 ${
              filterMode === 'thermal'
                ? 'filter invert hue-rotate-180 contrast-125'
                : filterMode === 'nightvision'
                ? 'filter sepia-100 hue-rotate-90 brightness-110 contrast-125'
                : ''
            }`}
            style={{
              clipPath: `polygon(${splitPos}% 0, 100% 0, 100% 100%, ${splitPos}% 100%)`,
              transform: `scale(${zoomLevel})`,
              transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
            }}
          >
            <img
              src={liveOverlayUrl}
              alt="Live Segmentation Overlay"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {viewMode === 'blend' && (
          <div
            className={`absolute inset-0 pointer-events-none transition-transform duration-100 ${
              filterMode === 'thermal'
                ? 'filter invert hue-rotate-180 contrast-125'
                : filterMode === 'nightvision'
                ? 'filter sepia-100 hue-rotate-90 brightness-110 contrast-125'
                : ''
            }`}
            style={{
              opacity: opacity / 100,
              transform: `scale(${zoomLevel})`,
              transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
            }}
          >
            <img
              src={liveOverlayUrl}
              alt="Live Segmentation Blend"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Swipe Divider Bar */}
        {viewMode === 'swipe' && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-20 cursor-ew-resize pointer-events-auto"
            style={{ left: `${splitPos}%` }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-slate-900 border border-cyan-400 shadow-md flex items-center justify-center text-cyan-300">
              <Split className="w-3 h-3" />
            </div>
          </div>
        )}

        {/* Inspection Loupe Magnifier Lens */}
        {viewMode === 'loupe' && isHovering && (
          <div
            className="absolute pointer-events-none z-20 rounded-full border-2 border-cyan-400 shadow-2xl overflow-hidden"
            style={{
              width: 240,
              height: 240,
              left: pixelPos.x - 120,
              top: pixelPos.y - 120,
            }}
          >
            <div
              className="absolute w-[800px] h-[500px]"
              style={{
                left: -pixelPos.x * 2.5 + 120,
                top: -pixelPos.y * 2.5 + 120,
                transform: 'scale(2.5)',
                transformOrigin: '0 0',
              }}
            >
              <img
                src={liveOverlayUrl}
                alt="Inspection Loupe Local Reveal"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
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
