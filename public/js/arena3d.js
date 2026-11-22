import * as THREE from 'three';
import { PhysicsWorld } from './physics3d.js';

const ARENA_THEMES = [
  {
    name: 'Mountain Arena',
    skyTop: '#1d3e6b',
    skyHorizon: '#8eb1cf',
    fog: '#89accb',
    fogDensity: 0.0086,
    sunGlow: '#f2dfb8',
    groundA: '#50483f',
    groundB: '#3a342e',
    accent: '#78a2c9',
    sunColor: '#ffedd0',
    sunIntensity: 1.55,
    hemiSky: '#8bb8e0',
    hemiGround: '#3d342d',
    hemiIntensity: 0.5,
    rimColor: '#76abde',
    isNight: false,
  },
  {
    name: 'Futuristic City',
    skyTop: '#050311',
    skyHorizon: '#200c45',
    fog: '#160836',
    fogDensity: 0.0095,
    sunGlow: '#e6399b',
    groundA: '#13162e',
    groundB: '#0b0d1f',
    accent: '#ff2d95',
    sunColor: '#eec8ea',
    sunIntensity: 1.35,
    hemiSky: '#44b8e8',
    hemiGround: '#140829',
    hemiIntensity: 0.45,
    rimColor: '#4fd1ff',
    isNight: true,
  },
  {
    name: 'Ancient Temple',
    skyTop: '#3d223e',
    skyHorizon: '#bf7c4d',
    fog: '#ad6b42',
    fogDensity: 0.009,
    sunGlow: '#f5cc84',
    groundA: '#75573d',
    groundB: '#573f2a',
    accent: '#eb9e34',
    sunColor: '#ffd094',
    sunIntensity: 1.65,
    hemiSky: '#e8a66d',
    hemiGround: '#3b2619',
    hemiIntensity: 0.48,
    rimColor: '#e88243',
    isNight: false,
  },
  {
    name: 'Forest Arena',
    skyTop: '#214c3e',
    skyHorizon: '#76ab83',
    fog: '#6da17b',
    fogDensity: 0.01,
    sunGlow: '#e3f0be',
    groundA: '#2c4629',
    groundB: '#1d301c',
    accent: '#5cd175',
    sunColor: '#eef7d2',
    sunIntensity: 1.5,
    hemiSky: '#98d6ab',
    hemiGround: '#1c2b1b',
    hemiIntensity: 0.5,
    rimColor: '#72cf90',
    isNight: false,
  },
  {
    name: 'Desert Battlefield',
    skyTop: '#2f598a',
    skyHorizon: '#cfa468',
    fog: '#c79a5e',
    fogDensity: 0.0085,
    sunGlow: '#f5e4b0',
    groundA: '#b58443',
    groundB: '#94672f',
    accent: '#e0bc60',
    sunColor: '#ffe7b3',
    sunIntensity: 1.72,
    hemiSky: '#ebd098',
    hemiGround: '#6b4922',
    hemiIntensity: 0.48,
    rimColor: '#e8bc6b',
    isNight: false,
  },
];

function createSkyDome(theme) {
  const geo = new THREE.SphereGeometry(165, 32, 20);
  const sunDir = new THREE.Vector3(22, 34, 18).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTopColor: { value: new THREE.Color(theme.skyTop) },
      uHorizonColor: { value: new THREE.Color(theme.fog) },
      uSunGlow: { value: new THREE.Color(theme.sunGlow) },
      uSunDir: { value: sunDir },
      uTime: { value: 0 },
      uNight: { value: theme.isNight ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunGlow;
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform float uNight;
      varying vec3 vWorldDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);
        float horizonBlend = pow(1.0 - h, 2.4);
        vec3 col = mix(uTopColor, uHorizonColor, horizonBlend);

        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        col += uSunGlow * pow(sunDot, 12.0) * mix(0.28, 0.18, uNight);
        col += uSunGlow * smoothstep(0.9965, 0.9996, sunDot) * mix(0.95, 0.55, uNight);

        if (dir.y > 0.03) {
          vec2 cloudUv = dir.xz / (dir.y + 0.18) * 1.4 + vec2(uTime * 0.012, uTime * 0.006);
          float c = noise(cloudUv) * 0.6 + noise(cloudUv * 2.3) * 0.3 + noise(cloudUv * 5.0) * 0.1;
          float cloudMask = smoothstep(0.54, 0.82, c) * smoothstep(0.03, 0.26, dir.y);
          vec3 cloudCol = mix(vec3(0.86, 0.84, 0.82), uSunGlow * 0.45, uNight);
          col = mix(col, cloudCol, cloudMask * mix(0.35, 0.18, uNight));
        }

        if (uNight > 0.5 && dir.y > 0.08) {
          float s = hash21(floor(dir.xz * 260.0));
          float star = step(0.994, s) * smoothstep(0.08, 0.4, dir.y);
          col += vec3(0.85, 0.92, 1.0) * star * 0.9;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

function buildNormalFromHeight(height, size, strength = 2.6) {
  const data = new Uint8Array(size * size * 4);
  const idx = (x, y) => ((y + size) % size) * size + ((x + size) % size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[idx(x - 1, y)];
      const r = height[idx(x + 1, y)];
      const u = height[idx(x, y - 1)];
      const d = height[idx(x, y + 1)];
      let nx = (l - r) * strength;
      let ny = (u - d) * strength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * size + x) * 4;
      data[o] = Math.round((nx * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createGroundPBRTextures(theme, idx, maxAniso) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  const rc = document.createElement('canvas');
  rc.width = size;
  rc.height = size;
  const rctx = rc.getContext('2d');

  const nSize = 256;
  const height = new Float32Array(nSize * nSize);
  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  for (let y = 0; y < nSize; y++) {
    for (let x = 0; x < nSize; x++) {
      height[y * nSize + x] = hash(x, y) * 0.16 + Math.sin(x * 0.25) * Math.cos(y * 0.25) * 0.08;
    }
  }

  ctx.fillStyle = theme.groundA;
  ctx.fillRect(0, 0, size, size);
  rctx.fillStyle = idx === 1 ? '#585858' : '#d8d8d8';
  rctx.fillRect(0, 0, size, size);

  if (idx === 1) {
    // Futuristic cyber metallic deck with recessed neon panel grooves
    for (let y = 0; y < size; y += 64) {
      for (let x = 0; x < size; x += 64) {
        const checker = ((x + y) / 64) % 2 === 0;
        ctx.fillStyle = checker ? '#181c3a' : '#101329';
        ctx.fillRect(x, y, 64, 64);
        rctx.fillStyle = checker ? '#484848' : '#646464';
        rctx.fillRect(x + 3, y + 3, 58, 58);
      }
    }
    ctx.strokeStyle = 'rgba(79, 209, 255, 0.34)';
    ctx.lineWidth = 3;
    for (let g = 0; g <= size; g += 64) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(size, g);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 45, 149, 0.22)';
    ctx.fillRect(10, 10, 44, 44);
    ctx.fillRect(266, 266, 44, 44);

    for (let y = 0; y < nSize; y++) {
      for (let x = 0; x < nSize; x++) {
        const gx = x % 32;
        const gy = y % 32;
        const bevel = (gx < 2 || gx > 29 || gy < 2 || gy > 29) ? -0.45 : 0.15;
        height[y * nSize + x] = bevel + hash(x, y) * 0.04;
      }
    }
  } else if (idx === 0 || idx === 2) {
    // Flagstone / weathered temple carved blocks
    for (let row = 0; row < 8; row++) {
      const y = row * 64;
      const offset = (row % 2) * 32;
      for (let col = -1; col < 9; col++) {
        const x = col * 64 + offset;
        const tone = ((row * 5 + col * 3) & 1) ? theme.groundA : theme.groundB;
        ctx.fillStyle = tone;
        ctx.fillRect(x, y, 64, 64);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(x + 4, y + 4, 56, 8);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.36)';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, 64, 64);

        rctx.fillStyle = ((row + col) % 3 === 0) ? '#b0b0b0' : '#dcdcdc';
        rctx.fillRect(x + 3, y + 3, 58, 58);
        rctx.strokeStyle = '#707070';
        rctx.lineWidth = 4;
        rctx.strokeRect(x, y, 64, 64);
      }
    }
    for (let i = 0; i < 450; i++) {
      const px = (i * 97) % size;
      const py = (i * 173) % size;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(px, py, 3 + (i % 5), 2 + (i % 4));
    }
    for (let y = 0; y < nSize; y++) {
      const row = Math.floor(y / 32);
      const gy = y % 32;
      const off = (row % 2) * 16;
      for (let x = 0; x < nSize; x++) {
        const gx = (x + off) % 32;
        const seam = (gx <= 1 || gx >= 30 || gy <= 1 || gy >= 30);
        height[y * nSize + x] = seam ? -0.55 : (0.2 + hash(x, y) * 0.22);
      }
    }
  } else if (idx === 3) {
    // Forest organic soil, mossy patches & pebbles
    for (let i = 0; i < 650; i++) {
      const x = (i * 73) % size;
      const y = (i * 137) % size;
      const r = 5 + (i % 15);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(110, 231, 135, 0.16)' : i % 3 === 1 ? 'rgba(20, 38, 22, 0.26)' : 'rgba(92, 74, 48, 0.18)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      rctx.fillStyle = i % 3 === 0 ? '#a8a8a8' : '#e6e6e6';
      rctx.beginPath();
      rctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      rctx.fill();
    }
    for (let y = 0; y < nSize; y++) {
      for (let x = 0; x < nSize; x++) {
        height[y * nSize + x] =
          Math.sin(x * 0.15) * Math.cos(y * 0.18) * 0.28 +
          Math.sin((x + y) * 0.35) * 0.12 +
          hash(x, y) * 0.24;
      }
    }
  } else {
    // Desert wind-swept sand dunes & crisp ripple normals
    ctx.fillStyle = theme.groundB;
    for (let y = 0; y < size; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.049 + y * 0.08) * 6);
      }
      ctx.lineTo(size, y + 13);
      ctx.lineTo(0, y + 13);
      ctx.closePath();
      ctx.globalAlpha = 0.28;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 800; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,245,210,0.12)' : 'rgba(130,85,35,0.1)';
      ctx.fillRect((i * 89) % size, (i * 151) % size, 2, 2);
    }
    rctx.fillStyle = '#cfcfcf';
    rctx.fillRect(0, 0, size, size);
    for (let y = 0; y < nSize; y++) {
      for (let x = 0; x < nSize; x++) {
        const wave = Math.sin(y * 0.45 + Math.sin(x * 0.098) * 2.1);
        height[y * nSize + x] = wave * 0.42 + hash(x, y) * 0.1;
      }
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(22, 22);
  map.anisotropy = Math.max(1, maxAniso);

  const roughnessMap = new THREE.CanvasTexture(rc);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(22, 22);
  roughnessMap.anisotropy = Math.max(1, maxAniso);

  const normalMap = buildNormalFromHeight(height, nSize, idx === 1 ? 2.4 : 3.2);
  normalMap.repeat.set(22, 22);
  normalMap.anisotropy = Math.max(1, maxAniso);

  return { map, normalMap, roughnessMap };
}

function createStoneBumpTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const v = 90 + ((i * 53) % 100);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect((i * 41) % size, (i * 79) % size, 2 + (i % 4), 2 + (i % 3));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeStonePillar(color, trimColor, bumpTex, height = 5.4, radius = 0.85) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.06,
    bumpMap: bumpTex,
    bumpScale: 0.045,
  });
  const trimMat = new THREE.MeshPhysicalMaterial({
    color: trimColor,
    roughness: 0.3,
    metalness: 0.65,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25,
    emissive: trimColor,
    emissiveIntensity: 0.65,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.55, 0.48, radius * 2.55), trimMat);
  base.position.y = 0.24;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.2, 0.25, radius * 2.2), bodyMat);
  plinth.position.y = 0.6;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  g.add(plinth);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.86, radius * 0.98, height - 1.15, 14), bodyMat);
  shaft.position.y = 0.72 + (height - 1.15) * 0.5;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  g.add(shaft);

  const band = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.94, 0.085, 8, 22), trimMat);
  band.rotation.x = Math.PI / 2;
  band.position.y = height * 0.66;
  g.add(band);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.45, 0.46, radius * 2.45), trimMat);
  cap.position.y = height - 0.23;
  cap.castShadow = true;
  cap.receiveShadow = true;
  g.add(cap);

  return g;
}

function makeRockCluster(color, bumpTex, scale = 1.0) {
  const g = new THREE.Group();
  const matA = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.04,
    bumpMap: bumpTex,
    bumpScale: 0.06,
  });
  const matB = new THREE.MeshStandardMaterial({
    color: '#454954',
    roughness: 0.68,
    metalness: 0.18,
    bumpMap: bumpTex,
    bumpScale: 0.05,
  });

  const main = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1 * scale, 1), matA);
  main.position.y = 0.72 * scale;
  main.scale.set(1.22, 0.88, 1.12);
  main.castShadow = true;
  main.receiveShadow = true;
  g.add(main);

  const side = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68 * scale, 1), matB);
  side.position.set(0.85 * scale, 0.42 * scale, 0.45 * scale);
  side.castShadow = true;
  side.receiveShadow = true;
  g.add(side);

  const shard = new THREE.Mesh(new THREE.ConeGeometry(0.45 * scale, 1.45 * scale, 6), matB);
  shard.position.set(-0.6 * scale, 0.7 * scale, -0.35 * scale);
  shard.rotation.z = 0.28;
  shard.castShadow = true;
  g.add(shard);

  return g;
}

function makeTree(trunkColor, leafColor, bumpTex, scale = 1) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({
    color: trunkColor,
    roughness: 0.92,
    metalness: 0.02,
    bumpMap: bumpTex,
    bumpScale: 0.05,
  });
  const leafMat = new THREE.MeshPhysicalMaterial({
    color: leafColor,
    roughness: 0.62,
    metalness: 0.03,
    sheen: 0.35,
    sheenColor: new THREE.Color('#8ff0a4'),
  });

  const roots = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.58 * scale, 0.65 * scale, 9), trunkMat);
  roots.position.y = 0.32 * scale;
  roots.castShadow = true;
  g.add(roots);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.34 * scale, 3.2 * scale, 10), trunkMat);
  trunk.position.y = 1.9 * scale;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);

  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.75 * scale, 2.35 * scale, 10), leafMat);
  c1.position.y = 3.8 * scale;
  c1.castShadow = true;
  c1.receiveShadow = true;
  g.add(c1);

  const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.28 * scale, 1.95 * scale, 10), leafMat);
  c2.position.y = 5.0 * scale;
  c2.castShadow = true;
  c2.receiveShadow = true;
  g.add(c2);

  return g;
}

function makeHoloPylon(accentColor) {
  const g = new THREE.Group();
  const baseMat = new THREE.MeshPhysicalMaterial({
    color: '#181a34',
    roughness: 0.28,
    metalness: 0.85,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 3.4,
    roughness: 0.2,
    metalness: 0.1,
  });

  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.96, 0.55, 10), baseMat);
  ped.position.y = 0.275;
  ped.castShadow = true;
  ped.receiveShadow = true;
  g.add(ped);

  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 4.4, 10), baseMat);
  core.position.y = 2.6;
  core.castShadow = true;
  g.add(core);

  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.8, 0.92), glowMat);
  strip.position.y = 2.6;
  g.add(strip);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.06, 10, 24), glowMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 4.55;
  g.add(ring);

  return { group: g, animatedRing: ring };
}

export function buildArena3D(arenaIdx, scene, renderer, isSoftwareGl, fogEnabled = true) {
  const theme = ARENA_THEMES[arenaIdx] || ARENA_THEMES[0];
  const group = new THREE.Group();
  const physics = new PhysicsWorld(26);
  const animatedProps = [];

  scene.background = new THREE.Color(theme.fog);
  const fogObj = new THREE.FogExp2(theme.fog, theme.fogDensity);
  scene.fog = fogEnabled ? fogObj : null;

  // Atmospheric Sky Dome
  const skyDome = createSkyDome(theme);
  group.add(skyDome);

  // 3-Point Balanced Studio / Outdoor Lighting Rig
  const hemiLight = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
  hemiLight.position.set(0, 40, 0);
  group.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
  keyLight.position.set(22, 34, 18);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 2;
  keyLight.shadow.camera.far = 90;
  const d = 28;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  group.add(keyLight);

  const rimLight = new THREE.DirectionalLight(theme.rimColor, 0.45);
  rimLight.position.set(-18, 14, -22);
  group.add(rimLight);

  if (arenaIdx === 1 || arenaIdx === 2) {
    const accentPt = new THREE.PointLight(theme.accent, arenaIdx === 1 ? 10 : 7, 34, 1.6);
    accentPt.position.set(0, 4.5, 0);
    group.add(accentPt);
  }

  // Extended Ground Plane (140 radius) with procedural albedo + normal + roughness maps
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const pbrGround = createGroundPBRTextures(theme, arenaIdx, maxAniso);
  const stoneBump = createStoneBumpTexture();

  const groundMat = new THREE.MeshStandardMaterial({
    map: pbrGround.map,
    normalMap: pbrGround.normalMap,
    normalScale: new THREE.Vector2(arenaIdx === 4 ? 1.35 : 1.0, arenaIdx === 4 ? 1.35 : 1.0),
    roughnessMap: pbrGround.roughnessMap,
    roughness: arenaIdx === 1 ? 0.42 : 0.92,
    metalness: arenaIdx === 1 ? 0.55 : 0.05,
  });
  const groundMesh = new THREE.Mesh(new THREE.CircleGeometry(140, 80), groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // Playable Arena Ring Trim (offset +0.025 to prevent Z-fighting)
  const ringMat = new THREE.MeshPhysicalMaterial({
    color: theme.accent,
    roughness: 0.24,
    metalness: 0.72,
    clearcoat: 0.6,
    emissive: theme.accent,
    emissiveIntensity: arenaIdx === 1 ? 2.6 : 1.15,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const arenaBorderRing = new THREE.Mesh(new THREE.RingGeometry(25.7, 26.35, 72), ringMat);
  arenaBorderRing.rotation.x = -Math.PI / 2;
  arenaBorderRing.position.y = 0.025;
  arenaBorderRing.receiveShadow = true;
  group.add(arenaBorderRing);

  // Central Battle Emblem Medallion
  const emblemRing = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.45, 56), ringMat);
  emblemRing.rotation.x = -Math.PI / 2;
  emblemRing.position.y = 0.022;
  group.add(emblemRing);

  // Jumpable Stepped Battle Platforms
  const stepMatA = new THREE.MeshStandardMaterial({
    color: theme.groundB,
    roughness: 0.72,
    metalness: 0.16,
    bumpMap: stoneBump,
    bumpScale: 0.035,
  });
  const stepMatB = new THREE.MeshPhysicalMaterial({
    color: theme.accent,
    roughness: 0.26,
    metalness: 0.68,
    clearcoat: 0.5,
  });

  const platformConfigs = [
    { x: -11.5, z: 0, w: 4.8, h: 0.48, d: 5.4 },
    { x: -12.6, z: 0, w: 2.6, h: 1.15, d: 3.2 },
    { x: 11.5, z: 0, w: 4.8, h: 0.48, d: 5.4 },
    { x: 12.6, z: 0, w: 2.6, h: 1.15, d: 3.2 },
    { x: 0, z: -13.5, w: 6.4, h: 0.46, d: 3.4 },
  ];

  for (const p of platformConfigs) {
    const platGroup = new THREE.Group();
    const block = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), stepMatA);
    block.position.set(p.x, p.h * 0.5, p.z);
    block.castShadow = true;
    block.receiveShadow = true;
    platGroup.add(block);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.1, 0.08, p.d + 0.1), stepMatB);
    trim.position.set(p.x, p.h - 0.03, p.z);
    trim.receiveShadow = true;
    platGroup.add(trim);

    group.add(platGroup);
    physics.addBoxFromCenter(p.x, p.h * 0.5, p.z, p.w, p.h, p.d, true);
  }

  // Arena-Specific Collidable Obstacles Inside Playable Zone
  const obstacleSpots = [
    { x: -8.5, z: -9.5 },
    { x: 8.5, z: -9.5 },
    { x: -8.5, z: 9.5 },
    { x: 8.5, z: 9.5 },
  ];

  for (let i = 0; i < obstacleSpots.length; i++) {
    const s = obstacleSpots[i];
    if (arenaIdx === 1) {
      const pylon = makeHoloPylon(i % 2 === 0 ? '#4fd1ff' : '#ff2d95');
      pylon.group.position.set(s.x, 0, s.z);
      group.add(pylon.group);
      animatedProps.push({ type: 'bob', obj: pylon.animatedRing, baseY: 4.55, phase: i * 1.3 });
      physics.addCylinderCollider(s.x, s.z, 0.92, 0, 5.2, false);
    } else if (arenaIdx === 3) {
      const tree = makeTree('#4b3423', i % 2 === 0 ? '#236b3c' : '#2d8a4e', stoneBump, 1.15);
      tree.position.set(s.x, 0, s.z);
      group.add(tree);
      physics.addCylinderCollider(s.x, s.z, 0.6, 0, 5.5, false);
    } else {
      const pillarColor = arenaIdx === 4 ? '#c49050' : arenaIdx === 2 ? '#785038' : '#656c78';
      const pillar = makeStonePillar(pillarColor, theme.accent, stoneBump, 5.4, 0.82);
      pillar.position.set(s.x, 0, s.z);
      group.add(pillar);
      physics.addCylinderCollider(s.x, s.z, 0.98, 0, 5.4, false);
    }
  }

  // Natural Scatter Rocks
  const rockSpots = [
    { x: -16.5, z: -6.5, sc: 0.95 },
    { x: 16.5, z: 6.5, sc: 1.05 },
    { x: 0, z: 14.5, sc: 1.1 },
  ];
  for (const r of rockSpots) {
    const rock = makeRockCluster(arenaIdx === 4 ? '#b88246' : '#585e6a', stoneBump, r.sc);
    rock.position.set(r.x, 0, r.z);
    group.add(rock);
    physics.addCylinderCollider(r.x, r.z, 1.35 * r.sc, 0, 1.45 * r.sc, true);
  }

  // Natural Perimeter Ring
  const dummy = new THREE.Object3D();
  const colorTmp = new THREE.Color();

  if (arenaIdx === 1) {
    const count = 36;
    const towerGeo = new THREE.BoxGeometry(4.5, 1, 4.5);
    towerGeo.translate(0, 0.5, 0);
    const towerMat = new THREE.MeshPhysicalMaterial({
      color: '#1b1642',
      roughness: 0.28,
      metalness: 0.78,
      clearcoat: 0.5,
    });
    const towers = new THREE.InstancedMesh(towerGeo, towerMat, count);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const dist = 34 + (i % 4) * 7.5;
      const h = 14 + ((i * 19) % 24);
      dummy.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
      dummy.rotation.set(0, -ang, 0);
      dummy.scale.set(0.85 + (i % 3) * 0.25, h, 0.85 + ((i + 1) % 3) * 0.25);
      dummy.updateMatrix();
      towers.setMatrixAt(i, dummy.matrix);
      colorTmp.set(i % 2 === 0 ? '#1e194b' : '#28154a');
      towers.setColorAt(i, colorTmp);
    }
    towers.instanceMatrix.needsUpdate = true;
    if (towers.instanceColor) towers.instanceColor.needsUpdate = true;
    towers.computeBoundingSphere();
    group.add(towers);
  } else if (arenaIdx === 3) {
    const count = 42;
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.48, 4.2, 8);
    trunkGeo.translate(0, 2.1, 0);
    const canopyGeo = new THREE.ConeGeometry(2.3, 5.2, 8);
    canopyGeo.translate(0, 5.8, 0);

    const trunks = new THREE.InstancedMesh(
      trunkGeo,
      new THREE.MeshStandardMaterial({ color: '#422e1d', roughness: 0.9, bumpMap: stoneBump, bumpScale: 0.04 }),
      count
    );
    const canopies = new THREE.InstancedMesh(
      canopyGeo,
      new THREE.MeshStandardMaterial({ color: '#226639', roughness: 0.65 }),
      count
    );
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (i % 2) * 0.05;
      const dist = 28.5 + (i % 5) * 4.5;
      const sc = 0.88 + (i % 4) * 0.14;
      dummy.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
      dummy.rotation.set(0, ang, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      canopies.setMatrixAt(i, dummy.matrix);
      colorTmp.set(i % 2 === 0 ? '#236e3b' : '#2f8a4b');
      canopies.setColorAt(i, colorTmp);
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    canopies.computeBoundingSphere();
    group.add(trunks, canopies);
  } else {
    const count = 32;
    const peakGeo = new THREE.ConeGeometry(7.5, 1, 7);
    peakGeo.translate(0, 0.5, 0);
    const peakColor = arenaIdx === 4 ? '#c7934d' : arenaIdx === 2 ? '#6b4933' : '#515e73';
    const peakMat = new THREE.MeshStandardMaterial({
      color: peakColor,
      roughness: 0.88,
      metalness: 0.05,
      bumpMap: stoneBump,
      bumpScale: 0.06,
    });
    const peaks = new THREE.InstancedMesh(peakGeo, peakMat, count);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const dist = 36 + (i % 4) * 8;
      const h = (arenaIdx === 0 ? 18 : 11) + ((i * 11) % 12);
      const w = 0.85 + (i % 3) * 0.25;
      dummy.position.set(Math.cos(ang) * dist, -0.5, Math.sin(ang) * dist);
      dummy.rotation.set(0, ang * 1.7, 0);
      dummy.scale.set(w, h, w);
      dummy.updateMatrix();
      peaks.setMatrixAt(i, dummy.matrix);
      colorTmp.set(peakColor).offsetHSL(0, 0, ((i % 3) - 1) * 0.04);
      peaks.setColorAt(i, colorTmp);
    }
    peaks.instanceMatrix.needsUpdate = true;
    if (peaks.instanceColor) peaks.instanceColor.needsUpdate = true;
    peaks.computeBoundingSphere();
    group.add(peaks);
  }

  // Ambient floating spirit/energy motes
  const moteCount = 56;
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 21;
    motePos[i * 3] = Math.cos(a) * r;
    motePos[i * 3 + 1] = 0.6 + Math.random() * 5.2;
    motePos[i * 3 + 2] = Math.sin(a) * r;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    color: new THREE.Color(theme.accent).multiplyScalar(2.4),
    size: 0.21,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  group.add(motes);

  scene.add(group);

  return {
    group,
    physics,
    theme,
    setFog(enabled) {
      scene.fog = enabled ? fogObj : null;
    },
    update(dt, elapsed) {
      skyDome.material.uniforms.uTime.value = elapsed;
      for (let i = 0; i < animatedProps.length; i++) {
        const p = animatedProps[i];
        p.obj.position.y = p.baseY + Math.sin(elapsed * 2.4 + p.phase) * 0.22;
        p.obj.rotation.z = elapsed * 0.9 + p.phase;
      }
      motes.rotation.y = elapsed * 0.05;
    },
    dispose() {
      scene.remove(group);
      const geos = new Set();
      const mats = new Set();
      const texs = new Set();
      group.traverse((o) => {
        if (o.geometry && !geos.has(o.geometry)) {
          geos.add(o.geometry);
          o.geometry.dispose();
        }
        if (o.material) {
          const arr = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of arr) {
            if (!mats.has(m)) {
              mats.add(m);
              for (const k of ['map', 'normalMap', 'roughnessMap', 'bumpMap']) {
                if (m[k] && !texs.has(m[k])) {
                  texs.add(m[k]);
                  m[k].dispose();
                }
              }
              m.dispose();
            }
          }
        }
      });
    },
  };
}
