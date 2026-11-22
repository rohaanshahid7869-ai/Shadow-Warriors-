import * as THREE from 'three';

const _dir = new THREE.Vector3();

function shortestAngleDiff(from, to) {
  let diff = (to - from + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  return diff - Math.PI;
}

export class PhysicsWorld {
  constructor(arenaRadius = 26) {
    this.arenaRadius = arenaRadius;
    this.boxes = [];
    this.cylinders = [];
    this.gravity = -28;
    this.stepUpHeight = 0.52;
  }

  clear() {
    this.boxes.length = 0;
    this.cylinders.length = 0;
  }

  addBoxCollider(minX, maxX, minY, maxY, minZ, maxZ, walkable = true) {
    this.boxes.push({ minX, maxX, minY, maxY, minZ, maxZ, walkable });
  }

  addBoxFromCenter(cx, cy, cz, w, h, d, walkable = true) {
    this.addBoxCollider(
      cx - w * 0.5,
      cx + w * 0.5,
      cy - h * 0.5,
      cy + h * 0.5,
      cz - d * 0.5,
      cz + d * 0.5,
      walkable
    );
  }

  addCylinderCollider(x, z, radius, minY = 0, maxY = 6, walkable = false) {
    this.cylinders.push({ x, z, radius, minY, maxY, walkable });
  }

  groundHeightAt(x, z, footY = 0, radius = 0.35) {
    let bestY = 0;
    const reachY = footY + this.stepUpHeight;

    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (!b.walkable) continue;
      if (
        x + radius * 0.6 >= b.minX &&
        x - radius * 0.6 <= b.maxX &&
        z + radius * 0.6 >= b.minZ &&
        z - radius * 0.6 <= b.maxZ &&
        b.maxY <= reachY &&
        b.maxY > bestY
      ) {
        bestY = b.maxY;
      }
    }

    for (let i = 0; i < this.cylinders.length; i++) {
      const c = this.cylinders[i];
      if (!c.walkable) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const r = c.radius + radius * 0.45;
      if (dx * dx + dz * dz <= r * r && c.maxY <= reachY && c.maxY > bestY) {
        bestY = c.maxY;
      }
    }

    return bestY;
  }

  resolveHorizontal(pos, radius, height, others = []) {
    // Two solver passes prevent corner snagging between adjacent colliders
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.boxes.length; i++) {
        const b = this.boxes[i];
        // Allow stepping onto low walkable platforms (maxY <= pos.y + stepUpHeight)
        const stepMargin = b.walkable ? this.stepUpHeight + 0.02 : 0.36;
        if (pos.y >= b.maxY - stepMargin || pos.y + height <= b.minY + 0.05) continue;

        const closestX = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const closestZ = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        const dx = pos.x - closestX;
        const dz = pos.z - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const push = radius - dist;
            pos.x += (dx / dist) * push;
            pos.z += (dz / dist) * push;
          } else {
            // Center is inside AABB; push out along minimum penetration axis
            const penLeft = Math.abs(pos.x - b.minX);
            const penRight = Math.abs(b.maxX - pos.x);
            const penTop = Math.abs(pos.z - b.minZ);
            const penBot = Math.abs(b.maxZ - pos.z);
            const minPen = Math.min(penLeft, penRight, penTop, penBot);
            if (minPen === penLeft) pos.x = b.minX - radius;
            else if (minPen === penRight) pos.x = b.maxX + radius;
            else if (minPen === penTop) pos.z = b.minZ - radius;
            else pos.z = b.maxZ + radius;
          }
        }
      }

      for (let i = 0; i < this.cylinders.length; i++) {
        const c = this.cylinders[i];
        const stepMargin = c.walkable ? this.stepUpHeight + 0.02 : 0.36;
        if (pos.y >= c.maxY - stepMargin || pos.y + height <= c.minY + 0.05) continue;
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const minD = radius + c.radius;
        const distSq = dx * dx + dz * dz;
        if (distSq < minD * minD) {
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const push = minD - dist;
            pos.x += (dx / dist) * push;
            pos.z += (dz / dist) * push;
          } else {
            pos.x += minD;
          }
        }
      }

      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (!o) continue;
        if (pos.y >= o.pos.y + o.height - 0.25 || pos.y + height <= o.pos.y + 0.1) continue;
        const dx = pos.x - o.pos.x;
        const dz = pos.z - o.pos.z;
        const minD = radius + o.radius;
        const distSq = dx * dx + dz * dz;
        if (distSq < minD * minD) {
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const push = minD - dist;
            pos.x += (dx / dist) * push;
            pos.z += (dz / dist) * push;
          } else {
            pos.z += minD;
          }
        }
      }

      const maxR = this.arenaRadius - radius;
      const distFromCenterSq = pos.x * pos.x + pos.z * pos.z;
      if (distFromCenterSq > maxR * maxR) {
        const dist = Math.sqrt(distFromCenterSq);
        pos.x = (pos.x / dist) * maxR;
        pos.z = (pos.z / dist) * maxR;
      }
    }
  }

  segmentHitsObstacle(x, y, z, radius = 0.3) {
    if (Math.hypot(x, z) > this.arenaRadius - radius) return true;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (y + radius < b.minY || y - radius > b.maxY) continue;
      if (x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) {
        return true;
      }
    }
    for (let i = 0; i < this.cylinders.length; i++) {
      const c = this.cylinders[i];
      if (y + radius < c.minY || y - radius > c.maxY) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const r = c.radius + radius;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  stepBody(body, moveX, moveZ, sprint, jumpPressed, dt, others = []) {
    const moveMag = Math.min(1, Math.hypot(moveX, moveZ));
    const hasMove = moveMag > 0.04;

    const baseWalk = body.baseSpeed;
    const targetSpeed = hasMove
      ? baseWalk * (sprint ? 1.55 : 1.0) * (body.speedBoost > 0 ? 1.6 : 1.0) * moveMag
      : 0;

    let targetVx = 0;
    let targetVz = 0;
    if (hasMove) {
      const rawLen = Math.hypot(moveX, moveZ);
      const nx = moveX / rawLen;
      const nz = moveZ / rawLen;
      targetVx = nx * targetSpeed;
      targetVz = nz * targetSpeed;

      const targetYaw = Math.atan2(nx, nz);
      const diff = shortestAngleDiff(body.yaw, targetYaw);
      const rotLambda = body.grounded ? 14 : 7;
      body.yaw += diff * (1 - Math.exp(-rotLambda * dt));
    }

    const act = body.combat?.action || 'idle';
    let accelLambda;
    if (act === 'dodge') accelLambda = 3.2;
    else if (act === 'hurt') accelLambda = 4.8;
    else if (act === 'punch' || act === 'kick') accelLambda = 7.5;
    else accelLambda = body.grounded ? (hasMove ? 14 : 18) : 5.5;

    body.vel.x = THREE.MathUtils.damp(body.vel.x, targetVx, accelLambda, dt);
    body.vel.z = THREE.MathUtils.damp(body.vel.z, targetVz, accelLambda, dt);

    // Coyote time & jump buffer
    if (body.grounded) body.coyoteTimer = 0.12;
    else body.coyoteTimer = Math.max(0, body.coyoteTimer - dt);

    if (jumpPressed) body.jumpBuffer = 0.13;
    else body.jumpBuffer = Math.max(0, body.jumpBuffer - dt);

    if (body.jumpBuffer > 0 && body.coyoteTimer > 0) {
      body.vel.y = body.jumpVelocity;
      body.grounded = false;
      body.coyoteTimer = 0;
      body.jumpBuffer = 0;
      body.justJumped = true;
    } else {
      body.justJumped = false;
    }

    // Gravity
    body.vel.y += this.gravity * dt;

    // Sub-step horizontal movement to prevent tunneling on fast dashes/knockbacks
    const prevY = body.pos.y;
    const stepDx = body.vel.x * dt;
    const stepDz = body.vel.z * dt;
    const stepDist = Math.hypot(stepDx, stepDz);
    const subSteps = Math.max(1, Math.min(4, Math.ceil(stepDist / Math.max(0.15, body.radius * 0.55))));
    for (let s = 0; s < subSteps; s++) {
      body.pos.x += stepDx / subSteps;
      body.pos.z += stepDz / subSteps;
      this.resolveHorizontal(body.pos, body.radius, body.height, others);
    }

    // Vertical update + ceiling + ground snap
    body.pos.y += body.vel.y * dt;

    // Head ceiling check against underside of boxes
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (
        body.pos.x + body.radius * 0.7 > b.minX &&
        body.pos.x - body.radius * 0.7 < b.maxX &&
        body.pos.z + body.radius * 0.7 > b.minZ &&
        body.pos.z - body.radius * 0.7 < b.maxZ
      ) {
        if (prevY + body.height <= b.minY + 0.1 && body.pos.y + body.height > b.minY && body.vel.y > 0) {
          body.pos.y = b.minY - body.height;
          body.vel.y = 0;
        }
      }
    }

    const groundY = this.groundHeightAt(body.pos.x, body.pos.z, prevY, body.radius);
    const wasGrounded = body.grounded;
    body.landed = false;

    if (body.pos.y <= groundY && body.vel.y <= 0) {
      if (!wasGrounded && body.vel.y < -4) {
        body.landed = true;
        body.landTimer = 0.16;
      }
      body.pos.y = groundY;
      body.vel.y = 0;
      body.grounded = true;
    } else {
      body.grounded = false;
    }

    body.groundY = groundY;
    if (body.landTimer > 0) body.landTimer = Math.max(0, body.landTimer - dt);

    const horizSpeed = Math.hypot(body.vel.x, body.vel.z);
    body.speedRatio = horizSpeed / Math.max(0.01, baseWalk);
    body.isRunning = body.grounded && horizSpeed > baseWalk * 1.18;
  }

  raycastCamera(pivot, desiredCam, outCam) {
    _dir.subVectors(desiredCam, pivot);
    const maxDist = _dir.length();
    if (maxDist < 0.001) {
      outCam.copy(desiredCam);
      return;
    }
    _dir.divideScalar(maxDist);

    let closestT = maxDist;
    const pad = 0.28;

    // Ray vs AABB obstacles
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (b.maxY - b.minY < 0.6) continue; // ignore low step platforms for camera clipping
      const minX = b.minX - pad;
      const maxX = b.maxX + pad;
      const minY = b.minY;
      const maxY = b.maxY + pad;
      const minZ = b.minZ - pad;
      const maxZ = b.maxZ + pad;

      let tmin = 0;
      let tmax = closestT;

      const invX = Math.abs(_dir.x) > 1e-6 ? 1 / _dir.x : 1e9;
      let t1 = (minX - pivot.x) * invX;
      let t2 = (maxX - pivot.x) * invX;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;

      const invY = Math.abs(_dir.y) > 1e-6 ? 1 / _dir.y : 1e9;
      t1 = (minY - pivot.y) * invY;
      t2 = (maxY - pivot.y) * invY;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;

      const invZ = Math.abs(_dir.z) > 1e-6 ? 1 / _dir.z : 1e9;
      t1 = (minZ - pivot.z) * invZ;
      t2 = (maxZ - pivot.z) * invZ;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin <= tmax && tmin > 0.2 && tmin < closestT) {
        closestT = tmin;
      }
    }

    // Ray vs tall cylinder pillars in XZ
    for (let i = 0; i < this.cylinders.length; i++) {
      const c = this.cylinders[i];
      if (c.maxY < 1.2) continue;
      const fx = pivot.x - c.x;
      const fz = pivot.z - c.z;
      const a = _dir.x * _dir.x + _dir.z * _dir.z;
      if (a < 1e-6) continue;
      const r = c.radius + pad;
      const bCoef = 2 * (fx * _dir.x + fz * _dir.z);
      const cCoef = fx * fx + fz * fz - r * r;
      const disc = bCoef * bCoef - 4 * a * cCoef;
      if (disc < 0) continue;
      const t = (-bCoef - Math.sqrt(disc)) / (2 * a);
      if (t > 0.2 && t < closestT) {
        const hitY = pivot.y + _dir.y * t;
        if (hitY >= c.minY && hitY <= c.maxY + pad) {
          closestT = t;
        }
      }
    }

    const finalDist = Math.max(1.4, closestT);
    outCam.copy(pivot).addScaledVector(_dir, finalDist);

    const floorY = this.groundHeightAt(outCam.x, outCam.z, outCam.y + 0.5, 0.2);
    if (outCam.y < floorY + 0.45) {
      outCam.y = floorY + 0.45;
    }
  }
}
