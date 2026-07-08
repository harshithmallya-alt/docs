/*
 * recommend.js — the "analyse the market and recommend funds" engine.
 *
 * Two parts:
 *   marketSnapshot()  – a transparent, date-seeded read of the Indian market
 *                       (Nifty / Midcap / Smallcap direction, an India-VIX-style
 *                       volatility gauge, breadth, sector leaders) that resolves
 *                       to a regime: Bullish / Neutral / Cautious.
 *   recommend(...)    – combines the user's GOAL, their CURRENT allocation and
 *                       the market regime into a concrete "deploy new money
 *                       like this today" plan with specific funds + rationale.
 *
 * IMPORTANT: the snapshot is a deterministic educational MODEL, not a live NSE
 * feed. A static, offline-capable page can't reliably pull real-time exchange
 * data, so we're honest about that in the UI and let the user override the
 * regime. None of this is investment advice — see MFA.DISCLAIMER.
 */
(function (root) {
  "use strict";
  var ASSET = null; // filled at call time from MFA

  // Small deterministic PRNG so "today's read" is stable within a day but
  // moves day to day. Seeded by the date.
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }
  function seeded(dayKey, salt) { return hash(dayKey + "|" + salt); }

  function marketSnapshot(dateOverride) {
    var d = dateOverride ? new Date(dateOverride) : new Date();
    var dayKey = d.toISOString().slice(0, 10);

    // Base drifts, then a day-specific shock. Range roughly ±1.6%.
    function chg(salt, spread) { return +(((seeded(dayKey, salt) - 0.5) * 2) * spread).toFixed(2); }
    var nifty = chg("nifty", 1.2);
    var midcap = +(nifty + chg("mid", 1.1)).toFixed(2);
    var smallcap = +(midcap + chg("small", 1.3)).toFixed(2);
    var vix = +(11 + seeded(dayKey, "vix") * 12).toFixed(1);        // ~11–23
    var breadth = Math.round(30 + seeded(dayKey, "breadth") * 45);   // % advancers

    var SECTORS = ["IT", "Banks", "Auto", "Pharma", "FMCG", "Metals", "Energy", "Realty", "Infra"];
    var ranked = SECTORS.map(function (s) { return { s: s, v: (seeded(dayKey, "sec" + s) - 0.5) * 4 }; })
      .sort(function (a, b) { return b.v - a.v; });
    var leaders = ranked.slice(0, 3).map(function (x) { return { name: x.s, chg: +x.v.toFixed(2) }; });
    var laggards = ranked.slice(-3).reverse().map(function (x) { return { name: x.s, chg: +x.v.toFixed(2) }; });

    var avg = (nifty + midcap + smallcap) / 3;
    var label, tone, note;
    if (avg > 0.35 && vix < 16 && breadth > 50) {
      label = "Bullish"; tone = "good";
      note = "Broad-based buying with low volatility — risk appetite is healthy.";
    } else if (avg < -0.35 || vix > 18 || breadth < 42) {
      label = "Cautious"; tone = "warning";
      note = "Softer breadth / elevated volatility — a defensive tilt is prudent.";
    } else {
      label = "Neutral"; tone = "muted";
      note = "Mixed signals — a balanced, staggered (SIP) deployment fits best.";
    }

    return {
      dayKey: dayKey, label: label, tone: tone, note: note, vix: vix, breadth: breadth,
      indices: [
        { name: "Nifty 50", chg: nifty },
        { name: "Nifty Midcap 150", chg: midcap },
        { name: "Nifty Smallcap 250", chg: smallcap },
      ],
      sectors: { leaders: leaders, laggards: laggards },
    };
  }

  // Target allocation by goal (percent of portfolio).
  function targetFor(goal) {
    if (goal === "safe") return { Equity: 25, Hybrid: 25, Debt: 40, Gold: 10 };
    if (goal === "aggressive") return { Equity: 85, Hybrid: 5, Debt: 5, Gold: 5 };
    return { Equity: 55, Hybrid: 15, Debt: 20, Gold: 10 }; // balanced
  }

  // Preferred equity categories per goal (order = priority).
  function equityPrefs(goal) {
    if (goal === "safe") return ["Index / ETF", "Large Cap"];
    if (goal === "aggressive") return ["Mid Cap", "Small Cap", "Flexi / Multi Cap", "Sectoral / Thematic", "International"];
    return ["Flexi / Multi Cap", "Large Cap", "Large & Mid Cap", "Index / ETF"];
  }

  // Nudge the target + equity prefs by the market regime.
  function applyRegime(target, prefs, regime, goal) {
    var t = Object.assign({}, target);
    var p = prefs.slice();
    if (regime === "Cautious") {
      var shift = Math.min(t.Equity, goal === "aggressive" ? 12 : 8);
      t.Equity -= shift; t.Debt += shift * 0.5; t.Hybrid += shift * 0.25; t.Gold += shift * 0.25;
      p = p.filter(function (c) { return c !== "Small Cap" && c !== "Sectoral / Thematic"; });
      if (p.indexOf("Large Cap") === -1) p.unshift("Large Cap");
      if (p.indexOf("Index / ETF") === -1) p.unshift("Index / ETF");
    } else if (regime === "Bullish") {
      var add = Math.min(t.Debt, 6);
      t.Equity += add; t.Debt -= add;
      if (goal !== "safe") { if (p.indexOf("Mid Cap") === -1) p.unshift("Mid Cap"); }
    }
    // round + renormalise to 100
    var sum = t.Equity + t.Hybrid + t.Debt + t.Gold;
    Object.keys(t).forEach(function (k) { t[k] = +(t[k] / sum * 100).toFixed(1); });
    return { target: t, prefs: p };
  }

  function allocOf(holdings) {
    var by = { Equity: 0, Hybrid: 0, Debt: 0, Gold: 0, International: 0, Other: 0 };
    var total = 0;
    holdings.forEach(function (h) { by[h.asset] = (by[h.asset] || 0) + (h.value || 0); total += (h.value || 0); });
    // fold International into Equity-sleeve view for allocation targeting, but keep a copy
    var out = { Equity: by.Equity + by.International, Hybrid: by.Hybrid, Debt: by.Debt, Gold: by.Gold };
    total = total || 1;
    Object.keys(out).forEach(function (k) { out[k] = +(out[k] / total * 100).toFixed(1); });
    return out;
  }

  function recommend(holdings, goal, regimeOverride, dateOverride) {
    ASSET = root.MFA.ASSET;
    var snap = marketSnapshot(dateOverride);
    var regime = regimeOverride && regimeOverride !== "auto" ? regimeOverride : snap.label;

    var current = allocOf(holdings);
    var base = targetFor(goal);
    var prefsBase = equityPrefs(goal);
    var tuned = applyRegime(base, prefsBase, regime, goal);
    var target = tuned.target;
    var prefs = tuned.prefs;

    // Gap (how far under target each sleeve is). Only positive gaps get new money.
    // New-money split leads with the TARGET mix (so the plan actually looks like
    // the chosen goal), then applies a bounded tilt toward whichever sleeves you
    // are under-weight in. Using target-minus-current directly (not gaps
    // normalised to 100) keeps it stable when the portfolio is already close to
    // target — otherwise a tiny 2% gap would balloon into the whole plan.
    var keys = ["Equity", "Hybrid", "Debt", "Gold"];
    var devSum = 0;
    var split = {};
    keys.forEach(function (k) {
      var dev = target[k] - (current[k] || 0);   // + = under-weight, - = over-weight
      devSum += Math.abs(dev);
      split[k] = Math.max(0, target[k] + 0.6 * dev); // tilt, never below zero
    });
    // Drop trivially small sleeves so we never render a 0.5% pick.
    keys.forEach(function (k) { if (split[k] < 4) split[k] = 0; });
    var ssum = keys.reduce(function (s, k) { return s + split[k]; }, 0) || 1;
    keys.forEach(function (k) { split[k] = +(split[k] / ssum * 100).toFixed(1); });

    var held = {}; holdings.forEach(function (h) { held[h.scheme.toLowerCase().replace(/\s+/g, " ")] = true; });
    var heldAMCs = {}; holdings.forEach(function (h) { heldAMCs[h.amc] = true; });

    var universe = root.MFA.FUND_UNIVERSE;

    function pickFrom(filterFn, wantCategories, n) {
      var cands = universe.filter(filterFn);
      // score
      cands.forEach(function (f) {
        var score = 0;
        // category preference (earlier = better)
        var ci = wantCategories.indexOf(f.category);
        score += ci === -1 ? 0 : (wantCategories.length - ci) * 3;
        // goal-appropriate return/vol
        if (goal === "safe") score += (6 - f.vol) * 1.5 + f.ret * 0.05;
        else if (goal === "aggressive") score += f.ret * 0.25 - f.vol * 0.2;
        else score += (f.ret / f.vol) * 1.2;
        // diversification: reward new fund + new AMC
        var key = f.name.toLowerCase().replace(/\s+/g, " ");
        if (!held[key]) score += 2.5; else score -= 4;
        if (!heldAMCs[f.amc]) score += 1.2;
        f._score = score;
      });
      cands.sort(function (a, b) { return b._score - a._score; });
      return cands.slice(0, n);
    }

    var picks = [];
    function addSleeve(assetKey, weight, funds, reasonBase) {
      if (weight <= 0 || !funds.length) return;
      // split the sleeve weight across the chosen funds (favour the top one)
      var wts = funds.length === 1 ? [1] : funds.length === 2 ? [0.6, 0.4] : [0.5, 0.3, 0.2];
      funds.forEach(function (f, i) {
        picks.push({
          fund: f,
          allocPct: +(weight * wts[i]).toFixed(1),
          rationale: reasonBase(f),
        });
      });
    }

    // Equity sleeve
    addSleeve("Equity", split.Equity,
      pickFrom(function (f) { return f.asset === ASSET.EQUITY || f.asset === ASSET.INTL; }, prefs, goal === "aggressive" ? 3 : 2),
      function (f) {
        return f.category + " exposure fits a " + goal + " goal" +
          (regime === "Bullish" && (f.category.indexOf("Mid") > -1 || f.category.indexOf("Small") > -1) ? "; a bullish tape favours higher-beta equity" :
            regime === "Cautious" && (f.category.indexOf("Large") > -1 || f.category.indexOf("Index") > -1) ? "; a cautious tape favours large-cap/index stability" : "") +
          (!heldAMCs[f.amc] ? "; adds a new fund house (" + f.amc + ")" : "") + ".";
      });

    // Hybrid sleeve
    addSleeve("Hybrid", split.Hybrid,
      pickFrom(function (f) { return f.asset === ASSET.HYBRID; }, ["Hybrid", "Arbitrage"], 1),
      function () { return "Cushions equity drawdowns while still participating in upside — good ballast for a " + goal + " plan."; });

    // Debt sleeve
    addSleeve("Debt", split.Debt,
      pickFrom(function (f) { return f.asset === ASSET.DEBT; }, goal === "safe" ? ["Liquid / Overnight", "Debt", "Gilt"] : ["Debt", "Gilt"], goal === "safe" ? 2 : 1),
      function (f) { return f.category + " brings stability and predictable accrual to lower overall volatility."; });

    // Gold sleeve
    addSleeve("Gold", split.Gold,
      pickFrom(function (f) { return f.asset === ASSET.GOLD; }, ["Gold / Silver"], 1),
      function () { return "Gold is an uncorrelated hedge" + (regime === "Cautious" ? " — especially useful when volatility is elevated" : "") + "."; });

    // Normalise pick weights to 100.
    var wsum = picks.reduce(function (s, p) { return s + p.allocPct; }, 0) || 1;
    picks.forEach(function (p) { p.allocPct = +(p.allocPct / wsum * 100).toFixed(1); });
    picks.sort(function (a, b) { return b.allocPct - a.allocPct; });

    // Actions vs current
    var actions = [];
    ["Equity", "Hybrid", "Debt", "Gold"].forEach(function (k) {
      var delta = +(target[k] - (current[k] || 0)).toFixed(1);
      if (Math.abs(delta) >= 3) actions.push({ asset: k, delta: delta });
    });
    actions.sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });

    var under = actions.filter(function (a) { return a.delta > 0; }).map(function (a) { return a.asset.toLowerCase(); });
    var summary = "Market read is " + regime.toLowerCase() + " (" + snap.note.toLowerCase().replace(/\.$/, "") +
      "). For a " + goal + " goal, the target mix is " + target.Equity + "% equity / " + target.Hybrid +
      "% hybrid / " + target.Debt + "% debt / " + target.Gold + "% gold. " +
      (devSum < 12 ? "Your portfolio is already close to that target, so the plan below deploys fresh money roughly along the target mix."
        : under.length ? "You're currently under-weight " + under.join(" & ") + ", so today's plan tilts new money there while staying anchored to the target mix."
        : "The plan below trims your over-weight sleeves back toward the target mix.");

    return {
      snapshot: snap, regime: regime, goal: goal,
      current: current, target: target, actions: actions,
      picks: picks, summary: summary,
    };
  }

  root.MFA = root.MFA || {};
  root.MFA.marketSnapshot = marketSnapshot;
  root.MFA.recommend = recommend;
})(window);
