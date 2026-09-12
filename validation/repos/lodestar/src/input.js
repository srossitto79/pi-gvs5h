/* LODESTAR — input.
 * Keyboard + on-screen touch. Exposes a polled state object plus
 * edge-triggered "justPressed" flags that are cleared each frame.
 */
window.LD = window.LD || {};

LD.Input = (function () {
  const state = {
    left: false, right: false,
    jump: false, jumpHeld: false,
    flip: false,
    down: false,
    // edge-triggered (true for one frame)
    jumpPressed: false, flipPressed: false,
    // meta
    pause: false, restart: false, mute: false, confirm: false,
    pausePressed: false, restartPressed: false, mutePressed: false,
    confirmPressed: false,
    anyPressed: false,
  };

  const keyMap = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "jump", KeyW: "jump", Space: "jump",
    ArrowDown: "down", KeyS: "down",
    KeyE: "flip", KeyQ: "flip", ShiftLeft: "flip", ShiftRight: "flip",
    Escape: "pause", KeyP: "pause",
    KeyR: "restart",
    KeyM: "mute",
    Enter: "confirm",
  };

  const pressed = new Set();

  function setAction(a, down) {
    if (a === "jump") {
      if (down && !state.jump) state.jumpPressed = true;
      state.jump = down; state.jumpHeld = down;
    } else if (a === "flip") {
      if (down && !state.flip) state.flipPressed = true;
      state.flip = down;
    } else if (a === "pause") {
      if (down && !state.pause) state.pausePressed = true;
      state.pause = down;
    } else if (a === "restart") {
      if (down && !state.restart) state.restartPressed = true;
      state.restart = down;
    } else if (a === "mute") {
      if (down && !state.mute) state.mutePressed = true;
      state.mute = down;
    } else if (a === "confirm") {
      if (down && !state.confirm) state.confirmPressed = true;
      state.confirm = down;
    } else {
      state[a] = down;
    }
    if (down) state.anyPressed = true;
  }

  function onKeyDown(e) {
    const a = keyMap[e.code];
    if (!a) return;
    e.preventDefault();
    if (pressed.has(e.code)) return;
    pressed.add(e.code);
    setAction(a, true);
  }
  function onKeyUp(e) {
    const a = keyMap[e.code];
    if (!a) return;
    pressed.delete(e.code);
    setAction(a, false);
  }

  // ---- touch ----
  function bindTouch(root) {
    if (!root) return;
    root.querySelectorAll(".tbtn").forEach(btn => {
      const a = btn.dataset.k;
      const on = ev => { ev.preventDefault(); setAction(a, true); };
      const off = ev => { ev.preventDefault(); setAction(a, false); };
      btn.addEventListener("touchstart", on, { passive: false });
      btn.addEventListener("touchend", off, { passive: false });
      btn.addEventListener("touchcancel", off, { passive: false });
      // mouse fallback for desktop testing of the touch UI
      btn.addEventListener("mousedown", on);
      btn.addEventListener("mouseup", off);
      btn.addEventListener("mouseleave", off);
    });
  }

  function init() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => {
      pressed.clear();
      state.left = state.right = state.jump = state.jumpHeld =
        state.flip = state.down = state.pause = state.restart =
        state.confirm = false;
    });
    const touch = document.getElementById("touch");
    if (touch) {
      const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
      if (isTouch) {
        touch.classList.remove("hidden");
        bindTouch(touch);
      }
    }
  }

  // call once per frame AFTER the game has read the state
  function endFrame() {
    state.jumpPressed = false;
    state.flipPressed = false;
    state.pausePressed = false;
    state.restartPressed = false;
    state.mutePressed = false;
    state.confirmPressed = false;
    state.anyPressed = false;
  }

  return { state, init, endFrame, setAction };
})();
