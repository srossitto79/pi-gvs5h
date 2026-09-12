// REVERB — keyboard input with edge detection
(function (RV) {
  "use strict";

  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "up", KeyW: "up", Space: "jump",
    ShiftLeft: "dash", ShiftRight: "dash", KeyX: "dash", KeyJ: "dash",
    KeyE: "shout", KeyQ: "shout",
    KeyR: "restart",
    Escape: "pause", KeyP: "pause",
    KeyM: "mute",
    Enter: "confirm",
    Digit1: "level1", Digit2: "level2", Digit3: "level3",
    Digit4: "level4", Digit5: "level5", Digit6: "level6",
  };

  function Input() {
    this.down = {};       // action -> bool
    this.pressed = {};    // action -> true for one frame after edge
    this._queue = [];
    const self = this;
    window.addEventListener("keydown", (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      self._queue.push({ action: a, code: e.code, e });
    }, { passive: false });
    window.addEventListener("keyup", (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      self.down[a] = false;
    });
    window.addEventListener("blur", () => { self.down = {}; });
  }

  Input.prototype = {
    // Called once per rendered frame BEFORE game update.
    beginFrame() {
      this.pressed = {};
      for (const q of this._queue) {
        if (!this.down[q.action]) this.pressed[q.action] = true;
        this.down[q.action] = true;
      }
      this._queue.length = 0;
    },
    isDown(a) { return !!this.down[a]; },
    justPressed(a) { return !!this.pressed[a]; },
  };

  RV.Input = Input;
})(window.RV = window.RV || {});
