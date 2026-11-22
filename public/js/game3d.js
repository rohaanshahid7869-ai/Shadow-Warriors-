import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildArena3D } from './arena3d.js';
import { createFighterMesh, animateFighterMesh, disposeObject3D } from './character3d.js';
import { ThirdPersonCamera } from './camera3d.js';
import { InputController } from './input3d.js';
import { CombatSystem3D, createCombatFighterState } from './combat3d.js';

const _moveWorld = new THREE.Vector3();
const _frameInput = {
  moveX: 0,
  moveY: 0,
  jumpPressed: false,
  sprint: false,
  dodgePressed: false,
  punchPressed: false,
  kickPressed: false,
  spPressed: false,
  ultPressed: false,
  blockHeld: false,
  camDeltaX: 0,
  camDeltaY: 0,
  zoomDelta: 0,
};

function detectSoftwareWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch (_) {
    return false;
  }
}

class DustPool {
  constructor(scene) {
    this.count = 28;
    this.items = [];
    const geo = new THREE.SphereGeometry(0.16, 6, 5);
    for (let i = 0; i < this.count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe6dfd3,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.35 });
    }
    this.cursor = 0;
  }

  spawn(x, y, z, burst = 1) {
    for (let n = 0; n < burst; n++) {
      const p = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.count;
      p.life = p.maxLife;
      p.mesh.visible = true;
      p.mesh.position.set(
        x + (Math.random() - 0.5) * 0.45,
        y + 0.12,
        z + (Math.random() - 0.5) * 0.45
      );
      p.mesh.scale.setScalar(0.8 + Math.random() * 0.5);
      p.vx = (Math.random() - 0.5) * 2.2;
      p.vy = 0.7 + Math.random() * 1.4;
      p.vz = (Math.random() - 0.5) * 2.2;
    }
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const p = this.items[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      const k = p.life / p.maxLife;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(1 + (1 - k) * 1.4);
      p.mat.opacity = k * 0.42;
    }
  }

  reset() {
    for (let i = 0; i < this.count; i++) {
      this.items[i].life = 0;
      this.items[i].mesh.visible = false;
    }
  }

  dispose() {
    if (this.items.length > 0) {
      this.items[0].mesh.geometry.dispose();
    }
    for (let i = 0; i < this.count; i++) {
      this.items[i].mat.dispose();
    }
  }
}

export class ShadowWarriors3DEngine {
  constructor(mountEl, hooks) {
    this.mountEl = mountEl;
    this.hooks = hooks || {};
    this.isSoftwareGl = detectSoftwareWebGL();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 240);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.baseExposure = 0.84;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.baseExposure;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    mountEl.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.cameraCtrl = new ThirdPersonCamera(this.camera);
    this.input = new InputController(
      () => this.hooks.getSettings?.(),
      () => this.hooks.onJumpSfx?.(),
      () => this.hooks.onQuit?.()
    );
    this.input.attach(this.renderer.domElement);

    this.baseBloomStrength = 0.48;
    this.bloomBoost = 0;
    this.composer = null;
    this.bloomPass = null;
    if (!this.isSoftwareGl) {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        this.baseBloomStrength,
        0.56,
        0.92
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    this.dust = new DustPool(this.scene);
    this.combat = new CombatSystem3D(this.scene, {
      onPlaySfx: (f, d, ty, v) => this.hooks.onPlaySfx?.(f, d, ty, v),
      onCameraShake: (s, dur, fovPunch) => this.cameraCtrl.triggerShake(s, dur, fovPunch),
      onBloomPulse: (amount) => {
        this.bloomBoost = Math.min(0.42, Math.max(this.bloomBoost, amount));
      },
      onFlash: (alpha) => this.hooks.onFlash?.(alpha),
      onToast: (msg) => this.hooks.onToast?.(msg),
      onPlayerHit: () => { this.hits++; },
      onPlayerUltimate: (moveInfo) => this.hooks.onPlayerUltimate?.(moveInfo),
    });

    this.arena = null;
    this.arenaIdx = -1;
    this.fogEnabled = (this.hooks.getSettings?.()?.fog ?? 1) !== 0;
    this.showcaseCharId = null;
    this.showcaseRig = null;
    this.playerRig = null;
    this.opponentRig = null;
    this.playerBody = null;
    this.opponentBody = null;

    this.mode = 'showcase'; // 'showcase' | 'match'
    this.running = false;
    this.matchOver = false;
    this.matchTime = 60;
    this.hits = 0;
    this.training = false;
    this.diffIdx = 1;

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.frameId = 0;
    this._stepAccum = 0;
    this._hudSyncTimer = 0;

    this._onResize = this._onResize.bind(this);
    this._onContextLost = this._onContextLost.bind(this);
    this._onContextRestored = this._onContextRestored.bind(this);
    window.addEventListener('resize', this._onResize);
    this.renderer.domElement.addEventListener('webglcontextlost', this._onContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._onContextRestored, false);
  }

  setBrightness(pct = 100) {
    const scale = Math.max(0.55, Math.min(1.35, (Number(pct) || 100) / 100));
    this.renderer.toneMappingExposure = this.baseExposure * scale;
  }

  setFog(enabled = true) {
    this.fogEnabled = Boolean(enabled);
    this.arena?.setFog?.(this.fogEnabled);
  }

  _onContextLost(e) {
    e.preventDefault();
    this.stopLoopOnly();
  }

  _onContextRestored() {
    if (this.running) {
      this.clock.start();
      this.clock.getDelta();
      this._tick();
    }
  }

  _onResize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
      this.bloomPass?.resolution.set(w, h);
    }
    if (!this.running) {
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    }
  }

  _clearActors() {
    if (this.showcaseRig) {
      this.scene.remove(this.showcaseRig.root);
      disposeObject3D(this.showcaseRig.root);
      this.showcaseRig = null;
    }
    if (this.playerRig) {
      this.scene.remove(this.playerRig.root);
      disposeObject3D(this.playerRig.root);
      this.playerRig = null;
    }
    if (this.opponentRig) {
      this.scene.remove(this.opponentRig.root);
      disposeObject3D(this.opponentRig.root);
      this.opponentRig = null;
    }
    this.combat.clear();
    this.dust.reset();
  }

  _ensureArena(arenaIdx) {
    if (this.arena && this.arenaIdx === arenaIdx) return;
    if (this.arena) {
      this.arena.dispose();
      this.arena = null;
    }
    this.arenaIdx = arenaIdx;
    this.arena = buildArena3D(arenaIdx, this.scene, this.renderer, this.isSoftwareGl, this.fogEnabled);
  }

  setMenuShowcase(playerChar, arenaIdx) {
    this.mode = 'showcase';
    this.input.setActive(false);
    this._ensureArena(arenaIdx);

    if (this.playerRig || this.opponentRig) {
      this._clearActors();
      this.showcaseCharId = null;
    }

    if (!this.showcaseRig || this.showcaseCharId !== playerChar.id) {
      if (this.showcaseRig) {
        this.scene.remove(this.showcaseRig.root);
        disposeObject3D(this.showcaseRig.root);
      }
      this.showcaseCharId = playerChar.id;
      this.showcaseRig = createFighterMesh(playerChar);
      this.showcaseRig.root.position.set(0, 0, 0);
      this.showcaseRig.root.rotation.y = 0.35;
      this.scene.add(this.showcaseRig.root);
    }

    this.camera.fov = 46;
    this.camera.updateProjectionMatrix();

    if (!this.running) {
      this.running = true;
      this.clock.start();
      this.clock.getDelta();
      this._tick();
    }
  }

  startMatch({ playerChar, opponentChar, arenaIdx, training, diffIdx }) {
    this.stopLoopOnly();
    this._clearActors();
    this.showcaseCharId = null;
    this._ensureArena(arenaIdx);

    this.mode = 'match';
    this.matchOver = false;
    this.matchTime = 60;
    this.hits = 0;
    this.training = Boolean(training);
    this.diffIdx = diffIdx ?? 1;

    this.playerRig = createFighterMesh(playerChar);
    this.opponentRig = createFighterMesh(opponentChar);
    this.scene.add(this.playerRig.root);
    this.scene.add(this.opponentRig.root);

    const makeBody = (ch, zPos, yaw) => ({
      char: ch,
      pos: new THREE.Vector3(0, 0, zPos),
      vel: new THREE.Vector3(0, 0, 0),
      yaw,
      radius: ch.id === 'gorou' ? 0.58 : 0.46,
      height: ch.id === 'gorou' ? 2.15 : 1.9,
      baseSpeed: 4.6 + ch.sp * 0.55,
      jumpVelocity: 10.6 * ch.jp,
      grounded: true,
      groundY: 0,
      coyoteTimer: 0,
      jumpBuffer: 0,
      landTimer: 0,
      justJumped: false,
      landed: false,
      isRunning: false,
      speedRatio: 0,
      speedBoost: 0,
      invTimer: 0,
      combat: createCombatFighterState(ch),
    });

    this.playerBody = makeBody(playerChar, 7.5, Math.PI);
    this.opponentBody = makeBody(opponentChar, -7.5, 0);

    this.playerRig.root.position.copy(this.playerBody.pos);
    this.playerRig.root.rotation.y = this.playerBody.yaw;
    this.opponentRig.root.position.copy(this.opponentBody.pos);
    this.opponentRig.root.rotation.y = this.opponentBody.yaw;

    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
    this.cameraCtrl.reset(Math.PI, this.playerBody.pos);
    this.input.setActive(true);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.running = true;
    this.clock.start();
    this.clock.getDelta();
    this._tick();
  }

  stopMatch(playerChar, arenaIdx) {
    this.input.setActive(false);
    this._clearActors();
    this.playerBody = null;
    this.opponentBody = null;
    this.setMenuShowcase(playerChar, arenaIdx);
  }

  stopLoopOnly() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
      this.frameId = 0;
    }
  }

  applyPowerBuff(id) {
    if (!this.playerBody || this.mode !== 'match' || this.matchOver) return;
    const pb = this.playerBody;
    const ob = this.opponentBody;

    if (id === 'heal') {
      pb.combat.hp = Math.min(pb.combat.mhp, pb.combat.hp + pb.combat.mhp * 0.3);
      this.combat.spawnImpactRing(pb.pos.x, pb.pos.y, pb.pos.z, '#4ade80', 3.0, 0.45);
      this.combat.spawnHitBurst(pb.pos.x, pb.pos.y + 1.0, pb.pos.z, '#4ade80', 10);
    } else if (id === 'shld') {
      pb.invTimer = 3.0;
      this.combat.spawnImpactRing(pb.pos.x, pb.pos.y, pb.pos.z, '#4fd1ff', 2.8, 0.35);
    } else if (id === 'spd') {
      pb.speedBoost = 6.0;
      this.combat.spawnImpactRing(pb.pos.x, pb.pos.y, pb.pos.z, '#ffe34a', 2.8, 0.35);
    } else if (id === 'met') {
      this.combat.callSkyMeteor(pb, ob);
    } else if (id === 'frz') {
      ob.combat.frozenTimer = 2.0;
      ob.vel.x = 0;
      ob.vel.z = 0;
      this.combat.spawnImpactRing(ob.pos.x, ob.pos.y, ob.pos.z, '#9be7ff', 3.2, 0.4);
    }
  }

  _afterDraw(cb) {
    const gl = this.renderer.getContext();
    const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    gl.flush();
    const poll = () => {
      if (!this.running) {
        gl.deleteSync(sync);
        return;
      }
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  _tick = () => {
    if (!this.running) return;
    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    this.elapsed += dt;

    if (this.mode === 'showcase') {
      this._stepShowcase(dt);
    } else {
      this._stepMatch(dt);
    }

    if (this.bloomBoost > 0.001) {
      this.bloomBoost = THREE.MathUtils.damp(this.bloomBoost, 0, 8, dt);
    } else {
      this.bloomBoost = 0;
    }
    if (this.bloomPass) {
      this.bloomPass.strength = this.baseBloomStrength + this.bloomBoost;
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.isSoftwareGl) {
      this._afterDraw(this._tick);
    } else {
      this.frameId = requestAnimationFrame(this._tick);
    }
  };

  _stepShowcase(dt) {
    if (this.arena) this.arena.update(dt, this.elapsed);

    const narrow = window.innerWidth < 760;
    const ang = 0.45 + Math.sin(this.elapsed * 0.28) * 0.35;
    const dist = narrow ? 5.2 : 4.6;
    const lookX = narrow ? 0 : -0.75;
    this.camera.position.set(
      Math.sin(ang) * dist + (narrow ? 0 : -0.85),
      1.75 + Math.sin(this.elapsed * 0.4) * 0.1,
      Math.cos(ang) * dist
    );
    this.camera.lookAt(lookX, 1.25, 0);

    if (this.showcaseRig) {
      this.showcaseRig.root.rotation.y = Math.sin(this.elapsed * 0.45) * 0.25 + 0.18;
      animateFighterMesh(
        this.showcaseRig,
        {
          speedRatio: 0,
          grounded: true,
          isRunning: false,
          velY: 0,
          landTimer: 0,
          heightAboveGround: 0,
          invTimer: 0,
          action: 'idle',
          pwTimer: 0,
          frozenTimer: 0,
        },
        dt,
        this.elapsed
      );
    }
  }

  _stepMatch(dt) {
    this.input.consumeFrameInput(_frameInput);
    this.cameraCtrl.applyInput(_frameInput.camDeltaX, _frameInput.camDeltaY, _frameInput.zoomDelta);
    this.cameraCtrl.getMoveWorldXZ(_frameInput.moveX, _frameInput.moveY, _moveWorld);

    const pb = this.playerBody;
    const ob = this.opponentBody;
    const physics = this.arena.physics;
    const S = this.hooks.getSettings?.() || {};

    if (!this.matchOver) {
      if (this.training) {
        pb.combat.hp = pb.combat.mhp;
        pb.combat.en = Math.min(100, Math.max(pb.combat.en + 8 * dt, 60));
        if (pb.combat.comboTimer <= 0 && ob.combat.hp < ob.combat.mhp) {
          ob.combat.hp = Math.min(ob.combat.mhp, ob.combat.hp + 28 * dt);
        }
      } else {
        this.matchTime = Math.max(0, this.matchTime - dt);
      }

      if (pb.speedBoost > 0) pb.speedBoost = Math.max(0, pb.speedBoost - dt);
      if (pb.invTimer > 0) pb.invTimer = Math.max(0, pb.invTimer - dt);
      if (ob.invTimer > 0) ob.invTimer = Math.max(0, ob.invTimer - dt);

      const pCanMove = this.combat.stepFighterCombat(
        pb,
        ob,
        {
          punchPressed: _frameInput.punchPressed,
          kickPressed: _frameInput.kickPressed,
          spPressed: _frameInput.spPressed,
          ultPressed: _frameInput.ultPressed,
          blockHeld: _frameInput.blockHeld,
          dodgePressed: _frameInput.dodgePressed,
          moveWorldX: _moveWorld.x,
          moveWorldZ: _moveWorld.z,
        },
        true,
        this.training,
        dt
      );

      physics.stepBody(
        pb,
        pCanMove ? _moveWorld.x : 0,
        pCanMove ? _moveWorld.z : 0,
        _frameInput.sprint || pb.combat.pwTimer > 0,
        pCanMove && _frameInput.jumpPressed,
        dt,
        [ob]
      );

      const aiAct = this.combat.stepAI(ob, pb, this.diffIdx, this.training, dt);
      const oCanMove = this.combat.stepFighterCombat(
        ob,
        pb,
        {
          punchPressed: aiAct.punchPressed,
          kickPressed: aiAct.kickPressed,
          spPressed: aiAct.spPressed,
          ultPressed: aiAct.ultPressed,
          blockHeld: aiAct.blockHeld,
          dodgePressed: aiAct.dodgePressed,
          moveWorldX: aiAct.moveX,
          moveWorldZ: aiAct.moveZ,
        },
        false,
        this.training,
        dt
      );

      physics.stepBody(
        ob,
        oCanMove ? aiAct.moveX : 0,
        oCanMove ? aiAct.moveZ : 0,
        aiAct.sprint || ob.combat.pwTimer > 0,
        oCanMove && aiAct.jumpPressed,
        dt,
        [pb]
      );

      this.combat.updateProjectilesAndVfx(pb, ob, this.training, dt, physics, false);

      if (!this.training && (pb.combat.hp <= 0 || ob.combat.hp <= 0 || this.matchTime <= 0)) {
        this.matchOver = true;
        this.input.setActive(false);
        const won = pb.combat.hp > ob.combat.hp;
        const ko = ob.combat.hp <= 0;
        this.hooks.onMatchEnd?.({
          won,
          ko,
          hits: this.hits,
          oppName: ob.char.n,
        });
      }
    } else {
      this.combat.updateProjectilesAndVfx(pb, ob, this.training, dt, physics, true);
    }

    if (pb.justJumped) this.dust.spawn(pb.pos.x, pb.pos.y, pb.pos.z, 5);
    if (pb.landed) {
      this.dust.spawn(pb.pos.x, pb.pos.y, pb.pos.z, 6);
      this.hooks.onLandSfx?.();
    }
    if (pb.isRunning) {
      this._stepAccum += dt;
      if (this._stepAccum > 0.16) {
        this._stepAccum = 0;
        this.dust.spawn(pb.pos.x, pb.pos.y, pb.pos.z, 1);
      }
    }

    this.playerRig.root.position.copy(pb.pos);
    this.playerRig.root.rotation.y = pb.yaw;
    animateFighterMesh(
      this.playerRig,
      {
        speedRatio: pb.speedRatio,
        grounded: pb.grounded,
        isRunning: pb.isRunning,
        velY: pb.vel.y,
        landTimer: pb.landTimer,
        heightAboveGround: pb.pos.y - pb.groundY,
        invTimer: pb.invTimer,
        action: pb.combat.action,
        pwTimer: pb.combat.pwTimer,
        frozenTimer: pb.combat.frozenTimer,
      },
      dt,
      this.elapsed
    );

    this.opponentRig.root.position.copy(ob.pos);
    this.opponentRig.root.rotation.y = ob.yaw;
    animateFighterMesh(
      this.opponentRig,
      {
        speedRatio: ob.speedRatio,
        grounded: ob.grounded,
        isRunning: ob.isRunning,
        velY: ob.vel.y,
        landTimer: ob.landTimer,
        heightAboveGround: ob.pos.y - ob.groundY,
        invTimer: ob.invTimer,
        action: ob.combat.action,
        pwTimer: ob.combat.pwTimer,
        frozenTimer: ob.combat.frozenTimer,
      },
      dt,
      this.elapsed + 1.2
    );

    this.cameraCtrl.update(pb.pos, pb.isRunning, physics, dt, Boolean(S.shk));
    this.arena.update(dt, this.elapsed);
    this.dust.update(dt);

    this._hudSyncTimer += dt;
    if (this._hudSyncTimer >= 0.05) {
      this._hudSyncTimer = 0;
      this.hooks.onHudUpdate?.({
        p1Hp: pb.combat.hp,
        p1Mhp: pb.combat.mhp,
        p1En: pb.combat.en,
        p1Combo: pb.combat.combo,
        p1Form: pb.combat.pwTimer,
        p2Hp: ob.combat.hp,
        p2Mhp: ob.combat.mhp,
        p2En: ob.combat.en,
        time: this.matchTime,
        over: this.matchOver,
        training: this.training,
      });
    }
  }

  dispose() {
    this.running = false;
    this.stopLoopOnly();
    this._clearActors();
    if (this.arena) {
      this.arena.dispose();
      this.arena = null;
    }
    this.combat.dispose();
    this.dust.dispose();
    window.removeEventListener('resize', this._onResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this._onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._onContextRestored);
    this.bloomPass?.dispose?.();
    this.composer?.dispose?.();
    this.envTexture?.dispose?.();
    this.renderer.dispose();
  }
}
