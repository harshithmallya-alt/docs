/*
 * charts.js — dependency-free SVG donut charts.
 *
 * Why hand-rolled instead of a chart lib: this app must run from file:// and
 * from any static host with no build step, light + dark, offline. Inline SVG
 * with fills bound to CSS custom properties (var(--series-N)) gives us the
 * validated data-viz palette *and* automatic theme swap in one place.
 *
 * Palette + rules follow the bundled `dataviz` skill: categorical hues are
 * assigned in a FIXED order (never cycled), colour follows the entity (not its
 * rank) via a stable key map, and a 9th+ category folds into "Other".
 */
(function (root) {
  "use strict";

  // Slot index -> CSS var. The vars themselves (light/dark values) live in
  // styles.css so the theme swaps without touching JS.
  function slot(i) { return "var(--series-" + (((i % 8) + 8) % 8 + 1) + ")"; }
  var OTHER_COLOR = "var(--muted-fill)";

  // Fixed colours for the well-known dimensions so the same asset/risk always
  // wears the same hue across every chart on the page.
  var ASSET_COLORS = {
    "Equity": "var(--series-1)",        // blue
    "Hybrid": "var(--series-5)",        // violet
    "Debt": "var(--series-2)",          // aqua
    "Gold": "var(--series-3)",          // yellow
    "International": "var(--series-8)",  // orange
    "Other": "var(--muted-fill)",
  };
  var RISK_COLORS = {
    "Low": "var(--series-2)",           // aqua  (calm)
    "Moderate": "var(--series-1)",      // blue
    "High": "var(--series-3)",          // yellow
    "Very High": "var(--series-6)",     // red   (hot)
  };

  function fmtINR(n) {
    // Indian grouping (lakh/crore style) for whole rupees.
    n = Math.round(n);
    var s = n.toString();
    var neg = s[0] === "-";
    if (neg) s = s.slice(1);
    var last3 = s.slice(-3);
    var rest = s.slice(0, -3);
    if (rest) last3 = "," + last3;
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    return (neg ? "-" : "") + "₹" + rest + last3;
  }
  function fmtShort(n) {
    var a = Math.abs(n);
    if (a >= 1e7) return "₹" + (n / 1e7).toFixed(2) + " Cr";
    if (a >= 1e5) return "₹" + (n / 1e5).toFixed(2) + " L";
    if (a >= 1e3) return "₹" + (n / 1e3).toFixed(1) + "k";
    return "₹" + Math.round(n);
  }

  // Build [{label,value,color}] from a {label:value} map, sorted desc, with
  // everything past `max` folded into "Other". Colours assigned in fixed order.
  function toSeries(map, opts) {
    opts = opts || {};
    var arr = Object.keys(map).map(function (k) { return { label: k, value: map[k] }; });
    arr.sort(function (a, b) { return b.value - a.value; });
    var max = opts.max || 8;
    var out = [];
    var otherTotal = 0;
    arr.forEach(function (d, i) {
      if (i < max - (arr.length > max ? 1 : 0)) {
        var color = opts.colorMap ? (opts.colorMap[d.label] || slot(out.length)) : slot(out.length);
        out.push({ label: d.label, value: d.value, color: color });
      } else {
        otherTotal += d.value;
      }
    });
    if (otherTotal > 0) out.push({ label: "Other", value: otherTotal, color: OTHER_COLOR });
    return out;
  }

  function polar(cx, cy, r, deg) {
    var rad = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }
  function arcPath(cx, cy, rOuter, rInner, a0, a1) {
    var p0 = polar(cx, cy, rOuter, a0), p1 = polar(cx, cy, rOuter, a1);
    var p2 = polar(cx, cy, rInner, a1), p3 = polar(cx, cy, rInner, a0);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return [
      "M", p0[0], p0[1],
      "A", rOuter, rOuter, 0, large, 1, p1[0], p1[1],
      "L", p2[0], p2[1],
      "A", rInner, rInner, 0, large, 0, p3[0], p3[1],
      "Z",
    ].join(" ");
  }

  /*
   * Render a donut into `el`. `series` = [{label,value,color}].
   * `opts.center` = {top, bottom} big number in the hole.
   * Adds a legend with values + % and per-slice hover.
   */
  function donut(el, series, opts) {
    opts = opts || {};
    var total = series.reduce(function (s, d) { return s + d.value; }, 0) || 1;
    var size = 220, cx = size / 2, cy = size / 2;
    var rOuter = 100, rInner = 62, gap = 1.6; // gap in degrees = 2px surface gap feel

    var svg = ['<svg viewBox="0 0 ' + size + ' ' + size + '" class="donut-svg" role="img" aria-label="' + (opts.title || "chart") + '">'];
    var a = 0;
    series.forEach(function (d, i) {
      var frac = d.value / total;
      var a1 = a + frac * 360;
      var start = a + (i === 0 && series.length === 1 ? 0 : gap / 2);
      var end = a1 - (series.length === 1 ? 0 : gap / 2);
      if (end <= start) end = start + 0.001;
      var pct = (frac * 100).toFixed(1);
      svg.push(
        '<path d="' + arcPath(cx, cy, rOuter, rInner, start, end) + '" fill="' + d.color + '" ' +
        'class="slice" tabindex="0" ' +
        'data-label="' + esc(d.label) + '" data-value="' + d.value + '" data-pct="' + pct + '">' +
        '<title>' + esc(d.label) + ": " + fmtShort(d.value) + " (" + pct + "%)</title></path>"
      );
      a = a1;
    });
    // center label
    if (opts.center) {
      svg.push('<text x="' + cx + '" y="' + (cy - 4) + '" class="donut-center-top" text-anchor="middle">' + esc(opts.center.top || "") + "</text>");
      svg.push('<text x="' + cx + '" y="' + (cy + 16) + '" class="donut-center-bottom" text-anchor="middle">' + esc(opts.center.bottom || "") + "</text>");
    }
    svg.push("</svg>");

    var legend = ['<ul class="legend">'];
    series.forEach(function (d) {
      var pct = (d.value / total * 100).toFixed(1);
      legend.push(
        '<li class="legend-item"><span class="swatch" style="background:' + d.color + '"></span>' +
        '<span class="legend-label">' + esc(d.label) + "</span>" +
        '<span class="legend-val">' + (opts.money ? fmtShort(d.value) : d.value) + '</span>' +
        '<span class="legend-pct">' + pct + "%</span></li>"
      );
    });
    legend.push("</ul>");

    el.innerHTML = '<div class="donut-wrap">' + svg.join("") + "</div>" + legend.join("");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  root.MFA = root.MFA || {};
  root.MFA.charts = {
    donut: donut,
    toSeries: toSeries,
    ASSET_COLORS: ASSET_COLORS,
    RISK_COLORS: RISK_COLORS,
    fmtINR: fmtINR,
    fmtShort: fmtShort,
    esc: esc,
  };
})(window);
