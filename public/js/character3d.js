import * as THREE from 'three';

let _contactShadowTex = null;
let _fabricBumpTex = null;

function getContactShadowTexture() {
  if (_contactShadowTex) return _contactShadowTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  g.addColorStop(0.55, 'rgba(0, 0, 0, 0.36)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _contactShadowTex = new THREE.CanvasTexture(c);
  _contactShadowTex.colorSpace = THREE.SRGBColorSpace;
  return _contactShadowTex;
}

function getFabricBumpTexture() {
  if (_fabricBumpTex) return _fabricBumpTex;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const weave = ((x + y) % 4 === 0) ? 148 : 112;
      ctx.fillStyle = `rgb(${weave},${weave},${weave})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  _fabricBumpTex = new THREE.CanvasTexture(c);
  _fabricBumpTex.wrapS = THREE.RepeatWrapping;
  _fabricBumpTex.wrapT = THREE.RepeatWrapping;
  _fabricBumpTex.repeat.set(4, 4);
  return _fabricBumpTex;
}

function makeClothMat(color, sheenColor) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.76,
    metalness: 0.05,
    sheen: 0.6,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(sheenColor || color).lerp(new THREE.Color('#ffffff'), 0.35),
    bumpMap: getFabricBumpTexture(),
    bumpScale: 0.015,
  });
}

function makeArmorMat(color, roughness = 0.25, metalness = 0.65, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
    emissive,
    emissiveIntensity,
  });
}

function makeMat(color, roughness = 0.55, metalness = 0.08, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
}

export function createFighterMesh(ch) {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const isTitan = ch.id === 'gorou';
  const isNinja = ch.id === 'mika';
  const isMonk = ch.id === 'sora';
  const isAssassin = ch.id === 'zen';

  const scaleMult = isTitan ? 1.15 : isNinja ? 0.96 : 1.0;
  bodyPivot.scale.set(
    isTitan ? 1.2 : scaleMult,
    scaleMult,
    isTitan ? 1.16 : scaleMult
  );

  const primaryMat = makeClothMat(ch.c, ch.h);
  const accentMat = makeArmorMat(ch.h, 0.24, 0.62, ch.h, 0.2);
  const darkClothMat = makeClothMat('#161628', '#383d5e');
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: '#e4b78e',
    roughness: 0.56,
    metalness: 0.02,
    clearcoat: 0.05,
    clearcoatRoughness: 0.72,
  });
  const metalMat = makeArmorMat('#b8c4d8', 0.22, 0.9);
  const eyeColor = isTitan ? '#ff9f43' : ch.h;
  const eyeGlowMat = makeMat(eyeColor, 0.15, 0.05, eyeColor, 2.5);
  const darkTrimMat = makeMat('#0d0f1a', 0.7, 0.15);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.23, 0.29), darkClothMat);
  pelvis.position.set(0, 0.92, 0);
  pelvis.castShadow = true;
  pelvis.receiveShadow = true;
  bodyPivot.add(pelvis);

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.0, 0);
  bodyPivot.add(torsoGroup);

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.21, 0.56, 12), primaryMat);
  chest.position.y = 0.28;
  chest.castShadow = true;
  chest.receiveShadow = true;
  torsoGroup.add(chest);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 8, 16), darkClothMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.55, 0.01);
  torsoGroup.add(collar);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.1, 12), accentMat);
  belt.position.y = 0.04;
  belt.castShadow = true;
  torsoGroup.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.07), metalMat);
  buckle.position.set(0, 0.04, 0.215);
  torsoGroup.add(buckle);

  const beltGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.036, 0), eyeGlowMat);
  beltGem.position.set(0, 0.04, 0.255);
  torsoGroup.add(beltGem);

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.09), metalMat);
  chestPlate.position.set(0, 0.36, 0.18);
  chestPlate.castShadow = true;
  torsoGroup.add(chestPlate);

  const chestCore = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.03), accentMat);
  chestCore.position.set(0, 0.36, 0.225);
  torsoGroup.add(chestCore);

  let scarfTail = null;
  let haloRing = null;

  if (isNinja) {
    scarfTail = new THREE.Group();
    scarfTail.position.set(0, 0.52, -0.18);
    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.055, 0.72), accentMat);
    scarf.position.set(0, -0.04, -0.34);
    scarf.rotation.x = 0.22;
    scarf.castShadow = true;
    scarfTail.add(scarf);
    torsoGroup.add(scarfTail);

    for (const s of [-1, 1]) {
      const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.74, 8), darkTrimMat);
      sheath.position.set(s * 0.13, 0.36, -0.22);
      sheath.rotation.z = s * 0.36;
      sheath.rotation.x = -0.14;
      sheath.castShadow = true;
      torsoGroup.add(sheath);

      const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 10), accentMat);
      tsuba.position.set(s * 0.26, 0.71, -0.27);
      tsuba.rotation.z = s * 0.36;
      tsuba.rotation.x = -0.14;
      torsoGroup.add(tsuba);

      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.2, 8), metalMat);
      hilt.position.set(s * 0.3, 0.8, -0.285);
      hilt.rotation.z = s * 0.36;
      hilt.rotation.x = -0.14;
      torsoGroup.add(hilt);
    }
  } else if (isTitan) {
    for (const s of [-1, 1]) {
      const pauldron = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), metalMat);
      pauldron.position.set(s * 0.37, 0.52, 0);
      pauldron.castShadow = true;
      torsoGroup.add(pauldron);

      const rimSpike = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.22, 5), accentMat);
      rimSpike.position.set(s * 0.48, 0.62, 0);
      rimSpike.rotation.z = -s * 0.65;
      torsoGroup.add(rimSpike);
    }
  } else if (isMonk) {
    haloRing = new THREE.Group();
    haloRing.position.set(0, 0.64, -0.24);
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.032, 10, 32), eyeGlowMat);
    haloRing.add(ringMesh);
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * Math.PI * 2;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), accentMat);
      bead.position.set(Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0);
      haloRing.add(bead);
    }
    torsoGroup.add(haloRing);
  } else if (isAssassin) {
    const mantleMat = darkClothMat.clone();
    mantleMat.side = THREE.DoubleSide;
    const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.58, 8, 1, true), mantleMat);
    mantle.position.set(0, 0.34, -0.04);
    mantle.castShadow = true;
    torsoGroup.add(mantle);

    for (const s of [-1, 1]) {
      const dagger = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.34, 4), eyeGlowMat);
      dagger.position.set(s * 0.24, 0.03, -0.04);
      dagger.rotation.x = Math.PI * 0.72;
      dagger.rotation.z = s * 0.35;
      torsoGroup.add(dagger);
    }
  } else {
    for (const s of [-1, 1]) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.038, 8, 14), accentMat);
      wrap.position.set(s * 0.29, 0.48, 0);
      wrap.rotation.y = Math.PI / 2;
      torsoGroup.add(wrap);
    }
    scarfTail = new THREE.Group();
    scarfTail.position.set(-0.08, 0.04, -0.18);
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.45), accentMat);
    sash.position.set(0, -0.14, -0.15);
    sash.rotation.x = 0.75;
    sash.castShadow = true;
    scarfTail.add(sash);
    torsoGroup.add(scarfTail);
  }

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.62, 0);
  torsoGroup.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.13, 10), skinMat);
  neck.position.y = 0.02;
  headGroup.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), skinMat);
  head.position.y = 0.22;
  head.scale.set(0.96, 1.04, 1.0);
  head.castShadow = true;
  headGroup.add(head);

  // Subtle nose bridge + brow intensity + shadowed eye sockets
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 4), skinMat);
  nose.rotation.x = Math.PI * 0.42;
  nose.position.set(0, 0.195, 0.205);
  headGroup.add(nose);

  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.032, 0.05), darkTrimMat);
  brow.position.set(0, 0.265, 0.185);
  headGroup.add(brow);

  for (const s of [-1, 1]) {
    const eyeSocket = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.048, 0.025), darkTrimMat);
    eyeSocket.position.set(s * 0.074, 0.228, 0.182);
    headGroup.add(eyeSocket);

    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.036, 0.03), eyeGlowMat);
    eye.position.set(s * 0.074, 0.228, 0.188);
    headGroup.add(eye);
  }

  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.218, 0.218, 0.078, 16), primaryMat);
  band.position.y = 0.31;
  headGroup.add(band);

  // Headband knot & flowing ribbons on back of head
  const headbandTails = new THREE.Group();
  headbandTails.position.set(0, 0.3, -0.21);
  for (const s of [-1, 1]) {
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.32), accentMat);
    ribbon.position.set(s * 0.03, -0.06, -0.14);
    ribbon.rotation.x = 0.55;
    ribbon.rotation.y = s * 0.22;
    headbandTails.add(ribbon);
  }
  headGroup.add(headbandTails);

  const hairGroup = new THREE.Group();
  hairGroup.position.y = 0.34;
  headGroup.add(hairGroup);

  const hairMat = isAssassin ? darkClothMat : accentMat;
  const spikeCount = 8;
  for (let i = 0; i < spikeCount; i++) {
    const angle = (i / spikeCount) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.082, 0.33, 6), hairMat);
    spike.position.set(Math.sin(angle) * 0.11, 0.08, Math.cos(angle) * 0.11 - 0.04);
    spike.rotation.z = -Math.sin(angle) * 0.72;
    spike.rotation.x = Math.cos(angle) * 0.58 - 0.25;
    spike.castShadow = true;
    hairGroup.add(spike);
  }
  const topSpike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.37, 6), hairMat);
  topSpike.position.set(0, 0.16, -0.04);
  topSpike.rotation.x = -0.35;
  topSpike.castShadow = true;
  hairGroup.add(topSpike);

  function makeArm(side) {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 0.34, 0.48, 0);
    torsoGroup.add(shoulderPivot);

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), primaryMat);
    shoulderCap.castShadow = true;
    shoulderPivot.add(shoulderCap);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.22, 5, 10), skinMat);
    upper.position.y = -0.15;
    upper.castShadow = true;
    shoulderPivot.add(upper);

    const elbowBand = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 12), metalMat);
    elbowBand.rotation.x = Math.PI / 2;
    elbowBand.position.y = -0.25;
    shoulderPivot.add(elbowBand);

    const gauntlet = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.07, 0.29, 10), primaryMat);
    gauntlet.position.y = -0.39;
    gauntlet.castShadow = true;
    shoulderPivot.add(gauntlet);

    const bracerPlate = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.22, 0.11), metalMat);
    bracerPlate.position.set(side * 0.068, -0.39, 0);
    shoulderPivot.add(bracerPlate);

    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.086, 10, 10), accentMat);
    fist.position.y = -0.55;
    fist.castShadow = true;
    shoulderPivot.add(fist);

    return shoulderPivot;
  }

  function makeLeg(side) {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.135, 0.88, 0);
    bodyPivot.add(hipPivot);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.26, 5, 10), darkClothMat);
    thigh.position.y = -0.22;
    thigh.castShadow = true;
    hipPivot.add(thigh);

    const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.08), metalMat);
    kneePad.position.set(0, -0.38, 0.078);
    hipPivot.add(kneePad);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.068, 0.34, 10), primaryMat);
    shin.position.y = -0.54;
    shin.castShadow = true;
    hipPivot.add(shin);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.115, 0.25), accentMat);
    boot.position.set(0, -0.78, 0.042);
    boot.castShadow = true;
    hipPivot.add(boot);

    return hipPivot;
  }

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  // Hand energy charge orb (visible during sp/ult windup)
  const chargeOrb = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 12),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(ch.c).multiplyScalar(2.4),
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  chargeOrb.position.set(0, 1.32, 0.65);
  chargeOrb.visible = false;
  bodyPivot.add(chargeOrb);

  // Soft contact shadow
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  // Shield power-up sphere
  const shieldSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 20, 16),
    new THREE.MeshBasicMaterial({
      color: 0x4fd1ff,
      transparent: true,
      opacity: 0.28,
      wireframe: true,
      depthWrite: false,
    })
  );
  shieldSphere.position.y = 1.1;
  shieldSphere.visible = false;
  root.add(shieldSphere);

  // Block directional energy buckler
  const blockShield = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.75, 0.06, 6),
    new THREE.MeshBasicMaterial({
      color: 0x4fd1ff,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    })
  );
  blockShield.rotation.x = Math.PI / 2;
  blockShield.position.set(0, 1.15, 0.62);
  blockShield.visible = false;
  root.add(blockShield);

  // Transformation aura ring (Ultimate awakened form)
  const transformAura = new THREE.Group();
  const auraMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffe34a).multiplyScalar(2.3),
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const auraRingA = new THREE.Mesh(new THREE.RingGeometry(0.65, 1.05, 24), auraMat);
  auraRingA.rotation.x = -Math.PI / 2;
  auraRingA.position.y = 0.08;
  const auraShell = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.88, 2.05, 12, 1, true), auraMat);
  auraShell.position.y = 1.05;
  transformAura.add(auraRingA, auraShell);
  transformAura.visible = false;
  root.add(transformAura);

  // Freeze power-up crystal prison
  const freezeCage = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.18, 0),
    new THREE.MeshStandardMaterial({
      color: '#9be7ff',
      emissive: '#4fd1ff',
      emissiveIntensity: 0.45,
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.56,
    })
  );
  freezeCage.scale.set(0.9, 1.25, 0.9);
  freezeCage.position.y = 1.12;
  freezeCage.visible = false;
  root.add(freezeCage);

  return {
    root,
    bodyPivot,
    torsoGroup,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    scarfTail,
    headbandTails,
    haloRing,
    chargeOrb,
    contactShadow,
    shieldSphere,
    blockShield,
    transformAura,
    freezeCage,
    accentMat,
    baseScaleX: isTitan ? 1.2 : scaleMult,
    baseScaleY: scaleMult,
    baseScaleZ: isTitan ? 1.16 : scaleMult,
  };
}

export function animateFighterMesh(rig, state, dt, elapsed) {
  const {
    bodyPivot,
    torsoGroup,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    scarfTail,
    headbandTails,
    haloRing,
    chargeOrb,
    contactShadow,
    shieldSphere,
    blockShield,
    transformAura,
    freezeCage,
    accentMat,
    baseScaleX,
    baseScaleY,
    baseScaleZ,
  } = rig;

  const speed = state.speedRatio || 0;
  const grounded = state.grounded !== false;
  const running = Boolean(state.isRunning);
  const st = state.action || 'idle';

  let targetTorsoX = 0;
  let targetTorsoY = 0;
  let targetBodyY = 0;
  let targetScaleY = 1;
  let targetScaleXZ = 1;
  let lLegX = 0;
  let rLegX = 0;
  let lArmX = 0;
  let rArmX = 0;
  let lArmZ = 0.14;
  let rArmZ = -0.14;

  chargeOrb.visible = false;
  blockShield.visible = false;

  if (st === 'hurt') {
    targetTorsoX = -0.35;
    targetBodyY = -0.04;
    lArmX = -0.3;
    rArmX = -0.3;
    lArmZ = 0.65;
    rArmZ = -0.65;
  } else if (st === 'block') {
    targetTorsoX = 0.14;
    targetBodyY = -0.08;
    lArmX = -1.28;
    rArmX = -1.28;
    lArmZ = -0.42;
    rArmZ = 0.42;
    lLegX = -0.22;
    rLegX = 0.24;
    blockShield.visible = true;
  } else if (st === 'dodge') {
    targetTorsoX = 0.48;
    targetBodyY = -0.12;
    lArmX = 0.7;
    rArmX = 0.7;
    lLegX = -0.5;
    rLegX = 0.55;
  } else if (st === 'punch') {
    targetTorsoX = 0.26;
    targetTorsoY = -0.45;
    rArmX = -1.55;
    rArmZ = -0.05;
    lArmX = 0.45;
    lLegX = -0.32;
    rLegX = 0.36;
  } else if (st === 'kick') {
    targetTorsoX = -0.22;
    targetTorsoY = 0.35;
    rLegX = -1.52;
    lLegX = 0.12;
    lArmX = -0.65;
    rArmX = 0.5;
    lArmZ = 0.42;
    rArmZ = -0.42;
  } else if (st === 'sp' || st === 'ult') {
    const isUlt = st === 'ult';
    targetTorsoX = isUlt ? -0.18 : 0.22;
    lArmX = -1.48;
    rArmX = -1.48;
    lArmZ = isUlt ? 0.22 : -0.12;
    rArmZ = isUlt ? -0.22 : 0.12;
    chargeOrb.visible = true;
    const pulse = (isUlt ? 1.7 : 1.0) + Math.sin(elapsed * 32) * 0.22;
    chargeOrb.scale.setScalar(pulse);
  } else if (!grounded) {
    const rising = state.velY > 0;
    targetTorsoX = rising ? -0.1 : 0.18;
    lLegX = rising ? -0.55 : -0.25;
    rLegX = rising ? 0.35 : 0.45;
    lArmX = rising ? -1.1 : -0.45;
    rArmX = rising ? -1.1 : -0.45;
    lArmZ = 0.45;
    rArmZ = -0.45;
  } else if (speed > 0.08) {
    const freq = running ? 13.5 : 8.5;
    const stride = running ? 0.92 : 0.56;
    const armSwing = running ? 1.05 : 0.62;
    const phase = elapsed * freq;
    const s = Math.sin(phase);

    targetTorsoX = running ? 0.28 : 0.1;
    targetBodyY = Math.abs(Math.cos(phase)) * (running ? 0.09 : 0.045);

    lLegX = s * stride;
    rLegX = -s * stride;
    lArmX = -s * armSwing;
    rArmX = s * armSwing;
    lArmZ = running ? 0.22 : 0.14;
    rArmZ = running ? -0.22 : -0.14;
  } else {
    const breath = Math.sin(elapsed * 2.8);
    targetBodyY = breath * 0.025;
    targetTorsoX = 0.06;
    lLegX = -0.14;
    rLegX = 0.16;
    lArmX = -0.42 + breath * 0.05;
    rArmX = -0.62 - breath * 0.05;
    lArmZ = 0.26;
    rArmZ = -0.22;
  }

  if (state.landTimer > 0) {
    const k = state.landTimer / 0.16;
    targetScaleY = 1 - k * 0.14;
    targetScaleXZ = 1 + k * 0.09;
  }

  const snapRate = (st === 'punch' || st === 'kick' || st === 'sp' || st === 'ult') ? 28 : 16;

  bodyPivot.position.y = THREE.MathUtils.damp(bodyPivot.position.y, targetBodyY, 16, dt);
  torsoGroup.rotation.x = THREE.MathUtils.damp(torsoGroup.rotation.x, targetTorsoX, snapRate, dt);
  torsoGroup.rotation.y = THREE.MathUtils.damp(torsoGroup.rotation.y, targetTorsoY, snapRate, dt);
  headGroup.rotation.x = THREE.MathUtils.damp(headGroup.rotation.x, -targetTorsoX * 0.5, 14, dt);

  leftLeg.rotation.x = THREE.MathUtils.damp(leftLeg.rotation.x, lLegX, snapRate, dt);
  rightLeg.rotation.x = THREE.MathUtils.damp(rightLeg.rotation.x, rLegX, snapRate, dt);
  leftArm.rotation.x = THREE.MathUtils.damp(leftArm.rotation.x, lArmX, snapRate, dt);
  rightArm.rotation.x = THREE.MathUtils.damp(rightArm.rotation.x, rArmX, snapRate, dt);
  leftArm.rotation.z = THREE.MathUtils.damp(leftArm.rotation.z, lArmZ, 16, dt);
  rightArm.rotation.z = THREE.MathUtils.damp(rightArm.rotation.z, rArmZ, 16, dt);

  bodyPivot.scale.y = THREE.MathUtils.damp(bodyPivot.scale.y, baseScaleY * targetScaleY, 18, dt);
  bodyPivot.scale.x = THREE.MathUtils.damp(bodyPivot.scale.x, baseScaleX * targetScaleXZ, 18, dt);
  bodyPivot.scale.z = THREE.MathUtils.damp(bodyPivot.scale.z, baseScaleZ * targetScaleXZ, 18, dt);

  if (scarfTail) {
    scarfTail.rotation.x = -0.15 - Math.min(0.65, speed * 0.4) + Math.sin(elapsed * 8) * 0.08;
  }
  if (headbandTails) {
    headbandTails.rotation.x = 0.08 + Math.min(0.85, speed * 0.55) + Math.sin(elapsed * 9.5) * 0.12;
    headbandTails.rotation.y = Math.cos(elapsed * 6.5) * 0.06;
  }
  if (haloRing) {
    haloRing.rotation.z += dt * (state.pwTimer > 0 ? 4.2 : 1.4);
  }

  const heightAboveGround = Math.max(0, state.heightAboveGround || 0);
  contactShadow.position.y = -heightAboveGround + 0.025;
  const shadowScale = Math.max(0.45, 1 - heightAboveGround * 0.09);
  contactShadow.scale.setScalar(shadowScale);
  contactShadow.material.opacity = Math.max(0.14, 0.48 - heightAboveGround * 0.06);

  if (shieldSphere) {
    shieldSphere.visible = (state.invTimer || 0) > 0;
    if (shieldSphere.visible) shieldSphere.rotation.y += dt * 1.8;
  }

  if (transformAura) {
    const transformed = (state.pwTimer || 0) > 0;
    transformAura.visible = transformed;
    accentMat.emissiveIntensity = transformed ? 2.6 : (st === 'sp' || st === 'ult') ? 1.8 : 0.24;
    if (transformed) {
      transformAura.rotation.y += dt * 3.5;
      transformAura.scale.setScalar(1 + Math.sin(elapsed * 14) * 0.06);
    }
  }

  if (freezeCage) {
    freezeCage.visible = (state.frozenTimer || 0) > 0;
    if (freezeCage.visible) freezeCage.rotation.y += dt * 0.6;
  }
}

export function disposeObject3D(root) {
  if (!root) return;
  const seenGeos = new Set();
  const seenMats = new Set();
  const isSharedTex = (t) => t === _contactShadowTex || t === _fabricBumpTex;
  root.traverse((obj) => {
    if (obj.geometry && !seenGeos.has(obj.geometry)) {
      seenGeos.add(obj.geometry);
      obj.geometry.dispose();
    }
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!seenMats.has(m)) {
          seenMats.add(m);
          for (const key of ['map', 'bumpMap', 'normalMap', 'roughnessMap']) {
            if (m[key] && !isSharedTex(m[key])) m[key].dispose();
          }
          m.dispose();
        }
      }
    }
  });
}
