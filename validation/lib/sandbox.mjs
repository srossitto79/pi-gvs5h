import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";

// The entries under validation/repos are browser games built from plain <script> tags over a
// window global. Loading them in a VM with a stub window lets a grader drive real game code
// without a browser, so grading needs no extra dependency. Modules that touch the canvas or the
// audio context are simply not loaded unless a grader asks for them.

/**
 * A 2D context stub faithful in the two ways graders depend on.
 *
 * It keeps the drawing state that affects layout (font, alignment, alpha) across save/restore, so
 * recorded text can be turned back into boxes. And it reproduces the one place the real canvas
 * throws rather than ignoring bad input: the gradient constructors reject non-finite values. A
 * game that computes a NaN coordinate fails here exactly as it fails in a browser.
 */
function stubContext(sink) {
  const state = { font: "10px sans-serif", textAlign: "left", textBaseline: "alphabetic", globalAlpha: 1, fillStyle: "#000" };
  const stack = [];
  const sizeOf = font => Number(/(\d+(?:\.\d+)?)px/.exec(font ?? "")?.[1] ?? 10);
  const width = (text, font) => String(text).length * sizeOf(font) * sink.charWidth;
  const finite = (...values) => values.every(value => typeof value !== "number" || Number.isFinite(value));
  const target = {
    canvas: { width: sink.width, height: sink.height },
    save() { stack.push({ ...state }); },
    restore() { Object.assign(state, stack.pop() ?? state); },
    measureText: text => ({ width: width(text, state.font) }),
    fillText(text, x, y) {
      if (!finite(x, y)) sink.nonFinite.push({ method: "fillText", args: [x, y] });
      sink.draws.push({ method: "fillText", text: String(text), x, y,
        align: state.textAlign, baseline: state.textBaseline, size: sizeOf(state.font),
        width: width(text, state.font), alpha: state.globalAlpha, fill: state.fillStyle });
    },
    strokeText(text, x, y) { target.fillText(text, x, y); },
    fillRect(x, y, w, h) {
      if (!finite(x, y, w, h)) sink.nonFinite.push({ method: "fillRect", args: [x, y, w, h] });
      sink.draws.push({ method: "fillRect", x, y, w, h, fill: state.fillStyle, alpha: state.globalAlpha });
    },
    drawImage() {},
    // The real canvas throws here on non-finite input; everything else silently ignores it.
    createLinearGradient(...args) {
      if (!finite(...args)) {
        sink.nonFinite.push({ method: "createLinearGradient", args });
        throw new TypeError("Failed to execute 'createLinearGradient' on 'CanvasRenderingContext2D': The provided double value is non-finite.");
      }
      return { addColorStop() {} };
    },
    createRadialGradient(...args) {
      if (!finite(...args)) {
        sink.nonFinite.push({ method: "createRadialGradient", args });
        throw new TypeError("Failed to execute 'createRadialGradient' on 'CanvasRenderingContext2D': The provided double value is non-finite.");
      }
      return { addColorStop() {} };
    },
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData() {},
  };
  return new Proxy(target, {
    get(object, key) {
      if (key in object) return object[key];
      if (key in state) return state[key];
      return (...args) => {
        if (!finite(...args)) sink.nonFinite.push({ method: String(key), args });
        return undefined;
      };
    },
    set(object, key, value) {
      if (key in state) state[key] = value; else object[key] = value;
      return true;
    },
    has: () => true,
  });
}

function stubElement(sink) {
  return {
    width: sink.width, height: sink.height, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    getContext: () => sink.context,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {},
    setAttribute() {}, getAttribute: () => null, focus() {}, requestPointerLock() {},
    getBoundingClientRect: () => ({ x: 0, y: 0, width: sink.width, height: sink.height, top: 0, left: 0, right: sink.width, bottom: sink.height }),
  };
}

/**
 * Loads the named scripts of a repository copy into one VM context.
 *
 * Returns the stub `window`, an `evaluate` that runs an expression in the same context — top-level
 * `const` bindings are reachable that way but are not properties of the global — and the recorded
 * drawing, for graders that need to inspect what the game rendered.
 */
export function loadScripts(repoDirectory, files, { width = 1280, height = 720, charWidth = 0.55, expose = [] } = {}) {
  const sink = { draws: [], nonFinite: [], width, height, charWidth, context: undefined };
  sink.context = stubContext(sink);
  const listeners = new Map();
  const window = {
    innerWidth: width, innerHeight: height, devicePixelRatio: 1,
    addEventListener(type, handler) { listeners.set(type, [...(listeners.get(type) ?? []), handler]); },
    removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    performance: { now: () => 0 },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    AudioContext: function AudioContext() { return new Proxy({}, { get: () => () => new Proxy({}, { get: () => () => {} }) }); },
    Image: function Image() { return stubElement(sink); },
    console,
    /** Delivers a DOM event the loaded scripts registered for, such as a keydown. */
    dispatch(type, event) { for (const handler of listeners.get(type) ?? []) handler(event); },
  };
  window.window = window;
  window.self = window;
  window.globalThis = window;
  window.webkitAudioContext = window.AudioContext;
  const element = stubElement(sink);
  window.document = {
    documentElement: element, body: element,
    createElement: () => stubElement(sink),
    getElementById: () => element,
    querySelector: () => element,
    querySelectorAll: () => [],
    addEventListener: (type, handler) => window.addEventListener(type, handler),
    removeEventListener() {},
  };
  const context = createContext(window);
  // Classic <script> tags share one global lexical environment, so a top-level `const` in one file
  // is visible to the next. Node gives each runInContext call its own scope, which would hide those
  // bindings and diverge from the browser, so the sources are concatenated and run as one script.
  // A duplicate top-level declaration across files then throws here exactly as it would in a page.
  const source = files.map(file => readFileSync(join(repoDirectory, file), "utf8")).join("\n;\n");
  const epilogue = expose.length
    ? `\n;globalThis.__exposed = {${expose.map(name => `${name}: typeof ${name} !== "undefined" ? ${name} : undefined`).join(", ")}};`
    : "";
  runInContext(source + epilogue, context, { filename: join(repoDirectory, files[0] ?? "bundle.js") });
  return {
    window,
    exposed: window.__exposed ?? {},
    evaluate: expression => runInContext(expression, context),
    draws: sink.draws,
    nonFinite: sink.nonFinite,
    clearDrawing() { sink.draws.length = 0; sink.nonFinite.length = 0; },
  };
}

/** Horizontal extent of a recorded text draw, accounting for its alignment. */
export function textBox(draw) {
  const left = draw.align === "right" ? draw.x - draw.width
    : draw.align === "center" ? draw.x - draw.width / 2
    : draw.x;
  return { left, right: left + draw.width, y: draw.y, text: draw.text };
}

/** A rectangular world of empty tiles with a solid floor, for driving movement in isolation. */
export function flatWorld(tiles, { width = 200, height = 20, floor = 15 } = {}) {
  const grid = new Array(width * height).fill(tiles.EMPTY);
  for (let x = 0; x < width; x++) {
    for (let y = floor; y < height; y++) grid[y * width + x] = tiles.SOLID;
  }
  return { w: width, h: height, tiles: grid, crumbleMap: new Array(width * height).fill(null), movers: [] };
}

/** Input stub whose held actions and one-frame edges are set by the grader. */
export function scriptedInput(held = []) {
  const down = new Set(held);
  const edges = new Set();
  return {
    isDown: action => down.has(action),
    justPressed: action => edges.has(action),
    hold(action, on = true) { if (on) down.add(action); else down.delete(action); },
    press(action) { edges.add(action); },
    endFrame() { edges.clear(); },
  };
}

/** Effect hooks a game calls; a grader only needs them not to throw. */
export function silentEffects() {
  return new Proxy({}, { get: () => () => {} });
}
