/* ============================================================
   ECHO PROTOCOL — ui.js
   DOM overlays: screens, level select cards, HUD sync, toasts.
   ============================================================ */
"use strict";
(function () {

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  class UI {
    constructor() {
      this.game = null;
      this.screens = {
        title: $("#screen-title"),
        levels: $("#screen-levels"),
        help: $("#screen-help"),
        pause: $("#screen-pause"),
        complete: $("#screen-complete"),
        fin: $("#screen-fin"),
      };
      this.hud = $("#hud");
      this.hintBar = $("#hintBar");
      this.toastEl = $("#toast");
      this._toastTimer = null;
      this._hintText = "";
      this._hudCache = {};

      // button actions (game ref resolved at click time)
      $$("#screens [data-action]").forEach(btn => {
        btn.addEventListener("click", () => {
          OX.Audio.init(); OX.Audio.sUI();
          if (this.game) this.game.onAction(btn.dataset.action);
        });
      });
    }

    /* ---------------- screen switching ---------------- */
    showScreen(name) {
      for (const k in this.screens)
        this.screens[k].classList.toggle("show", k === name);
      const inPlay = name === null;
      this.hud.classList.toggle("hidden", !inPlay && name !== "pause");
    }

    hideAllScreens() { this.showScreen(null); }

    fade(on, cb) {
      const el = $("#fadeLayer");
      el.classList.toggle("on", !!on);
      if (cb) setTimeout(cb, 300);
    }

    /* ---------------- HUD ---------------- */
    setHud(key, val, force) {
      if (force || this._hudCache[key] !== val) {
        this._hudCache[key] = val;
        return true;
      }
      return false;
    }

    updateHud() {
      const g = this.game;
      if (!g.level) return;
      if (this.setHud("name", g.level.name)) $("#hudLevelName").textContent = g.level.name;

      // shards
      if (this.setHud("shards", g.shardMask + ":" + g.shardsCollected)) {
        const wrap = $("#hudShards");
        wrap.innerHTML = "";
        for (let i = 0; i < 3; i++) {
          const pip = document.createElement("div");
          pip.className = "shard-pip" + ((g.shardMask & (1 << i)) ? " got" : "");
          wrap.appendChild(pip);
        }
      }

      if (this.setHud("loop", String(g.loopNo))) $("#hudLoop").textContent = g.loopNo;
      if (this.setHud("deaths", String(g.resets))) $("#hudDeaths").textContent = g.resets;
      if (this.setHud("time", OX.Utils.fmtTime(g.levelTime))) $("#hudTime").textContent = OX.Utils.fmtTime(g.levelTime);

      // echo pips
      const key2 = g.echoes.length + "/" + g.level.maxEchoes;
      if (this.setHud("echoes", key2)) {
        const wrap = $("#hudEchoes");
        wrap.innerHTML = "";
        for (let i = 0; i < g.level.maxEchoes; i++) {
          const pip = document.createElement("div");
          pip.className = "echo-pip" + (i < g.echoes.length ? " on" : "") + (i === g.level.maxEchoes - 1 ? " full" : "");
          wrap.appendChild(pip);
        }
      }
    }

    hint(text) {
      if (text === this._hintText) return;
      this._hintText = text;
      if (!text) { this.hintBar.classList.add("hidden"); return; }
      this.hintBar.textContent = text;
      this.hintBar.classList.remove("hidden");
    }

    toast(msg, ms = 2200) {
      const el = this.toastEl;
      el.innerHTML = msg;
      el.classList.remove("show");
      void el.offsetWidth; // restart transition
      el.classList.add("show");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove("show"), ms);
    }

    /* ---------------- level select ---------------- */
    buildLevelGrid() {
      const grid = $("#levelGrid");
      grid.innerHTML = "";
      const save = this.game.save;
      OX.LEVELS.forEach((lvl, i) => {
        const unlocked = i < save.unlocked;
        const best = save.best[lvl.id];
        const card = document.createElement("button");
        card.className = "level-card" + (unlocked ? "" : " locked");
        let statsHtml = "";
        if (unlocked) {
          const shardPips = [0, 1, 2].map(b =>
            `<span class="lc-shard ${best && (best.shards & (1 << b)) ? "got" : ""}"></span>`).join("");
          let medal = "";
          if (best) {
            medal = best.time <= lvl.par ? '<span class="lc-medal">🥇</span>'
              : best.time <= lvl.par * 1.7 ? '<span class="lc-medal">🥈</span>'
                : '<span class="lc-medal">🥉</span>';
          }
          statsHtml = `
            <span>${best ? OX.Utils.fmtTime(best.time) : "—"}${best && best.time <= lvl.par ? " ★" : ""}</span>
            <span class="lc-shards">${shardPips}</span>
            ${medal}`;
        } else {
          statsHtml = `<span>CLEAR PREVIOUS SECTOR</span>`;
        }
        card.innerHTML = `
          <div class="lc-num">SECTOR 0${i + 1}</div>
          <div class="lc-name">${lvl.name}</div>
          <div class="lc-sub">${lvl.sub}</div>
          <div class="lc-stats">${statsHtml}</div>`;
        if (unlocked) {
          card.addEventListener("click", () => { OX.Audio.init(); OX.Audio.sUI(); this.game.startLevel(i); });
        }
        grid.appendChild(card);
      });
    }

    /* ---------------- pause / complete ---------------- */
    fillPause() {
      const g = this.game;
      $("#pauseStats").innerHTML =
        `${g.level.name}<br>` +
        `TIME <b>${OX.Utils.fmtTime(g.levelTime)}</b> · LOOPS <b>${g.loopNo}</b> · ECHOES <b>${g.echoes.length}/${g.level.maxEchoes}</b>`;
    }

    fillComplete(stats) {
      const g = this.game;
      $("#completeName").textContent = g.level.name;
      const medal = stats.time <= g.level.par ? "🥇 GOLD"
        : stats.time <= g.level.par * 1.7 ? "🥈 SILVER" : "🥉 BRONZE";
      $("#completeStats").innerHTML = `
        <div class="cs-item ${stats.record ? "record" : ""}">
          <div class="cs-val">${OX.Utils.fmtTime(stats.time)}</div>
          <div class="cs-lab">${stats.record ? "NEW RECORD" : "TIME"}</div>
        </div>
        <div class="cs-item"><div class="cs-val">${g.loopNo}</div><div class="cs-lab">LOOPS USED</div></div>
        <div class="cs-item"><div class="cs-val">${stats.shards}/3</div><div class="cs-lab">SHARDS</div></div>
        <div class="cs-item"><div class="cs-val" style="font-size:22px;padding-top:6px">${medal}</div><div class="cs-lab">RANK</div></div>`;
      const nextBtn = $$('#screen-complete [data-action="next"]')[0];
      nextBtn.style.display = g.level.index + 1 < OX.LEVEL_COUNT ? "" : "none";
    }

    fillFinale() {
      const save = this.game.save;
      let totalShards = 0;
      Object.values(save.best).forEach(b => {
        totalShards += ((b.shards || 0)).toString(2).split("").filter(c => c === "1").length;
      });
      $("#finStats").textContent = `All six sectors cleared · ${totalShards}/18 data shards recovered.`;
    }
  }

  OX.UI = UI;
})();
