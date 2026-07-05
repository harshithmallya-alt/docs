/*
 * parser.js — turn a CAMS statement into holdings the dashboard understands.
 *
 * Three input paths, all best-effort:
 *   parsePDF(file, password)  – a CAMS / KFintech Consolidated Account
 *                               Statement (CAS) PDF, using pdf.js if present.
 *   parseText(text)           – the same statement pasted as plain text.
 *   parseCSV(text)            – a simple columnar export / the app's template.
 *
 * A holding: { scheme, folio, amc, units, nav, value, cost, category, asset,
 *              risk, gain, gainPct }.
 * Parsing never throws to the UI: it returns { holdings, asOf, warnings, raw }.
 */
(function (root) {
  "use strict";

  function num(s) {
    if (s == null) return NaN;
    var v = parseFloat(String(s).replace(/[₹,\s]/g, ""));
    return isFinite(v) ? v : NaN;
  }

  function enrich(h) {
    var cat = root.MFA.categorize(h.scheme);
    h.category = h.category || cat.category;
    h.asset = h.asset || cat.asset;
    h.risk = h.risk || cat.risk;
    h.amc = h.amc || root.MFA.amcOf(h.scheme);
    if (!(h.value > 0) && h.units > 0 && h.nav > 0) h.value = h.units * h.nav;
    if (h.cost > 0 && h.value > 0) {
      h.gain = h.value - h.cost;
      h.gainPct = (h.gain / h.cost) * 100;
    }
    return h;
  }

  // ---- CAS text (from PDF text layer or a paste) -------------------------
  function parseText(text) {
    var warnings = [];
    var lines = text.split(/\r?\n/).map(function (l) { return l.replace(/\s+/g, " ").trim(); })
      .filter(function (l) { return l.length; });

    var holdings = [];
    var cur = null;
    var asOf = null;

    // Lines we must never mistake for a scheme header.
    var NOISE = /(closing unit balance|opening unit balance|nav on|market value|total cost|folio no|registrar|nominee|pan|kyc|statement|address|email|mobile|page \d|consolidated account|valuation|systematic|redemption|purchase|switch|reinvest|stamp duty|www\.|amfi|isin)/i;
    // A scheme header: has fund-ish words, a plan/option, and is not noise.
    var SCHEME = /([A-Za-z0-9 .&'()\/-]*(?:fund|scheme)[A-Za-z0-9 .&'()\/-]*(?:growth|idcw|dividend|reinvest|payout|plan|option|direct|regular)?)/i;

    function flush() { if (cur && (cur.value > 0 || cur.units > 0)) holdings.push(enrich(cur)); cur = null; }

    lines.forEach(function (line) {
      var mDate = line.match(/(?:market value|nav)\s+on\s+(\d{1,2}[-\/ ][A-Za-z]{3,}[-\/ ]\d{2,4})/i);
      if (mDate && !asOf) asOf = mDate[1];

      // Scheme header detection.
      if (!NOISE.test(line) && /fund|scheme/i.test(line) && /growth|idcw|dividend|plan|option|direct|regular|reinvest|payout/i.test(line)) {
        // strip a leading AMFI/registrar code like "HDFC0001-" or "128TSDGG-"
        var name = line.replace(/^[A-Z0-9]{4,}\s*-\s*/, "")
          .replace(/\bregistrar\b.*$/i, "")
          .replace(/\(.*?advisor.*?\)/i, "")
          .replace(/\bISIN\b.*$/i, "")
          .trim();
        if (name.length > 6) {
          flush();
          cur = { scheme: name, units: NaN, nav: NaN, value: NaN, cost: NaN };
          return;
        }
      }
      if (!cur) return;

      var mFolio = line.match(/folio no[:.\s]*([0-9\/ ]+)/i);
      if (mFolio) cur.folio = mFolio[1].trim();

      var mUnits = line.match(/closing unit balance[:\s]*([\d,]+\.\d+)/i);
      if (mUnits) cur.units = num(mUnits[1]);

      var mNav = line.match(/nav on[^:]*[:\s]*(?:inr|rs\.?)?\s*([\d,]+\.\d+)/i);
      if (mNav) cur.nav = num(mNav[1]);

      var mCost = line.match(/total cost value[:\s]*([\d,]+\.\d+)/i);
      if (mCost) cur.cost = num(mCost[1]);

      var mVal = line.match(/market value(?:ation)? on[^:]*[:\s]*(?:inr|rs\.?)?\s*([\d,]+\.\d+)/i);
      if (mVal) cur.value = num(mVal[1]);
    });
    flush();

    if (!holdings.length) warnings.push("Couldn't recognise any schemes in this text. It may not be a CAMS/KFintech statement, or the layout differs. Try the CSV template or the sample.");
    return { holdings: holdings, asOf: asOf, warnings: warnings, raw: text };
  }

  // ---- CSV / template ----------------------------------------------------
  function splitCSVLine(line) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === "," && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
  }

  function parseCSV(text) {
    var warnings = [];
    var rows = text.split(/\r?\n/).filter(function (l) { return l.trim().length; });
    if (!rows.length) return { holdings: [], warnings: ["Empty file."], raw: text };
    var header = splitCSVLine(rows[0]).map(function (h) { return h.toLowerCase(); });

    function col(names) {
      for (var i = 0; i < header.length; i++) {
        for (var j = 0; j < names.length; j++) if (header[i].indexOf(names[j]) !== -1) return i;
      }
      return -1;
    }
    var iScheme = col(["scheme", "fund", "name"]);
    var iUnits = col(["unit", "balance", "quantity"]);
    var iNav = col(["nav", "price"]);
    var iValue = col(["market", "current value", "value", "amount"]);
    var iCost = col(["cost", "invested", "purchase"]);
    var iCat = col(["category", "type"]);
    var iAmc = col(["amc", "house", "fund family"]);

    if (iScheme === -1) {
      warnings.push('No "scheme"/"fund" column found. Expected a header row like: Scheme,Units,NAV,Value,Cost');
      return { holdings: [], warnings: warnings, raw: text };
    }
    var holdings = [];
    for (var r = 1; r < rows.length; r++) {
      var c = splitCSVLine(rows[r]);
      var scheme = c[iScheme];
      if (!scheme) continue;
      var h = {
        scheme: scheme,
        units: iUnits > -1 ? num(c[iUnits]) : NaN,
        nav: iNav > -1 ? num(c[iNav]) : NaN,
        value: iValue > -1 ? num(c[iValue]) : NaN,
        cost: iCost > -1 ? num(c[iCost]) : NaN,
        category: iCat > -1 ? c[iCat] : "",
        amc: iAmc > -1 ? c[iAmc] : "",
      };
      enrich(h);
      if (h.value > 0 || h.units > 0) holdings.push(h);
    }
    if (!holdings.length) warnings.push("No usable rows found in the CSV.");
    return { holdings: holdings, warnings: warnings, raw: text };
  }

  // ---- PDF (optional; needs pdf.js loaded as window.pdfjsLib) ------------
  function parsePDF(file, password) {
    return new Promise(function (resolve) {
      if (!root.pdfjsLib) {
        resolve({ holdings: [], warnings: ["PDF support needs an internet connection to load the PDF engine. Paste the statement text or use the CSV template instead."], raw: "" });
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var task = root.pdfjsLib.getDocument({ data: new Uint8Array(reader.result), password: password || "" });
        task.promise.then(function (pdf) {
          var pages = [];
          for (var i = 1; i <= pdf.numPages; i++) pages.push(pdf.getPage(i));
          Promise.all(pages).then(function (ps) {
            return Promise.all(ps.map(function (p) {
              return p.getTextContent().then(function (tc) {
                // Reconstruct lines from text items by their y position.
                var byY = {};
                tc.items.forEach(function (it) {
                  var y = Math.round(it.transform[5]);
                  (byY[y] = byY[y] || []).push({ x: it.transform[4], s: it.str });
                });
                return Object.keys(byY).map(Number).sort(function (a, b) { return b - a; })
                  .map(function (y) {
                    return byY[y].sort(function (a, b) { return a.x - b.x; })
                      .map(function (t) { return t.s; }).join(" ");
                  }).join("\n");
              });
            }));
          }).then(function (texts) {
            var res = parseText(texts.join("\n"));
            if (!res.holdings.length && !res.warnings.length) res.warnings.push("Parsed the PDF but found no schemes.");
            resolve(res);
          });
        }).catch(function (err) {
          var msg = /password/i.test(err && err.message || "")
            ? "This PDF is password protected. Enter the password (usually your PAN in capitals) and try again."
            : "Couldn't read this PDF (" + (err && err.name || "error") + "). Try pasting the text or using the CSV template.";
          resolve({ holdings: [], warnings: [msg], needsPassword: /password/i.test(err && err.message || ""), raw: "" });
        });
      };
      reader.readAsArrayBuffer(file);
    });
  }

  root.MFA = root.MFA || {};
  root.MFA.parser = { parseText: parseText, parseCSV: parseCSV, parsePDF: parsePDF, enrich: enrich };
})(window);
