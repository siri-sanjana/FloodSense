'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Sliders, Split, Maximize2, Crosshair, Zap, Compass, BatteryCharging, Radio, Layers } from 'lucide-react';
import { RegionContext, SegmentationClass } from '../lib/types';
import { api } from '../lib/api';

interface MaskViewerProps {
  rawImageUrl?: string;
  imageUrl?: string;
  maskImageUrl?: string;
  maskUrl?: string;
  sampleId?: string;
  imageFile?: File;
  classes?: SegmentationClass[];
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
  isScanning = false,
  onRegionSelect,
  onError,
}) => {
  const finalRawUrl = rawImageUrl || imageUrl || '/samples/10169.jpg';
  const initialMaskUrl = maskImageUrl || maskUrl || '/samples/10169_mask.png';

  const [opacity, setOpacity] = useState<number>(85);
  const [viewMode, setViewMode] = useState<'overlay' | 'split'>('split');
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
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Track mouse coordinates for dynamic HUD reticle and Swipe mode
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
    if (viewMode === 'split') {
      setSplitPos(Math.min(95, Math.max(5, x)));
    }
  };

  // Handle click on the image for "Ask the Image"
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

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

          {/* Opacity slider */}
          {viewMode === 'overlay' && (
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 text-[10px]">Mask:</span>
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

          {/* Overlay vs Swipe toggle */}
          <div className="flex items-center border border-slate-700 bg-slate-950 text-[10px] rounded overflow-hidden">
            <button
              onClick={() => setViewMode('overlay')}
              className={`px-2 py-0.5 transition-colors ${
                viewMode === 'overlay' ? 'bg-slate-700 text-slate-100 font-semibold' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Overlay
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`px-2 py-0.5 transition-colors ${
                viewMode === 'split' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Swipe
            </button>
          </div>
        </div>
      </div>

      {/* ────────────────── MAIN INTERACTIVE DRONE HUD ────────────────── */}
      <div
        ref={containerRef}
        onClick={handleImageClick}
        onMouseMove={handleMouseMove}
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

        {/* Layer 2: 10-Class Segmentation / Relative Depth Overlay */}
        {liveOverlayUrl && viewMode === 'overlay' && (
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

        {/* Layer 2b: Split / Swipe view with clipPath for perfect 1:1 pixel alignment */}
        {liveOverlayUrl && viewMode === 'split' && (
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

        {activeLayer === 'depth' && (
          <div className="absolute bottom-3 left-3 z-20 max-w-[80%] rounded bg-slate-950/85 px-2.5 py-1.5 text-[10px] font-mono text-amber-200">
            Scene depth relative to the camera. Water depth in meters is not measured; that requires terrain elevation and water-level data.
          </div>
        )}

        {/* Swipe Divider Line & Interactive Handle */}
        {viewMode === 'split' && (
          <>
            {/* Sector Labels for Swipe Comparison */}
            <div className="absolute top-3 left-3 z-20 pointer-events-none px-2 py-0.5 bg-slate-900/80 border border-slate-700 text-[10px] font-mono text-slate-200 rounded shadow-xs">
              RAW UAV PHOTO
            </div>
            <div className="absolute top-3 right-3 z-20 pointer-events-none px-2 py-0.5 bg-cyan-950/80 border border-cyan-500 text-[10px] font-mono text-cyan-300 rounded font-semibold shadow-xs">
              {activeLayer === 'depth' ? 'RELATIVE SCENE DEPTH' : 'SEGMENTATION MASK'}
            </div>

            {/* Vertical Divider */}
            <div
              className="absolute inset-y-0 w-0.5 bg-cyan-400 cursor-ew-resize z-20 shadow-[0_0_12px_rgba(0,212,255,0.8)]"
              style={{ left: `${splitPos}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-2.5 py-1 bg-slate-900 border border-cyan-400 rounded-full text-cyan-300 flex items-center space-x-1.5 shadow-xl text-[9px] font-mono font-bold tracking-wider hover:scale-110 transition-transform cursor-ew-resize">
                <span>&larr;</span>
                <span>SWIPE</span>
                <span>&rarr;</span>
              </div>
            </div>
          </>
        )}

        {/* ────────────────── TACTICAL CYBER HUD OVERLAY ────────────────── */}
        {/* Corner HUD Bracket Reticles */}
        <div className="absolute inset-3 pointer-events-none z-20 flex flex-col justify-between opacity-70">
          <div className="flex justify-between">
            <span className="w-4 h-4 border-t-2 border-l-2 border-cyan-500" />
            <span className="w-4 h-4 border-t-2 border-r-2 border-cyan-500" />
          </div>
          <div className="flex justify-between">
            <span className="w-4 h-4 border-b-2 border-l-2 border-cyan-500" />
            <span className="w-4 h-4 border-b-2 border-r-2 border-cyan-500" />
          </div>
        </div>

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
