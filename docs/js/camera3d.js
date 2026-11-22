import * as THREE from 'three';

const _pivot = new THREE.Vector3();
const _desiredCam = new THREE.Vector3();
const _clampedCam = new THREE.Vector3();

export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.distance = 6.8;
    this.targetDistance = 6.8;
    this.minDistance = 4.0;
    this.maxDistance = 12.0;
    this.minPitch = -0.18;
    this.maxPitch = 1.15;

    this.targetPos = new THREE.Vector3(0, 1.55, 0);
    this.currentCamPos = new THREE.Vector3(0, 4.2, 6.8);
    this.sensitivity = 0.0038;
    this.baseFov = 58;
    this.shakeTimer = 0;
    this.shakeDuration = 0.25;
    this.shakeStrength = 0;
    this.shakeTime = 0;
    this.fovKick = 0;
  }

  reset(initialYaw = Math.PI, targetVec) {
    this.yaw = initialYaw;
    this.pitch = 0.32;
    this.distance = 6.8;
    this.targetDistance = 6.8;
    this.shakeTimer = 0;
    this.shakeDuration = 0.25;
    this.shakeStrength = 0;
    this.shakeTime = 0;
    this.fovKick = 0;
    if (targetVec) {
      this.targetPos.set(targetVec.x, targetVec.y + 1.55, targetVec.z);
    }
    const horiz = Math.cos(this.pitch) * this.distance;
    const vert = Math.sin(this.pitch) * this.distance;
    this.currentCamPos.set(
      this.targetPos.x - Math.sin(this.yaw) * horiz,
      this.targetPos.y + vert,
      this.targetPos.z - Math.cos(this.yaw) * horiz
    );
    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.targetPos);
    if (this.camera.fov !== this.baseFov) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  triggerShake(strength = 0.25, duration = 0.22, fovPunch = 0) {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeDuration = Math.max(0.05, Math.max(this.shakeTimer, duration));
    this.shakeTimer = Math.max(this.shakeTimer, duration);
    if (fovPunch > 0) {
      this.fovKick = Math.max(this.fovKick, fovPunch);
    }
  }

  applyInput(camDeltaX, camDeltaY, zoomDelta) {
    this.yaw = Math.atan2(Math.sin(this.yaw - camDeltaX * this.sensitivity), Math.cos(this.yaw - camDeltaX * this.sensitivity));
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + camDeltaY * this.sensitivity,
      this.minPitch,
      this.maxPitch
    );
    if (zoomDelta !== 0) {
      this.targetDistance = THREE.MathUtils.clamp(
        this.targetDistance + zoomDelta,
        this.minDistance,
        this.maxDistance
      );
    }
  }

  getMoveWorldXZ(moveX, moveY, outVec) {
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const rightX = -Math.cos(this.yaw);
    const rightZ = Math.sin(this.yaw);

    outVec.x = fwdX * moveY + rightX * moveX;
    outVec.z = fwdZ * moveY + rightZ * moveX;
    outVec.y = 0;
  }

  getCameraForwardXZ(outVec) {
    outVec.x = Math.sin(this.yaw);
    outVec.y = 0;
    outVec.z = Math.cos(this.yaw);
  }

  update(playerPos, isRunning, physics, dt, allowShake = true) {
    _pivot.set(playerPos.x, playerPos.y + 1.55, playerPos.z);

    this.targetPos.x = THREE.MathUtils.damp(this.targetPos.x, _pivot.x, 15, dt);
    this.targetPos.y = THREE.MathUtils.damp(this.targetPos.y, _pivot.y, 12, dt);
    this.targetPos.z = THREE.MathUtils.damp(this.targetPos.z, _pivot.z, 15, dt);

    this.distance = THREE.MathUtils.damp(this.distance, this.targetDistance, 10, dt);

    const horiz = Math.cos(this.pitch) * this.distance;
    const vert = Math.sin(this.pitch) * this.distance;

    _desiredCam.set(
      this.targetPos.x - Math.sin(this.yaw) * horiz,
      this.targetPos.y + vert,
      this.targetPos.z - Math.cos(this.yaw) * horiz
    );

    if (physics) {
      physics.raycastCamera(this.targetPos, _desiredCam, _clampedCam);
    } else {
      _clampedCam.copy(_desiredCam);
    }

    this.currentCamPos.x = THREE.MathUtils.damp(this.currentCamPos.x, _clampedCam.x, 20, dt);
    this.currentCamPos.y = THREE.MathUtils.damp(this.currentCamPos.y, _clampedCam.y, 20, dt);
    this.currentCamPos.z = THREE.MathUtils.damp(this.currentCamPos.z, _clampedCam.z, 20, dt);

    this.camera.position.copy(this.currentCamPos);

    let lookX = this.targetPos.x;
    let lookY = this.targetPos.y;
    let lookZ = this.targetPos.z;
    let rollOffset = 0;

    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      this.shakeTime += dt;
      if (allowShake) {
        const ratio = this.shakeTimer / Math.max(0.05, this.shakeDuration);
        const fade = ratio * ratio;
        const amp = this.shakeStrength * fade;
        const t = this.shakeTime;
        const ox = (Math.sin(t * 58) * 0.65 + (Math.random() - 0.5) * 0.7) * amp;
        const oy = (Math.cos(t * 47) * 0.6 + (Math.random() - 0.5) * 0.6) * amp;
        const oz = Math.sin(t * 41) * 0.35 * amp;
        this.camera.position.x += ox;
        this.camera.position.y += oy;
        this.camera.position.z += oz;
        lookX += ox * 0.35;
        lookY += oy * 0.35;
        rollOffset = Math.sin(t * 52) * Math.min(0.04, amp * 0.035);
      }
      if (this.shakeTimer === 0) this.shakeStrength = 0;
    }

    this.camera.lookAt(lookX, lookY, lookZ);
    if (rollOffset !== 0) {
      this.camera.rotateZ(rollOffset);
    }

    this.fovKick = THREE.MathUtils.damp(this.fovKick, 0, 9, dt);
    const activeFovKick = allowShake ? this.fovKick : 0;
    const targetFov = (isRunning ? this.baseFov + 5.5 : this.baseFov) + activeFovKick;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 11, dt);
      this.camera.updateProjectionMatrix();
    }
  }
}
