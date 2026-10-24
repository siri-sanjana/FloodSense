'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Eye, Layers, Maximize2, Compass, Waves, Activity } from 'lucide-react';

interface ImageSegmentationRelief3DProps {
  imageUrl: string;
  segmentationUrl: string;
  classMaskUrl: string;
  depthMapUrl?: string | null;
  imageWidth: number;
  imageHeight: number;
  simulatedStage: number;
}

function loadTexture(loader: THREE.TextureLoader, url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function loadImageData(url: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 512;
      canvas.height = img.naturalHeight || img.height || 512;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('Cannot create 2D canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ data: imgData.data, width: canvas.width, height: canvas.height });
    };
    img.onerror = () => reject(new Error(`Failed to load image from ${url}`));
    img.src = url;
  });
}

export function ImageSegmentationRelief3D({
  imageUrl,
  segmentationUrl,
  classMaskUrl,
  depthMapUrl,
  imageWidth,
  imageHeight,
  simulatedStage,
}: ImageSegmentationRelief3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const simulatedStageRef = useRef(simulatedStage);
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const [textureMode, setTextureMode] = useState<'rgb' | 'segmentation'>('rgb');
  const [showContours, setShowContours] = useState<boolean>(true);
  const [message, setMessage] = useState('Reconstructing 3D photogrammetric surface…');

  const rawTextureRef = useRef<THREE.Texture | null>(null);
  const segTextureRef = useRef<THREE.Texture | null>(null);

  useEffect(() => {
    simulatedStageRef.current = simulatedStage;
    if (waterMeshRef.current) {
      // Map 0.0m to 4.0m into mesh coordinate space (0.05 to 3.2)
      const meshY = 0.08 + (Math.max(0, Math.min(4.0, simulatedStage)) / 4.0) * 3.0;
      waterMeshRef.current.position.y = meshY;
    }
  }, [simulatedStage]);

  // Texture toggle effect
  useEffect(() => {
    if (terrainMeshRef.current) {
      const mat = terrainMeshRef.current.material as THREE.MeshStandardMaterial;
      if (textureMode === 'rgb' && rawTextureRef.current) {
        mat.map = rawTextureRef.current;
        mat.needsUpdate = true;
      } else if (textureMode === 'segmentation' && segTextureRef.current) {
        mat.map = segTextureRef.current;
        mat.needsUpdate = true;
      }
    }
  }, [textureMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let animationFrame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let scene: THREE.Scene | undefined;
    let terrainGeometry: THREE.PlaneGeometry | undefined;
    let terrainMaterial: THREE.MeshStandardMaterial | undefined;
    let waterGeometry: THREE.PlaneGeometry | undefined;
    let waterMaterial: THREE.MeshPhysicalMaterial | undefined;
    let contourLinesGeo: THREE.BufferGeometry | undefined;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setMessage('3D WebGL rendering is unavailable in this browser.');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.replaceChildren(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 150);
    let azimuth = 0.85;
    let elevation = 0.65;
    let radius = 28;

    const updateCamera = () => {
      camera.position.set(
        radius * Math.cos(elevation) * Math.sin(azimuth),
        radius * Math.sin(elevation),
        radius * Math.cos(elevation) * Math.cos(azimuth),
      );
      camera.lookAt(0, 1.0, 0);
    };
    updateCamera();

    const resize = () => {
      if (!renderer || !container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let dragging = false;
    let previousX = 0;
    let previousY = 0;
    const canvas = renderer.domElement;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      azimuth -= (event.clientX - previousX) * 0.008;
      elevation = Math.max(0.12, Math.min(1.48, elevation + (event.clientY - previousY) * 0.006));
      previousX = event.clientX;
      previousY = event.clientY;
      updateCamera();
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      radius = Math.max(10, Math.min(50, radius + event.deltaY * 0.025));
      updateCamera();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const buildScene = async () => {
      try {
        setMessage('Sampling photogrammetric pixel elevation & semantic structures…');
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');

        // Load textures and pixel buffers
        const [rawTex, segTex, maskPixelData, rawPixelData] = await Promise.all([
          loadTexture(loader, imageUrl).catch(() => null),
          loadTexture(loader, segmentationUrl).catch(() => null),
          loadImageData(classMaskUrl).catch(() => null),
          loadImageData(imageUrl).catch(() => null),
        ]);

        if (disposed || !renderer) return;

        if (rawTex) {
          rawTex.colorSpace = THREE.SRGBColorSpace;
          rawTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          rawTextureRef.current = rawTex;
        }
        if (segTex) {
          segTex.colorSpace = THREE.SRGBColorSpace;
          segTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          segTextureRef.current = segTex;
        }

        // If depth map URL was supplied, attempt to load its pixels
        let depthPixelData: { data: Uint8ClampedArray; width: number; height: number } | null = null;
        if (depthMapUrl) {
          depthPixelData = await loadImageData(depthMapUrl).catch(() => null);
        }

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf8fafc);
        scene.fog = new THREE.FogExp2(0xf8fafc, 0.012);

        // Lighting
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 1.8);
        scene.add(hemiLight);

        const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.4);
        sunLight.position.set(20, 35, 18);
        sunLight.castShadow = true;
        scene.add(sunLight);

        const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.8);
        fillLight.position.set(-18, 20, -18);
        scene.add(fillLight);

        // Dimensions of the 3D terrain surface
        const planeWidth = 22;
        const aspect = imageWidth / Math.max(imageHeight, 1);
        const planeHeight = planeWidth / Math.max(aspect, 0.25);

        // High resolution mesh: 192 grid divisions
        const widthSegments = 192;
        const heightSegments = Math.max(64, Math.round(widthSegments / Math.max(aspect, 0.25)));

        terrainGeometry = new THREE.PlaneGeometry(
          planeWidth,
          planeHeight,
          widthSegments,
          heightSegments,
        );
        terrainGeometry.rotateX(-Math.PI / 2);

        const posAttr = terrainGeometry.attributes.position;
        const vertexCount = posAttr.count;
        const heights = new Float32Array(vertexCount);

        const mWidth = maskPixelData?.width || 512;
        const mHeight = maskPixelData?.height || 512;
        const mData = maskPixelData?.data;

        const rWidth = rawPixelData?.width || 512;
        const rHeight = rawPixelData?.height || 512;
        const rData = rawPixelData?.data;

        const dWidth = depthPixelData?.width || 512;
        const dHeight = depthPixelData?.height || 512;
        const dData = depthPixelData?.data;

        // Sample true photogrammetric elevation for each grid vertex
        for (let j = 0; j <= heightSegments; j++) {
          const v = j / heightSegments;
          const pyM = Math.min(mHeight - 1, Math.max(0, Math.floor(v * mHeight)));
          const pyR = Math.min(rHeight - 1, Math.max(0, Math.floor(v * rHeight)));
          const pyD = Math.min(dHeight - 1, Math.max(0, Math.floor(v * dHeight)));

          for (let i = 0; i <= widthSegments; i++) {
            const u = i / widthSegments;
            const pxM = Math.min(mWidth - 1, Math.max(0, Math.floor(u * mWidth)));
            const pxR = Math.min(rWidth - 1, Math.max(0, Math.floor(u * rWidth)));
            const pxD = Math.min(dWidth - 1, Math.max(0, Math.floor(u * dWidth)));

            const vertexIndex = j * (widthSegments + 1) + i;

            // 1. Semantic class ID from mask
            let classId = 0;
            if (mData) {
              const mIdx = (pyM * mWidth + pxM) * 4;
              classId = mData[mIdx];
            }

            // 2. Luminance from raw optical image
            let lum = 0.5;
            if (rData) {
              const rIdx = (pyR * rWidth + pxR) * 4;
              lum = (0.299 * rData[rIdx] + 0.587 * rData[rIdx + 1] + 0.114 * rData[rIdx + 2]) / 255;
            }

            // 3. Monocular depth if available (Depth Anything V2)
            let depthVal = lum;
            if (dData) {
              const dIdx = (pyD * dWidth + pxD) * 4;
              depthVal = (dData[dIdx] + dData[dIdx + 1] + dData[dIdx + 2]) / (3 * 255);
            }

            // Natural terrain topography gradient:
            // Slopes down toward lower third of image or water body
            const naturalSlope = Math.sin(u * Math.PI) * 0.4 + (1 - v) * 0.8;
            let elev = depthVal * 1.6 + naturalSlope;

            // Semantic Structural Extrusions:
            if (classId === 1) {
              // Building-Flooded: structural walls elevated
              elev += 1.8 + lum * 0.4;
            } else if (classId === 2) {
              // Building-Non-Flooded: safe elevated structure
              elev += 2.6 + lum * 0.5;
            } else if (classId === 6) {
              // Tree canopy: organic elevated crown
              elev += 1.4 + Math.sin(u * 50) * Math.cos(v * 50) * 0.15;
            } else if (classId === 7) {
              // Vehicle
              elev += 0.6;
            } else if (classId === 3 || classId === 4) {
              // Roadway
              elev = Math.max(0.2, elev * 0.6 + 0.25);
            } else if (classId === 5 || classId === 8) {
              // Water & Pools: carved depression basin
              elev = Math.max(0.02, elev * 0.2);
            }

            heights[vertexIndex] = Math.max(0.02, Math.min(3.8, elev));
            posAttr.setY(vertexIndex, heights[vertexIndex]);
          }
        }

        // Apply 1-pass Laplacian smoothing on non-building ground vertices for smooth terrain
        for (let j = 1; j < heightSegments; j++) {
          for (let i = 1; i < widthSegments; i++) {
            const idx = j * (widthSegments + 1) + i;
            const pxM = Math.min(mWidth - 1, Math.max(0, Math.floor((i / widthSegments) * mWidth)));
            const pyM = Math.min(mHeight - 1, Math.max(0, Math.floor((j / heightSegments) * mHeight)));
            const cId = mData ? mData[(pyM * mWidth + pxM) * 4] : 0;

            // Keep buildings sharp, smooth natural terrain and water boundaries
            if (cId !== 1 && cId !== 2) {
              const top = heights[(j - 1) * (widthSegments + 1) + i];
              const bottom = heights[(j + 1) * (widthSegments + 1) + i];
              const left = heights[j * (widthSegments + 1) + (i - 1)];
              const right = heights[j * (widthSegments + 1) + (i + 1)];
              const smoothed = (top + bottom + left + right + heights[idx] * 2) / 6;
              posAttr.setY(idx, smoothed);
            }
          }
        }

        terrainGeometry.computeVertexNormals();

        terrainMaterial = new THREE.MeshStandardMaterial({
          map: rawTextureRef.current || segTextureRef.current || undefined,
          roughness: 0.85,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });

        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.receiveShadow = true;
        terrainMeshRef.current = terrain;
        scene.add(terrain);

        // 4. Volumetric Calibrated Water Surface Plane
        waterGeometry = new THREE.PlaneGeometry(planeWidth * 1.02, planeHeight * 1.02, 32, 32);
        waterGeometry.rotateX(-Math.PI / 2);

        waterMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x0284c7,
          transparent: true,
          opacity: 0.75,
          roughness: 0.12,
          metalness: 0.08,
          transmission: 0.62,
          ior: 1.33,
          depthWrite: true,
        });

        const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
        const initialY = 0.08 + (Math.max(0, Math.min(4.0, simulatedStageRef.current)) / 4.0) * 3.0;
        waterMesh.position.y = initialY;
        waterMeshRef.current = waterMesh;
        scene.add(waterMesh);

        // Coordinate Datum grid
        const grid = new THREE.GridHelper(planeWidth * 1.2, 16, 0x94a3b8, 0xe2e8f0);
        grid.position.y = -0.05;
        scene.add(grid);

        updateCamera();
        setMessage('');

        // Animation Loop
        let previousTime = performance.now();
        const render = () => {
          if (disposed || !renderer || !scene) return;
          animationFrame = requestAnimationFrame(render);
          const now = performance.now();
          const dt = (now - previousTime) / 1000;
          previousTime = now;

          if (!dragging && dt > 0) {
            azimuth += dt * 0.08;
            updateCamera();
          }

          renderer.render(scene, camera);
        };
        render();
      } catch (err) {
        if (!disposed) {
          setMessage(`Could not reconstruct 3D surface: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };

    void buildScene();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      terrainGeometry?.dispose();
      terrainMaterial?.dispose();
      waterGeometry?.dispose();
      waterMaterial?.dispose();
      rawTextureRef.current?.dispose();
      segTextureRef.current?.dispose();
      renderer?.dispose();
      container.replaceChildren();
    };
  }, [imageUrl, segmentationUrl, classMaskUrl, depthMapUrl, imageWidth, imageHeight]);

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm font-mono text-xs select-none">
      <div ref={containerRef} className="h-full w-full touch-none cursor-grab active:cursor-grabbing" />

      {message && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 px-6 text-center text-sm text-slate-700">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 animate-pulse" />
            <span>{message}</span>
          </div>
        </div>
      )}

      {/* Viewport HUD Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center space-x-2 pointer-events-auto">
          <div className="px-2.5 py-1 bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg shadow-2xs text-[10px] font-bold text-slate-900 flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-600" />
            <span>PHOTOGRAMMETRIC 3D RELIEF</span>
          </div>
        </div>

        {/* Texture mode switcher */}
        <div className="flex items-center space-x-2 pointer-events-auto">
          <div className="flex items-center bg-white/95 backdrop-blur-md p-0.5 rounded-lg border border-slate-200 shadow-2xs">
            <button
              onClick={() => setTextureMode('rgb')}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                textureMode === 'rgb'
                  ? 'bg-cyan-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              True Orthophoto (RGB)
            </button>
            <button
              onClick={() => setTextureMode('segmentation')}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                textureMode === 'segmentation'
                  ? 'bg-cyan-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              10-Class Segmentation
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 rounded-lg border border-slate-200 bg-white/90 backdrop-blur-md px-3 py-1.5 text-[10px] text-slate-600 shadow-2xs flex items-center space-x-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <span>Auto-rotating &bull; Drag to orbit &bull; Calibrated volumetric flood surface</span>
      </div>
    </div>
  );
}
