/* ============================================================
   ECHO PROTOCOL — input.js
   Action-mapped keyboard input with edge detection.
   ============================================================ */
"use strict";
(function () {

  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "jump", KeyW: "jump", Space: "jump",
    ArrowDown: "down", KeyS: "down",
    ShiftLeft: "dash", ShiftRight: "dash", KeyX: "dash", KeyK: "dash",
    KeyR: "rewind",
    KeyT: "clearEchoes",
    Escape: "pause", KeyP: "pause",
    KeyM: "mute",
    Enter: "confirm",
  };

  class Input {
    constructor() {
      this.held = {};      // action -> bool
      this.pressed = {};   // action -> edge (cleared on consume)
      this.anyKey = false;
      this._anyEdge = false;

      window.addEventListener("keydown", (e) => {
        if (e.repeat) {
          if (KEYMAP[e.code]) e.preventDefault();
          return;
        }
        const a = KEYMAP[e.code];
        this.anyKey = true; this._anyEdge = true;
        if (a) {
          e.preventDefault();
          if (!this.held[a]) this.pressed[a] = true;
          this.held[a] = true;
        }
        OX.Audio.init(); // unlock audio on first interaction
      }, { passive: false });

      window.addEventListener("keyup", (e) => {
        const a = KEYMAP[e.code];
        if (a) { e.preventDefault(); this.held[a] = false; }
      }, { passive: false });

      window.addEventListener("blur", () => { this.held = {}; });
    }

    isHeld(a) { return !!this.held[a]; };
    consume(a) {
      if (this.pressed[a]) { this.pressed[a] = false; return true; }
      return false;
    }
    clearEdges() { this.pressed = {}; this._anyEdge = false; }
  }

  OX.Input = new Input();
})();
