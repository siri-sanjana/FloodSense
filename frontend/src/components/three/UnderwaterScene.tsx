'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { waterVertexShader, waterFragmentShader } from '../../shaders/waterShader';
import { gsap, ScrollTrigger } from '../../lib/scroll/lenis';

interface UnderwaterSceneProps {
  progress?: number;
  onLoaded?: () => void;
}

export const UnderwaterScene: React.FC<UnderwaterSceneProps> = ({ progress = 0, onLoaded }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    // Detect WebGL capability and prefers-reduced-motion
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      if (onLoaded) onLoaded();
      return;
    }

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04161a, 0.045); // Deep abyss teal fog

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 3, 10); // Start slightly above water surface

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      setWebglSupported(false);
      if (onLoaded) onLoaded();
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // DPR cap 1.5
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0x0e3b43, 1.2);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xe9e4d8, 2.0);
    sunLight.position.set(5, 12, 8);
    scene.add(sunLight);

    const underwaterPoint = new THREE.PointLight(0xd9822b, 1.5, 15);
    underwaterPoint.position.set(0, -6, 2);
    scene.add(underwaterPoint);

    // 3. Rippling Water Surface Plane (Custom GLSL Shader)
    const waterGeo = new THREE.PlaneGeometry(30, 30, 64, 64);
    waterGeo.rotateX(-Math.PI / 2);

    const waterUniforms = {
      uTime: { value: 0 },
      uWaveSpeed: { value: 1.2 },
      uWaveHeight: { value: 0.18 },
      uColorDeep: { value: new THREE.Color(0x04161a) },
      uColorShallow: { value: new THREE.Color(0x0e3b43) },
      uColorFoam: { value: new THREE.Color(0xe9e4d8) },
      uCausticIntensity: { value: 0.75 },
      uDepth: { value: 0 },
    };

    const waterMat = new THREE.ShaderMaterial({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: waterUniforms,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = 0;
    scene.add(waterMesh);

    // 4. Submerged Low-Poly Town (Instanced & Geometric Houses)
    const townGroup = new THREE.Group();
    townGroup.position.set(0, -4.5, 0);

    const houseMat = new THREE.MeshStandardMaterial({
      color: 0x09282d,
      roughness: 0.8,
      metalness: 0.2,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x134b55,
      roughness: 0.6,
    });

    // Create a cluster of submerged structures
    const housePositions = [
      [-3, 0, -2], [-1.2, 0, -4], [2, 0, -3],
      [4, 0, -5], [-4, 0, -6], [0.5, 0, -7],
      [-2.5, 0, -9], [3, 0, -10],
    ];

    housePositions.forEach(([hx, hy, hz], idx) => {
      const houseW = 1.2 + (idx % 3) * 0.3;
      const houseH = 1.4 + (idx % 2) * 0.4;
      const houseD = 1.2 + (idx % 2) * 0.2;

      // Base wall
      const baseGeo = new THREE.BoxGeometry(houseW, houseH, houseD);
      const baseMesh = new THREE.Mesh(baseGeo, houseMat);
      baseMesh.position.set(hx, hy + houseH / 2, hz);
      townGroup.add(baseMesh);

      // Gable roof
      const roofGeo = new THREE.ConeGeometry(houseW * 0.8, 0.8, 4);
      roofGeo.rotateY(Math.PI / 4);
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.set(hx, hy + houseH + 0.4, hz);
      townGroup.add(roofMesh);
    });

    scene.add(townGroup);

    // 5. Procedural 3D Drone Model (Sensor Chassis & Rotors)
    const droneGroup = new THREE.Group();
    droneGroup.position.set(0, -8.5, 2);

    const droneChassisMat = new THREE.MeshStandardMaterial({
      color: 0x04161a,
      roughness: 0.4,
      metalness: 0.8,
    });
    const droneAccentMat = new THREE.MeshBasicMaterial({ color: 0xd9822b });

    const chassisGeo = new THREE.BoxGeometry(1.4, 0.2, 1.4);
    const chassis = new THREE.Mesh(chassisGeo, droneChassisMat);
    droneGroup.add(chassis);

    // Sensor camera pod underneath
    const cameraPodGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const cameraPod = new THREE.Mesh(cameraPodGeo, droneAccentMat);
    cameraPod.position.set(0, -0.22, 0.2);
    droneGroup.add(cameraPod);

    // 4 rotor arms & spinning discs
    const rotors: THREE.Mesh[] = [];
    [[-0.8, 0.1, -0.8], [0.8, 0.1, -0.8], [-0.8, 0.1, 0.8], [0.8, 0.1, 0.8]].forEach(([rx, ry, rz]) => {
      const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8);
      armGeo.rotateZ(Math.PI / 2);
      const arm = new THREE.Mesh(armGeo, droneChassisMat);
      arm.position.set(rx / 2, ry, rz / 2);
      droneGroup.add(arm);

      const propGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.02, 16);
      const prop = new THREE.Mesh(propGeo, droneAccentMat);
      prop.position.set(rx, ry + 0.05, rz);
      droneGroup.add(prop);
      rotors.push(prop);
    });

    scene.add(droneGroup);

    // 6. Floating Protocol Documents (NDMA / NDRF Statutory Sheets)
    const docsGroup = new THREE.Group();
    docsGroup.position.set(0, -14, 1);

    const docGeo = new THREE.PlaneGeometry(1.6, 2.2);
    const docMats = [
      new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.9, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xd3ccbe, roughness: 0.9, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0x0e3b43, roughness: 0.5, side: THREE.DoubleSide }),
    ];

    const docs: THREE.Mesh[] = [];
    [[-1.8, 0.5, -0.5], [0.2, 0, 0], [1.9, -0.4, 0.6]].forEach(([dx, dy, dz], i) => {
      const docMesh = new THREE.Mesh(docGeo, docMats[i % docMats.length]);
      docMesh.position.set(dx, dy, dz);
      docMesh.rotation.set(0.1 * i, 0.2 * i, -0.05 * i);
      docsGroup.add(docMesh);
      docs.push(docMesh);
    });

    scene.add(docsGroup);

    // 7. 3D Vertical Water Gauge Column
    const gaugeGroup = new THREE.Group();
    gaugeGroup.position.set(2.8, -19, 2);

    const columnGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 16);
    const columnMat = new THREE.MeshStandardMaterial({ color: 0x09282d, roughness: 0.5 });
    const column = new THREE.Mesh(columnGeo, columnMat);
    gaugeGroup.add(column);

    const waterLevelGeo = new THREE.CylinderGeometry(0.16, 0.16, 1, 16);
    const waterLevelMat = new THREE.MeshBasicMaterial({ color: 0xd9822b });
    const waterLevelMesh = new THREE.Mesh(waterLevelGeo, waterLevelMat);
    waterLevelMesh.position.y = -2;
    gaugeGroup.add(waterLevelMesh);

    scene.add(gaugeGroup);

    // 8. Continuous Camera Journey Linked to GSAP ScrollTrigger
    let animationFrameId: number;
    const clock = new THREE.Clock();

    // GSAP ScrollTrigger timeline scrubbing camera position from surface (0) to depth (-24) and resurfacing
    const mainStory = document.getElementById('about-story-container');
    if (mainStory) {
      ScrollTrigger.create({
        trigger: mainStory,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1.2,
        onUpdate: (self) => {
          const p = self.progress; // 0.0 (surface) to 1.0 (resurfaced)

          // Continuous vertical descent then resurface
          if (p < 0.2) {
            // Ch 00 -> Ch 01: Descent from above surface into submerged town
            const sub = p / 0.2;
            camera.position.y = 3 - sub * 7.5; // 3 to -4.5
            camera.position.z = 10 - sub * 4;   // 10 to 6
            camera.rotation.x = -0.2 + sub * 0.1;
          } else if (p < 0.45) {
            // Ch 01 -> Ch 02: Descend past drone sensor
            const sub = (p - 0.2) / 0.25;
            camera.position.y = -4.5 - sub * 4.0; // -4.5 to -8.5
            camera.position.z = 6 - sub * 2.5;   // 6 to 3.5
            droneGroup.rotation.y = sub * Math.PI * 1.5;
            droneGroup.rotation.z = Math.sin(sub * Math.PI) * 0.25;
          } else if (p < 0.7) {
            // Ch 02 -> Ch 03: Floating protocol documents stack
            const sub = (p - 0.45) / 0.25;
            camera.position.y = -8.5 - sub * 5.5; // -8.5 to -14
            camera.position.z = 3.5 - sub * 0.5;
            docs.forEach((doc, idx) => {
              doc.rotation.z = (1 - sub) * (0.2 * (idx + 1));
              doc.position.x = THREE.MathUtils.lerp(doc.position.x, 0, sub * 0.05);
            });
          } else if (p < 0.88) {
            // Ch 03 -> Ch 04: The Tide Gauge rising
            const sub = (p - 0.7) / 0.18;
            camera.position.y = -14 - sub * 5.0; // -14 to -19
            waterLevelMesh.scale.y = 1 + sub * 3.5;
            waterLevelMesh.position.y = -2 + (sub * 3.5) / 2;
          } else {
            // Ch 05 -> Resurface into Daylight
            const sub = (p - 0.88) / 0.12;
            camera.position.y = -19 + sub * 22; // Rise from -19 back up to +3
            camera.position.z = 3.0 + sub * 6.0;
            if (scene.fog) {
              scene.fog.color.lerp(new THREE.Color(0xe9e4d8), sub * 0.4);
            }
          }
        },
      });
    }

    // 9. Render Loop
    let isVisible = true;
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    observer.observe(container);

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsed = clock.getElapsedTime();
      waterUniforms.uTime.value = elapsed;

      // Spin drone propellers
      rotors.forEach((rotor, idx) => {
        rotor.rotation.y += idx % 2 === 0 ? 0.45 : -0.45;
      });

      // Subtle float movement on town and documents
      townGroup.position.y = -4.5 + Math.sin(elapsed * 0.8) * 0.08;
      docsGroup.position.y = -14 + Math.cos(elapsed * 0.6) * 0.12;

      renderer.render(scene, camera);
    };

    animate();
    if (onLoaded) onLoaded();

    // 10. Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      cancelAnimationFrame(animationFrameId);
      ScrollTrigger.getAll().forEach((st) => st.kill());
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onLoaded]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      {!webglSupported && (
        <div className="absolute inset-0 bg-abyss-950/80 bg-cover bg-center" style={{ backgroundImage: "radial-gradient(ellipse at 50% 30%, #0e3b43 0%, #04161a 100%)" }} />
      )}
    </div>
  );
};
