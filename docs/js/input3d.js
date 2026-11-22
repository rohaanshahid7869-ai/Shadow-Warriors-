export class InputController {
  constructor(getSettings, onJumpEdge, onQuit) {
    this.getSettings = getSettings;
    this.onJumpEdge = onJumpEdge;
    this.onQuit = onQuit;

    this.keys = Object.create(null);
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchArrow = { left: 0, right: 0, forward: 0, back: 0 };
    this.touchAction = Object.create(null);

    this.camDeltaX = 0;
    this.camDeltaY = 0;
    this.zoomDelta = 0;

    this.active = false;
    this.pointerLocked = false;
    this._dragging = false;
    this._lastMouseX = 0;
    this._lastMouseY = 0;
    this._camTouchId = null;
    this._lastTouchX = 0;
    this._lastTouchY = 0;

    this._prevHeld = Object.create(null);
    this._queued = Object.create(null);

    this._keyMap = Object.create(null);
    this._canvasEl = null;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._onBlur = this._onBlur.bind(this);

    this.rebuildKeyMap();
  }

  static get DEFAULT_KEYS() {
    return {
      forward: 'KeyW',
      back: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      up: 'Space',
      dodge: 'ShiftLeft',
      punch: 'KeyJ',
      kick: 'KeyK',
      sp: 'KeyL',
      ult: 'KeyI',
      block: 'KeyU',
    };
  }

  rebuildKeyMap() {
    const S = this.getSettings ? this.getSettings() : {};
    const saved = S.keys || {};
    const DK = InputController.DEFAULT_KEYS;
    this._keyMap = Object.create(null);

    for (const action in DK) {
      const code = saved[action] || DK[action];
      this._keyMap[code] = action;
    }

    if (!this._keyMap.ArrowUp) this._keyMap.ArrowUp = 'forward';
    if (!this._keyMap.ArrowDown) this._keyMap.ArrowDown = 'back';
    if (!this._keyMap.ArrowLeft) this._keyMap.ArrowLeft = 'left';
    if (!this._keyMap.ArrowRight) this._keyMap.ArrowRight = 'right';
    if (!this._keyMap.ShiftRight) this._keyMap.ShiftRight = 'dodge';
  }

  attach(canvasEl) {
    this._canvasEl = canvasEl;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);

    canvasEl.addEventListener('mousedown', this._onMouseDown);
    canvasEl.addEventListener('wheel', this._onWheel, { passive: false });
    canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
    canvasEl.addEventListener('touchstart', this._onTouchStart, { passive: false });
    canvasEl.addEventListener('touchmove', this._onTouchMove, { passive: false });
    canvasEl.addEventListener('touchend', this._onTouchEnd);
    canvasEl.addEventListener('touchcancel', this._onTouchEnd);
  }

  setActive(isActive) {
    this.active = isActive;
    if (!isActive) {
      this.clearState();
      this.releasePointerLock();
    }
  }

  clearState() {
    for (const k in this.keys) this.keys[k] = false;
    for (const k in this.touchAction) this.touchAction[k] = false;
    for (const k in this._prevHeld) this._prevHeld[k] = false;
    for (const k in this._queued) this._queued[k] = false;
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchArrow.left = 0;
    this.touchArrow.right = 0;
    this.touchArrow.forward = 0;
    this.touchArrow.back = 0;
    this.camDeltaX = 0;
    this.camDeltaY = 0;
    this.zoomDelta = 0;
    this._dragging = false;
    this._camTouchId = null;
  }

  requestPointerLock() {
    if (!this.active || !this._canvasEl) return;
    if (document.pointerLockElement === this._canvasEl) return;
    try {
      const p = this._canvasEl.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  releasePointerLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock?.();
    } catch (_) {}
  }

  _onPointerLockChange() {
    this.pointerLocked = document.pointerLockElement === this._canvasEl;
  }

  _onBlur() {
    this.clearState();
  }

  _onKeyDown(e) {
    if (!this.active) return;
    if (window.__SW_REBINDING__) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const action = this._keyMap[e.code];
    if (action) {
      if (!this.keys[action]) {
        this._queued[action] = true;
        if (action === 'up') this.onJumpEdge?.();
      }
      this.keys[action] = true;
      e.preventDefault();
    }
    if (e.code === 'Escape') {
      if (this.pointerLocked) {
        this.releasePointerLock();
      } else {
        this.onQuit?.();
      }
    }
  }

  _onKeyUp(e) {
    const action = this._keyMap[e.code];
    if (action) {
      this.keys[action] = false;
    }
  }

  _onMouseDown(e) {
    if (!this.active) return;
    if (e.button === 0 || e.button === 2) {
      this._dragging = true;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
      if (e.button === 0 && !this.pointerLocked) {
        this.requestPointerLock();
      }
    }
  }

  _onMouseUp() {
    this._dragging = false;
  }

  _onMouseMove(e) {
    if (!this.active) return;
    if (this.pointerLocked) {
      this.camDeltaX += e.movementX || 0;
      this.camDeltaY += e.movementY || 0;
    } else if (this._dragging) {
      const dx = e.clientX - this._lastMouseX;
      const dy = e.clientY - this._lastMouseY;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
      this.camDeltaX += dx;
      this.camDeltaY += dy;
    }
  }

  _onWheel(e) {
    if (!this.active) return;
    e.preventDefault();
    this.zoomDelta += Math.sign(e.deltaY) * 0.65;
  }

  _onTouchStart(e) {
    if (!this.active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (this._camTouchId === null) {
        this._camTouchId = t.identifier;
        this._lastTouchX = t.clientX;
        this._lastTouchY = t.clientY;
      }
    }
  }

  _onTouchMove(e) {
    if (!this.active || this._camTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this._camTouchId) {
        e.preventDefault();
        this.camDeltaX += (t.clientX - this._lastTouchX) * 1.4;
        this.camDeltaY += (t.clientY - this._lastTouchY) * 1.4;
        this._lastTouchX = t.clientX;
        this._lastTouchY = t.clientY;
      }
    }
  }

  _onTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this._camTouchId) {
        this._camTouchId = null;
      }
    }
  }

  setJoystickVector(nx, ny) {
    this.touchMoveX = nx;
    this.touchMoveY = ny;
  }

  setTouchAction(action, pressed) {
    if (action === 'left' || action === 'right' || action === 'forward' || action === 'back') {
      this.touchArrow[action] = pressed ? 1 : 0;
      return;
    }
    if (pressed && !this.touchAction[action]) {
      this._queued[action] = true;
      if (action === 'up') this.onJumpEdge?.();
    }
    this.touchAction[action] = Boolean(pressed);
  }

  _consumeEdge(action) {
    const held = Boolean(this.keys[action] || this.touchAction[action]);
    const edge = Boolean(this._queued[action] || (held && !this._prevHeld[action]));
    this._prevHeld[action] = held;
    this._queued[action] = false;
    return { held, edge };
  }

  consumeFrameInput(out) {
    const kbRight = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    const kbForward = (this.keys.forward ? 1 : 0) - (this.keys.back ? 1 : 0);

    const arrRight = this.touchArrow.right - this.touchArrow.left;
    const arrForward = this.touchArrow.forward - this.touchArrow.back;

    let moveX = kbRight + arrRight + this.touchMoveX;
    let moveY = kbForward + arrForward + this.touchMoveY;
    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }

    const up = this._consumeEdge('up');
    const dodge = this._consumeEdge('dodge');
    const punch = this._consumeEdge('punch');
    const kick = this._consumeEdge('kick');
    const sp = this._consumeEdge('sp');
    const ult = this._consumeEdge('ult');
    const block = this._consumeEdge('block');

    const joySprint = Math.hypot(this.touchMoveX, this.touchMoveY) > 0.88;

    out.moveX = moveX;
    out.moveY = moveY;
    out.jumpPressed = up.edge;
    out.sprint = Boolean(dodge.held || joySprint);
    out.dodgePressed = dodge.edge;
    out.punchPressed = punch.edge;
    out.kickPressed = kick.edge;
    out.spPressed = sp.edge;
    out.ultPressed = ult.edge;
    out.blockHeld = block.held;

    out.camDeltaX = this.camDeltaX;
    out.camDeltaY = this.camDeltaY;
    out.zoomDelta = this.zoomDelta;

    this.camDeltaX = 0;
    this.camDeltaY = 0;
    this.zoomDelta = 0;
  }
}
