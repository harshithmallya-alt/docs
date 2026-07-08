/*
 * app.js — UI controller. Wires uploads → parsing → dashboard → recommendations.
 * State is deliberately tiny: the current holdings array + selected goal.
 */
(function (root) {
  "use strict";
  var MFA = root.MFA;
  var C = MFA.charts;
  var $ = function (id) { return document.getElementById(id); };
  var state = { holdings: [], asOf: null, goal: "balanced", pendingFile: null };

  // ---------- Theme ----------
  function initTheme() {
    var saved = localStorage.getItem("mfa-theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    $("themeToggle").addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      var next = cur === "dark" ? "light" : cur === "light" ? "dark"
        : (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("mfa-theme", next);
    });
  }

  // ---------- Upload wiring ----------
  function initUpload() {
    var dz = $("dropzone"), fi = $("fileInput");
    dz.addEventListener("click", function () { fi.click(); });
    dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("drag"); });
    dz.addEventListener("dragleave", function () { dz.classList.remove("drag"); });
    dz.addEventListener("drop", function (e) {
      e.preventDefault(); dz.classList.remove("drag");
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fi.addEventListener("change", function () { if (fi.files[0]) handleFile(fi.files[0]); });

    $("analysePaste").addEventListener("click", function () {
      var txt = $("pasteBox").value.trim();
      if (!txt) { notice("Paste some statement text first.", true); return; }
      var res = MFA.parser.parseText(txt);
      finishParse(res);
    });
    $("retryPdf").addEventListener("click", function () {
      if (state.pendingFile) handleFile(state.pendingFile, $("pdfPassword").value);
    });
    $("loadSample").addEventListener("click", loadSample);
    $("loadSample2").addEventListener("click", loadSample);
    $("resetBtn").addEventListener("click", function () {
      $("dashboard").classList.add("hidden");
      $("uploadSection").classList.remove("hidden");
      notice("", false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("dlTemplate").addEventListener("click", function (e) {
      e.preventDefault();
      var csv = "Scheme,Units,NAV,Value,Cost\n" +
        "Parag Parikh Flexi Cap Fund - Direct Growth,812.34,78.9,64085,45000\n" +
        "ICICI Prudential Corporate Bond Fund - Growth,900,27.8,25020,24000\n";
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = "portfolio-template.csv"; a.click();
    });
  }

  function handleFile(file, password) {
    state.pendingFile = file;
    var name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      file.text().then(function (t) { finishParse(MFA.parser.parseCSV(t)); });
    } else if (name.endsWith(".txt")) {
      file.text().then(function (t) { finishParse(MFA.parser.parseText(t)); });
    } else {
      notice('<span class="spin" style="border-top-color:var(--accent);border-color:var(--border);border-top-color:var(--accent)"></span> Reading PDF…', false);
      MFA.parser.parsePDF(file, password).then(function (res) {
        if (res.needsPassword) { $("pwField").style.display = "block"; notice(res.warnings[0], true); return; }
        finishParse(res);
      });
    }
  }

  function finishParse(res) {
    if (res.warnings && res.warnings.length && (!res.holdings || !res.holdings.length)) {
      notice(res.warnings.join(" "), true);
      return;
    }
    state.holdings = res.holdings;
    state.asOf = res.asOf || null;
    if (res.warnings && res.warnings.length) notice(res.warnings.join(" "), true); else notice("", false);
    renderDashboard();
  }

  function loadSample() {
    state.holdings = MFA.sampleHoldings();
    state.asOf = "sample data";
    notice("", false);
    renderDashboard();
  }

  function notice(html, isWarn) {
    var el = $("uploadNotice");
    if (!html) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="notice ' + (isWarn ? "warn" : "") + '">' + html + "</div>";
  }

  // ---------- Dashboard ----------
  function totals() {
    var value = 0, cost = 0, hasCost = false;
    state.holdings.forEach(function (h) {
      value += h.value || 0;
      if (h.cost > 0) { cost += h.cost; hasCost = true; }
    });
    return { value: value, cost: cost, hasCost: hasCost, gain: value - cost, gainPct: cost ? (value - cost) / cost * 100 : 0 };
  }

  function groupSum(keyFn) {
    var m = {};
    state.holdings.forEach(function (h) { var k = keyFn(h); m[k] = (m[k] || 0) + (h.value || 0); });
    return m;
  }

  function renderDashboard() {
    $("uploadSection").classList.add("hidden");
    var dash = $("dashboard");
    dash.classList.remove("hidden");
    dash.classList.add("fade-in");
    $("disclaimer").textContent = MFA.DISCLAIMER;
    $("asOf").textContent = state.asOf ? "As of " + state.asOf : "";

    var t = totals();
    var equityVal = state.holdings.reduce(function (s, h) {
      return s + ((h.asset === MFA.ASSET.EQUITY || h.asset === MFA.ASSET.INTL) ? (h.value || 0) : 0);
    }, 0);
    var amcs = Object.keys(groupSum(function (h) { return h.amc; })).length;

    // KPIs
    var gainClass = t.gain >= 0 ? "up" : "down";
    var gainStr = t.hasCost
      ? (t.gain >= 0 ? "+" : "") + C.fmtShort(t.gain) + " (" + (t.gainPct >= 0 ? "+" : "") + t.gainPct.toFixed(1) + "%)"
      : "cost basis not in statement";
    $("kpiRow").innerHTML = [
      kpi("Current value", C.fmtINR(t.value), t.hasCost ? "Invested " + C.fmtShort(t.cost) : "&nbsp;"),
      kpi("Overall gain/loss", t.hasCost ? (t.gain >= 0 ? "+" : "") + t.gainPct.toFixed(1) + "%" : "—", gainStr, t.hasCost ? gainClass : ""),
      kpi("Schemes", String(state.holdings.length), amcs + " fund house" + (amcs === 1 ? "" : "s")),
      kpi("Equity exposure", (t.value ? (equityVal / t.value * 100).toFixed(0) : 0) + "%", "of total portfolio"),
    ].join("");

    // Charts
    var assetSeries = C.toSeries(groupSum(function (h) { return h.asset; }), { colorMap: C.ASSET_COLORS });
    var catSeries = C.toSeries(groupSum(function (h) { return h.category; }), { max: 8 });
    var amcSeries = C.toSeries(groupSum(function (h) { return h.amc; }), { max: 7 });
    // risk uses fixed order + colours
    var riskMap = groupSum(function (h) { return h.risk; });
    var riskSeries = MFA.RISK_ORDER.filter(function (r) { return riskMap[r]; })
      .map(function (r) { return { label: r, value: riskMap[r], color: C.RISK_COLORS[r] }; });

    $("chartsGrid").innerHTML =
      chartCard("byAsset", "Allocation by asset class", "Equity vs debt vs hybrid vs gold") +
      chartCard("byCat", "Allocation by category", "Where your equity/debt sits") +
      chartCard("byAmc", "Allocation by fund house", "Concentration across AMCs") +
      chartCard("byRisk", "Allocation by risk level", "Low → Very High risk buckets");

    C.donut($("byAsset"), assetSeries, { money: true, center: { top: "Total", bottom: C.fmtShort(t.value) }, title: "Allocation by asset class" });
    C.donut($("byCat"), catSeries, { money: true, title: "Allocation by category" });
    C.donut($("byAmc"), amcSeries, { money: true, title: "Allocation by fund house" });
    C.donut($("byRisk"), riskSeries, { money: true, title: "Allocation by risk level" });

    renderHoldings(t.value);

    // reset recommendation panel
    $("recResult").classList.add("hidden");
    $("recResult").innerHTML = "";
    dash.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function kpi(label, val, sub, cls) {
    return '<div class="card kpi"><div class="k-label">' + label + '</div>' +
      '<div class="k-val">' + val + '</div>' +
      '<div class="k-sub ' + (cls || "") + '">' + sub + '</div></div>';
  }
  function chartCard(id, title, sub) {
    return '<div class="card chart-card"><h3>' + title + '</h3><div class="csub">' + sub + '</div><div id="' + id + '"></div></div>';
  }

  function renderHoldings(total) {
    var rows = state.holdings.slice().sort(function (a, b) { return (b.value || 0) - (a.value || 0); });
    var head = "<thead><tr>" +
      "<th>Scheme</th><th>Category</th><th class='num'>Units</th><th class='num'>NAV</th>" +
      "<th class='num'>Value</th><th class='num'>Weight</th><th class='num'>Gain</th></tr></thead>";
    var body = rows.map(function (h) {
      var w = total ? (h.value / total * 100) : 0;
      var gain = (h.gainPct != null && isFinite(h.gainPct))
        ? "<span class='" + (h.gainPct >= 0 ? "pos" : "neg") + "'>" + (h.gainPct >= 0 ? "+" : "") + h.gainPct.toFixed(1) + "%</span>"
        : "<span style='color:var(--muted)'>—</span>";
      return "<tr>" +
        "<td>" + C.esc(h.scheme) + "</td>" +
        "<td><span class='tag'>" + C.esc(h.category) + "</span></td>" +
        "<td class='num'>" + (isFinite(h.units) ? h.units.toLocaleString("en-IN", { maximumFractionDigits: 3 }) : "—") + "</td>" +
        "<td class='num'>" + (isFinite(h.nav) ? "₹" + h.nav.toFixed(2) : "—") + "</td>" +
        "<td class='num'>" + C.fmtINR(h.value || 0) + "</td>" +
        "<td class='num'>" + w.toFixed(1) + "%</td>" +
        "<td class='num'>" + gain + "</td>" +
        "</tr>";
    }).join("");
    $("holdingsTable").innerHTML = head + "<tbody>" + body + "</tbody>";
  }

  // ---------- Recommendations ----------
  function initRec() {
    $("goalGroup").addEventListener("click", function (e) {
      var b = e.target.closest(".goal-pill"); if (!b) return;
      state.goal = b.getAttribute("data-goal");
      [].forEach.call(this.querySelectorAll(".goal-pill"), function (p) { p.classList.toggle("active", p === b); });
    });
    $("analyseMarket").addEventListener("click", function () {
      var btn = this;
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Reading the market…';
      // brief delay so the "analysing" state is visible; the compute is instant.
      setTimeout(function () {
        var rec = MFA.recommend(state.holdings, state.goal, $("regimeSel").value);
        renderRec(rec);
        btn.disabled = false;
        btn.innerHTML = "📈 Analyse market &amp; recommend";
      }, 450);
    });
  }

  function miniRing(pct, color) {
    var r = 22, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return '<svg class="alloc-ring" viewBox="0 0 54 54">' +
      '<circle cx="27" cy="27" r="' + r + '" fill="none" stroke="var(--grid)" stroke-width="6"/>' +
      '<circle cx="27" cy="27" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="6" ' +
      'stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 27 27)"/>' +
      '<text x="27" y="31" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text-primary)">' + Math.round(pct) + '</text></svg>';
  }

  function renderRec(rec) {
    var s = rec.snapshot;
    var el = $("recResult");
    el.classList.remove("hidden");
    el.classList.add("fade-in");

    function idx(i) {
      var cls = i.chg >= 0 ? "up" : "down";
      return '<div class="card mkt"><div class="m-name">' + i.name + '</div>' +
        '<div class="m-val ' + (i.chg >= 0 ? "pos" : "neg") + '">' + (i.chg >= 0 ? "+" : "") + i.chg + '%</div></div>';
    }
    var leaders = s.sectors.leaders.map(function (x) { return '<span class="chip up">▲ ' + x.name + " " + (x.chg >= 0 ? "+" : "") + x.chg + "%</span>"; }).join("");
    var laggards = s.sectors.laggards.map(function (x) { return '<span class="chip down">▼ ' + x.name + " " + x.chg + "%</span>"; }).join("");

    var picks = rec.picks.map(function (p) {
      var f = p.fund;
      return '<div class="pick">' +
        '<div>' + miniRing(p.allocPct, C.ASSET_COLORS[f.asset] || "var(--accent)") + '</div>' +
        '<div><div class="p-name">' + C.esc(f.name) + '</div>' +
        '<div class="p-meta">' + C.esc(f.category) + ' · ' + C.esc(f.asset) + ' · ' + f.risk + ' risk · ~' + f.ret + '% hist. 5Y</div>' +
        '<div class="p-rat">' + C.esc(p.rationale) + '</div></div>' +
        '<div class="p-alloc"><div class="pa-num">' + p.allocPct + '%</div><div class="pa-lbl">of new SIP</div></div>' +
        '</div>';
    }).join("");

    var actions = rec.actions.map(function (a) {
      var up = a.delta > 0;
      return '<span class="chip ' + (up ? "up" : "down") + '">' + (up ? "▲ add " : "▼ trim ") + Math.abs(a.delta) + "% " + a.asset + "</span>";
    }).join("") || '<span class="chip">Portfolio already close to target</span>';

    el.innerHTML =
      '<div class="card pad" style="margin-top:16px">' +
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
          '<span class="regime-badge regime-' + s.tone + '"><span class="rd"></span>Market: ' + s.label + '</span>' +
          '<span class="hint">India VIX-style gauge: <b>' + s.vix + '</b> · Breadth: <b>' + s.breadth + '%</b> advancing · Model read for ' + s.dayKey + '</span>' +
        '</div>' +
        '<div class="market-strip">' + rec.snapshot.indices.map(idx).join("") + '</div>' +
        '<div class="chips" style="margin-top:12px">' + leaders + laggards + '</div>' +
        '<p style="font-size:14px;margin:16px 0 0;color:var(--text-secondary)">' + C.esc(rec.summary) + '</p>' +
        '<div class="chips" style="margin-top:10px">' + actions + '</div>' +
      '</div>' +
      '<div class="card pad" style="margin-top:16px">' +
        '<div class="section-title" style="margin-bottom:6px">Suggested funds for a ' + rec.goal + ' goal today</div>' +
        '<p class="hint" style="margin:0 0 8px">How to split fresh money (a monthly SIP or lump sum) across ideas that move you toward your target mix. Percentages sum to 100%.</p>' +
        picks +
      '</div>' +
      '<div class="notice" style="background:var(--surface-2);border:1px solid var(--border);margin-top:14px;font-size:12px;color:var(--muted)">' +
        'This is a rules-based educational model, not live exchange data or personalised advice. The market read is a deterministic daily model so a static page can work offline; use “Market view” to explore other scenarios.' +
      '</div>';
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", function () {
    initTheme(); initUpload(); initRec();
    $("disclaimer").textContent = MFA.DISCLAIMER;
  });
})(window);
