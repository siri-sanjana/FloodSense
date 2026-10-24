'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export const FloodHero3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 560;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xffffff, 0.025);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(16, 13, 16);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setWebglSupported(false);
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0xffffff, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Realistic Daylight Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    sunLight.position.set(25, 35, 18);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 1.0);
    fillLight.position.set(-20, 20, -15);
    scene.add(fillLight);

    // 3. Topographic Ground Relief (Clean architectural palette)
    const terrainGeo = new THREE.PlaneGeometry(30, 30, 48, 48);
    terrainGeo.rotateX(-Math.PI / 2);

    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let y = Math.sin(x * 0.3) * 0.8 + Math.cos(z * 0.3) * 0.7;
      if (Math.abs(x) < 4.2) {
        y -= 1.5;
      }
      pos.setY(i, y);
    }
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    scene.add(terrain);

    // 4. Architectural Model Buildings
    const bldgGroup = new THREE.Group();
    scene.add(bldgGroup);

    const bldgNormalMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.6,
      metalness: 0.1,
    });

    const bldgInundatedMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.5,
      metalness: 0.1,
    });

    const bldgs = [
      { x: -5, z: -5, w: 2.0, d: 2.0, h: 3.5, flooded: false },
      { x: -6, z: 2, w: 2.2, d: 1.8, h: 2.8, flooded: false },
      { x: -2, z: -2, w: 1.8, d: 2.2, h: 2.4, flooded: true },
      { x: 1, z: 1, w: 2.4, d: 2.0, h: 3.0, flooded: true },
      { x: 2, z: -4, w: 2.0, d: 1.8, h: 2.6, flooded: true },
      { x: 6, z: -3, w: 2.5, d: 2.5, h: 4.2, flooded: false },
      { x: 5, z: 4, w: 2.2, d: 2.0, h: 3.2, flooded: false },
    ];

    bldgs.forEach((b) => {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mesh = new THREE.Mesh(geo, b.flooded ? bldgInundatedMat : bldgNormalMat);
      mesh.position.set(b.x, b.h / 2 - 0.4, b.z);
      bldgGroup.add(mesh);
    });

    // 5. Realistic Blue Water Surface
    const waterGeo = new THREE.PlaneGeometry(30, 30, 36, 36);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.65,
      roughness: 0.15,
      metalness: 0.1,
      transmission: 0.55,
      ior: 1.33,
      depthWrite: false,
    });

    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = 0.35;
    scene.add(waterMesh);

    // 6. Natural Mouse Parallax
    let mouseX = 0;
    let mouseY = 0;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMouseMove);

    let animId: number;
    let clock = new THREE.Clock();

    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);
      const t = clock.getElapsedTime();

      // Subtle natural water ripples
      if (!reducedMotion) {
        const waterPos = waterGeo.attributes.position;
        for (let i = 0; i < waterPos.count; i++) {
          const u = waterPos.getX(i);
          const v = waterPos.getZ(i);
          const wave = Math.sin(u * 0.4 + t * 1.2) * Math.cos(v * 0.4 + t * 0.9) * 0.05;
          waterPos.setY(i, wave);
        }
        waterGeo.computeVertexNormals();
        waterGeo.attributes.position.needsUpdate = true;
      }

      // Smooth camera orbit
      camera.position.x += (16 + mouseX * 2.5 - camera.position.x) * 0.03;
      camera.position.y += (13 + mouseY * 1.5 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    renderLoop();

    const onResize = () => {
      if (!containerRef) return;
      const w = container.clientWidth;
      const h = container.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const containerRef = container;
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      terrainGeo.dispose();
      terrainMat.dispose();
      waterGeo.dispose();
      waterMat.dispose();
      bldgGroup.children.forEach((c) => {
        if (c instanceof THREE.Mesh) {
          c.geometry.dispose();
        }
      });
      if (containerRef && renderer.domElement) {
        containerRef.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (!webglSupported) {
    return <div className="h-[520px] w-full bg-slate-50 lg:h-[620px]" aria-hidden="true" />;
  }

  return (
    <div
      className="h-[520px] w-full select-none lg:h-[620px]"
      aria-label="3D flood terrain model"
      role="img"
    >
      <div ref={mountRef} className="h-full w-full" />
    </div>
  );
};
