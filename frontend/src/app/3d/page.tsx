'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Box,
  Layers,
  ShieldAlert,
  Sliders,
  Compass,
  Activity,
  Maximize2,
  Building,
  Route,
  Car,
  Trees,
  Droplets,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  FileText,
  Split
} from 'lucide-react';
import { FloodSenseLogo } from '../../components/ui/FloodSenseLogo';
import { FloodDigitalTwin3D, ClassStats } from '../../components/three/FloodDigitalTwin3D';
import { ImageSegmentationRelief3D } from '../../components/three/ImageSegmentationRelief3D';
import { MaskViewer } from '../../components/MaskViewer';
import { api } from '../../lib/api';

export default function Standalone3DDigitalTwinPage() {
  const [selectedSector, setSelectedSector] = useState<'10169' | '10815' | '6423'>('10169');
  const [activeView, setActiveView] = useState<'3d' | 'swipe' | 'image3d'>('3d');
  const [currentWaterLevel, setCurrentWaterLevel] = useState<number>(1.8);
  const [segmentationModel, setSegmentationModel] = useState<'segformer' | 'classical' | 'sam'>('segformer');
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [derivedAssets, setDerivedAssets] = useState<{
    imageUrl: string;
    segmentationUrl: string;
    classMaskUrl: string;
    imageWidth: number;
    imageHeight: number;
    modelName: string;
  } | null>(null);
  const [isBuildingImage3d, setIsBuildingImage3d] = useState(false);
  const [image3dError, setImage3dError] = useState<string | null>(null);
  const [classStats, setClassStats] = useState<ClassStats>({
    floodedBuildings: 7,
    totalBuildings: 12,
    floodedRoadsKm: 2.1,
    totalRoadsKm: 4.6,
    floodedVehicles: 4,
    totalVehicles: 8,
    inundatedAreaHa: 3.82,
    severityLevel: 'CRITICAL',
  });

  const SECTORS = [
    {
      id: '10169',
      title: 'Sector 10169: Marine Drive & Canal Axis',
      waterBaseline: 1.8,
      basinType: 'Coastal Estuarine Basin',
      structuresCount: 16,
      safeCorridor: 'Western Ridge (+1.5m Elevation)',
      criticalThreshold: 1.2,
      description: 'High-density residential and commercial zone flanked by municipal canal and tidal estuary.',
      image: '/samples/10169.jpg',
      mask: '/samples/10169_mask.png',
    },
    {
      id: '10815',
      title: 'Sector 10815: North Dyke Canal Breach',
      waterBaseline: 2.3,
      basinType: 'Riverine Lowlands',
      structuresCount: 21,
      safeCorridor: 'Highland Bypass (+2.1m Elevation)',
      criticalThreshold: 1.4,
      description: 'Major agricultural drainage corridor with embankment breach submerging access roads.',
      image: '/samples/10815.jpg',
      mask: '/samples/10815_mask.png',
    },
    {
      id: '6423',
      title: 'Sector 6423: Highway Overpass & Bridge Embankment',
      waterBaseline: 1.1,
      basinType: 'Alluvial Floodplain',
      structuresCount: 9,
      safeCorridor: 'Northern Arterial Flyover',
      criticalThreshold: 0.9,
      description: 'Critical transport lifeline with multi-span bridge overpass and low-lying storage facilities.',
      image: '/samples/6423.jpg',
      mask: '/samples/6423_mask.png',
    },
  ];

  const activeSector = SECTORS.find((s) => s.id === selectedSector)!;
  const selectedImageUrl = uploadedImageUrl || activeSector.image;
  const stagePosition = Math.min(100, Math.max(0, ((currentWaterLevel + 0.5) / 4) * 100));
  const stageColor = currentWaterLevel >= 2.2
    ? 'text-red-700 border-red-200 bg-red-50'
    : currentWaterLevel >= 1.2
    ? 'text-amber-800 border-amber-200 bg-amber-50'
    : 'text-cyan-800 border-cyan-200 bg-cyan-50';
  const severityColor = classStats.severityLevel === 'CATASTROPHIC'
    ? 'bg-red-100 text-red-800'
    : classStats.severityLevel === 'CRITICAL'
    ? 'bg-amber-100 text-amber-800'
    : classStats.severityLevel === 'ADVISORY'
    ? 'bg-yellow-100 text-yellow-800'
    : 'bg-emerald-100 text-emerald-800';

  React.useEffect(() => {
    if (!uploadedImage) {
      setUploadedImageUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(uploadedImage);
    setUploadedImageUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [uploadedImage]);

  const buildImage3d = async () => {
    setImage3dError(null);
    setIsBuildingImage3d(true);
    try {
      const input = uploadedImage
        ? { image: uploadedImage }
        : { sample_id: selectedSector };
      const segmentation = await api.segment({ ...input, model: segmentationModel });
      setDerivedAssets({
        imageUrl: selectedImageUrl,
        segmentationUrl: segmentation.overlay_url,
        classMaskUrl: segmentation.class_mask_url,
        imageWidth: segmentation.image_size.width,
        imageHeight: segmentation.image_size.height,
        modelName: segmentation.model_display_name,
      });
      setActiveView('image3d');
    } catch (error) {
      setImage3dError(error instanceof Error ? error.message : 'Could not build the image-derived 3D view.');
    } finally {
      setIsBuildingImage3d(false);
    }
  };

  // The 10 FloodNet segmentation classes
  const CLASS_SCHEMA = [
    { id: 1, name: 'Building-Flooded', color: '#DC2626', desc: 'Structural footprints with water ingress past foundation', count: `${classStats.floodedBuildings} active` },
    { id: 2, name: 'Building-Safe', color: '#94A3B8', desc: 'Highland residential and clinic footprints above crest', count: `${classStats.totalBuildings - classStats.floodedBuildings} safe` },
    { id: 3, name: 'Road-Flooded', color: '#CA8A04', desc: 'Submerged lowland arterial segments (>0.2m depth)', count: `${classStats.floodedRoadsKm} km` },
    { id: 4, name: 'Road-Safe', color: '#475569', desc: 'Elevated highway overpass and dry escape corridors', count: `${(classStats.totalRoadsKm - classStats.floodedRoadsKm).toFixed(1)} km` },
    { id: 5, name: 'Water Body / Flood Mesh', color: '#0284C7', desc: 'Active volumetric reflective inundation layer', count: `${classStats.inundatedAreaHa} ha` },
    { id: 6, name: 'Tree Canopy / Vegetation', color: '#059669', desc: 'Natural forest buffers, roadside palms, and mangrove stands', count: '11 stands' },
    { id: 7, name: 'Vehicle / Vessel', color: '#7C3AED', desc: 'Trapped lowland delivery vans and civilian automobiles', count: `${classStats.floodedVehicles} submerged` },
    { id: 8, name: 'Retention Pool / Basin', color: '#06B6D4', desc: 'Constructed stormwater sumps and containment basins', count: '1 pool' },
    { id: 9, name: 'Open Grassland', color: '#4ADE80', desc: 'Porous meadow buffers and permeable soil plains', count: 'Terrain base' },
    { id: 10, name: 'Hydraulic Infrastructure', color: '#64748B', desc: 'Dikes, levees, bridge abutments, and canal gates', count: 'Piers & levees' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col select-none">
      {/* ────────────────── TOP NAVIGATION HEADER (STANDALONE) ────────────────── */}
      <header className="sticky top-0 z-50 h-16 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <FloodSenseLogo size="sm" href="/" />
            <span className="text-slate-300 hidden sm:inline">|</span>
            <div className="flex items-center space-x-2">
              <Box className="w-4 h-4 text-cyan-600" />
              <h1 className="font-bold text-sm tracking-wider text-slate-900 font-mono">
                3D SIMULATOR
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-xs font-mono">
            <Link
              href="/"
              className="text-slate-600 hover:text-cyan-700 transition-colors hidden sm:inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Landing Page</span>
            </Link>

            <Link
              href="/signin"
              className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded transition-colors flex items-center space-x-1.5 shadow-xs"
            >
              <span>Open Studio</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ────────────────── SECTOR SELECTION & VIEW SWITCHER ────────────────── */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
          {/* Active Sector Selection */}
          <div className="flex items-center space-x-3 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Active Sector:</span>
            {SECTORS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => {
                  setSelectedSector(sec.id as '10169' | '10815' | '6423');
                  setCurrentWaterLevel(sec.waterBaseline);
                  setUploadedImage(null);
                  setDerivedAssets(null);
                  setImage3dError(null);
                  setActiveView('3d');
                }}
                disabled={isBuildingImage3d}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-2 shrink-0 cursor-pointer border ${
                  selectedSector === sec.id
                    ? 'bg-cyan-50 border-cyan-600 text-cyan-950 font-bold shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${selectedSector === sec.id ? 'bg-cyan-600' : 'bg-slate-300'}`} />
                <span>{sec.title.split(':')[0]}</span>
              </button>
            ))}
          </div>

          {/* View mode switcher */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveView('3d')}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold transition-all border ${
                activeView === '3d'
                  ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Box className="w-3.5 h-3.5 text-cyan-400" />
              <span>3D Simulator</span>
            </button>
            <button
              onClick={() => setActiveView('swipe')}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold transition-all border ${
                activeView === 'swipe'
                  ? 'bg-cyan-600 border-cyan-600 text-white shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Split className="w-3.5 h-3.5" />
              <span>Swipe for Segmentation</span>
            </button>
            <button
              onClick={() => {
                if (derivedAssets) setActiveView('image3d');
                else void buildImage3d();
              }}
              disabled={isBuildingImage3d}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold transition-all border ${
                activeView === 'image3d'
                  ? 'bg-violet-700 border-violet-700 text-white shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              } disabled:cursor-wait disabled:opacity-60`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isBuildingImage3d ? 'Building…' : 'Image 2.5D'}</span>
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-3 text-xs">
          <label className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer">
            <span>{uploadedImage ? uploadedImage.name : 'Use current sample or upload an image'}</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={isBuildingImage3d}
              onChange={(event) => {
                setUploadedImage(event.target.files?.[0] || null);
                setDerivedAssets(null);
                setImage3dError(null);
                setActiveView('3d');
              }}
            />
          </label>
          {uploadedImage && (
            <button
              type="button"
              disabled={isBuildingImage3d}
              onClick={() => {
                setUploadedImage(null);
                setDerivedAssets(null);
                setImage3dError(null);
                setActiveView('3d');
              }}
              className="text-slate-500 hover:text-slate-800 disabled:opacity-50"
            >
              Clear upload
            </button>
          )}
          <button
            type="button"
            onClick={() => void buildImage3d()}
            disabled={isBuildingImage3d}
            className="rounded bg-violet-700 px-3 py-1.5 font-semibold text-white hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60"
          >
            {isBuildingImage3d ? 'Running segmentation…' : 'Generate image-derived 3D'}
          </button>
          <label className="flex items-center gap-2 text-slate-600">
            Segmentation model
            <select
              value={segmentationModel}
              disabled={isBuildingImage3d}
              onChange={(event) => {
                setSegmentationModel(event.target.value as 'segformer' | 'classical' | 'sam');
                setDerivedAssets(null);
                setActiveView('3d');
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-800 disabled:opacity-50"
            >
              <option value="segformer">SegFormer (recommended)</option>
              <option value="classical">Classical CV</option>
              <option value="sam">SAM</option>
            </select>
          </label>
          <span className="text-slate-500">Runs live segmentation on the selected image.</span>
          {image3dError && (
            <p role="alert" className="basis-full text-red-700">{image3dError}</p>
          )}
        </div>
      </div>

      {/* ────────────────── MAIN CONTENT ────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1 space-y-6">
        {activeView === '3d' ? (
          /* 3D WebGL Simulator View */
          <div className="w-full space-y-6">
            <FloodDigitalTwin3D
              initialWaterLevel={currentWaterLevel}
              sectorName={activeSector.title}
              onWaterLevelChange={(lvl) => setCurrentWaterLevel(lvl)}
              onStatsChange={(st) => setClassStats(st)}
              onSwitchToSwipe={() => setActiveView('swipe')}
              className="w-full"
            />

            {/* Quick Prompt to Swipe */}
            <div className="p-4 bg-white border border-cyan-200 rounded-xl flex items-center justify-between text-xs font-mono shadow-2xs">
              <div className="flex items-center space-x-3">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 animate-pulse" />
                <span className="font-semibold text-slate-900">Want to inspect 2D UAV optical telemetry?</span>
                <span className="text-slate-500 hidden sm:inline">&bull; Swipe split view reveals 10-class segmentation mask over true drone photo.</span>
              </div>
              <button
                onClick={() => setActiveView('swipe')}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg flex items-center space-x-1.5 transition-colors shadow-2xs"
              >
                <span>Swipe Segmentation</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : activeView === 'swipe' ? (
          /* Swipe Segmentation Comparison View */
          <div className="w-full bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs font-mono">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span className="text-slate-900 font-semibold">{activeSector.title}</span>
                <span className="text-slate-500 hidden sm:inline">({activeSector.basinType})</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] text-cyan-800 font-semibold px-2 py-0.5 bg-cyan-50 border border-cyan-200 rounded">
                  SWIPE COMPARISON ACTIVE
                </span>
                <button
                  onClick={() => setActiveView('3d')}
                  className="px-2.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] rounded border border-slate-200 transition-colors"
                >
                  Return to 3D
                </button>
              </div>
            </div>

            <div className="rounded-lg overflow-hidden border border-slate-200">
              <MaskViewer
                sampleId={String(selectedSector)}
                rawImageUrl={activeSector.image}
                maskImageUrl={activeSector.mask}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1">
              <span>Move mouse or drag divider horizontally to swipe between raw drone capture and segmentation overlay.</span>
              <span className="font-semibold text-cyan-800">10-Class Verified Overlay</span>
            </div>
          </div>
        ) : derivedAssets ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
              <strong>Approximate single-image 2.5D view.</strong> The surface color uses the live segmentation
              overlay, and semantic classes are given shallow, illustrative relief. This does not infer
              real-world depth or elevation. A single image cannot recover hidden sides or true 3D geometry.
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
              <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                <ImageSegmentationRelief3D
                  imageUrl={derivedAssets.imageUrl}
                  segmentationUrl={derivedAssets.segmentationUrl}
                  classMaskUrl={derivedAssets.classMaskUrl}
                  imageWidth={derivedAssets.imageWidth}
                  imageHeight={derivedAssets.imageHeight}
                  simulatedStage={currentWaterLevel}
                />
              </div>
              <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">Live model inputs</h2>
                <img
                  src={derivedAssets.imageUrl}
                  alt="Source image used for the 3D surface"
                  className="max-h-64 w-full rounded border border-slate-200 object-contain"
                />
                <dl className="space-y-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Segmentation</dt>
                    <dd className="font-medium text-slate-900">{derivedAssets.modelName}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Relief</dt>
                    <dd className="font-medium text-slate-900">FloodNet class-based, illustrative</dd>
                  </div>
                </dl>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  The colored surface is the backend&apos;s segmentation overlay. Small class-specific offsets
                  shape the mesh; they are not measured building heights or water depth.
                </p>
              </aside>
            </div>
            <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm" aria-label="Simulated hydro gauge control">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                <div className="flex min-w-64 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Simulated Stage
                    </span>
                    <span className={`rounded-md border px-2.5 py-0.5 text-xs font-bold tabular-nums ${stageColor}`}>
                      {currentWaterLevel >= 0 ? '+' : ''}{currentWaterLevel.toFixed(2)}m SURGE
                    </span>
                  </div>
                  <div className="flex min-w-40 flex-1 items-center gap-3">
                    <span className="whitespace-nowrap font-mono text-[10px] text-slate-400">-0.5m</span>
                    <input
                      type="range"
                      min="-0.5"
                      max="3.5"
                      step="0.05"
                      value={currentWaterLevel}
                      onChange={(event) => setCurrentWaterLevel(Number(event.target.value))}
                      aria-label="Simulated stage level"
                      aria-valuetext={`${currentWaterLevel.toFixed(2)} meters simulated stage`}
                      className="h-3 min-w-24 flex-1 cursor-pointer appearance-none rounded-full accent-cyan-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-700"
                      style={{
                        background: `linear-gradient(to right, #0891b2 0%, #0891b2 ${stagePosition}%, #e2e8f0 ${stagePosition}%, #e2e8f0 100%)`,
                      }}
                    />
                    <span className="whitespace-nowrap font-mono text-[10px] text-slate-400">+3.5m</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">INUNDATION:</span>
                    <span className="font-bold text-slate-900">{classStats.inundatedAreaHa.toFixed(2)} Hectares</span>
                  </div>
                  <span className="hidden text-slate-300 sm:inline">&bull;</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">STRUCTURES:</span>
                    <span className="font-bold text-red-600">
                      {classStats.floodedBuildings} Flooded / {classStats.totalBuildings} Total
                    </span>
                  </div>
                  <span className="hidden text-slate-300 sm:inline">&bull;</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">SEVERITY:</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${severityColor}`}>
                      {classStats.severityLevel}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">
                Drag the gauge to expand and raise an illustrative flood overlay across the image.
                Its spread and vertical exaggeration are simulated, not measured floodwater depth.
              </p>
            </section>
          </div>
        ) : null}

        {activeView !== 'image3d' && (
          <>
        {/* ────────────────── ALL 10 POSSIBLE CLASS BLOCKS INVENTORY ────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center space-x-2 font-mono text-xs font-bold text-slate-900">
              <Layers className="w-4 h-4 text-cyan-600" />
              <span>10-CLASS SPATIAL SEGMENTATION BLOCKS</span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              Correlated with FloodNet Benchmark &amp; NDMA SOP Guidelines
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-xs">
            {CLASS_SCHEMA.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-3 h-3 rounded-xs shrink-0 shadow-2xs"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-bold text-slate-900 text-[11px] truncate">
                      {item.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-cyan-800 font-semibold px-1.5 py-0.2 bg-white rounded border border-slate-200">
                    {item.count}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ────────────────── MISSION READOUT & GROUND CORRELATION ────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              CRITICAL FLOODING THRESHOLD
            </div>
            <div className="text-xl font-bold text-slate-900 font-sans">
              +{activeSector.criticalThreshold.toFixed(2)}m Above MSL
            </div>
            <p className="text-[11px] font-sans text-slate-600 leading-relaxed">
              When water level exceeds this threshold, lowland road arteries are completely severed and residential sill isolation occurs.
            </p>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              SIMULATED STRUCTURAL CASUALTY RISK
            </div>
            <div className={`text-xl font-bold font-sans ${classStats.floodedBuildings > 5 ? 'text-red-600' : 'text-emerald-700'}`}>
              {classStats.floodedBuildings} of {classStats.totalBuildings} Compromised
            </div>
            <p className="text-[11px] font-sans text-slate-600 leading-relaxed">
              Real-time depth collision marks ground-floor ingress. Priority evacuation recommended via the {activeSector.safeCorridor}.
            </p>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              FIELD ACTION READINESS
            </div>
            <div className="text-xl font-bold text-slate-900 font-sans">
              Tier-2 Emergency Staging
            </div>
            <p className="text-[11px] font-sans text-slate-600 leading-relaxed">
              Direct telemetry feeds into the FloodSense Chat Studio to generate automated SITREPs citing NDMA and NDRF protocols.
            </p>
          </div>
        </div>
          </>
        )}
      </main>

      {/* ────────────────── MINIMAL FOOTER ────────────────── */}
      <footer className="py-6 border-t border-slate-200 bg-white font-mono text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
          <div>
            &copy; {new Date().getFullYear()} FloodSense 3D Simulator &bull; WebGL 60 FPS
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/" className="hover:text-cyan-700">Home</Link>
            <Link href="/signin" className="hover:text-cyan-700">Sign In</Link>
            <Link href="/signup" className="hover:text-cyan-700">Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
