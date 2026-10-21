'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface ImageSegmentationRelief3DProps {
  imageUrl: string;
  segmentationUrl: string;
  classMaskUrl: string;
  imageWidth: number;
  imageHeight: number;
  simulatedStage: number;
}

function loadTexture(loader: THREE.TextureLoader, url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function createFloodSpreadOverlay(classMaskTexture: THREE.Texture) {
  const sourceImage = classMaskTexture.image as HTMLImageElement;
  const width = sourceImage.naturalWidth || sourceImage.width;
  const height = sourceImage.naturalHeight || sourceImage.height;
  if (!width || !height) throw new Error('The segmentation mask has no readable dimensions.');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not read the segmentation mask for flood spread.');

  context.drawImage(sourceImage, 0, 0, width, height);
  const source = context.getImageData(0, 0, width, height).data;
  const pixelCount = width * height;
  const distances = new Int32Array(pixelCount);
  distances.fill(-1);
  const queue = new Int32Array(pixelCount);
  const canFlood = new Uint8Array(pixelCount);
  let queueEnd = 0;

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const classId = source[pixel * 4];
    if (classId === 5) {
      distances[pixel] = 0;
      queue[queueEnd++] = pixel;
    }
    if (classId === 3 || classId === 4 || classId === 6 || classId === 8 || classId === 9) {
      canFlood[pixel] = 1;
    }
  }

  let queueStart = 0;
  while (queueStart < queueEnd) {
    const pixel = queue[queueStart++];
    const x = pixel % width;
    const nextDistance = distances[pixel] + 1;
    const visit = (neighbor: number) => {
      if (distances[neighbor] !== -1 || (!canFlood[neighbor] && source[neighbor * 4] !== 5)) return;
      distances[neighbor] = nextDistance;
      queue[queueEnd++] = neighbor;
    };

    if (x > 0) visit(pixel - 1);
    if (x + 1 < width) visit(pixel + 1);
    if (pixel >= width) visit(pixel - width);
    if (pixel + width < pixelCount) visit(pixel + width);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = classMaskTexture.flipY;
  const spreadPixels = context.createImageData(width, height);
  const maxSpreadDistance = Math.max(1, Math.round(Math.min(width, height) * 0.18));

  return {
    texture,
    update(stage: number) {
      const stageProgress = Math.min(1, Math.max(0, (stage + 0.5) / 4));
      const spreadRadius = Math.round(stageProgress * maxSpreadDistance);
      for (let pixel = 0; pixel < pixelCount; pixel++) {
        const isFlooded = distances[pixel] >= 0 && distances[pixel] <= spreadRadius;
        const offset = pixel * 4;
        const channel = isFlooded ? 255 : 0;
        spreadPixels.data[offset] = channel;
        spreadPixels.data[offset + 1] = channel;
        spreadPixels.data[offset + 2] = channel;
        spreadPixels.data[offset + 3] = 255;
      }
      context.putImageData(spreadPixels, 0, 0);
      texture.needsUpdate = true;
    },
  };
}

export function ImageSegmentationRelief3D({
  imageUrl,
  segmentationUrl,
  classMaskUrl,
  imageWidth,
  imageHeight,
  simulatedStage,
}: ImageSegmentationRelief3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const simulatedStageRef = useRef(simulatedStage);
  const updateFloodSpreadRef = useRef<((stage: number) => void) | null>(null);
  const floodOverlayRef = useRef<THREE.Mesh | null>(null);
  const [message, setMessage] = useState('Building segmentation-derived relief…');

  useEffect(() => {
    simulatedStageRef.current = simulatedStage;
    updateFloodSpreadRef.current?.(simulatedStage);
    if (floodOverlayRef.current) {
      const progress = Math.min(1, Math.max(0, (simulatedStage + 0.5) / 4));
      floodOverlayRef.current.position.y = 0.12 + progress * 0.42;
    }
  }, [simulatedStage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let animationFrame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let scene: THREE.Scene | undefined;
    let terrainGeometry: THREE.BufferGeometry | undefined;
    let terrainMaterial: THREE.MeshStandardMaterial | undefined;
    let floodGeometry: THREE.PlaneGeometry | undefined;
    let floodMaterial: THREE.MeshStandardMaterial | undefined;
    let overlayTexture: THREE.Texture | undefined;
    let classMaskTexture: THREE.Texture | undefined;
    let floodSpreadTexture: THREE.CanvasTexture | undefined;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setMessage('3D rendering is unavailable in this browser or device.');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.replaceChildren(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    let azimuth = Math.PI / 4;
    let elevation = 0.72;
    let radius = 24;
    const updateCamera = () => {
      camera.position.set(
        radius * Math.cos(elevation) * Math.sin(azimuth),
        radius * Math.sin(elevation),
        radius * Math.cos(elevation) * Math.cos(azimuth),
      );
      camera.lookAt(0, 0, 0);
    };
    updateCamera();

    const resize = () => {
      if (!renderer) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
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
      elevation = Math.max(0.12, Math.min(1.45, elevation + (event.clientY - previousY) * 0.006));
      previousX = event.clientX;
      previousY = event.clientY;
      updateCamera();
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      radius = Math.max(9, Math.min(42, radius + event.deltaY * 0.025));
      updateCamera();
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const buildScene = async () => {
      try {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        [overlayTexture, classMaskTexture] = await Promise.all([
          loadTexture(loader, segmentationUrl),
          loadTexture(loader, classMaskUrl),
        ]);
        if (disposed || !renderer) return;

        overlayTexture.colorSpace = THREE.SRGBColorSpace;
        overlayTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        classMaskTexture.colorSpace = THREE.NoColorSpace;
        classMaskTexture.minFilter = THREE.NearestFilter;
        classMaskTexture.magFilter = THREE.NearestFilter;
        const floodSpread = createFloodSpreadOverlay(classMaskTexture);
        floodSpreadTexture = floodSpread.texture;
        updateFloodSpreadRef.current = floodSpread.update;
        floodSpread.update(simulatedStageRef.current);

        scene = new THREE.Scene();
        scene.background = new THREE.Color('#ffffff');
        scene.add(new THREE.HemisphereLight(0xffffff, 0xdbe4ee, 2.4));
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
        keyLight.position.set(-8, 14, 10);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xe2e8f0, 1.1);
        fillLight.position.set(8, 6, -10);
        scene.add(fillLight);

        const planeWidth = 20;
        const aspect = imageWidth / Math.max(imageHeight, 1);
        const planeHeight = planeWidth / Math.max(aspect, 0.2);
        const widthSegments = 256;
        const heightSegments = Math.max(64, Math.round(widthSegments / Math.max(aspect, 0.2)));
        terrainGeometry = new THREE.PlaneGeometry(
          planeWidth,
          planeHeight,
          widthSegments,
          heightSegments,
        );
        terrainGeometry.rotateX(-Math.PI / 2);

        terrainMaterial = new THREE.MeshStandardMaterial({
          map: overlayTexture,
          roughness: 0.92,
          metalness: 0,
          side: THREE.DoubleSide,
        });

        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        scene.add(terrain);

        floodGeometry = new THREE.PlaneGeometry(
          planeWidth,
          planeHeight,
          widthSegments,
          heightSegments,
        );
        floodGeometry.rotateX(-Math.PI / 2);
        floodMaterial = new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          alphaMap: floodSpreadTexture,
          transparent: true,
          opacity: 0.82,
          roughness: 0.3,
          metalness: 0.04,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        });
        const floodOverlay = new THREE.Mesh(floodGeometry, floodMaterial);
        floodOverlay.position.y = 0.12 + Math.min(1, Math.max(0, (simulatedStageRef.current + 0.5) / 4)) * 0.42;
        floodOverlay.renderOrder = 1;
        floodOverlayRef.current = floodOverlay;
        scene.add(floodOverlay);

        const grid = new THREE.GridHelper(24, 24, 0xe2e8f0, 0xf1f5f9);
        grid.position.y = -0.65;
        scene.add(grid);

        updateCamera();
        setMessage('');
        let previousFrameTime = 0;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const render = () => {
          if (disposed || !renderer || !scene) return;
          animationFrame = requestAnimationFrame(render);
          const now = performance.now();
          if (!dragging && !reduceMotion && previousFrameTime > 0) {
            azimuth += Math.min((now - previousFrameTime) / 1000, 0.05) * 0.12;
            updateCamera();
          }
          previousFrameTime = now;
          renderer.render(scene, camera);
        };
        render();
      } catch {
        if (!disposed) {
          setMessage('Could not load the segmentation result for 3D rendering.');
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
      floodGeometry?.dispose();
      floodMaterial?.dispose();
      updateFloodSpreadRef.current = null;
      floodOverlayRef.current = null;
      overlayTexture?.dispose();
      classMaskTexture?.dispose();
      floodSpreadTexture?.dispose();
      renderer?.dispose();
      container.replaceChildren();
    };
  }, [classMaskUrl, imageHeight, imageUrl, imageWidth, segmentationUrl]);

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div ref={containerRef} className="h-full w-full touch-none" />
      {message && (
      <div className="absolute inset-0 flex items-center justify-center bg-white/90 px-6 text-center text-sm text-slate-700">
          {message}
        </div>
      )}
    <div className="absolute bottom-3 left-3 rounded border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[10px] text-slate-600 shadow-sm">
      Auto-rotating · Drag to orbit · Blue flood overlay expands and rises with stage
      </div>
      <span className="sr-only">3D surface derived from {imageUrl}</span>
    </div>
  );
}
