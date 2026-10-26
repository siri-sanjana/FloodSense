'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Play,
  Pause,
  RotateCcw,
  Eye,
  Layers,
  ShieldAlert,
  Compass,
  Sliders,
  Maximize2,
  Navigation,
  Waves,
  CloudRain,
  Car,
  Building,
  Trees,
  Route,
  Droplets,
  Split,
  ChevronDown,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Info
} from 'lucide-react';
import {
  getDSMElevation,
  computeHydrologyMetrics,
  SCENE_SPECS,
  type HydrologyMetrics
} from '../../lib/hydrology';
import type { DetectedStructure, DamageMetrics } from '../../lib/api';

export interface ClassStats {
  floodedBuildings: number;
  totalBuildings: number;
  floodedRoadUnits: number;
  totalRoadUnits: number;
  floodedVehicles: number;
  totalVehicles: number;
  simulatedAreaUnits: number;
  inundatedAreaM2: number;
  inundatedHectares: number;
  inundatedPercent: number;
  storageVolumeM3: number;
  severityLevel: 'NORMAL' | 'ADVISORY' | 'CRITICAL' | 'CATASTROPHIC';
}

export type CameraPreset = 'nadir' | 'oblique' | 'isometric' | 'orbit';

interface FloodDigitalTwin3DProps {
  initialWaterLevel?: number; // Calibrated Stage Height in meters (0.0m to 4.0m)
  sectorName?: string;
  sectorId?: string;
  detectedStructures?: DetectedStructure[];
  damageMetrics?: DamageMetrics;
  onWaterLevelChange?: (level: number) => void;
  onStatsChange?: (stats: ClassStats) => void;
  onSwitchToSwipe?: () => void;
  activeCameraPreset?: CameraPreset;
  onCameraPresetChange?: (preset: CameraPreset) => void;
  className?: string;
}

/**
 * Generates Marching Squares 3D topographic contour line segments at exact 0.5m elevation intervals.
 */
function generateTopographicContours(sectorId?: string): {
  majorLinesGeo: THREE.BufferGeometry;
  minorLinesGeo: THREE.BufferGeometry;
} {
  const segments = 72;
  const size = 36;
  const halfSize = size / 2;
  const dx = size / segments;
  const dz = size / segments;

  const majorCoords: number[] = [];
  const minorCoords: number[] = [];

  // Elevation contour levels: 0.5m intervals from 0.5m to 3.5m
  const contourLevels = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5];

  for (const h of contourLevels) {
    const isMajor = Math.abs(h % 1.0) < 0.05; // 1.0m, 2.0m, 3.0m are major index contours
    const targetArr = isMajor ? majorCoords : minorCoords;
    const yOffset = h + 0.025; // 25mm elevation offset above mesh prevents z-fighting

    for (let j = 0; j < segments; j++) {
      const z0 = -halfSize + j * dz;
      const z1 = z0 + dz;

      for (let i = 0; i < segments; i++) {
        const x0 = -halfSize + i * dx;
        const x1 = x0 + dx;

        const e00 = getDSMElevation(x0, z0, sectorId);
        const e10 = getDSMElevation(x1, z0, sectorId);
        const e11 = getDSMElevation(x1, z1, sectorId);
        const e01 = getDSMElevation(x0, z1, sectorId);

        const b0 = e00 >= h ? 1 : 0;
        const b1 = e10 >= h ? 2 : 0;
        const b2 = e11 >= h ? 4 : 0;
        const b3 = e01 >= h ? 8 : 0;
        const mask = b0 | b1 | b2 | b3;

        if (mask === 0 || mask === 15) continue;

        // Edge crossing coordinates
        const t0 = (h - e00) / (e10 - e00 || 1e-6);
        const p0x = x0 + t0 * dx;
        const p0z = z0;

        const t1 = (h - e10) / (e11 - e10 || 1e-6);
        const p1x = x1;
        const p1z = z0 + t1 * dz;

        const t2 = (h - e01) / (e11 - e01 || 1e-6);
        const p2x = x0 + t2 * dx;
        const p2z = z1;

        const t3 = (h - e00) / (e01 - e00 || 1e-6);
        const p3x = x0;
        const p3z = z0 + t3 * dz;

        const pushSegment = (xa: number, za: number, xb: number, zb: number) => {
          targetArr.push(xa, yOffset, za, xb, yOffset, zb);
        };

        switch (mask) {
          case 1:
          case 14:
            pushSegment(p0x, p0z, p3x, p3z);
            break;
          case 2:
          case 13:
            pushSegment(p0x, p0z, p1x, p1z);
            break;
          case 3:
          case 12:
            pushSegment(p1x, p1z, p3x, p3z);
            break;
          case 4:
          case 11:
            pushSegment(p1x, p1z, p2x, p2z);
            break;
          case 5:
            pushSegment(p0x, p0z, p3x, p3z);
            pushSegment(p1x, p1z, p2x, p2z);
            break;
          case 6:
          case 9:
            pushSegment(p0x, p0z, p2x, p2z);
            break;
          case 7:
          case 8:
            pushSegment(p2x, p2z, p3x, p3z);
            break;
          case 10:
            pushSegment(p0x, p0z, p1x, p1z);
            pushSegment(p2x, p2z, p3x, p3z);
            break;
        }
      }
    }
  }

  const majorLinesGeo = new THREE.BufferGeometry();
  majorLinesGeo.setAttribute('position', new THREE.Float32BufferAttribute(majorCoords, 3));

  const minorLinesGeo = new THREE.BufferGeometry();
  minorLinesGeo.setAttribute('position', new THREE.Float32BufferAttribute(minorCoords, 3));

  return { majorLinesGeo, minorLinesGeo };
}

export const FloodDigitalTwin3D: React.FC<FloodDigitalTwin3DProps> = ({
  initialWaterLevel = 1.8,
  sectorName = 'FloodNet Survey Sector 10169',
  sectorId = '10169',
  detectedStructures,
  damageMetrics,
  onWaterLevelChange,
  onStatsChange,
  onSwitchToSwipe,
  activeCameraPreset,
  onCameraPresetChange,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [waterLevel, setWaterLevel] = useState<number>(initialWaterLevel);
  const [droneOrbit, setDroneOrbit] = useState<boolean>(true);
  const [cameraMode, setCameraMode] = useState<CameraPreset>(activeCameraPreset || 'orbit');
  const [isRaining, setIsRaining] = useState<boolean>(false);
  const [showContours, setShowContours] = useState<boolean>(true);

  // Sync external camera preset if passed
  useEffect(() => {
    if (activeCameraPreset && activeCameraPreset !== cameraMode) {
      setCameraMode(activeCameraPreset);
    }
  }, [activeCameraPreset]);

  // Class visibility toggles
  const [visibleClasses, setVisibleClasses] = useState({
    buildings: true,
    roads: true,
    vehicles: true,
    trees: true,
    water: true,
    pools: true,
    contours: true,
  });

  const [stats, setStats] = useState<ClassStats>({
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

  const [cameraTelemetry, setCameraTelemetry] = useState({ pitch: 35, yaw: 45, alt: 140 });

  // Refs for Three.js objects
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const terrainGeoRef = useRef<THREE.PlaneGeometry | null>(null);
  const buildingsGroupRef = useRef<THREE.Group | null>(null);
  const roadsGroupRef = useRef<THREE.Group | null>(null);
  const vehiclesGroupRef = useRef<THREE.Group | null>(null);
  const treesGroupRef = useRef<THREE.Group | null>(null);
  const poolsGroupRef = useRef<THREE.Group | null>(null);
  const contourGroupRef = useRef<THREE.Group | null>(null);
  const rainSystemRef = useRef<THREE.Points | null>(null);

  const orbitAngleRef = useRef<number>(0.75);
  const isOrbitingRef = useRef<boolean>(true);
  const targetWaterLevelRef = useRef<number>(initialWaterLevel);
  const cameraModeRef = useRef<CameraPreset>('orbit');

  const setCameraPresetMode = (mode: CameraPreset) => {
    setCameraMode(mode);
    cameraModeRef.current = mode;
    if (onCameraPresetChange) onCameraPresetChange(mode);
  };

  useEffect(() => {
    targetWaterLevelRef.current = waterLevel;
    if (onWaterLevelChange) onWaterLevelChange(waterLevel);
  }, [waterLevel, onWaterLevelChange]);

  useEffect(() => {
    isOrbitingRef.current = droneOrbit && cameraMode === 'orbit';
  }, [droneOrbit, cameraMode]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  // Update visibility of 3D groups when toggled
  useEffect(() => {
    if (buildingsGroupRef.current) buildingsGroupRef.current.visible = visibleClasses.buildings;
    if (roadsGroupRef.current) roadsGroupRef.current.visible = visibleClasses.roads;
    if (vehiclesGroupRef.current) vehiclesGroupRef.current.visible = visibleClasses.vehicles;
    if (treesGroupRef.current) treesGroupRef.current.visible = visibleClasses.trees;
    if (waterMeshRef.current) waterMeshRef.current.visible = visibleClasses.water;
    if (poolsGroupRef.current) poolsGroupRef.current.visible = visibleClasses.pools;
    if (contourGroupRef.current) contourGroupRef.current.visible = visibleClasses.contours && showContours;
  }, [visibleClasses, showContours]);

  // Three.js Initialization & Render Loop
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 600;

    // 1. Scene, Camera, Daylight Atmosphere
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    scene.fog = new THREE.FogExp2(0xf8fafc, 0.012);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 350);
    camera.position.set(22, 22, 22);
    camera.lookAt(0, 1.2, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Calibrated Daylight & Diffuse Hemispheric Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.5);
    sunLight.position.set(28, 45, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 110;
    sunLight.shadow.camera.left = -26;
    sunLight.shadow.camera.right = 26;
    sunLight.shadow.camera.top = 26;
    sunLight.shadow.camera.bottom = -26;
    scene.add(sunLight);

    const skyFill = new THREE.DirectionalLight(0xbae6fd, 0.85);
    skyFill.position.set(-20, 25, -20);
    scene.add(skyFill);

    // 3. Precision Digital Surface Model (DSM) Topographic Mesh (36m x 36m equivalent)
    const segments = 72;
    const terrainGeo = new THREE.PlaneGeometry(36, 36, segments, segments);
    terrainGeo.rotateX(-Math.PI / 2);
    terrainGeoRef.current = terrainGeo;

    const posAttr = terrainGeo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const elev = getDSMElevation(x, z, sectorId);
      posAttr.setY(i, elev);

      // Initial clean terrain dry color palette
      const normH = Math.min(1, Math.max(0, (elev - 0.2) / 3.4));
      colors[i * 3] = 0.88 + normH * 0.05;
      colors[i * 3 + 1] = 0.91 + normH * 0.04;
      colors[i * 3 + 2] = 0.94 - normH * 0.02;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.05,
      flatShading: false,
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.receiveShadow = true;
    scene.add(terrain);

    // 4. Marching Squares Topographic Contour Lines (0.5m Intervals)
    const { majorLinesGeo, minorLinesGeo } = generateTopographicContours(sectorId);
    const contourGroup = new THREE.Group();
    contourGroupRef.current = contourGroup;
    scene.add(contourGroup);

    // Major 1.0m Index Contours (Bolder dark slate)
    const majorContourMat = new THREE.LineBasicMaterial({
      color: 0x334155,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });
    const majorContours = new THREE.LineSegments(majorLinesGeo, majorContourMat);
    contourGroup.add(majorContours);

    // Intermediate 0.5m Contours (Subtle muted slate)
    const minorContourMat = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      linewidth: 1,
      transparent: true,
      opacity: 0.55,
    });
    const minorContours = new THREE.LineSegments(minorLinesGeo, minorContourMat);
    contourGroup.add(minorContours);

    // Subtle survey boundary coordinate grid
    const datumGrid = new THREE.GridHelper(36, 18, 0x94a3b8, 0xe2e8f0);
    datumGrid.position.y = 0.05;
    scene.add(datumGrid);

    // 5. CLASS 1 & 2: BUILDINGS (Dynamically derived from real image detection)
    const bldgGroup = new THREE.Group();
    buildingsGroupRef.current = bldgGroup;
    scene.add(bldgGroup);

    interface Building3DItem {
      id: string;
      x: number;
      z: number;
      w: number;
      d: number;
      h: number;
      baseElev: number;
      name: string;
      isFloodedInitially?: boolean;
    }

    let bldgData: Building3DItem[] = [];

    if (detectedStructures && detectedStructures.length > 0) {
      // Image-specific structures: Extrude dynamically at exact coordinates
      bldgData = detectedStructures.map((s, idx) => {
        // Map normalized percentage [0, 100] to Three.js coordinates [-15, 15]
        const wx = ((s.x + s.w / 2) / 100 - 0.5) * 30;
        const wz = ((s.y + s.h / 2) / 100 - 0.5) * 30;
        const bw = Math.max(1.8, Math.min(5.5, (s.w / 100) * 30));
        const bd = Math.max(1.8, Math.min(5.5, (s.h / 100) * 30));
        const elev = getDSMElevation(wx, wz, sectorId);
        const bh = s.flooded ? 2.8 : 3.6;
        return {
          id: s.id || `STR-${101 + idx}`,
          x: Math.round(wx * 10) / 10,
          z: Math.round(wz * 10) / 10,
          w: Math.round(bw * 10) / 10,
          d: Math.round(bd * 10) / 10,
          h: bh,
          baseElev: elev,
          name: `${s.label || 'Building'} ${s.id || idx + 1}`,
          isFloodedInitially: s.flooded,
        };
      });
    } else if (sectorId === '10815') {
      // Sector 10815: Dense residential floodplain layout
      bldgData = [
        { id: 'STR-201', x: -5, z: -6, w: 2.5, d: 2.2, h: 3.2, baseElev: 1.1, name: 'Residential Block 201' },
        { id: 'STR-202', x: -1, z: -4, w: 2.2, d: 2.0, h: 3.0, baseElev: 0.95, name: 'Submerged Dwelling 202' },
        { id: 'STR-203', x: 4, z: -5, w: 2.8, d: 2.2, h: 3.4, baseElev: 1.2, name: 'Townhouse Cluster' },
        { id: 'STR-204', x: 7, z: -3, w: 2.4, d: 2.0, h: 3.0, baseElev: 1.25, name: 'Community Center' },
        { id: 'STR-205', x: -6, z: 2, w: 2.6, d: 2.2, h: 3.6, baseElev: 1.3, name: 'Residential Unit 205' },
        { id: 'STR-206', x: 2, z: 3, w: 2.4, d: 2.0, h: 3.2, baseElev: 0.9, name: 'Canal Dwelling 206' },
        { id: 'STR-207', x: 6, z: 4, w: 2.2, d: 2.4, h: 3.0, baseElev: 1.15, name: 'Residential Unit 207' },
        { id: 'STR-208', x: -9, z: 7, w: 3.2, d: 2.6, h: 4.2, baseElev: 2.6, name: 'Highland Shelter North' },
        { id: 'STR-209', x: -5, z: 8, w: 2.6, d: 2.2, h: 3.8, baseElev: 2.45, name: 'Emergency Command Post' },
        { id: 'STR-210', x: 1, z: 8, w: 2.2, d: 2.0, h: 3.0, baseElev: 1.05, name: 'Lowland Habitation 210' },
      ];
    } else if (sectorId === '6423') {
      // Sector 6423: Perimeter retention basin farmstead
      bldgData = [
        { id: 'STR-301', x: -7, z: -6, w: 3.2, d: 2.6, h: 3.8, baseElev: 2.2, name: 'Retention Control Station' },
        { id: 'STR-302', x: -5, z: 1, w: 2.4, d: 2.2, h: 3.2, baseElev: 1.8, name: 'Agricultural Depot' },
        { id: 'STR-303', x: 4, z: -3, w: 2.5, d: 2.5, h: 2.8, baseElev: 0.85, name: 'Canal Pump Station 6423' },
        { id: 'STR-304', x: 6, z: 5, w: 2.6, d: 2.4, h: 3.0, baseElev: 0.9, name: 'Swale Farmstead' },
        { id: 'STR-305', x: -8, z: 6, w: 2.8, d: 2.8, h: 4.0, baseElev: 2.8, name: 'Highland Farmhouse' },
      ];
    } else {
      // Sector 10169 default calibrated buildings
      bldgData = [
        { id: 'STR-101', x: 2, z: -8, w: 2.2, d: 2.2, h: 3.2, baseElev: 0.72, name: 'Riverside Warehouse' },
        { id: 'STR-102', x: 4, z: -3, w: 2.6, d: 2.0, h: 3.6, baseElev: 0.95, name: 'Residential Block 10' },
        { id: 'STR-103', x: 5, z: 2, w: 3.0, d: 2.2, h: 3.0, baseElev: 1.15, name: 'Primary School Annexe' },
        { id: 'STR-104', x: 3, z: 7, w: 2.0, d: 2.4, h: 2.6, baseElev: 0.85, name: 'Canal Pump Station' },
        { id: 'STR-105', x: 7, z: -6, w: 2.4, d: 2.4, h: 3.4, baseElev: 1.35, name: 'Commercial Depot' },
        { id: 'STR-106', x: 8, z: 0, w: 2.8, d: 2.0, h: 3.8, baseElev: 1.55, name: 'Municipal Utility Hub' },
        { id: 'STR-107', x: 7, z: 5, w: 2.2, d: 2.2, h: 2.8, baseElev: 1.45, name: 'Suburban Cluster East' },
        { id: 'STR-108', x: -8, z: -5, w: 3.2, d: 2.8, h: 4.8, baseElev: 2.95, name: 'District General Hospital' },
        { id: 'STR-109', x: -7, z: 1, w: 2.4, d: 2.2, h: 3.8, baseElev: 2.75, name: 'Emergency Operations Center' },
        { id: 'STR-110', x: -6, z: 7, w: 2.2, d: 2.2, h: 3.2, baseElev: 2.60, name: 'Highland Shelter 1' },
        { id: 'STR-111', x: -10, z: -1, w: 2.5, d: 2.0, h: 3.5, baseElev: 3.25, name: 'Civil Defense Headquarters' },
        { id: 'STR-112', x: -9, z: 4, w: 2.0, d: 2.0, h: 3.0, baseElev: 3.10, name: 'Highland Communications Tower' },
      ];
    }

    bldgData.forEach((b) => {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const isInitiallyFlooded = b.isFloodedInitially ?? false;
      const mat = new THREE.MeshStandardMaterial({
        color: isInitiallyFlooded ? 0xca8a04 : 0x94a3b8,
        roughness: 0.5,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.baseElev + b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { ...b, type: 'building' };
      bldgGroup.add(mesh);

      // Roof cap
      const roofGeo = new THREE.BoxGeometry(b.w * 1.05, 0.35, b.d * 1.05);
      const roofMat = new THREE.MeshStandardMaterial({
        color: isInitiallyFlooded ? 0x991b1b : 0x334155,
        roughness: 0.7,
      });
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.set(b.x, b.baseElev + b.h + 0.18, b.z);
      bldgGroup.add(roofMesh);
    });

    // 6. CLASS 3 & 4: ROADWAYS (Flooded Lowland & Safe Highland Viaduct)
    const roadsGroup = new THREE.Group();
    roadsGroupRef.current = roadsGroup;
    scene.add(roadsGroup);

    // Elevated Highway Overpass (Safe along Highland Ridge at +3.3m elevation)
    const safeHighwayGeo = new THREE.BoxGeometry(2.2, 0.3, 30);
    const safeHighwayMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.6,
    });
    const safeHighway = new THREE.Mesh(safeHighwayGeo, safeHighwayMat);
    safeHighway.position.set(-7, 3.3, 0);
    safeHighway.receiveShadow = true;
    safeHighway.userData = { type: 'road-safe', name: 'West Highland Arterial (Safe Viaduct)' };
    roadsGroup.add(safeHighway);

    // Highway viaduct support piers
    for (let pz = -12; pz <= 12; pz += 6) {
      const pierGeo = new THREE.CylinderGeometry(0.3, 0.3, 3.8, 12);
      const pierMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
      const pier = new THREE.Mesh(pierGeo, pierMat);
      pier.position.set(-7, 1.5, pz);
      roadsGroup.add(pier);
    }

    // Lowland arterial corridors with calibrated submersion elevations
    const lowRoadsData = [
      { x: 5, z: 0, w: 2.2, d: 30, elev: 1.15, name: 'Eastern Basin Main Avenue' },
      { x: 0, z: -5, w: 24, d: 1.8, elev: 0.95, name: 'Canal Crossing Boulevard' },
      { x: 0, z: 4, w: 24, d: 1.8, elev: 1.05, name: 'South Drainage Causeway' },
    ];

    lowRoadsData.forEach((r) => {
      const roadGeo = new THREE.BoxGeometry(r.w, 0.12, r.d);
      const roadMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.7,
      });
      const roadMesh = new THREE.Mesh(roadGeo, roadMat);
      roadMesh.position.set(r.x, r.elev, r.z);
      roadMesh.receiveShadow = true;
      roadMesh.userData = { ...r, type: 'road-low' };
      roadsGroup.add(roadMesh);
    });

    // 7. CLASS 7: VEHICLES & MOBILITY EQUIPMENT
    const vehiclesGroup = new THREE.Group();
    vehiclesGroupRef.current = vehiclesGroup;
    scene.add(vehiclesGroup);

    const vehicleData = [
      // Lowland vehicles
      { x: 5.2, z: -2, elev: 1.25, name: 'Delivery Van 01' },
      { x: 4.8, z: -1, elev: 1.25, name: 'Sedan A' },
      { x: 1.5, z: -5, elev: 1.05, name: 'Utility Vehicle 03' },
      { x: 3.5, z: 3.8, elev: 1.15, name: 'Minibus Transit' },
      { x: 6.5, z: 4.2, elev: 1.15, name: 'Pickup Truck' },
      // Elevated safe highway vehicles
      { x: -7, z: -4, elev: 3.5, name: 'Emergency Rescue Truck (Safe)' },
      { x: -7, z: 2, elev: 3.5, name: 'High-Water Ambulance (Safe)' },
      { x: -7, z: 6, elev: 3.5, name: 'NDRF Evacuation Bus (Safe)' },
    ];

    vehicleData.forEach((v) => {
      const vGroup = new THREE.Group();
      const chassisGeo = new THREE.BoxGeometry(0.8, 0.35, 1.6);
      const chassisMat = new THREE.MeshStandardMaterial({
        color: v.elev > 2.0 ? 0x0284c7 : 0x7c3aed,
        roughness: 0.4,
        metalness: 0.3,
      });
      const chassis = new THREE.Mesh(chassisGeo, chassisMat);
      chassis.position.y = 0.25;
      chassis.castShadow = true;
      vGroup.add(chassis);

      const cabinGeo = new THREE.BoxGeometry(0.7, 0.3, 0.9);
      const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(0, 0.52, -0.1);
      vGroup.add(cabin);

      vGroup.position.set(v.x, v.elev, v.z);
      vGroup.userData = { ...v, type: 'vehicle' };
      vehiclesGroup.add(vGroup);
    });

    // 8. CLASS 6: TREE CANOPY / VEGETATION
    const treesGroup = new THREE.Group();
    treesGroupRef.current = treesGroup;
    scene.add(treesGroup);

    const treeLocations = [
      { x: -4, z: -9 },
      { x: -3, z: -7 },
      { x: -5, z: -3 },
      { x: -4, z: 5 },
      { x: -3, z: 8 },
      { x: 9, z: -9 },
      { x: 10, z: -4 },
      { x: 11, z: 2 },
      { x: 9, z: 6 },
      { x: 1, z: 9 },
      { x: 0, z: -8 },
    ];

    treeLocations.forEach((t) => {
      const elev = getDSMElevation(t.x, t.z);
      const tree = new THREE.Group();

      const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.2, 8);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.6;
      trunk.castShadow = true;
      tree.add(trunk);

      const canopyGeo = new THREE.DodecahedronGeometry(0.85, 1);
      const canopyMat = new THREE.MeshStandardMaterial({
        color: 0x059669,
        roughness: 0.7,
        flatShading: true,
      });
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.y = 1.7;
      canopy.castShadow = true;
      tree.add(canopy);

      tree.position.set(t.x, elev, t.z);
      tree.userData = { ...t, elev, type: 'tree' };
      treesGroup.add(tree);
    });

    // 9. CLASS 8: RETENTION POOL & BASIN INFRASTRUCTURE
    const poolsGroup = new THREE.Group();
    poolsGroupRef.current = poolsGroup;
    scene.add(poolsGroup);

    const poolRimGeo = new THREE.BoxGeometry(4.4, 0.35, 3.4);
    const poolRimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8 });
    const poolRim = new THREE.Mesh(poolRimGeo, poolRimMat);
    poolRim.position.set(6, 0.45, -9);
    poolsGroup.add(poolRim);

    const poolWaterGeo = new THREE.BoxGeometry(3.9, 0.2, 2.9);
    const poolWaterMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      roughness: 0.2,
      metalness: 0.1,
    });
    const poolWater = new THREE.Mesh(poolWaterGeo, poolWaterMat);
    poolWater.position.set(6, 0.4, -9);
    poolsGroup.add(poolWater);

    // 10. CALIBRATED HYDROLOGIC WATER LEVEL PLANE (Depth-Clipped Intersecting Plane)
    // Direct metric coordinates: y = targetWaterLevelRef.current (0.0m to 4.0m)
    const waterGeo = new THREE.PlaneGeometry(36, 36, 64, 64);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.75,
      roughness: 0.12,
      metalness: 0.1,
      transmission: 0.6,
      ior: 1.33,
      depthWrite: true,
    });

    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = targetWaterLevelRef.current;
    waterMeshRef.current = waterMesh;
    scene.add(waterMesh);

    // 11. DYNAMIC PRECIPITATION PARTICLE SYSTEM
    const rainCount = 1800;
    const rainGeo = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let r = 0; r < rainCount; r++) {
      rainPositions[r * 3] = (Math.random() - 0.5) * 36;
      rainPositions[r * 3 + 1] = Math.random() * 25;
      rainPositions[r * 3 + 2] = (Math.random() - 0.5) * 36;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.12,
      transparent: true,
      opacity: 0.65,
    });
    const rainSystem = new THREE.Points(rainGeo, rainMat);
    rainSystem.visible = false;
    rainSystemRef.current = rainSystem;
    scene.add(rainSystem);

    // 12. Viewport Controls & Mouse Drag / Zoom
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      orbitAngleRef.current += deltaX * 0.005;
      camera.position.y = Math.max(3, Math.min(38, camera.position.y - deltaY * 0.08));
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const radius = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
      const newRadius = Math.max(8, Math.min(52, radius + e.deltaY * 0.03));
      const currentAngle = Math.atan2(camera.position.z, camera.position.x);
      camera.position.x = Math.cos(currentAngle) * newRadius;
      camera.position.z = Math.sin(currentAngle) * newRadius;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    domEl.addEventListener('wheel', handleWheel, { passive: false });

    // Target vectors for smooth camera preset transition
    const targetCamPos = new THREE.Vector3(22, 22, 22);
    const targetCamLook = new THREE.Vector3(0, 1.2, 0);

    // 13. Main Simulation & Animation Loop
    let animationId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Smooth Water Elevation Interpolation
      if (waterMeshRef.current) {
        const targetY = targetWaterLevelRef.current;
        waterMeshRef.current.position.y += (targetY - waterMeshRef.current.position.y) * 0.1;
        const currentWaterSurface = waterMeshRef.current.position.y;

        // Dynamic Submerged Terrain Bathymetric Tinting
        if (terrainGeoRef.current) {
          const pos = terrainGeoRef.current.attributes.position;
          const col = terrainGeoRef.current.attributes.color;
          const colArr = col.array as Float32Array;

          for (let idx = 0; idx < pos.count; idx++) {
            const vy = pos.getY(idx);
            const i3 = idx * 3;

            if (vy <= currentWaterSurface) {
              // Submerged bathymetry tint: deep water receives rich aquatic cyan tint
              const subDepth = Math.min(2.5, currentWaterSurface - vy);
              const factor = Math.min(1.0, 0.45 + subDepth * 0.35);

              colArr[i3] = 0.88 * (1 - factor) + 0.01 * factor;     // R
              colArr[i3 + 1] = 0.91 * (1 - factor) + 0.45 * factor; // G
              colArr[i3 + 2] = 0.94 * (1 - factor) + 0.75 * factor; // B
            } else {
              // Dry ground: subtle elevation-based topographic coloring
              const normH = Math.min(1, Math.max(0, (vy - 0.2) / 3.4));
              colArr[i3] = 0.88 + normH * 0.05;
              colArr[i3 + 1] = 0.91 + normH * 0.04;
              colArr[i3 + 2] = 0.94 - normH * 0.02;
            }
          }
          col.needsUpdate = true;
        }

        // Submerged Building Polygons Evaluation & Inundation Tint
        let floodedBldgsCount = 0;
        if (buildingsGroupRef.current) {
          buildingsGroupRef.current.children.forEach((child) => {
            if (child instanceof THREE.Mesh && child.userData.type === 'building') {
              const base = child.userData.baseElev;
              const isFlooded = currentWaterSurface > base + 0.15;
              if (isFlooded) floodedBldgsCount++;

              const mat = child.material as THREE.MeshStandardMaterial;
              // Flooded structures receive critical crimson tint; safe structures remain engineering slate
              mat.color.setHex(isFlooded ? 0xdc2626 : 0x94a3b8);
            }
          });
        }

        // Lowland Road Network Submersion Evaluation & Hazard Inundation Tint
        let floodedRoadUnits = 0;
        if (roadsGroupRef.current) {
          roadsGroupRef.current.children.forEach((child) => {
            if (child instanceof THREE.Mesh && child.userData.type === 'road-low') {
              const elev = child.userData.elev;
              const isFlooded = currentWaterSurface > elev + 0.05;
              if (isFlooded) floodedRoadUnits += 1.4;

              const mat = child.material as THREE.MeshStandardMaterial;
              // Submerged roadway turns hazardous amber/yellow #CA8A04
              mat.color.setHex(isFlooded ? 0xca8a04 : 0x334155);
            }
          });
        }

        // Vehicle Submersion Evaluation
        let floodedVehiclesCount = 0;
        if (vehiclesGroupRef.current) {
          vehiclesGroupRef.current.children.forEach((group) => {
            if (group instanceof THREE.Group && group.userData.type === 'vehicle') {
              const elev = group.userData.elev;
              const isFlooded = currentWaterSurface > elev + 0.1;
              if (isFlooded && elev < 2.0) floodedVehiclesCount++;

              const chassis = group.children[0] as THREE.Mesh;
              if (chassis && chassis.material instanceof THREE.MeshStandardMaterial) {
                chassis.material.color.setHex(
                  elev > 2.0 ? 0x0284c7 : isFlooded ? 0xdc2626 : 0x7c3aed
                );
              }
            }
          });
        }

        // Rigorous Engineering Hydrology Integration via hydrology.ts
        const hydro = computeHydrologyMetrics(targetWaterLevelRef.current);

        const updatedStats: ClassStats = {
          floodedBuildings: floodedBldgsCount,
          totalBuildings: bldgData.length,
          floodedRoadUnits: parseFloat(floodedRoadUnits.toFixed(1)),
          totalRoadUnits: 4.6,
          floodedVehicles: floodedVehiclesCount,
          totalVehicles: 8,
          simulatedAreaUnits: hydro.inundatedAreaM2,
          inundatedAreaM2: hydro.inundatedAreaM2,
          inundatedHectares: hydro.inundatedHectares,
          inundatedPercent: hydro.inundatedPercent,
          storageVolumeM3: hydro.storageVolumeM3,
          severityLevel: hydro.severityLevel,
        };

        setStats(updatedStats);
        if (onStatsChange) onStatsChange(updatedStats);
      }

      // Rain Particles System
      if (rainSystemRef.current && rainSystemRef.current.visible) {
        const positions = rainSystemRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] -= delta * 18;
          if (positions[i] < -2) positions[i] = 25;
        }
        rainSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Camera Presets & Movement Logic
      const currentMode = cameraModeRef.current;
      if (currentMode === 'orbit') {
        if (isOrbitingRef.current && !isDragging) {
          orbitAngleRef.current += delta * 0.12;
        }
        const radius = 28;
        targetCamPos.set(
          Math.cos(orbitAngleRef.current) * radius,
          camera.position.y || 20,
          Math.sin(orbitAngleRef.current) * radius
        );
        targetCamLook.set(0, 1.2, 0);
        camera.position.lerp(targetCamPos, 0.08);
        camera.lookAt(targetCamLook);
      } else if (currentMode === 'nadir') {
        // Standard Engineering Nadir Viewport (Top-Down Orthogonal, 90°)
        targetCamPos.set(0.001, 38, 0.001);
        targetCamLook.set(0, 1.2, 0);
        camera.position.lerp(targetCamPos, 0.08);
        camera.lookAt(targetCamLook);
      } else if (currentMode === 'oblique') {
        // Standard Engineering Oblique 45° Viewport
        targetCamPos.set(22, 22, 22);
        targetCamLook.set(0, 1.2, 0);
        camera.position.lerp(targetCamPos, 0.08);
        camera.lookAt(targetCamLook);
      } else if (currentMode === 'isometric') {
        // Standard Engineering Isometric Axonometric Projection (35.264° tilt)
        targetCamPos.set(25, 20.41, 25);
        targetCamLook.set(0, 1.2, 0);
        camera.position.lerp(targetCamPos, 0.08);
        camera.lookAt(targetCamLook);
      }

      setCameraTelemetry({
        pitch: Math.round(camera.position.y * 2.2),
        yaw: Math.round((orbitAngleRef.current * (180 / Math.PI)) % 360),
        alt: Math.round(100 + camera.position.y * 3.5),
      });

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      domEl.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      domEl.removeEventListener('wheel', handleWheel);
      renderer.dispose();
      terrainGeo.dispose();
      waterGeo.dispose();
      majorLinesGeo.dispose();
      minorLinesGeo.dispose();
    };
  }, [sectorId, detectedStructures]);

  // Sync rain state to particle system
  useEffect(() => {
    if (rainSystemRef.current) {
      rainSystemRef.current.visible = isRaining;
    }
  }, [isRaining]);

  return (
    <div className={`relative w-full bg-slate-900 border border-slate-200 rounded-xl overflow-hidden select-none font-mono text-xs shadow-md ${className}`}>
      {/* ────────────────── TOP HUD TELEMETRY & VIEWPORT BAR ────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex flex-wrap items-center justify-between px-4 py-2.5 bg-white/95 backdrop-blur-md border-b border-slate-200 gap-2">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-cyan-50 border border-cyan-200 text-cyan-800 text-[10px] rounded font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 animate-pulse" />
            <span>HYDRO-ENGINEERING 3D</span>
          </div>
          <span className="font-semibold text-slate-900 font-sans">{sectorName}</span>
          <span className="text-slate-300 hidden sm:inline">&bull;</span>
          <span className="text-slate-500 text-[11px] hidden md:inline">0.5m Topographic DSM &bull; GSD 2.5 cm/px</span>
        </div>

        {/* Viewport Presets & Controls */}
        <div className="flex items-center space-x-2 text-[10px]">
          {/* Quick Switch to Swipe Segmentation */}
          {onSwitchToSwipe && (
            <button
              onClick={onSwitchToSwipe}
              className="px-2.5 py-1 rounded border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-900 font-medium transition-colors flex items-center space-x-1 font-sans shadow-2xs cursor-pointer"
              title="Swipe for 2D Segmentation Mask Comparison"
            >
              <Split className="w-3 h-3 text-cyan-600" />
              <span>Swipe Segmentation</span>
            </button>
          )}

          {/* Standard Engineering Viewport Switcher */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200 font-sans">
            <button
              onClick={() => setCameraPresetMode('nadir')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                cameraMode === 'nadir' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Nadir View (90° Top-Down Ortho)"
            >
              Nadir (Top-Down)
            </button>
            <button
              onClick={() => setCameraPresetMode('oblique')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                cameraMode === 'oblique' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Oblique 45° Survey View"
            >
              Oblique 45°
            </button>
            <button
              onClick={() => setCameraPresetMode('isometric')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                cameraMode === 'isometric' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Standard Engineering Isometric View"
            >
              Isometric
            </button>
            <button
              onClick={() => { setCameraPresetMode('orbit'); setDroneOrbit(true); }}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                cameraMode === 'orbit' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="360° Drone Inspection Orbit"
            >
              Orbit
            </button>
          </div>

          {/* Contours Toggle */}
          <button
            onClick={() => setShowContours(!showContours)}
            className={`px-2.5 py-1 rounded border transition-colors flex items-center space-x-1 font-sans cursor-pointer ${
              showContours ? 'bg-slate-800 text-white border-slate-800 shadow-2xs' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle 0.5m Topographic Contour Lines"
          >
            <Activity className="w-3 h-3" />
            <span>{showContours ? 'Contours 0.5m On' : 'Contours Off'}</span>
          </button>

          {/* Rainfall Toggle */}
          <button
            onClick={() => setIsRaining(!isRaining)}
            className={`px-2.5 py-1 rounded border transition-colors flex items-center space-x-1 font-sans cursor-pointer ${
              isRaining ? 'bg-cyan-600 text-white border-cyan-600 shadow-2xs' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle Tropical Precipitation"
          >
            <CloudRain className="w-3 h-3" />
            <span>{isRaining ? 'Rain On' : 'Rain Off'}</span>
          </button>

          {/* Orbit Pause/Play */}
          {cameraMode === 'orbit' && (
            <button
              onClick={() => setDroneOrbit(!droneOrbit)}
              className={`px-2.5 py-1 rounded border transition-colors flex items-center space-x-1 font-sans font-medium cursor-pointer ${
                droneOrbit ? 'bg-slate-100 text-slate-800 border-slate-300' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {droneOrbit ? <Pause className="w-3 h-3 text-cyan-600" /> : <Play className="w-3 h-3 text-cyan-600" />}
              <span>{droneOrbit ? 'Pause' : 'Play'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ────────────────── 3D WEBGL CANVAS ────────────────── */}
      <div
        ref={containerRef}
        className="w-full h-[540px] sm:h-[620px] bg-slate-100 cursor-grab active:cursor-grabbing"
      />

      {/* ────────────────── TOPOGRAPHIC CONTOUR & CLASS FILTER OVERLAY ────────────────── */}
      <div className="absolute top-14 left-4 z-20 hidden md:flex flex-col gap-1.5 p-2.5 bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg shadow-sm text-[10px] font-mono">
        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1 flex items-center justify-between">
          <span>Photogrammetric DSM Classes</span>
          <span className="text-cyan-700">100m x 100m</span>
        </div>

        <button
          onClick={() => setShowContours(!showContours)}
          className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors text-left cursor-pointer ${
            showContours ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          <span className="w-2.5 h-1 rounded-xs bg-slate-700 shrink-0" />
          <span>Topographic Contours (0.5m eq.)</span>
        </button>

        <button
          onClick={() => setVisibleClasses((p) => ({ ...p, buildings: !p.buildings }))}
          className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors text-left cursor-pointer ${
            visibleClasses.buildings ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-xs bg-red-600 shrink-0" />
          <span>Building models ({stats.floodedBuildings} / {stats.totalBuildings} submerged)</span>
        </button>

        <button
          onClick={() => setVisibleClasses((p) => ({ ...p, roads: !p.roads }))}
          className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors text-left cursor-pointer ${
            visibleClasses.roads ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 shrink-0" />
          <span>Road corridors ({stats.floodedRoadUnits} / {stats.totalRoadUnits} units cut)</span>
        </button>

        <button
          onClick={() => setVisibleClasses((p) => ({ ...p, vehicles: !p.vehicles }))}
          className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors text-left cursor-pointer ${
            visibleClasses.vehicles ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-xs bg-purple-600 shrink-0" />
          <span>Mobile assets ({stats.floodedVehicles} / {stats.totalVehicles} stranded)</span>
        </button>

        <button
          onClick={() => setVisibleClasses((p) => ({ ...p, water: !p.water }))}
          className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors text-left cursor-pointer ${
            visibleClasses.water ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-400'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-xs bg-cyan-600 shrink-0" />
          <span>Calibrated Hydro Water Plane</span>
        </button>
      </div>

      {/* ────────────────── BOTTOM CALIBRATED STAGE HEIGHT SLIDER BAR ────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Calibrated Stage Height Slider (0.0m to 4.0m, step 0.1m) */}
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Simulated Stage Height:</span>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded border tabular-nums ${
              waterLevel >= 2.6
                ? 'bg-red-100 text-red-800 border-red-300'
                : waterLevel >= 1.2
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : waterLevel >= 0.8
                ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                : 'bg-cyan-50 text-cyan-800 border-cyan-200'
            }`}>
              +{waterLevel.toFixed(1)}m STAGE
            </span>
          </div>

          <div className="flex-1 flex items-center space-x-3">
            <span className="text-[10px] text-slate-400 font-mono">0.0m</span>
            <input
              type="range"
              min="0.0"
              max="4.0"
              step="0.1"
              value={waterLevel}
              onChange={(e) => setWaterLevel(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-slate-200 appearance-none cursor-pointer accent-cyan-600 rounded-lg"
            />
            <span className="text-[10px] text-slate-400 font-mono">+4.0m</span>
          </div>
        </div>

        {/* Live Multi-Class Readout Pills */}
        <div className="flex flex-wrap items-center gap-4 shrink-0 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">INUNDATED:</span>
            <span className="text-slate-900 font-bold tabular-nums">
              {stats.inundatedAreaM2.toLocaleString()} m² ({stats.inundatedPercent}%)
            </span>
          </div>

          <div className="hidden sm:inline text-slate-300">&bull;</div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">STORAGE:</span>
            <span className="text-slate-900 font-bold tabular-nums">
              {stats.storageVolumeM3.toLocaleString()} m³
            </span>
          </div>

          <div className="hidden sm:inline text-slate-300">&bull;</div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">STRUCTURES:</span>
            <span className={stats.floodedBuildings > 0 ? 'text-red-600 font-bold tabular-nums' : 'text-emerald-700 font-bold tabular-nums'}>
              {stats.floodedBuildings} / {stats.totalBuildings}
            </span>
          </div>

          <div className="hidden sm:inline text-slate-300">&bull;</div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">SEVERITY:</span>
            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
              stats.severityLevel === 'CATASTROPHIC'
                ? 'bg-red-100 text-red-800'
                : stats.severityLevel === 'CRITICAL'
                ? 'bg-amber-100 text-amber-800'
                : stats.severityLevel === 'ADVISORY'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}>
              {stats.severityLevel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
