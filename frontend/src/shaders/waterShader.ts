/**
 * Custom GLSL Shaders for FloodSense Cinematic Underwater Scene
 * Includes:
 * - Vertex wave displacement (sinusoidal + trochoidal harmonics)
 * - Depth-based light falloff & abyss teal absorption
 * - Procedural caustic light patterns
 * - Fresnel reflectance & edge glow
 */

export const waterVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveHeight;
  uniform float uProgress;

  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vElevation;

  void main() {
    vUv = uv;
    vPosition = position;

    // Multi-octave wave displacement
    float wave1 = sin(position.x * 2.5 + uTime * uWaveSpeed) * cos(position.z * 2.0 + uTime * uWaveSpeed * 0.8) * uWaveHeight;
    float wave2 = sin(position.x * 5.0 - uTime * uWaveSpeed * 1.2) * cos(position.z * 4.5 + uTime * uWaveSpeed * 0.9) * (uWaveHeight * 0.35);
    float wave3 = sin((position.x + position.z) * 8.0 + uTime * uWaveSpeed * 1.5) * (uWaveHeight * 0.15);

    float totalElevation = wave1 + wave2 + wave3;
    vElevation = totalElevation;

    vec3 newPos = position;
    newPos.y += totalElevation;

    // Normal estimation
    vec3 tangentX = vec3(1.0, (cos(position.x * 2.5 + uTime * uWaveSpeed) * 2.5) * uWaveHeight, 0.0);
    vec3 tangentZ = vec3(0.0, (-sin(position.z * 2.0 + uTime * uWaveSpeed * 0.8) * 2.0) * uWaveHeight, 1.0);
    vNormal = normalize(cross(tangentZ, tangentX));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
  }
`;

export const waterFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorDeep;   // Abyss Teal #04161A
  uniform vec3 uColorShallow; // Mid Teal #0E3B43
  uniform vec3 uColorFoam;   // Silt sand #E9E4D8
  uniform float uCausticIntensity;
  uniform float uDepth;      // Camera depth down Z/Y

  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vElevation;

  // Procedural 2D Voronoi / Caustic pattern
  vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }

  float voronoi(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float md = 5.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash2(n + g);
        o = 0.5 + 0.4 * sin(uTime * 1.8 + 6.2831 * o);
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < md) md = d;
      }
    }
    return sqrt(md);
  }

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vPosition);

    // Fresnel calculation
    float fresnel = pow(1.0 - max(dot(viewDirection, vNormal), 0.0), 3.0);

    // Animated caustic layers
    vec2 uvCaustic1 = vUv * 12.0 + vec2(uTime * 0.04, uTime * 0.02);
    vec2 uvCaustic2 = vUv * 16.0 - vec2(uTime * 0.03, -uTime * 0.05);
    float c1 = voronoi(uvCaustic1);
    float c2 = voronoi(uvCaustic2);
    float caustic = pow(1.0 - min(c1, c2), 3.0) * uCausticIntensity;

    // Depth water absorption: deep abyss teal at bottom, mid teal near surface
    float depthFactor = clamp((cameraPosition.y - vPosition.y) * 0.15, 0.0, 1.0);
    vec3 waterColor = mix(uColorShallow, uColorDeep, depthFactor);

    // Add caustic highlights
    waterColor += caustic * vec3(0.12, 0.35, 0.38);

    // Add fresnel reflectance
    waterColor = mix(waterColor, uColorFoam, fresnel * 0.35);

    gl_FragColor = vec4(waterColor, 0.92);
  }
`;
