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
  Split
} from 'lucide-react';

export interface ClassStats {
  floodedBuildings: number;
  totalBuildings: number;
  floodedRoadsKm: number;
  totalRoadsKm: number;
  floodedVehicles: number;
  totalVehicles: number;
  inundatedAreaHa: number;
  severityLevel: 'NORMAL' | 'ADVISORY' | 'CRITICAL' | 'CATASTROPHIC';
}

interface FloodDigitalTwin3DProps {
  initialWaterLevel?: number; // meters (-0.5 to 3.5)
  sectorName?: string;
  onWaterLevelChange?: (level: number) => void;
  onStatsChange?: (stats: ClassStats) => void;
  onSwitchToSwipe?: () => void;
  className?: string;
}

export const FloodDigitalTwin3D: React.FC<FloodDigitalTwin3DProps> = ({
  initialWaterLevel = 1.8,
  sectorName = 'Kochi Sector 10169 (Marine Drive)',
  onWaterLevelChange,
  onStatsChange,
  onSwitchToSwipe,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [waterLevel, setWaterLevel] = useState<number>(initialWaterLevel);
  const [droneOrbit, setDroneOrbit] = useState<boolean>(true);
  const [cameraMode, setCameraMode] = useState<'orbit' | 'topdown' | 'street'>('orbit');
  const [isRaining, setIsRaining] = useState<boolean>(false);

  // Class visibility toggles
  const [visibleClasses, setVisibleClasses] = useState({
    buildings: true,
    roads: true,
    vehicles: true,
    trees: true,
    water: true,
    pools: true,
    infrastructure: true,
  });

  const [stats, setStats] = useState<ClassStats>({
    floodedBuildings: 7,
    totalBuildings: 12,
    floodedRoadsKm: 2.1,
    totalRoadsKm: 4.6,
    floodedVehicles: 4,
    totalVehicles: 8,
    inundatedAreaHa: 3.82,
    severityLevel: 'CRITICAL',
  });

  const [cameraTelemetry, setCameraTelemetry] = useState({ pitch: 35, yaw: 45, alt: 140 });

  // Refs for 3D state
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const buildingsGroupRef = useRef<THREE.Group | null>(null);
  const roadsGroupRef = useRef<THREE.Group | null>(null);
  const vehiclesGroupRef = useRef<THREE.Group | null>(null);
  const treesGroupRef = useRef<THREE.Group | null>(null);
  const poolsGroupRef = useRef<THREE.Group | null>(null);
  const rainSystemRef = useRef<THREE.Points | null>(null);

  const orbitAngleRef = useRef<number>(0);
  const isOrbitingRef = useRef<boolean>(true);
  const targetWaterLevelRef = useRef<number>(initialWaterLevel);
  const cameraModeRef = useRef<'orbit' | 'topdown' | 'street'>('orbit');

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
  }, [visibleClasses]);

  // Three.js Initialization & Render Loop
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 580;

    // 1. Scene, Camera, Daylight Environment
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.014);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300);
    camera.position.set(24, 18, 24);
    camera.lookAt(0, 0, 0);

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
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Realistic Daylight Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.7);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.4);
    sunLight.position.set(30, 42, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 100;
    sunLight.shadow.camera.left = -25;
    sunLight.shadow.camera.right = 25;
    sunLight.shadow.camera.top = 25;
    sunLight.shadow.camera.bottom = -25;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.9);
    fillLight.position.set(-20, 25, -20);
    scene.add(fillLight);

    // 3. Topographic Ground Relief (36x36 units)
    const terrainGeo = new THREE.PlaneGeometry(36, 36, 72, 72);
    terrainGeo.rotateX(-Math.PI / 2);

    const posAttr = terrainGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);

      let y = 0;
      // River channel carved through the center-left (-3 to 5)
      const distToChannel = Math.abs(x - 2);
      if (distToChannel < 5) {
        y = -1.8 + (distToChannel / 5) * 0.8;
      } else if (x < -3) {
        // Highland Ridge on west (+1.5 to +2.5m)
        y = 1.2 + Math.sin(x * 0.3) * 0.9;
      } else {
        // Lowland residential alluvial plain on east
        y = -0.4 + Math.sin(x * 0.25) * 0.5 + Math.cos(z * 0.25) * 0.4;
      }

      // Micro topography
      y += Math.sin(x * 0.7) * Math.cos(z * 0.7) * 0.15;
      posAttr.setY(i, y);
    }
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.receiveShadow = true;
    scene.add(terrain);

    // Contour Grid wireframe overlay for architectural inspection
    const grid = new THREE.GridHelper(36, 36, 0x94a3b8, 0xcbd5e1);
    grid.position.y = -1.78;
    scene.add(grid);

    // 4. CLASS 1 & 2: BUILDINGS (Flooded & Safe)
    const bldgGroup = new THREE.Group();
    buildingsGroupRef.current = bldgGroup;
    scene.add(bldgGroup);

    const bldgData = [
      // Lowland structures (prone to flooding)
      { id: 'b1', x: 2, z: -8, w: 2.2, d: 2.2, h: 3.2, baseElev: -1.2, name: 'Riverside Warehouse' },
      { id: 'b2', x: 4, z: -3, w: 2.6, d: 2.0, h: 3.6, baseElev: -0.9, name: 'Residential Block 10' },
      { id: 'b3', x: 5, z: 2, w: 3.0, d: 2.2, h: 3.0, baseElev: -0.8, name: 'Primary School Annexe' },
      { id: 'b4', x: 3, z: 7, w: 2.0, d: 2.4, h: 2.6, baseElev: -0.7, name: 'Canal Pump Station' },
      { id: 'b5', x: 7, z: -6, w: 2.4, d: 2.4, h: 3.4, baseElev: -0.5, name: 'Commercial Depot' },
      { id: 'b6', x: 8, z: 0, w: 2.8, d: 2.0, h: 3.8, baseElev: -0.3, name: 'Municipal Utility Hub' },
      { id: 'b7', x: 7, z: 5, w: 2.2, d: 2.2, h: 2.8, baseElev: -0.4, name: 'Suburban Cluster East' },
      // Highland structures (safe unless catastrophic surge)
      { id: 'b8', x: -8, z: -5, w: 3.2, d: 2.8, h: 4.8, baseElev: 1.8, name: 'District General Hospital' },
      { id: 'b9', x: -7, z: 1, w: 2.4, d: 2.2, h: 3.8, baseElev: 1.6, name: 'Emergency Operations Center' },
      { id: 'b10', x: -6, z: 7, w: 2.2, d: 2.2, h: 3.2, baseElev: 1.4, name: 'Highland Shelter 1' },
      { id: 'b11', x: -10, z: -1, w: 2.5, d: 2.0, h: 3.5, baseElev: 2.1, name: 'Civil Defense Headquarters' },
      { id: 'b12', x: -9, z: 4, w: 2.0, d: 2.0, h: 3.0, baseElev: 1.9, name: 'Highland Communications Tower' },
    ];

    bldgData.forEach((b) => {
      // Main structural block
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.5,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.baseElev + b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { ...b, type: 'building' };
      bldgGroup.add(mesh);

      // Gabled / flat architectural roof cap
      const roofGeo = new THREE.BoxGeometry(b.w * 1.05, 0.4, b.d * 1.05);
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.set(b.x, b.baseElev + b.h + 0.2, b.z);
      bldgGroup.add(roofMesh);
    });

    // 5. CLASS 3 & 4: ROADWAYS (Flooded Lowland & Safe Elevated)
    const roadsGroup = new THREE.Group();
    roadsGroupRef.current = roadsGroup;
    scene.add(roadsGroup);

    // Elevated Highway Overpass (Safe road: Highland Western ridge)
    const safeHighwayGeo = new THREE.BoxGeometry(2.0, 0.3, 30);
    const safeHighwayMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.6,
    });
    const safeHighway = new THREE.Mesh(safeHighwayGeo, safeHighwayMat);
    safeHighway.position.set(-7, 2.2, 0);
    safeHighway.receiveShadow = true;
    safeHighway.userData = { type: 'road-safe', name: 'West Highland Arterial (Safe)' };
    roadsGroup.add(safeHighway);

    // Highway bridge pillars
    for (let pz = -12; pz <= 12; pz += 6) {
      const pierGeo = new THREE.CylinderGeometry(0.3, 0.3, 3.5, 12);
      const pierMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
      const pier = new THREE.Mesh(pierGeo, pierMat);
      pier.position.set(-7, 0.5, pz);
      roadsGroup.add(pier);
    }

    // Lowland Cross-Basin Arterials (Submerges dynamically)
    const lowRoadsData = [
      { x: 5, z: 0, w: 2.2, d: 30, elev: -0.85, name: 'Eastern Basin Main Avenue' },
      { x: 0, z: -5, w: 24, d: 1.8, elev: -0.9, name: 'Canal Crossing Boulevard' },
      { x: 0, z: 4, w: 24, d: 1.8, elev: -0.75, name: 'South Drainage Causeway' },
    ];

    lowRoadsData.forEach((r) => {
      const roadGeo = new THREE.BoxGeometry(r.w, 0.15, r.d);
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

    // 6. CLASS 7: VEHICLES & EQUIPMENT (Flooded & Safe)
    const vehiclesGroup = new THREE.Group();
    vehiclesGroupRef.current = vehiclesGroup;
    scene.add(vehiclesGroup);

    const vehicleData = [
      // Lowland vehicles (at risk of submersion)
      { x: 5.2, z: -2, elev: -0.75, name: 'Delivery Van 01' },
      { x: 4.8, z: -1, elev: -0.75, name: 'Sedan A' },
      { x: 1.5, z: -5, elev: -0.8, name: 'Utility Vehicle 03' },
      { x: 3.5, z: 3.8, elev: -0.65, name: 'Minibus Transit' },
      { x: 6.5, z: 4.2, elev: -0.65, name: 'Pickup Truck' },
      // Safe Highland vehicles (elevated highway)
      { x: -7, z: -4, elev: 2.4, name: 'Emergency Rescue Truck (Safe)' },
      { x: -7, z: 2, elev: 2.4, name: 'High-Water Ambulance (Safe)' },
      { x: -7, z: 6, elev: 2.4, name: 'NDRF Evacuation Bus (Safe)' },
    ];

    vehicleData.forEach((v) => {
      const vGroup = new THREE.Group();
      // Chassis
      const chassisGeo = new THREE.BoxGeometry(0.8, 0.35, 1.6);
      const chassisMat = new THREE.MeshStandardMaterial({
        color: v.elev > 1.0 ? 0x0284c7 : 0x7c3aed,
        roughness: 0.4,
        metalness: 0.3,
      });
      const chassis = new THREE.Mesh(chassisGeo, chassisMat);
      chassis.position.y = 0.25;
      chassis.castShadow = true;
      vGroup.add(chassis);

      // Cabin / Roof
      const cabinGeo = new THREE.BoxGeometry(0.7, 0.3, 0.9);
      const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(0, 0.52, -0.1);
      vGroup.add(cabin);

      vGroup.position.set(v.x, v.elev, v.z);
      vGroup.userData = { ...v, type: 'vehicle' };
      vehiclesGroup.add(vGroup);
    });

    // 7. CLASS 6: TREE CANOPY / VEGETATION
    const treesGroup = new THREE.Group();
    treesGroupRef.current = treesGroup;
    scene.add(treesGroup);

    const treeLocations = [
      { x: -4, z: -9, elev: 0.2 },
      { x: -3, z: -7, elev: -0.2 },
      { x: -5, z: -3, elev: 0.8 },
      { x: -4, z: 5, elev: 0.6 },
      { x: -3, z: 8, elev: 0.1 },
      { x: 9, z: -9, elev: -0.1 },
      { x: 10, z: -4, elev: 0.1 },
      { x: 11, z: 2, elev: 0.2 },
      { x: 9, z: 6, elev: 0.0 },
      { x: 1, z: 9, elev: -0.8 },
      { x: 0, z: -8, elev: -1.0 },
    ];

    treeLocations.forEach((t) => {
      const tree = new THREE.Group();
      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.2, 8);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.6;
      trunk.castShadow = true;
      tree.add(trunk);

      // Foliage Canopy Cluster
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

      tree.position.set(t.x, t.elev, t.z);
      tree.userData = { ...t, type: 'tree' };
      treesGroup.add(tree);
    });

    // 8. CLASS 8: SUNKEN RETENTION POOL / SWIMMING BASIN
    const poolsGroup = new THREE.Group();
    poolsGroupRef.current = poolsGroup;
    scene.add(poolsGroup);

    // Concrete basin rim
    const poolRimGeo = new THREE.BoxGeometry(4.2, 0.3, 3.2);
    const poolRimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8 });
    const poolRim = new THREE.Mesh(poolRimGeo, poolRimMat);
    poolRim.position.set(6, -0.65, -9);
    poolsGroup.add(poolRim);

    // Pool water interior
    const poolWaterGeo = new THREE.BoxGeometry(3.8, 0.25, 2.8);
    const poolWaterMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      roughness: 0.2,
      metalness: 0.1,
    });
    const poolWater = new THREE.Mesh(poolWaterGeo, poolWaterMat);
    poolWater.position.set(6, -0.6, -9);
    poolsGroup.add(poolWater);

    // 9. CLASS 5: DYNAMIC VOLUMETRIC WATER MESH
    const waterGeo = new THREE.PlaneGeometry(36, 36, 48, 48);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.72,
      roughness: 0.12,
      metalness: 0.1,
      transmission: 0.65,
      ior: 1.33,
      depthWrite: false,
    });

    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = -1.4 + targetWaterLevelRef.current * 0.95;
    waterMeshRef.current = waterMesh;
    scene.add(waterMesh);

    // 10. DYNAMIC RAINFALL SIMULATION SYSTEM
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
      opacity: 0.6,
    });
    const rainSystem = new THREE.Points(rainGeo, rainMat);
    rainSystem.visible = false;
    rainSystemRef.current = rainSystem;
    scene.add(rainSystem);

    // 11. Mouse Drag Controls & Wheel Zoom
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
      camera.position.y = Math.max(3, Math.min(34, camera.position.y - deltaY * 0.08));
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const radius = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
      const newRadius = Math.max(8, Math.min(48, radius + e.deltaY * 0.025));
      const currentAngle = Math.atan2(camera.position.z, camera.position.x);
      camera.position.x = Math.cos(currentAngle) * newRadius;
      camera.position.z = Math.sin(currentAngle) * newRadius;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    domEl.addEventListener('wheel', handleWheel, { passive: false });

    // 12. Main Animation & Physics Loop
    let animationId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Smooth water elevation interpolation
      if (waterMeshRef.current) {
        const targetY = -1.4 + targetWaterLevelRef.current * 0.95;
        waterMeshRef.current.position.y += (targetY - waterMeshRef.current.position.y) * 0.08;

        const currentWaterSurface = waterMeshRef.current.position.y;

        // Dynamic Building Submersion Evaluation
        let floodedBldgsCount = 0;
        if (buildingsGroupRef.current) {
          buildingsGroupRef.current.children.forEach((child) => {
            if (child instanceof THREE.Mesh && child.userData.type === 'building') {
              const base = child.userData.baseElev;
              const isFlooded = currentWaterSurface > base + 0.15;
              if (isFlooded) floodedBldgsCount++;

              const mat = child.material as THREE.MeshStandardMaterial;
              // Flooded buildings turn critical orange/red #DC2626
              mat.color.setHex(isFlooded ? 0xdc2626 : 0x94a3b8);
            }
          });
        }

        // Dynamic Lowland Road Inundation Evaluation
        let floodedRoadsKm = 0;
        if (roadsGroupRef.current) {
          roadsGroupRef.current.children.forEach((child) => {
            if (child instanceof THREE.Mesh && child.userData.type === 'road-low') {
              const elev = child.userData.elev;
              const isFlooded = currentWaterSurface > elev + 0.05;
              if (isFlooded) floodedRoadsKm += 1.4;

              const mat = child.material as THREE.MeshStandardMaterial;
              // Submerged roads turn hazardous amber/yellow #CA8A04
              mat.color.setHex(isFlooded ? 0xca8a04 : 0x334155);
            }
          });
        }

        // Dynamic Vehicle Submersion Evaluation
        let floodedVehiclesCount = 0;
        if (vehiclesGroupRef.current) {
          vehiclesGroupRef.current.children.forEach((group) => {
            if (group instanceof THREE.Group && group.userData.type === 'vehicle') {
              const elev = group.userData.elev;
              const isFlooded = currentWaterSurface > elev + 0.1;
              if (isFlooded && elev < 1.0) floodedVehiclesCount++;

              const chassis = group.children[0] as THREE.Mesh;
              if (chassis && chassis.material instanceof THREE.MeshStandardMaterial) {
                chassis.material.color.setHex(
                  elev > 1.0 ? 0x0284c7 : isFlooded ? 0xdc2626 : 0x7c3aed
                );
              }
            }
          });
        }

        // Compute Live Class Inundation Metrics
        const areaHa = parseFloat((1.2 + Math.max(0, targetWaterLevelRef.current) * 1.45).toFixed(2));
        const sevLevel: 'NORMAL' | 'ADVISORY' | 'CRITICAL' | 'CATASTROPHIC' =
          targetWaterLevelRef.current >= 2.5
            ? 'CATASTROPHIC'
            : targetWaterLevelRef.current >= 1.6
            ? 'CRITICAL'
            : targetWaterLevelRef.current >= 0.8
            ? 'ADVISORY'
            : 'NORMAL';

        const updatedStats: ClassStats = {
          floodedBuildings: floodedBldgsCount,
          totalBuildings: bldgData.length,
          floodedRoadsKm: parseFloat(floodedRoadsKm.toFixed(1)),
          totalRoadsKm: 4.6,
          floodedVehicles: floodedVehiclesCount,
          totalVehicles: 8,
          inundatedAreaHa: areaHa,
          severityLevel: sevLevel,
        };

        setStats(updatedStats);
        if (onStatsChange) onStatsChange(updatedStats);
      }

      // Rain particles animation
      if (rainSystemRef.current && rainSystemRef.current.visible) {
        const positions = rainSystemRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] -= delta * 16;
          if (positions[i] < -2) positions[i] = 25;
        }
        rainSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Camera presets & Orbit logic
      if (cameraModeRef.current === 'orbit') {
        if (isOrbitingRef.current && !isDragging) {
          orbitAngleRef.current += delta * 0.1;
        }
        const radius = 28;
        camera.position.x = Math.cos(orbitAngleRef.current) * radius;
        camera.position.z = Math.sin(orbitAngleRef.current) * radius;
        camera.lookAt(0, -0.4, 0);
      } else if (cameraModeRef.current === 'topdown') {
        camera.position.set(0, 34, 0.01);
        camera.lookAt(0, 0, 0);
      } else if (cameraModeRef.current === 'street') {
        camera.position.set(10, 1.2, 10);
        camera.lookAt(0, 0.5, 0);
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
      const h = containerRef.current.clientHeight || 580;
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
    };
  }, []);

  // Sync rain state to particle system
  useEffect(() => {
    if (rainSystemRef.current) {
      rainSystemRef.current.visible = isRaining;
    }
  }, [isRaining]);

  return (
    <div className={`relative w-full bg-slate-900 border border-slate-200 rounded-xl overflow-hidden select-none font-mono text-xs shadow-md ${className}`}>
      {/* ────────────────── TOP HUD TELEMETRY BAR ────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex flex-wrap items-center justify-between px-4 py-2.5 bg-white/95 backdrop-blur-md border-b border-slate-200 gap-2">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-cyan-50 border border-cyan-200 text-cyan-800 text-[10px] rounded font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 animate-pulse" />
            <span>3D SIMULATOR</span>
          </div>
          <span className="font-semibold text-slate-900 font-sans">{sectorName}</span>
          <span className="text-slate-300 hidden sm:inline">&bull;</span>
          <span className="text-slate-500 text-[11px] hidden md:inline">10-Class Hydro-Spatial Simulation</span>
        </div>

        {/* Camera & Weather Controls */}
        <div className="flex items-center space-x-2 text-[10px]">
          {/* Quick Switch to Swipe Segmentation */}
          {onSwitchToSwipe && (
            <button
              onClick={onSwitchToSwipe}
              className="px-2.5 py-1 rounded border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-900 font-medium transition-colors flex items-center space-x-1 font-sans shadow-2xs"
              title="Swipe for 2D Segmentation Mask Comparison"
            >
              <Split className="w-3 h-3 text-cyan-600" />
              <span>Swipe Segmentation</span>
            </button>
          )}

          {/* Camera View Switcher */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200 font-sans">
            <button
              onClick={() => { setCameraMode('orbit'); setDroneOrbit(true); }}
              className={`px-2 py-1 rounded transition-colors ${cameraMode === 'orbit' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              title="360 Drone Orbit"
            >
              Orbit
            </button>
            <button
              onClick={() => setCameraMode('topdown')}
              className={`px-2 py-1 rounded transition-colors ${cameraMode === 'topdown' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              title="Top-Down Satellite View"
            >
              Nadir
            </button>
            <button
              onClick={() => setCameraMode('street')}
              className={`px-2 py-1 rounded transition-colors ${cameraMode === 'street' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              title="Ground Observer View"
            >
              Surface
            </button>
          </div>

          {/* Rainfall Toggle */}
          <button
            onClick={() => setIsRaining(!isRaining)}
            className={`px-2.5 py-1 rounded border transition-colors flex items-center space-x-1 font-sans ${
              isRaining ? 'bg-cyan-600 text-white border-cyan-600 shadow-2xs' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle Tropical Precipitation"
          >
            <CloudRain className="w-3 h-3" />
            <span>{isRaining ? 'Precipitation On' : 'Rain Off'}</span>
          </button>

          {/* Flyover Pause/Resume */}
          {cameraMode === 'orbit' && (
            <button
              onClick={() => setDroneOrbit(!droneOrbit)}
              className={`px-2.5 py-1 rounded border transition-colors flex items-center space-x-1 font-sans font-medium ${
                droneOrbit ? 'bg-slate-100 text-slate-800 border-slate-300' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {droneOrbit ? <Pause className="w-3 h-3 text-cyan-600" /> : <Play className="w-3 h-3 text-cyan-600" />}
              <span>{droneOrbit ? 'Pause Flyover' : 'Resume'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ────────────────── 3D WEBGL CANVAS ────────────────── */}
      <div
        ref={containerRef}
        className="w-full h-[540px] sm:h-[620px] bg-slate-100 cursor-grab active:cursor-grabbing"
      />

      {/* ────────────────── CLASS VISIBILITY FILTER BAR ────────────────── */}
      <div className="absolute top-14 left-4 z-20 hidden md:flex flex-col gap-1.5 p-2.5 bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg shadow-sm text-[10px] font-mono">
        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">
          Simulated Class Blocks
        </div>

        <button
          onClick={() => setVisibleClasses((p) => ({ ...p, buildings: !p.buildings }))}
          className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors text-left ${visibleClasses.buildings ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-400'}`}
        >
          <span className="w-2.5 h-2.5 rounded-xs bg-red-600 shrink-0" />
          <span>Buildings ({stats.floodedBuildings} Flooded / {stats.totalBuildings - stats.floodedBuildings} Safe)</span>
        </button>

        <button
          onClick={() => setVisibleClasses((p) => ({ ...p, roads: !p.roads }))}
          className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors text-left ${visibleClasses.roads ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-400'}`}
        >
          <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 shrink-0" />
          <span>Roadways ({stats.floodedRoadsKm} km Flooded / 4.6 km)</span>
        </button>

        <button
          onClick={() => setVisibleClasses((p) => ({ ...p, vehicles: !p.vehicles }))}
          className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors text-left ${visibleClasses.vehicles ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-400'}`}
        >
          <span className="w-2.5 h-2.5 rounded-xs bg-purple-600 shrink-0" />
          <span>Vehicles ({stats.floodedVehicles} Flooded / 8)</span>
        </button>

        <button
          onClick={() => setVisibleClasses((p) => ({ ...p, trees: !p.trees }))}
          className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors text-left ${visibleClasses.trees ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-400'}`}
        >
          <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 shrink-0" />
          <span>Tree Canopy (11 Stands)</span>
        </button>

        <button
          onClick={() => setVisibleClasses((p) => ({ ...p, water: !p.water }))}
          className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors text-left ${visibleClasses.water ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-400'}`}
        >
          <span className="w-2.5 h-2.5 rounded-xs bg-cyan-600 shrink-0" />
          <span>River Channel &amp; Flood Mesh</span>
        </button>

        <button
          onClick={() => setVisibleClasses((p) => ({ ...p, pools: !p.pools }))}
          className={`flex items-center space-x-2 px-2 py-1 rounded transition-colors text-left ${visibleClasses.pools ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-400'}`}
        >
          <span className="w-2.5 h-2.5 rounded-xs bg-teal-500 shrink-0" />
          <span>Retention Pools &amp; Basins</span>
        </button>
      </div>

      {/* ────────────────── BOTTOM FLOOD CONTROL CONSOLE ────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Dynamic Water Depth Slider */}
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Stage Hydro Gauge:</span>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded border ${
              waterLevel >= 2.2
                ? 'bg-red-50 text-red-700 border-red-200'
                : waterLevel >= 1.2
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-cyan-50 text-cyan-800 border-cyan-200'
            }`}>
              {waterLevel >= 0 ? `+${waterLevel.toFixed(2)}m` : `${waterLevel.toFixed(2)}m`} SURGE
            </span>
          </div>

          <div className="flex-1 flex items-center space-x-3">
            <span className="text-[10px] text-slate-400 font-mono">-0.5m</span>
            <input
              type="range"
              min="-0.5"
              max="3.5"
              step="0.05"
              value={waterLevel}
              onChange={(e) => setWaterLevel(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-slate-200 appearance-none cursor-pointer accent-cyan-600 rounded-lg"
            />
            <span className="text-[10px] text-slate-400 font-mono">+3.5m (Peak)</span>
          </div>
        </div>

        {/* Live Multi-Class Tally Bar */}
        <div className="flex flex-wrap items-center gap-4 shrink-0 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">INUNDATION:</span>
            <span className="text-slate-900 font-bold">{stats.inundatedAreaHa} Hectares</span>
          </div>

          <div className="hidden sm:inline text-slate-300">&bull;</div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">STRUCTURES:</span>
            <span className={stats.floodedBuildings > 0 ? 'text-red-600 font-bold' : 'text-emerald-700 font-bold'}>
              {stats.floodedBuildings} Flooded / {stats.totalBuildings} Total
            </span>
          </div>

          <div className="hidden sm:inline text-slate-300">&bull;</div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">SEVERITY:</span>
            <span className={`px-2 py-0.2 rounded font-bold text-[10px] ${
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
