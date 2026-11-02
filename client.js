/**
 * dsh-off-peak-indicator — client half.
 *
 * One cell in `conversation.composer.dock`, the row under the composer that
 * already carries the shipped session statistics and the context meter: a
 * coloured dot, the current DeepSeek pricing class, and the countdown to the
 * next switch.
 *
 *     ● Off-peak · peak in 8h 36m
 *     ● Peak · off-peak in 2h 30m
 *     ● Off-peak weekend · peak in 1d 22h
 *
 * Typography is copied from the shipped `StatsPills.module.css` so the cell
 * reads as part of that row: 12px, `label-tertiary`, tabular numerals, the same
 * pill padding and radius. Only the status dot carries colour.
 *
 * Everything is derived from the UTC clock, so there is no Host half to talk to
 * and no dependency beyond React. DeepSeek's published schedule: peak is
 * 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday; every other hour is
 * off-peak. The tooltip prints those windows in the viewer's own timezone.
 *
 * Two shapes matter for robustness:
 *
 * 1. The whole bundle is one IIFE. A combo script concatenates several
 *    packages' client bundles into one classic script, where a top-level
 *    `const`/`let` collides with any other bundle's identifier — the browser
 *    then throws a SyntaxError and NOTHING in that script registers.
 * 2. Nothing is allowed to escape `apply`: a failed widget must cost this cell,
 *    never the boot audit of the application.
 */
(function () {
  /** One warning per page: a broken strip must not spam the console. */
  const REPORTED = new Set();

  function report(message) {
    if (REPORTED.has(message)) return;
    REPORTED.add(message);
    try {
      console.warn("[off-peak] " + message);
    } catch (ignored) {
      // A console that throws is not worth a second thought.
    }
  }

  function describe(error) {
    if (error === null || error === undefined) return String(error);
    return error.message === undefined ? String(error) : String(error.message);
  }

  const loader = typeof window === "undefined" ? undefined : window.__ModuleLoader__;
  if (loader === undefined || loader === null || typeof loader.load !== "function") {
    report("module loader is absent; nothing was registered");
    return;
  }

  try {
    loader.load({
      id: "dsh-off-peak-indicator",
      factory: (require) => {
        const module = { exports: {} };
        const exports = module.exports;
        try {
          build(require, exports);
        } catch (error) {
          // An inert plugin still activates, which keeps the boot audit happy.
          report("bundle body failed, staying inert: " + describe(error));
          exports.apply = function apply() {};
          exports.inject = [];
        }
        return module.exports;
      }
    });
  } catch (error) {
    // A duplicate id (combo script then single-resource URL) is harmless: the
    // factory already exists, so the row still activates.
    report("bundle registration was refused: " + describe(error));
  }

  /**
   * The module body.
   *
   * @param {(specifier: string) => any} require
   * @param {any} exports
   */
  function build(require, exports) {
    const React = require("react");

    /** The dock cell. `order` decides the position: the shipped statistics strip sits at -1. */
    const SLOT = "conversation.composer.dock";
    const SLOT_ID = "off-peak-indicator";
    const SLOT_ORDER = -3;
    const TICK_MS = 1000;
    const MIN = 60000;
    /** Peak windows as [startMinute, endMinute) of the UTC day, half-open. */
    const PEAK_BLOCKS = [[60, 240], [360, 600]];

    /**
     * Geometry and type copied from the shipped session-statistics strip
     * (`dsh-client-ui-chat` → `StatsPills.module.css`), so a row carrying both
     * reads as one line. Only the dot is coloured; the text keeps the row's own
     * tertiary label colour.
     */
    const CSS = [
      ".dshOffPeakStrip{box-sizing:border-box;min-width:0;max-width:100%;",
      "font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);",
      "line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));",
      "align-items:center;display:inline-flex;}",
      ".dshOffPeakPill{box-sizing:border-box;corner-shape:round;max-width:100%;",
      "color:var(--dsw-alias-label-tertiary);font:inherit;",
      "font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;",
      "background:0 0;border:none;border-radius:999px;align-items:center;gap:6px;",
      "padding:1px 8px;display:inline-flex;}",
      ".dshOffPeakDot{width:6px;height:6px;border-radius:999px;flex:none;background:currentColor;}",
      ".dshOffPeakStrip[data-state=peak] .dshOffPeakDot{background:#e02b2b;}",
      ".dshOffPeakStrip[data-state=off-peak] .dshOffPeakDot{background:#d9930a;}",
      ".dshOffPeakStrip[data-state=weekend] .dshOffPeakDot{background:#1f9d55;}",
      ".dshOffPeakLabel{text-overflow:ellipsis;min-width:0;overflow:hidden;}",
      ".dshOffPeakMeta{font-variant-numeric:tabular-nums;}",
      ".dshOffPeakSep{color:var(--dsw-alias-separator-primary);margin:0 6px;}"
    ].join("");

    /**
     * Dictionaries. `hint` is a template because the peak windows are printed in
     * the viewer's timezone, which is only known at render time.
     */
    const COPY = {
      en: {
        peak: "Peak",
        off: "Off-peak",
        weekend: "Off-peak weekend",
        toPeak: "peak in ",
        toOff: "off-peak in ",
        hint: function (local, utc, zone) {
          return "DeepSeek peak hours: " + local + " local time (" + zone + ") = " + utc +
            " UTC, Monday to Friday. Off-peak requests are billed at half the peak rate.";
        }
      },
      ru: {
        peak: "Пик",
        off: "Off-peak",
        weekend: "Off-peak (выходные)",
        toPeak: "пик через ",
        toOff: "off-peak через ",
        hint: function (local, utc, zone) {
          return "Пиковые часы DeepSeek: " + local + " по местному времени (" + zone + ") = " + utc +
            " UTC, понедельник-пятница. В off-peak цена вдвое ниже.";
        }
      },
      zh: {
        peak: "高峰",
        off: "闲时",
        weekend: "闲时（周末）",
        toPeak: "距高峰 ",
        toOff: "距闲时 ",
        hint: function (local, utc, zone) {
          return "DeepSeek 高峰时段：当地时间 " + local + "（" + zone + "）= UTC " + utc +
            "，周一至周五。闲时按高峰半价计费。";
        }
      }
    };

    /** The dictionary for the page language; the widget receives no translator. */
    function copy() {
      try {
        const explicit = typeof document === "undefined" ? null : document.documentElement.getAttribute("lang");
        const tag = explicit === null || explicit === undefined
          ? (typeof navigator === "undefined" ? null : navigator.language)
          : explicit;
        const lang = String(tag === null || tag === undefined ? "en" : tag).toLowerCase();
        if (lang.indexOf("ru") === 0) return COPY.ru;
        if (lang.indexOf("zh") === 0) return COPY.zh;
        return COPY.en;
      } catch (error) {
        return COPY.en;
      }
    }

    function pad2(value) {
      return value < 10 ? "0" + value : String(value);
    }

    /** "01:00-04:00, 06:00-10:00" — the peak blocks as UTC minutes. */
    function utcWindowText() {
      return PEAK_BLOCKS.map(function (block) {
        return pad2(Math.floor(block[0] / 60)) + ":" + pad2(block[0] % 60) +
          "-" + pad2(Math.floor(block[1] / 60)) + ":" + pad2(block[1] % 60);
      }).join(", ");
    }

    /**
     * The same windows in the viewer's own clock. Each boundary is a UTC instant
     * of the current day, read back through the local getters, so a half-hour or
     * DST offset is honoured and a window crossing local midnight prints as such.
     *
     * @param {number} nowMs - reference instant, used only to pick the offset.
     */
    function localWindowText(nowMs) {
      const day = new Date(nowMs);
      const baseUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
      return PEAK_BLOCKS.map(function (block) {
        return block.map(function (minute) {
          const at = new Date(baseUtc + minute * MIN);
          return pad2(at.getHours()) + ":" + pad2(at.getMinutes());
        }).join("-");
      }).join(", ");
    }

    /** The IANA zone name, or a bare offset when the runtime cannot name it. */
    function zoneName(nowMs) {
      try {
        const name = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (typeof name === "string" && name.length > 0) return name;
      } catch (error) {
        // Fall through to the numeric offset.
      }
      const offset = -new Date(nowMs).getTimezoneOffset();
      const sign = offset < 0 ? "-" : "+";
      const absolute = Math.abs(offset);
      return "UTC" + sign + pad2(Math.floor(absolute / 60)) + ":" + pad2(absolute % 60);
    }

    /** Whether the UTC day of `ms` is a weekend. */
    function isWeekend(ms) {
      const day = new Date(ms).getUTCDay();
      return day === 0 || day === 6;
    }

    /** Whether `ms` falls inside a weekday peak window. */
    function inPeak(ms) {
      if (isWeekend(ms)) return false;
      const date = new Date(ms);
      const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
      for (let index = 0; index < PEAK_BLOCKS.length; index++) {
        if (minute >= PEAK_BLOCKS[index][0] && minute < PEAK_BLOCKS[index][1]) return true;
      }
      return false;
    }

    /**
     * First minute-aligned instant at or after the next minute that satisfies
     * `match` — the state change always lands on a minute boundary.
     *
     * @param {number} fromMs - start of the forward scan.
     * @param {(t: number) => boolean} match - predicate.
     * @returns {number|null} the matching instant, or null within the 8-day bound.
     */
    function scanForward(fromMs, match) {
      let t = Math.ceil(fromMs / MIN) * MIN;
      for (let index = 0; index < 60 * 24 * 8; index++) {
        if (match(t)) return t;
        t += MIN;
      }
      return null;
    }

    /** Compact duration: "1d 22h", "8h 36m", "12m 05s". */
    function countdown(ms) {
      if (ms === null || typeof ms !== "number") return "--";
      let seconds = Math.max(0, Math.round(ms / 1000));
      const days = Math.floor(seconds / 86400);
      seconds -= days * 86400;
      const hours = Math.floor(seconds / 3600);
      seconds -= hours * 3600;
      const minutes = Math.floor(seconds / 60);
      seconds -= minutes * 60;
      if (days > 0) return days + "d " + hours + "h";
      if (hours > 0) return hours + "h " + pad2(minutes) + "m";
      return minutes + "m " + pad2(seconds) + "s";
    }

    /** The cell. */
    function OffPeakCell() {
      const state = React.useState(() => Date.now());
      const now = state[0];
      const setNow = state[1];

      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(timer);
      }, []);

      const peak = inPeak(now);
      const weekend = isWeekend(now);
      const target = peak
        ? scanForward(now, (t) => !inPeak(t))
        : scanForward(now, (t) => inPeak(t));
      const t = copy();
      const label = peak ? t.peak : weekend ? t.weekend : t.off;
      const meta = peak ? t.toOff : t.toPeak;
      const stateName = peak ? "peak" : weekend ? "weekend" : "off-peak";

      return React.createElement(
        "span",
        {
          className: "dshOffPeakStrip",
          "data-state": stateName,
          "data-off-peak-indicator": true,
          role: "status",
          title: t.hint(localWindowText(now), utcWindowText(), zoneName(now))
        },
        React.createElement(
          "span",
          { className: "dshOffPeakPill" },
          React.createElement("span", { className: "dshOffPeakDot", "aria-hidden": true }),
          React.createElement("span", { className: "dshOffPeakLabel" }, label),
          React.createElement("span", { className: "dshOffPeakSep", "aria-hidden": true }, "·"),
          React.createElement(
            "span",
            { className: "dshOffPeakMeta" },
            meta + countdown(target === null ? null : target - now)
          )
        )
      );
    }

    /** Insert this widget's stylesheet as an effect, so it leaves with the fiber. */
    function insertStyles(ctx) {
      ctx.effect(() => {
        const element = document.createElement("style");
        element.dataset.plugin = "dsh-off-peak-indicator";
        element.textContent = CSS;
        document.head.appendChild(element);
        return () => {
          if (element.parentNode !== null) element.parentNode.removeChild(element);
        };
      }, "off-peak: stylesheet");
    }

    /**
     * Register the cell.
     *
     * The callback runs INSIDE the slot owner's `register()` call, so it never
     * lets a throw escape: a failed registration costs this cell, while an
     * escaping throw would cost the slot owner's activation.
     *
     * @param {any} ctx - client plugin context.
     */
    function apply(ctx) {
      let slots;
      try {
        slots = ctx.get === undefined ? undefined : ctx.get("slots");
      } catch (error) {
        report("slots service unavailable: " + describe(error));
        return;
      }
      if (slots === undefined || slots === null) return;

      try {
        insertStyles(ctx);
      } catch (error) {
        report("stylesheet insertion failed: " + describe(error));
      }

      try {
        slots.inject(SLOT, () => {
          try {
            return slots.register({ name: SLOT, id: SLOT_ID, order: SLOT_ORDER }, OffPeakCell);
          } catch (error) {
            report("slot registration failed: " + describe(error));
            return function dispose() {};
          }
        });
      } catch (error) {
        report("slot wait failed: " + describe(error));
      }
    }

    exports.apply = apply;
    exports.inject = ["slots"];
  }
})();
