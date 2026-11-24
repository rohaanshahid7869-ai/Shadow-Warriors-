import * as THREE from 'three';

const _fwd = new THREE.Vector3();
const _toOpp = new THREE.Vector3();

const AI_PROFILES = [
  { think: 0.55, atk: 0.34, block: 0.12, sp: 0.18, dodge: 0.0 },
  { think: 0.35, atk: 0.54, block: 0.32, sp: 0.35, dodge: 0.08 },
  { think: 0.2, atk: 0.74, block: 0.52, sp: 0.54, dodge: 0.24 },
  { think: 0.09, atk: 0.92, block: 0.8, sp: 0.72, dodge: 0.52 },
];

export const CHARACTER_MOVES = {
  kaito: { spName: 'Fire Wave', ultName: 'Inferno Burst', formName: 'Blaze Form' },
  mika: { spName: 'Gale Shot', ultName: 'Typhoon Beam', formName: 'Storm Form' },
  gorou: { spName: 'Rock Blast', ultName: 'Quake Cannon', formName: 'Titan Form' },
  sora: { spName: 'Bolt Orb', ultName: 'Thunder God', formName: 'Volt Form' },
  zen: { spName: 'Shadow Slash', ultName: 'Void Eclipse', formName: 'Phantom Form' },
};

export function createCombatFighterState(ch) {
  return {
    hp: ch.hp,
    mhp: ch.hp,
    en: 0,
    action: 'idle',
    actionTimer: 0,
    cooldown: 0,
    hitDone: false,
    pwTimer: 0,      // transformation buff timer
    blockTimer: 0,   // used for perfect parry window (< 0.25s)
    frozenTimer: 0,
    combo: 0,
    comboTimer: 0,
    aiTimer: 0,
    aiMoveX: 0,
    aiMoveZ: 0,
    aiBlockHold: 0,
    aiStuckTimer: 0,
    aiLastX: 0,
    aiLastZ: 0,
    wasFrozen: false,
  };
}

export class CombatSystem3D {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks || {};
    this.projectiles = [];
    this.vfxList = [];
    this.meteors = [];
    this.sharedSparkGeo = new THREE.SphereGeometry(0.16, 7, 6);
    this.sharedRingGeo = new THREE.RingGeometry(0.45, 0.75, 24);
    this.sharedSlashGeo = new THREE.RingGeometry(0.72, 1.42, 20, 1, Math.PI * 0.05, Math.PI * 0.9);
  }

  clear() {
    for (const p of this.projectiles) this._disposeProjectile(p);
    this.projectiles.length = 0;

    for (const v of this.vfxList) {
      this.scene.remove(v.mesh);
      v.mat.dispose();
    }
    this.vfxList.length = 0;

    for (const m of this.meteors) {
      this.scene.remove(m.mesh);
      m.mesh.geometry.dispose();
      m.mat.dispose();
    }
    this.meteors.length = 0;
  }

  dispose() {
    this.clear();
    this.sharedSparkGeo.dispose();
    this.sharedRingGeo.dispose();
    this.sharedSlashGeo.dispose();
  }

  _disposeProjectile(p) {
    this.scene.remove(p.mesh);
    const geos = new Set();
    const mats = new Set();
    p.mesh.traverse((o) => {
      if (o.geometry && !geos.has(o.geometry)) {
        geos.add(o.geometry);
        o.geometry.dispose();
      }
      if (o.material && !mats.has(o.material)) {
        mats.add(o.material);
        o.material.dispose();
      }
    });
  }

  spawnImpactRing(x, y, z, color, maxScale = 3.2, duration = 0.35) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.3),
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.sharedRingGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.08, z);
    this.scene.add(mesh);
    this.vfxList.push({
      mesh,
      mat,
      life: duration,
      maxLife: duration,
      kind: 'ring',
      maxScale,
    });
  }

  spawnSlashArc(body, isKick = false) {
    const col = body.combat.pwTimer > 0 ? body.char.h : body.char.c;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(col).multiplyScalar(2.5),
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.sharedSlashGeo, mat);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = body.yaw;
    mesh.rotation.x = Math.PI / 2 + (isKick ? -0.32 : 0.2);
    mesh.rotation.z = isKick ? -0.45 : 0.35;
    mesh.position.set(
      body.pos.x + Math.sin(body.yaw) * 0.42,
      body.pos.y + (isKick ? 0.96 : 1.24),
      body.pos.z + Math.cos(body.yaw) * 0.42
    );
    this.scene.add(mesh);
    this.vfxList.push({
      mesh,
      mat,
      life: 0.16,
      maxLife: 0.16,
      kind: 'slash',
      isKick,
      spinDir: isKick ? -1 : 1,
    });
  }

  spawnHitBurst(x, y, z, color, count = 7) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(2.6),
        transparent: true,
        opacity: 0.96,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sharedSparkGeo, mat);
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(0.65 + Math.random() * 0.65);
      this.scene.add(mesh);
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 6.5;
      this.vfxList.push({
        mesh,
        mat,
        life: 0.34,
        maxLife: 0.34,
        kind: 'spark',
        vx: Math.cos(ang) * spd,
        vy: 1.5 + Math.random() * 5,
        vz: Math.sin(ang) * spd,
      });
    }
  }

  spawnCharacterProjectile(ownerBody, targetBody, isUlt) {
    const ch = ownerBody.char;
    const dirX = Math.sin(ownerBody.yaw);
    const dirZ = Math.cos(ownerBody.yaw);

    // Slight soft aim-assist toward opponent within a generous forward arc
    _toOpp.set(targetBody.pos.x - ownerBody.pos.x, 0, targetBody.pos.z - ownerBody.pos.z);
    const oppLen = _toOpp.length();
    if (oppLen > 0.2) {
      _toOpp.divideScalar(oppLen);
      const dot = dirX * _toOpp.x + dirZ * _toOpp.z;
      if (dot > 0.45) {
        // Snap projectile vector toward opponent for crisp 3D targeting
        _fwd.copy(_toOpp);
      } else {
        _fwd.set(dirX, 0, dirZ);
      }
    } else {
      _fwd.set(dirX, 0, dirZ);
    }

    const group = new THREE.Group();
    const primaryCol = isUlt ? ch.h : ch.c;
    const coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff').multiplyScalar(2.6),
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(primaryCol).multiplyScalar(2.4),
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const radius = isUlt ? 1.05 : 0.46;
    if (ch.id === 'kaito') {
      // Fire Wave / Inferno Burst
      const core = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.55, 12, 10), coreMat);
      const shell = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.85, radius * 0.24, 8, 18), glowMat);
      shell.rotation.x = Math.PI / 2;
      group.add(core, shell);
    } else if (ch.id === 'mika') {
      // Gale Shot / Typhoon Beam
      const blade = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.9, radius * 2.1, 6), glowMat);
      blade.rotation.x = Math.PI / 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, 0.08, 6, 16), coreMat);
      group.add(blade, ring);
    } else if (ch.id === 'gorou') {
      // Rock Blast / Quake Cannon
      const boulder = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius * 0.95, 0),
        new THREE.MeshStandardMaterial({
          color: '#a07850',
          emissive: ch.c,
          emissiveIntensity: isUlt ? 0.9 : 0.35,
          roughness: 0.8,
        })
      );
      const halo = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.1, 0.09, 6, 16), glowMat);
      group.add(boulder, halo);
    } else if (ch.id === 'sora') {
      // Bolt Orb / Thunder God
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(radius * 0.75, 1), coreMat);
      const ringA = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.95, 0.07, 6, 18), glowMat);
      const ringB = ringA.clone();
      ringB.rotation.y = Math.PI / 2;
      group.add(orb, ringA, ringB);
    } else {
      // Zen: Shadow Slash / Void Eclipse
      const crescent = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.0, radius * 0.22, 6, 16, Math.PI), glowMat);
      crescent.rotation.z = Math.PI / 2;
      const core = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.42, 10, 8), coreMat);
      group.add(crescent, core);
    }

    const startX = ownerBody.pos.x + _fwd.x * 1.1;
    const startY = ownerBody.pos.y + 1.25;
    const startZ = ownerBody.pos.z + _fwd.z * 1.1;
    group.position.set(startX, startY, startZ);
    group.rotation.order = 'YXZ';
    group.rotation.y = Math.atan2(_fwd.x, _fwd.z);
    this.scene.add(group);

    const speed = isUlt ? 29 : 22;
    this.projectiles.push({
      mesh: group,
      owner: ownerBody,
      vx: _fwd.x * speed,
      vz: _fwd.z * speed,
      radius,
      damage: isUlt ? 34 : 13,
      knockback: isUlt ? 16 : 9,
      color: primaryCol,
      life: 1.75,
      isUlt,
    });

    this.hooks.onPlaySfx?.(isUlt ? 700 : 520, isUlt ? 0.35 : 0.18, 'sine', 0.11);
  }

  callSkyMeteor(casterBody, targetBody) {
    const mat = new THREE.MeshStandardMaterial({
      color: '#ff6a3d',
      emissive: '#ff4500',
      emissiveIntensity: 2.6,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05, 0), mat);
    mesh.position.set(targetBody.pos.x, targetBody.pos.y + 16, targetBody.pos.z);
    this.scene.add(mesh);

    this.meteors.push({
      mesh,
      mat,
      caster: casterBody,
      target: targetBody,
      vy: -36,
      x: targetBody.pos.x,
      z: targetBody.pos.z,
      damage: 24,
    });
  }

  applyDamage(victim, attacker, rawDamage, knockback, hitColor, isPlayerAttack, isTraining) {
    if (victim.invTimer > 0) return;

    const vc = victim.combat;
    const ac = attacker.combat;

    // Shatter freeze crystal on hit
    if (vc.frozenTimer > 0) {
      vc.frozenTimer = 0;
      this.spawnHitBurst(victim.pos.x, victim.pos.y + 1.2, victim.pos.z, '#9be7ff', 10);
    }

    let dmg = rawDamage * attacker.char.dm * (ac.pwTimer > 0 ? 1.4 : 1.0) * (1 + Math.min(ac.combo, 6) * 0.06);

    // Check facing block & perfect parry
    _toOpp.set(attacker.pos.x - victim.pos.x, 0, attacker.pos.z - victim.pos.z);
    const dist = _toOpp.length() || 1;
    const vFwdX = Math.sin(victim.yaw);
    const vFwdZ = Math.cos(victim.yaw);
    const facingAttacker = (vFwdX * _toOpp.x + vFwdZ * _toOpp.z) / dist > 0.15;

    if (vc.action === 'block' && facingAttacker) {
      this.hooks.onPlaySfx?.(180, 0.08, 'sawtooth', 0.08);
      if (vc.blockTimer < 0.28) {
        // Perfect Parry!
        if (dist < 4.5) {
          ac.action = 'hurt';
          ac.actionTimer = 0.55;
          const pDirX = dist > 0.05 ? -(attacker.pos.x - victim.pos.x) / dist : Math.sin(victim.yaw);
          const pDirZ = dist > 0.05 ? -(attacker.pos.z - victim.pos.z) / dist : Math.cos(victim.yaw);
          attacker.vel.x = pDirX * 10;
          attacker.vel.z = pDirZ * 10;
        }
        vc.en = Math.min(100, vc.en + 14);
        this.spawnImpactRing(victim.pos.x, victim.pos.y + 1.0, victim.pos.z, '#ffffff', 3.4, 0.35);
        this.hooks.onCameraShake?.(0.42, 0.22, 2.0);
        this.hooks.onToast?.('PERFECT PARRY!');
        dmg = 0;
      } else {
        vc.en = Math.min(100, vc.en + 4);
        dmg *= 0.14;
      }
    } else {
      vc.action = 'hurt';
      vc.actionTimer = 0.32;
      vc.wasFrozen = false;
      const kbDirX = dist > 0.05 ? (victim.pos.x - attacker.pos.x) / dist : -Math.sin(victim.yaw);
      const kbDirZ = dist > 0.05 ? (victim.pos.z - attacker.pos.z) / dist : -Math.cos(victim.yaw);
      victim.vel.x = kbDirX * knockback;
      victim.vel.z = kbDirZ * knockback;
      if (!victim.grounded) victim.vel.y = Math.max(victim.vel.y, 4.5);

      ac.combo++;
      ac.comboTimer = 1.6;
      ac.en = Math.min(100, ac.en + dmg * 0.65);
      vc.en = Math.min(100, vc.en + dmg * 0.32);

      const isUltHit = rawDamage >= 30;
      const isHeavyHit = !isUltHit && (rawDamage >= 10 || knockback >= 10 || ac.pwTimer > 0 || ac.combo >= 3);

      this.spawnHitBurst(victim.pos.x, victim.pos.y + 1.15, victim.pos.z, hitColor || attacker.char.c, isUltHit ? 14 : isHeavyHit ? 11 : 7);
      this.spawnImpactRing(victim.pos.x, victim.pos.y, victim.pos.z, hitColor || attacker.char.c, isUltHit ? 4.6 : isHeavyHit ? 3.2 : 2.1, isUltHit ? 0.38 : 0.25);
      this.hooks.onPlaySfx?.(120 + Math.random() * 60, 0.08, 'square', 0.1);

      if (isUltHit) {
        this.hooks.onCameraShake?.(1.05, 0.46, 6.0);
        this.hooks.onBloomPulse?.(0.32);
        this.hooks.onFlash?.(0.32);
      } else if (isHeavyHit) {
        this.hooks.onCameraShake?.(isPlayerAttack ? 0.64 : 0.48, 0.28, isPlayerAttack ? 3.2 : 2.2);
        this.hooks.onBloomPulse?.(0.14);
        if (isPlayerAttack) this.hooks.onFlash?.(0.12);
      } else {
        this.hooks.onCameraShake?.(0.18, 0.14, 0.6);
      }

      if (isPlayerAttack) this.hooks.onPlayerHit?.();
    }

    if (isTraining) {
      // In Training Mode, dummy stays alive (minimum 1 HP) so combos can be practiced endlessly
      if (isPlayerAttack) {
        vc.hp = Math.max(1, vc.hp - dmg);
      }
    } else {
      vc.hp = Math.max(0, vc.hp - dmg);
    }
  }

  checkMeleeHit(attacker, target, range, damage, knockback, isPlayerAttack, isTraining) {
    const dx = target.pos.x - attacker.pos.x;
    const dz = target.pos.z - attacker.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range || Math.abs(target.pos.y - attacker.pos.y) > 1.8) return false;

    if (dist > 0.05) {
      const fwdX = Math.sin(attacker.yaw);
      const fwdZ = Math.cos(attacker.yaw);
      const dot = (fwdX * dx + fwdZ * dz) / dist;
      if (dot < 0.2) return false;
    }

    this.applyDamage(target, attacker, damage, knockback, attacker.char.c, isPlayerAttack, isTraining);
    return true;
  }

  _faceTarget(body, target) {
    const dx = target.pos.x - body.pos.x;
    const dz = target.pos.z - body.pos.z;
    if (dx * dx + dz * dz > 0.01) {
      body.yaw = Math.atan2(dx, dz);
    }
  }

  stepFighterCombat(body, opponent, actions, isPlayer, isTraining, dt) {
    const c = body.combat;

    c.cooldown = Math.max(0, c.cooldown - dt);
    c.comboTimer = Math.max(0, c.comboTimer - dt);
    if (c.comboTimer <= 0) c.combo = 0;
    if (c.pwTimer > 0) c.pwTimer = Math.max(0, c.pwTimer - dt);

    if (c.frozenTimer > 0) {
      c.frozenTimer = Math.max(0, c.frozenTimer - dt);
      c.wasFrozen = true;
      c.action = 'hurt';
      return false; // movement locked while frozen
    } else if (c.wasFrozen) {
      c.wasFrozen = false;
      if (c.action === 'hurt' && c.actionTimer <= 0) c.action = 'idle';
    }

    if (c.actionTimer > 0) {
      c.actionTimer -= dt;
      if (c.actionTimer <= 0 && ['hurt', 'punch', 'kick', 'sp', 'ult', 'dodge'].includes(c.action)) {
        c.action = 'idle';
      }
    }

    const canAct = c.action === 'idle' || c.action === 'block';
    if (c.action === 'block') c.blockTimer += dt;

    if (canAct) {
      if (actions.blockHeld && body.grounded) {
        if (c.action !== 'block') {
          c.action = 'block';
          c.blockTimer = 0;
        }
        return false; // stationary guard
      } else if (c.action === 'block') {
        c.action = 'idle';
      }

      if (actions.dodgePressed && c.cooldown <= 0 && body.grounded) {
        c.action = 'dodge';
        c.actionTimer = 0.24;
        c.cooldown = 0.58;
        body.invTimer = Math.max(body.invTimer, 0.3);
        const moveMag = Math.hypot(actions.moveWorldX, actions.moveWorldZ);
        const dirX = moveMag > 0.05 ? actions.moveWorldX / moveMag : -Math.sin(body.yaw);
        const dirZ = moveMag > 0.05 ? actions.moveWorldZ / moveMag : -Math.cos(body.yaw);
        body.vel.x = dirX * 16;
        body.vel.z = dirZ * 16;
        this.spawnImpactRing(body.pos.x, body.pos.y, body.pos.z, '#4fd1ff', 1.8, 0.25);
        this.hooks.onPlaySfx?.(420, 0.08, 'triangle', 0.07);
        return false;
      }

      if (actions.ultPressed && c.en >= 100) {
        c.en = 0;
        c.pwTimer = 10;
        c.action = 'ult';
        c.actionTimer = 0.68;
        c.hitDone = false;
        body.invTimer = Math.max(body.invTimer, 0.45);
        this._faceTarget(body, opponent);
        this.spawnImpactRing(body.pos.x, body.pos.y, body.pos.z, body.char.h, 5.2, 0.5);
        this.hooks.onCameraShake?.(isPlayer ? 0.9 : 0.62, 0.52, isPlayer ? 5.5 : 3.2);
        this.hooks.onBloomPulse?.(0.36);
        this.hooks.onFlash?.(0.42);
        this.hooks.onPlaySfx?.(95, 0.55, 'sawtooth', 0.12);
        if (isPlayer) {
          this.hooks.onPlayerUltimate?.(CHARACTER_MOVES[body.char.id]);
        }
        return false;
      }

      if (actions.spPressed && c.en >= 25 && c.cooldown <= 0) {
        c.en -= 25;
        c.action = 'sp';
        c.actionTimer = 0.34;
        c.cooldown = 0.48;
        c.hitDone = false;
        this._faceTarget(body, opponent);
        return false;
      }

      if (actions.punchPressed && c.cooldown <= 0) {
        c.action = 'punch';
        c.actionTimer = 0.22;
        c.cooldown = 0.24;
        c.hitDone = false;
        this._faceTarget(body, opponent);
        const fx = Math.sin(body.yaw);
        const fz = Math.cos(body.yaw);
        body.vel.x = fx * 5.2;
        body.vel.z = fz * 5.2;
        return false;
      }

      if (actions.kickPressed && c.cooldown <= 0) {
        c.action = 'kick';
        c.actionTimer = 0.32;
        c.cooldown = 0.42;
        c.hitDone = false;
        this._faceTarget(body, opponent);
        const fx = Math.sin(body.yaw);
        const fz = Math.cos(body.yaw);
        body.vel.x = fx * 6.5;
        body.vel.z = fz * 6.5;
        return false;
      }
    }

    // Active hitbox / projectile release frames
    if (c.action === 'punch' && c.actionTimer < 0.13 && !c.hitDone) {
      c.hitDone = true;
      this.spawnSlashArc(body, false);
      this.checkMeleeHit(body, opponent, 2.5, 6.5, 6.5, isPlayer, isTraining);
      this.hooks.onPlaySfx?.(300, 0.05, 'square', 0.06);
    } else if (c.action === 'kick' && c.actionTimer < 0.18 && !c.hitDone) {
      c.hitDone = true;
      this.spawnSlashArc(body, true);
      this.checkMeleeHit(body, opponent, 2.9, 10.5, 10.5, isPlayer, isTraining);
      this.hooks.onPlaySfx?.(230, 0.07, 'square', 0.07);
    } else if (c.action === 'sp' && c.actionTimer < 0.2 && !c.hitDone) {
      c.hitDone = true;
      this.spawnCharacterProjectile(body, opponent, false);
    } else if (c.action === 'ult' && c.actionTimer < 0.38 && !c.hitDone) {
      c.hitDone = true;
      this.spawnCharacterProjectile(body, opponent, true);
    }

    return c.action === 'idle';
  }

  stepAI(oppBody, playerBody, diffIdx, isTraining, dt) {
    const out = {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jumpPressed: false,
      punchPressed: false,
      kickPressed: false,
      spPressed: false,
      ultPressed: false,
      blockHeld: false,
      dodgePressed: false,
    };

    if (isTraining) return out;

    const prof = AI_PROFILES[diffIdx] || AI_PROFILES[1];
    const c = oppBody.combat;
    c.aiTimer -= dt;

    const dx = playerBody.pos.x - oppBody.pos.x;
    const dz = playerBody.pos.z - oppBody.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;

    if (c.aiTimer <= 0) {
      c.aiTimer = prof.think + Math.random() * 0.1;

      const playerThreat =
        ['punch', 'kick', 'sp', 'ult'].includes(playerBody.combat.action) ||
        this.projectiles.some((p) => p.owner === playerBody && Math.hypot(p.mesh.position.x - oppBody.pos.x, p.mesh.position.z - oppBody.pos.z) < 6.5);

      if (playerThreat && dist < 5.0 && Math.random() < prof.block) {
        if (Math.random() < prof.dodge) out.dodgePressed = true;
        else c.aiBlockHold = 0.45;
      } else if (c.en >= 100 && dist < 18 && Math.random() < 0.8) {
        out.ultPressed = true;
      } else if (dist > 6.5) {
        if (c.en >= 25 && dist < 16 && Math.random() < prof.sp) {
          out.spPressed = true;
        } else {
          c.aiMoveX = nx;
          c.aiMoveZ = nz;
        }
      } else if (dist > 2.4) {
        c.aiMoveX = nx;
        c.aiMoveZ = nz;
        if (Math.random() < 0.25) out.kickPressed = true;
      } else {
        c.aiMoveX = (Math.random() - 0.5) * 0.4;
        c.aiMoveZ = (Math.random() - 0.5) * 0.4;
        if (Math.random() < prof.atk) {
          if (Math.random() < 0.55) out.punchPressed = true;
          else out.kickPressed = true;
        }
      }
    }

    if (c.aiBlockHold > 0) {
      c.aiBlockHold = Math.max(0, c.aiBlockHold - dt);
      out.blockHeld = true;
    }

    // Obstacle stuck detection & tangential steering around arena pillars
    const tryingToMove = Math.hypot(c.aiMoveX, c.aiMoveZ) > 0.35 && c.action === 'idle' && !out.blockHeld;
    if (tryingToMove) {
      const moved = Math.hypot(oppBody.pos.x - c.aiLastX, oppBody.pos.z - c.aiLastZ);
      if (moved < 0.2 * dt && dist > 2.6) {
        c.aiStuckTimer += dt;
        if (c.aiStuckTimer > 0.32) {
          // Strafe tangentially around blocking pillar/rock and optionally jump
          const side = ((Math.floor(oppBody.pos.x + oppBody.pos.z) % 2) === 0 ? 1 : -1);
          c.aiMoveX = -nz * side + nx * 0.25;
          c.aiMoveZ = nx * side + nz * 0.25;
          out.jumpPressed = true;
          c.aiStuckTimer = 0;
        }
      } else {
        c.aiStuckTimer = 0;
      }
    } else {
      c.aiStuckTimer = 0;
    }
    c.aiLastX = oppBody.pos.x;
    c.aiLastZ = oppBody.pos.z;

    out.moveX = c.aiMoveX || 0;
    out.moveZ = c.aiMoveZ || 0;
    out.sprint = dist > 9.5;
    if (playerBody.pos.y > oppBody.pos.y + 0.9 && dist < 6 && Math.random() < 0.05) {
      out.jumpPressed = true;
    }

    return out;
  }

  updateProjectilesAndVfx(playerBody, oppBody, isTraining, dt, physics = null, matchOver = false) {
    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.z += dt * 10;

      const target = p.owner === playerBody ? oppBody : playerBody;
      const isPlayerAttack = p.owner === playerBody;
      const dx = p.mesh.position.x - target.pos.x;
      const dz = p.mesh.position.z - target.pos.z;
      const dy = p.mesh.position.y - (target.pos.y + 1.05);

      const hitDist = p.radius + target.radius + 0.35;
      let remove = p.life <= 0 || Math.hypot(p.mesh.position.x, p.mesh.position.z) > 28;

      if (!remove && physics?.segmentHitsObstacle(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, p.radius * 0.45)) {
        this.spawnHitBurst(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, p.color, 6);
        this.spawnImpactRing(p.mesh.position.x, Math.max(0.05, p.mesh.position.y - 0.6), p.mesh.position.z, p.color, 1.8, 0.22);
        remove = true;
      }

      if (!remove && !matchOver && dx * dx + dz * dz < hitDist * hitDist && Math.abs(dy) < p.radius + 1.2) {
        this.applyDamage(target, p.owner, p.damage, p.knockback, p.color, isPlayerAttack, isTraining);
        if (p.isUlt) {
          this.spawnImpactRing(p.mesh.position.x, target.pos.y, p.mesh.position.z, p.color, 5.0, 0.4);
          this.hooks.onCameraShake?.(1.05, 0.48, 6.2);
        }
        remove = true;
      }

      if (remove) {
        this._disposeProjectile(p);
        this.projectiles.splice(i, 1);
      }
    }

    // Update sky meteors
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.mesh.position.y += m.vy * dt;
      m.mesh.rotation.x += dt * 4;
      m.mesh.rotation.z += dt * 3;
      const impactGroundY = physics ? physics.groundHeightAt(m.x, m.z, 0.5, 0.5) : 0;
      if (m.mesh.position.y <= impactGroundY + 0.6) {
        this.spawnImpactRing(m.x, impactGroundY, m.z, '#ff6a3d', 5.5, 0.45);
        this.spawnHitBurst(m.x, impactGroundY + 0.8, m.z, '#ffaa44', 12);
        this.hooks.onCameraShake?.(0.95, 0.42, 5.0);
        this.hooks.onPlaySfx?.(110, 0.4, 'sawtooth', 0.14);
        const d = Math.hypot(m.target.pos.x - m.x, m.target.pos.z - m.z);
        if (!matchOver && d < 4.5 && Math.abs(m.target.pos.y - impactGroundY) < 3.6) {
          this.applyDamage(m.target, m.caster, m.damage, 12, '#ff8a30', true, isTraining);
        }
        this.scene.remove(m.mesh);
        m.mesh.geometry.dispose();
        m.mat.dispose();
        this.meteors.splice(i, 1);
      }
    }

    // Update VFX particles & shockwave rings
    for (let i = this.vfxList.length - 1; i >= 0; i--) {
      const v = this.vfxList[i];
      v.life -= dt;
      if (v.life <= 0) {
        this.scene.remove(v.mesh);
        v.mat.dispose();
        this.vfxList.splice(i, 1);
        continue;
      }
      const k = 1 - v.life / v.maxLife;
      if (v.kind === 'ring') {
        v.mesh.scale.setScalar(0.5 + k * v.maxScale);
        v.mat.opacity = (1 - k) * 0.85;
      } else if (v.kind === 'slash') {
        v.mesh.scale.setScalar(0.85 + k * (v.isKick ? 0.9 : 0.65));
        v.mesh.rotation.z += dt * 7 * v.spinDir;
        v.mat.opacity = (1 - k) * 0.9;
      } else {
        v.mesh.position.x += v.vx * dt;
        v.mesh.position.y += v.vy * dt;
        v.mesh.position.z += v.vz * dt;
        v.vy -= 14 * dt;
        v.mat.opacity = 1 - k;
      }
    }
  }
}
