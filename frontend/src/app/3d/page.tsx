'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
  Split,
  CheckCircle2,
  AlertOctagon,
  TrendingUp,
  MapPin,
  Camera,
  Crosshair,
  Upload,
  Sparkles,
  RefreshCw,
  X
} from 'lucide-react';
import { FloodSenseLogo } from '../../components/ui/FloodSenseLogo';
import {
  FloodDigitalTwin3D,
  ClassStats,
  type CameraPreset
} from '../../components/three/FloodDigitalTwin3D';
import { ImageSegmentationRelief3D } from '../../components/three/ImageSegmentationRelief3D';
import { MaskViewer } from '../../components/MaskViewer';
import { api } from '../../lib/api';
import {
  FLOODNET_SAMPLES,
  loadFloodNetSampleImage,
  type FloodNetSampleId,
} from '../../lib/floodnet-samples';
import {
  computeHydrologyMetrics,
  getHypsometricTable,
  SCENE_SPECS,
  type HypsometricPoint,
  type HydrologyMetrics
} from '../../lib/hydrology';

type ActiveImageId = '10169' | '10815' | '6423' | 'uploaded';

export default function Standalone3DDigitalTwinPage() {
  const [activeImageId, setActiveImageId] = useState<ActiveImageId>('10169');
  const [activeView, setActiveView] = useState<'3d' | 'swipe' | 'image3d'>('3d');
  const [currentWaterLevel, setCurrentWaterLevel] = useState<number>(1.8);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('orbit');
  const [segmentationModel, setSegmentationModel] = useState<'segformer' | 'classical' | 'sam'>('segformer');
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [derivedAssets, setDerivedAssets] = useState<{
    imageUrl: string;
    segmentationUrl: string;
    classMaskUrl: string;
    depthMapUrl: string | null;
    imageWidth: number;
    imageHeight: number;
    modelName: string;
  } | null>(null);
  const [isBuildingImage3d, setIsBuildingImage3d] = useState(false);
  const [image3dError, setImage3dError] = useState<string | null>(null);

  const [classStats, setClassStats] = useState<ClassStats>({
    floodedBuildings: 7,
    totalBuildings: 12,
    floodedRoadUnits: 2.1,
    totalRoadUnits: 4.6,
    floodedVehicles: 4,
    totalVehicles: 8,
    simulatedAreaUnits: 4820,
    inundatedAreaM2: 4820,
    inundatedHectares: 0.482,
    inundatedPercent: 48.2,
    storageVolumeM3: 5410,
    severityLevel: 'CRITICAL',
  });

  const SECTORS: Record<'10169' | '10815' | '6423', {
    id: '10169' | '10815' | '6423';
    title: string;
    image: string;
    mask: string;
    scene: string;
    waterBaseline: number;
    basinType: string;
    structuresCount: number;
    criticalThreshold: number;
    description: string;
  }> = {
    '10169': {
      ...FLOODNET_SAMPLES['10169'],
      id: '10169',
      waterBaseline: 1.8,
      basinType: FLOODNET_SAMPLES['10169'].scene,
      structuresCount: 12,
      criticalThreshold: 1.2,
      description: 'Calibrated photogrammetric DSM with 0.5m contouring and critical road submersion at +1.2m.',
    },
    '10815': {
      ...FLOODNET_SAMPLES['10815'],
      id: '10815',
      waterBaseline: 2.2,
      basinType: FLOODNET_SAMPLES['10815'].scene,
      structuresCount: 15,
      criticalThreshold: 1.2,
      description: 'High-density residential floodplain; drainage canals overtop into residential streets.',
    },
    '6423': {
      ...FLOODNET_SAMPLES['6423'],
      id: '6423',
      waterBaseline: 1.0,
      basinType: FLOODNET_SAMPLES['6423'].scene,
      structuresCount: 8,
      criticalThreshold: 1.2,
      description: 'Perimeter retention basin swale with agricultural buffer.',
    },
  };

  const activeSector = activeImageId !== 'uploaded' ? SECTORS[activeImageId] : SECTORS['10169'];

  // Current active raw image URL
  const currentRawImageUrl = useMemo(() => {
    if (activeImageId === 'uploaded' && uploadedImageUrl) return uploadedImageUrl;
    return activeSector.image;
  }, [activeImageId, uploadedImageUrl, activeSector.image]);

  // Current active segmentation mask URL
  const currentMaskImageUrl = useMemo(() => {
    if (activeImageId === 'uploaded') {
      return derivedAssets?.segmentationUrl || derivedAssets?.classMaskUrl || '';
    }
    return activeSector.mask;
  }, [activeImageId, derivedAssets, activeSector.mask]);

  // Active title
  const activeTitle = useMemo(() => {
    if (activeImageId === 'uploaded') {
      return uploadedImage ? uploadedImage.name : 'Uploaded Survey Capture';
    }
    return activeSector.title;
  }, [activeImageId, uploadedImage, activeSector.title]);

  // Real-time engineering hydrology metrics derived from DSM
  const hydroMetrics: HydrologyMetrics = useMemo(() => {
    return computeHydrologyMetrics(currentWaterLevel);
  }, [currentWaterLevel]);

  // Standard Hypsometric table
  const hypsometricTable: HypsometricPoint[] = useMemo(() => {
    return getHypsometricTable();
  }, []);

  // Update object URL when file changes
  useEffect(() => {
    if (!uploadedImage) {
      setUploadedImageUrl(null);
      if (activeImageId === 'uploaded') setActiveImageId('10169');
      return;
    }
    const objectUrl = URL.createObjectURL(uploadedImage);
    setUploadedImageUrl(objectUrl);
    setActiveImageId('uploaded');
    return () => URL.revokeObjectURL(objectUrl);
  }, [uploadedImage]);

  // Automated or manual image 3D reconstruction & segmentation
  const buildImage3d = async (forcedView?: 'image3d' | 'swipe') => {
    setImage3dError(null);
    setIsBuildingImage3d(true);
    try {
      const isUpload = activeImageId === 'uploaded' && uploadedImage;
      const imageToProcess = isUpload
        ? uploadedImage
        : await loadFloodNetSampleImage(activeImageId === 'uploaded' ? '10169' : activeImageId);

      const input = { image: imageToProcess };

      // Call segmentation and relative depth in parallel
      const [segmentation, depthResult] = await Promise.all([
        api.segment({ ...input, model: segmentationModel }),
        api.depth(input).catch(() => null),
      ]);

      const sourceUrl = isUpload && uploadedImageUrl
        ? uploadedImageUrl
        : SECTORS[activeImageId === 'uploaded' ? '10169' : activeImageId].image;

      setDerivedAssets({
        imageUrl: sourceUrl,
        segmentationUrl: segmentation.overlay_url,
        classMaskUrl: segmentation.class_mask_url,
        depthMapUrl: depthResult ? depthResult.depth_map_url : null,
        imageWidth: segmentation.image_size.width,
        imageHeight: segmentation.image_size.height,
        modelName: segmentation.model_display_name,
      });

      if (forcedView) {
        setActiveView(forcedView);
      } else {
        setActiveView('image3d');
      }
    } catch (error) {
      setImage3dError(error instanceof Error ? error.message : 'Could not reconstruct 3D surface.');
    } finally {
      setIsBuildingImage3d(false);
    }
  };

  // 10 Standard FloodNet Semantic Classes
  const CLASS_SCHEMA = [
    { id: 0, name: 'Background', color: '#374151', desc: 'Background / unassigned scene pixels', count: 'Class 0' },
    { id: 1, name: 'Building-Flooded', color: '#DC2626', desc: 'Submerged structural ground floors', count: 'Class 1' },
    { id: 2, name: 'Building-Non-Flooded', color: '#B47878', desc: 'Safe elevated structures (ridge)', count: 'Class 2' },
    { id: 3, name: 'Road-Flooded', color: '#CA8A04', desc: 'Severed low-lying roadways (<1.2m)', count: 'Class 3' },
    { id: 4, name: 'Road-Non-Flooded', color: '#8C8C8C', desc: 'Safe elevated viaduct overpass (+3.3m)', count: 'Class 4' },
    { id: 5, name: 'Water', color: '#0284C7', desc: 'Inundation mesh & drainage canal', count: 'Class 5' },
    { id: 6, name: 'Tree', color: '#059669', desc: 'Riparian buffer vegetation canopy', count: 'Class 6' },
    { id: 7, name: 'Vehicle', color: '#7C3AED', desc: 'Mobile assets and transit vehicles', count: 'Class 7' },
    { id: 8, name: 'Pool', color: '#06B6D4', desc: 'Engineered stormwater retention basin', count: 'Class 8' },
    { id: 9, name: 'Grass', color: '#4ADE80', desc: 'Pervious turf and drainage swales', count: 'Class 9' },
  ];

  // SVG Hypsometric Curve Geometry Calculations
  const svgWidth = 460;
  const svgHeight = 180;
  const padL = 46;
  const padR = 24;
  const padT = 20;
  const padB = 30;
  const plotW = svgWidth - padL - padR;
  const plotH = svgHeight - padT - padB;

  const mapAreaToX = (a: number) => padL + (Math.max(0, Math.min(10000, a)) / 10000) * plotW;
  const mapStageToY = (s: number) => padT + (1 - Math.max(0, Math.min(4.0, s)) / 4.0) * plotH;

  const curvePoints = hypsometricTable.map((pt) => `${mapAreaToX(pt.areaM2).toFixed(1)},${mapStageToY(pt.stage).toFixed(1)}`);
  const curvePathD = `M ${curvePoints.join(' L ')}`;
  const activePointX = mapAreaToX(hydroMetrics.inundatedAreaM2);
  const activePointY = mapStageToY(currentWaterLevel);
  const threshold12Y = mapStageToY(1.2);
  const threshold26Y = mapStageToY(2.6);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col select-none">
      {/* ────────────────── TOP NAVIGATION HEADER ────────────────── */}
      <header className="sticky top-0 z-50 h-16 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <FloodSenseLogo size="sm" href="/" />
            <span className="text-slate-300 hidden sm:inline">|</span>
            <div className="flex items-center space-x-2">
              <Box className="w-4 h-4 text-cyan-600" />
              <h1 className="font-bold text-sm tracking-wider text-slate-900 font-mono">
                HYDROLOGICAL 3D DIGITAL TWIN
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

      {/* ────────────────── ACTIVE IMAGE SELECTOR & WORKBENCH TABS ────────────────── */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-3 font-mono text-xs">
          {/* Top row: Image Selector and View Modes */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Active Image Switcher (Synchronized Across All Tabs) */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Active Scene:</span>

              {/* Uploaded Image Pill (if present) */}
              {uploadedImage && (
                <button
                  onClick={() => {
                    setActiveImageId('uploaded');
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 shrink-0 cursor-pointer border ${
                    activeImageId === 'uploaded'
                      ? 'bg-cyan-50 border-cyan-600 text-cyan-950 font-bold shadow-2xs ring-1 ring-cyan-600'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Upload className="w-3 h-3 text-cyan-600" />
                  <span className="max-w-[130px] truncate">{uploadedImage.name}</span>
                  <span className="text-[9px] bg-cyan-100 text-cyan-800 px-1 py-0.2 rounded font-bold uppercase">Active</span>
                </button>
              )}

              {/* Sample Images */}
              {(['10169', '10815', '6423'] as const).map((sId) => (
                <button
                  key={sId}
                  onClick={() => {
                    setActiveImageId(sId);
                    setCurrentWaterLevel(SECTORS[sId].waterBaseline);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-2 shrink-0 cursor-pointer border ${
                    activeImageId === sId
                      ? 'bg-cyan-50 border-cyan-600 text-cyan-950 font-bold shadow-2xs ring-1 ring-cyan-600'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${activeImageId === sId ? 'bg-cyan-600' : 'bg-slate-300'}`} />
                  <span>Image {sId}</span>
                </button>
              ))}
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setActiveView('3d')}
                className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold transition-all border cursor-pointer ${
                  activeView === '3d'
                    ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Box className="w-3.5 h-3.5 text-cyan-400" />
                <span>3D Hydro Twin</span>
              </button>
              <button
                onClick={() => {
                  if (activeImageId === 'uploaded' && !derivedAssets) {
                    void buildImage3d('swipe');
                  } else {
                    setActiveView('swipe');
                  }
                }}
                className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold transition-all border cursor-pointer ${
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
                  else void buildImage3d('image3d');
                }}
                disabled={isBuildingImage3d}
                className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold transition-all border cursor-pointer ${
                  activeView === 'image3d'
                    ? 'bg-violet-700 border-violet-700 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                } disabled:cursor-wait disabled:opacity-60`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>{isBuildingImage3d ? 'Reconstructing…' : 'Photogrammetric 3D'}</span>
              </button>
            </div>
          </div>

          {/* Bottom row: Upload tool & model selection */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs">
              <Upload className="w-3.5 h-3.5 text-cyan-600" />
              <span>{uploadedImage ? `Uploaded: ${uploadedImage.name}` : 'Upload custom aerial survey image'}</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={isBuildingImage3d}
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (file) {
                    setUploadedImage(file);
                    setDerivedAssets(null);
                    setImage3dError(null);
                  }
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
                  setActiveImageId('10169');
                  setActiveView('3d');
                }}
                className="text-slate-500 hover:text-red-600 disabled:opacity-50 flex items-center space-x-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear upload</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void buildImage3d()}
              disabled={isBuildingImage3d}
              className="rounded-lg bg-violet-700 px-3 py-1.5 font-semibold text-white hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60 flex items-center space-x-1.5 shadow-2xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isBuildingImage3d ? 'Generating Photogrammetric 3D…' : 'Reconstruct Photogrammetric 3D'}</span>
            </button>

            <label className="flex items-center gap-2 text-slate-600">
              Model:
              <select
                value={segmentationModel}
                disabled={isBuildingImage3d}
                onChange={(event) => {
                  setSegmentationModel(event.target.value as 'segformer' | 'classical' | 'sam');
                  setDerivedAssets(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-800 disabled:opacity-50"
              >
                <option value="segformer">SegFormer-B4 (Recommended)</option>
                <option value="classical">Classical CV</option>
                <option value="sam">Segment Anything (SAM)</option>
              </select>
            </label>

            {image3dError && (
              <p role="alert" className="basis-full text-red-700 bg-red-50 p-2 rounded border border-red-200">{image3dError}</p>
            )}
          </div>
        </div>
      </div>

      {/* ────────────────── MAIN WORKBENCH ────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1 space-y-6">
        {activeView === '3d' ? (
          /* 3D WebGL Digital Twin & Engineering Hydrology Readout */
          <div className="w-full space-y-6">
            {/* Viewport Presets Toolbar */}
            <div className="flex flex-wrap items-center justify-between p-3 bg-white border border-slate-200 rounded-xl shadow-2xs gap-3 font-mono text-xs">
              <div className="flex items-center space-x-2">
                <Camera className="w-4 h-4 text-cyan-600" />
                <span className="font-bold text-slate-900">Engineering Viewport Presets:</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCameraPreset('nadir')}
                  className={`px-3 py-1.5 rounded-lg border flex items-center space-x-1.5 transition-colors cursor-pointer ${
                    cameraPreset === 'nadir'
                      ? 'bg-cyan-50 border-cyan-500 text-cyan-900 font-bold shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title="90° Overhead Top-Down Ortho Perspective"
                >
                  <Crosshair className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Nadir (Top-Down Ortho)</span>
                </button>
                <button
                  onClick={() => setCameraPreset('oblique')}
                  className={`px-3 py-1.5 rounded-lg border flex items-center space-x-1.5 transition-colors cursor-pointer ${
                    cameraPreset === 'oblique'
                      ? 'bg-cyan-50 border-cyan-500 text-cyan-900 font-bold shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title="45° Oblique Survey Angle"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Oblique 45°</span>
                </button>
                <button
                  onClick={() => setCameraPreset('isometric')}
                  className={`px-3 py-1.5 rounded-lg border flex items-center space-x-1.5 transition-colors cursor-pointer ${
                    cameraPreset === 'isometric'
                      ? 'bg-cyan-50 border-cyan-500 text-cyan-900 font-bold shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title="Axonometric Isometric Engineering Projection"
                >
                  <Box className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Isometric</span>
                </button>
                <button
                  onClick={() => setCameraPreset('orbit')}
                  className={`px-3 py-1.5 rounded-lg border flex items-center space-x-1.5 transition-colors cursor-pointer ${
                    cameraPreset === 'orbit'
                      ? 'bg-cyan-50 border-cyan-500 text-cyan-900 font-bold shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title="360° Drone Inspection Orbit"
                >
                  <Compass className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Drone Orbit</span>
                </button>
              </div>
            </div>

            {/* 3D WebGL Digital Twin Viewer */}
            <FloodDigitalTwin3D
              initialWaterLevel={currentWaterLevel}
              sectorName={activeTitle}
              activeCameraPreset={cameraPreset}
              onCameraPresetChange={(p) => setCameraPreset(p)}
              onWaterLevelChange={(lvl) => setCurrentWaterLevel(lvl)}
              onStatsChange={(st) => setClassStats(st)}
              onSwitchToSwipe={() => {
                if (activeImageId === 'uploaded' && !derivedAssets) {
                  void buildImage3d('swipe');
                } else {
                  setActiveView('swipe');
                }
              }}
              className="w-full"
            />

            {/* ────────────────── ENGINEERING HYDROLOGY READOUT ────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-6">
              {/* Header and Live Status Banner */}
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-cyan-600" />
                    <h2 className="text-sm font-bold text-slate-900 font-mono tracking-wider">
                      ENGINEERING HYDROLOGY READOUT &bull; HYPSOMETRIC PROFILE
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500">
                    Real-time stage-storage integration across 10,000 m² (1.00 ha) photogrammetric DSM.
                  </p>
                </div>

                {/* Live Critical Threshold Alert Badge */}
                <div className={`px-4 py-2 rounded-lg border font-mono text-xs flex items-center space-x-2.5 ${
                  hydroMetrics.activeAlert.type === 'critical'
                    ? 'bg-red-50 border-red-300 text-red-900'
                    : hydroMetrics.activeAlert.type === 'danger'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : hydroMetrics.activeAlert.type === 'warning'
                    ? 'bg-yellow-50 border-yellow-300 text-yellow-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                }`}>
                  {hydroMetrics.activeAlert.type === 'critical' || hydroMetrics.activeAlert.type === 'danger' ? (
                    <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 animate-bounce" />
                  ) : hydroMetrics.activeAlert.type === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold">{hydroMetrics.activeAlert.title}</div>
                    <div className="text-[10px] opacity-80">{hydroMetrics.activeAlert.description}</div>
                  </div>
                </div>
              </div>

              {/* Real-Time Key Hydrologic Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Simulated Stage</span>
                  <div className="text-xl font-bold text-slate-900">
                    +{hydroMetrics.stage.toFixed(1)} m
                  </div>
                  <div className="text-[10px] text-slate-400">Relative to thalweg datum</div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Inundated Area</span>
                  <div className="text-xl font-bold text-cyan-900">
                    {hydroMetrics.inundatedAreaM2.toLocaleString()} m²
                  </div>
                  <div className="text-[10px] text-cyan-700 font-semibold">
                    {hydroMetrics.inundatedHectares.toFixed(3)} ha ({hydroMetrics.inundatedPercent}%)
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Storage Volume</span>
                  <div className="text-xl font-bold text-slate-900">
                    {hydroMetrics.storageVolumeM3.toLocaleString()} m³
                  </div>
                  <div className="text-[10px] text-slate-400">Integrated water column</div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Hydraulic Severity</span>
                  <div className={`text-base font-bold mt-1 inline-block px-2 py-0.5 rounded ${
                    hydroMetrics.severityLevel === 'CATASTROPHIC'
                      ? 'bg-red-100 text-red-800'
                      : hydroMetrics.severityLevel === 'CRITICAL'
                      ? 'bg-amber-100 text-amber-800'
                      : hydroMetrics.severityLevel === 'ADVISORY'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {hydroMetrics.severityLevel}
                  </div>
                  <div className="text-[10px] text-slate-400">Civil protection level</div>
                </div>
              </div>

              {/* Interactive Hypsometric Curve & Area-Capacity Table */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* SVG Hypsometric Curve Chart */}
                <div className="lg:col-span-6 p-4 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-3 font-mono">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5 font-bold">
                      <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Real-Time Hypsometric Curve [H vs. Area]</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Rating Profile</span>
                  </div>

                  <div className="w-full overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                      className="w-full h-44 select-none"
                    >
                      {/* Grid Lines */}
                      {[0, 1.0, 2.0, 3.0, 4.0].map((s) => {
                        const y = mapStageToY(s);
                        return (
                          <g key={`grid-y-${s}`}>
                            <line
                              x1={padL}
                              y1={y}
                              x2={svgWidth - padR}
                              y2={y}
                              stroke="#334155"
                              strokeDasharray="2,2"
                              strokeWidth="1"
                            />
                            <text
                              x={padL - 6}
                              y={y + 3}
                              fill="#94a3b8"
                              fontSize="9"
                              textAnchor="end"
                              fontFamily="monospace"
                            >
                              {s.toFixed(1)}m
                            </text>
                          </g>
                        );
                      })}

                      {[0, 2500, 5000, 7500, 10000].map((a) => {
                        const x = mapAreaToX(a);
                        return (
                          <g key={`grid-x-${a}`}>
                            <line
                              x1={x}
                              y1={padT}
                              x2={x}
                              y2={svgHeight - padB}
                              stroke="#334155"
                              strokeDasharray="2,2"
                              strokeWidth="1"
                            />
                            <text
                              x={x}
                              y={svgHeight - padB + 14}
                              fill="#94a3b8"
                              fontSize="9"
                              textAnchor="middle"
                              fontFamily="monospace"
                            >
                              {a >= 1000 ? `${a / 1000}k` : a}
                            </text>
                          </g>
                        );
                      })}

                      {/* Threshold Markers */}
                      {/* Road Submersion Threshold (+1.2m) */}
                      <line
                        x1={padL}
                        y1={threshold12Y}
                        x2={svgWidth - padR}
                        y2={threshold12Y}
                        stroke="#f59e0b"
                        strokeDasharray="4,3"
                        strokeWidth="1.5"
                      />
                      <text
                        x={svgWidth - padR - 4}
                        y={threshold12Y - 4}
                        fill="#f59e0b"
                        fontSize="8"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        ROAD SUBMERSION (+1.2m)
                      </text>

                      {/* Highland Overpass Threatened (+2.6m) */}
                      <line
                        x1={padL}
                        y1={threshold26Y}
                        x2={svgWidth - padR}
                        y2={threshold26Y}
                        stroke="#ef4444"
                        strokeDasharray="4,3"
                        strokeWidth="1.5"
                      />
                      <text
                        x={svgWidth - padR - 4}
                        y={threshold26Y - 4}
                        fill="#ef4444"
                        fontSize="8"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        HIGHLAND THRESHOLD (+2.6m)
                      </text>

                      {/* Hypsometric Area Curve */}
                      <path
                        d={curvePathD}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />

                      {/* Active Stage Indicator Crosshairs */}
                      <line
                        x1={padL}
                        y1={activePointY}
                        x2={activePointX}
                        y2={activePointY}
                        stroke="#38bdf8"
                        strokeWidth="1.2"
                      />
                      <line
                        x1={activePointX}
                        y1={activePointY}
                        x2={activePointX}
                        y2={svgHeight - padB}
                        stroke="#38bdf8"
                        strokeWidth="1.2"
                      />

                      {/* Pulsing Active Indicator Dot */}
                      <circle
                        cx={activePointX}
                        cy={activePointY}
                        r="6"
                        fill="#38bdf8"
                        fillOpacity="0.3"
                      />
                      <circle
                        cx={activePointX}
                        cy={activePointY}
                        r="3.5"
                        fill="#ffffff"
                        stroke="#0284c7"
                        strokeWidth="2"
                      />
                    </svg>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                    <span>X-Axis: Inundated Area (m²)</span>
                    <span>Y-Axis: Stage Height (m)</span>
                    <span className="text-cyan-400 font-bold">Active: +{hydroMetrics.stage.toFixed(1)}m</span>
                  </div>
                </div>

                {/* Area-Capacity Rating Table */}
                <div className="lg:col-span-6 border border-slate-200 rounded-xl overflow-hidden font-mono text-xs">
                  <div className="bg-slate-100 px-3.5 py-2.5 border-b border-slate-200 font-bold text-slate-800 flex items-center justify-between">
                    <span>Area-Capacity Rating Table (HEC-RAS Standards)</span>
                    <span className="text-[10px] text-slate-500 font-normal">Tile: 10,000 m²</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Stage</th>
                          <th className="py-2 px-3">Area (m²)</th>
                          <th className="py-2 px-3">Area (ha)</th>
                          <th className="py-2 px-3">Storage (m³)</th>
                          <th className="py-2 px-3">Hydraulic State</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {hypsometricTable.map((row) => {
                          const isCurrent = Math.abs(currentWaterLevel - row.stage) < 0.2;
                          return (
                            <tr
                              key={row.stage}
                              onClick={() => setCurrentWaterLevel(row.stage)}
                              className={`cursor-pointer transition-colors ${
                                isCurrent
                                  ? 'bg-cyan-50 text-cyan-950 font-bold border-l-4 border-cyan-600'
                                  : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <td className="py-1.5 px-3 whitespace-nowrap">
                                +{row.stage.toFixed(1)}m
                              </td>
                              <td className="py-1.5 px-3 tabular-nums">
                                {row.areaM2.toLocaleString()}
                              </td>
                              <td className="py-1.5 px-3 tabular-nums">
                                {row.hectares.toFixed(3)}
                              </td>
                              <td className="py-1.5 px-3 tabular-nums">
                                {row.storageVolumeM3.toLocaleString()}
                              </td>
                              <td className="py-1.5 px-3 text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded ${
                                  row.isThreshold
                                    ? row.stage === 1.2
                                      ? 'bg-amber-100 text-amber-900 font-bold'
                                      : 'bg-red-100 text-red-900 font-bold'
                                    : 'text-slate-500'
                                }`}>
                                  {row.stateLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-2 bg-slate-50 text-[10px] text-slate-500 border-t border-slate-200">
                    Click any stage row above to simulate and align the 3D twin to that exact water level.
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Switch to Swipe 2D Optical Telemetry */}
            <div className="p-4 bg-white border border-cyan-200 rounded-xl flex items-center justify-between text-xs font-mono shadow-2xs">
              <div className="flex items-center space-x-3">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 animate-pulse" />
                <span className="font-semibold text-slate-900">Inspect 2D UAV Optical Sensor Telemetry on {activeTitle}?</span>
                <span className="text-slate-500 hidden sm:inline">&bull; Compare photogrammetric capture against 10-class segmentation mask.</span>
              </div>
              <button
                onClick={() => {
                  if (activeImageId === 'uploaded' && !derivedAssets) {
                    void buildImage3d('swipe');
                  } else {
                    setActiveView('swipe');
                  }
                }}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg flex items-center space-x-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <span>Swipe Segmentation</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : activeView === 'swipe' ? (
          /* Swipe Segmentation Comparison View (STAYS ON CURRENT ACTIVE IMAGE!) */
          <div className="w-full bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs font-mono">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span className="text-slate-900 font-semibold">{activeTitle}</span>
                <span className="text-slate-500 hidden sm:inline">
                  ({activeImageId === 'uploaded' ? 'Custom Uploaded Scene' : activeSector.basinType})
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] text-cyan-800 font-semibold px-2 py-0.5 bg-cyan-50 border border-cyan-200 rounded">
                  SWIPE COMPARISON ACTIVE
                </span>
                <button
                  onClick={() => setActiveView('3d')}
                  className="px-2.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] rounded border border-slate-200 transition-colors cursor-pointer"
                >
                  Return to 3D Twin
                </button>
              </div>
            </div>

            {/* If uploaded image needs segmentation first */}
            {activeImageId === 'uploaded' && !currentMaskImageUrl && isBuildingImage3d ? (
              <div className="h-96 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-lg p-6 space-y-3 bg-slate-50/50">
                <RefreshCw className="w-6 h-6 text-cyan-600 animate-spin" />
                <span className="font-mono text-xs text-slate-600 font-semibold">
                  Generating high-accuracy SegFormer segmentation for {activeTitle}…
                </span>
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden border border-slate-200">
                <MaskViewer
                  sampleId={activeImageId}
                  rawImageUrl={currentRawImageUrl}
                  maskImageUrl={currentMaskImageUrl || currentRawImageUrl}
                />
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1">
              <span>Drag divider horizontally or use circular inspection loupe to reveal raw UAV capture vs. segmentation.</span>
              <span className="font-semibold text-cyan-800">10-Class Calibrated Model Overlay</span>
            </div>
          </div>
        ) : derivedAssets ? (
          /* Photogrammetric 3D Relief View */
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
              {/* 3D Photogrammetric Relief Viewer */}
              <div className="space-y-3">
                <ImageSegmentationRelief3D
                  imageUrl={derivedAssets.imageUrl}
                  segmentationUrl={derivedAssets.segmentationUrl}
                  classMaskUrl={derivedAssets.classMaskUrl}
                  depthMapUrl={derivedAssets.depthMapUrl}
                  imageWidth={derivedAssets.imageWidth}
                  imageHeight={derivedAssets.imageHeight}
                  simulatedStage={currentWaterLevel}
                />

                {/* Calibrated Stage Slider for Photogrammetric 3D */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Stage Hydro Gauge:</span>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded border tabular-nums ${
                      currentWaterLevel >= 2.6
                        ? 'bg-red-50 text-red-700 border-red-300'
                        : currentWaterLevel >= 1.2
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-cyan-50 text-cyan-800 border-cyan-200'
                    }`}>
                      +{currentWaterLevel.toFixed(1)}m STAGE
                    </span>
                  </div>

                  <div className="flex-1 w-full flex items-center space-x-3">
                    <span className="text-[10px] text-slate-400 font-mono">0.0m</span>
                    <input
                      type="range"
                      min="0.0"
                      max="4.0"
                      step="0.1"
                      value={currentWaterLevel}
                      onChange={(e) => setCurrentWaterLevel(parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-slate-200 appearance-none cursor-pointer accent-cyan-600 rounded-lg"
                    />
                    <span className="text-[10px] text-slate-400 font-mono">+4.0m</span>
                  </div>

                  <div className="flex items-center space-x-4 shrink-0 text-[11px]">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-slate-400">INUNDATED:</span>
                      <span className="font-bold text-slate-900 tabular-nums">
                        {hydroMetrics.inundatedAreaM2.toLocaleString()} m² ({hydroMetrics.inundatedPercent}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar with Image Telemetry */}
              <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h2 className="text-sm font-bold text-slate-900 font-sans">Active Photogrammetric Scene</h2>
                  <span className="text-[10px] text-cyan-800 font-semibold px-2 py-0.5 bg-cyan-50 rounded border border-cyan-200">
                    RECONSTRUCTED
                  </span>
                </div>

                <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                  <img
                    src={derivedAssets.imageUrl}
                    alt={activeTitle}
                    className="max-h-52 w-full object-cover"
                  />
                </div>

                <dl className="space-y-2 text-xs divide-y divide-slate-100">
                  <div className="pt-2 flex justify-between">
                    <dt className="text-slate-500">Image Source</dt>
                    <dd className="font-bold text-slate-900 truncate max-w-[150px]">{activeTitle}</dd>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <dt className="text-slate-500">Segmentation Model</dt>
                    <dd className="font-bold text-cyan-800">{derivedAssets.modelName}</dd>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <dt className="text-slate-500">3D Elevation Relief</dt>
                    <dd className="font-bold text-slate-900">
                      {derivedAssets.depthMapUrl ? 'Depth Anything V2 + Semantic DSM' : 'Photogrammetric DSM Extrusions'}
                    </dd>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <dt className="text-slate-500">Raster Resolution</dt>
                    <dd className="font-bold text-slate-900 tabular-nums">
                      {derivedAssets.imageWidth} &times; {derivedAssets.imageHeight} px
                    </dd>
                  </div>
                </dl>

                <div className="pt-2 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setActiveView('swipe')}
                    className="flex-1 py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-center font-semibold transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <Split className="w-3.5 h-3.5" />
                    <span>Swipe View</span>
                  </button>
                  <button
                    onClick={() => setActiveView('3d')}
                    className="flex-1 py-2 px-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-center font-semibold transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <Box className="w-3.5 h-3.5" />
                    <span>Digital Twin</span>
                  </button>
                </div>
              </aside>
            </div>
          </div>
        ) : null}

        {activeView !== 'image3d' && (
          <>
            {/* ────────────────── 10 SEMANTIC CLASS INVENTORY ────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center space-x-2 font-mono text-xs font-bold text-slate-900">
                  <Layers className="w-4 h-4 text-cyan-600" />
                  <span>10-CLASS SPATIAL PHOTOGRAMMETRIC SPECIFICATION</span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  FloodNet Survey Schema &bull; Elevation Calibrated
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

            {/* ────────────────── HYDROLOGICAL SPECIFICATION CARDS ────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  ROAD SUBMERSION THRESHOLD
                </div>
                <div className="text-xl font-bold text-amber-700 font-sans">
                  +1.20 m Stage
                </div>
                <p className="text-[11px] font-sans text-slate-600 leading-relaxed">
                  Eastern Basin Main Avenue and canal crossings submerge. Inundated road network impassable for emergency vehicle access.
                </p>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  STRUCTURAL INGRESS THRESHOLD
                </div>
                <div className={`text-xl font-bold font-sans ${classStats.floodedBuildings > 4 ? 'text-red-600' : 'text-slate-900'}`}>
                  +1.80 m Stage ({classStats.floodedBuildings}/{classStats.totalBuildings} Submerged)
                </div>
                <p className="text-[11px] font-sans text-slate-600 leading-relaxed">
                  Lowland commercial depot, warehouse, and primary school annexe ground floors inundated.
                </p>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  HIGHLAND EVACUATION CORRIDOR
                </div>
                <div className="text-xl font-bold text-emerald-700 font-sans">
                  +3.30 m Elevated Viaduct
                </div>
                <p className="text-[11px] font-sans text-slate-600 leading-relaxed">
                  West Highland arterial overpass maintains structural clearance and connectivity to hospital shelter up to +2.6m stage.
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ────────────────── FOOTER ────────────────── */}
      <footer className="py-6 border-t border-slate-200 bg-white font-mono text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
          <div>
            &copy; {new Date().getFullYear()} FloodSense Hydrological Digital Twin &bull; 0.5m DSM Contour Standard &bull; WebGL 60 FPS
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
