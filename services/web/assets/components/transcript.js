var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/binary-search/index.js
var require_binary_search = __commonJS({
  "node_modules/binary-search/index.js"(exports, module) {
    module.exports = function(haystack, needle, comparator, low, high) {
      var mid, cmp;
      if (low === void 0)
        low = 0;
      else {
        low = low | 0;
        if (low < 0 || low >= haystack.length)
          throw new RangeError("invalid lower bound");
      }
      if (high === void 0)
        high = haystack.length - 1;
      else {
        high = high | 0;
        if (high < low || high >= haystack.length)
          throw new RangeError("invalid upper bound");
      }
      while (low <= high) {
        mid = low + (high - low >>> 1);
        cmp = +comparator(haystack[mid], needle, mid, haystack);
        if (cmp < 0)
          low = mid + 1;
        else if (cmp > 0)
          high = mid - 1;
        else
          return mid;
      }
      return ~low;
    };
  }
});

// internal/components/transcript.ts
var import_binary_search = __toESM(require_binary_search());
var activeClass = "lc-media__content__transcript__segment--active";
var LcTranscript = class extends HTMLElement {
  abortController = null;
  constructor() {
    super();
    this.addEventListener("click", (e) => {
      if (!(e.target instanceof HTMLElement)) {
        return;
      }
      const closest = e.target.closest("[data-start]");
      if (!(closest instanceof HTMLElement)) {
        return;
      }
      const start = closest.dataset.start;
      if (!start) {
        return;
      }
      document.dispatchEvent(
        new CustomEvent("lc:player:seek", { detail: parseInt(start, 10) })
      );
    });
  }
  connectedCallback() {
    const ac = this.abortController = new AbortController();
    const starts = Array.from(this.querySelectorAll("[data-start]")).filter((el) => el instanceof HTMLElement).map((el) => parseInt(el.dataset.start ?? "0", 10));
    let lastEl = null;
    document.addEventListener(
      "lc:player:timeupdate",
      (e) => {
        if (!("detail" in e) || typeof e.detail !== "number") {
          return;
        }
        const found = (0, import_binary_search.default)(
          starts,
          e.detail,
          (start2, currentTime) => start2 - currentTime
        );
        const i = found < 0 ? -found - 2 : found;
        const start = starts[i];
        const el = this.querySelector(`[data-start="${start}"]`);
        if (el === lastEl || !(el instanceof HTMLElement) || !el?.parentElement) {
          return;
        }
        lastEl?.classList.remove(activeClass);
        el.classList.add(activeClass);
        el.parentElement.scrollTop = Math.max(
          el.offsetTop - el.parentElement.offsetTop - el.clientHeight,
          0
        );
        lastEl = el;
      },
      {
        signal: ac.signal
      }
    );
  }
  disconnectedCallback() {
    this.abortController?.abort();
  }
};
customElements.define("lc-transcript", LcTranscript);
