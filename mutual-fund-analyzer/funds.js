/*
 * funds.js
 * ---------
 * Two things live here:
 *   1. categorize()  — infers category / asset-class / risk from a scheme name.
 *      This is what turns a raw CAMS scheme name into something the dashboard
 *      can group and colour.
 *   2. FUND_UNIVERSE — a curated list of well-known, widely-available Indian
 *      mutual funds used by the recommendation engine. Return figures are
 *      *illustrative historical* ranges, NOT forecasts. See DISCLAIMER.
 *
 * Everything is attached to window.MFA so plain <script> tags (file:// safe)
 * can share state without ES modules.
 */
(function (root) {
  "use strict";

  // Asset classes drive the top-level allocation view + colours.
  var ASSET = {
    EQUITY: "Equity",
    HYBRID: "Hybrid",
    DEBT: "Debt",
    GOLD: "Gold",
    INTL: "International",
    OTHER: "Other",
  };

  // Ordered so the "safest first" reads left-to-right in legends.
  var RISK = {
    LOW: "Low",
    MODERATE: "Moderate",
    HIGH: "High",
    VERY_HIGH: "Very High",
  };

  // Keyword rules, checked in order. First match wins, so put the most
  // specific patterns first (e.g. "small cap" before generic "equity").
  var RULES = [
    { re: /\b(liquid|overnight|money market|ultra[\s-]?short)\b/i, category: "Liquid / Overnight", asset: ASSET.DEBT, risk: RISK.LOW },
    { re: /\b(gilt|g-?sec|government securities)\b/i, category: "Gilt", asset: ASSET.DEBT, risk: RISK.LOW },
    { re: /\b(corporate bond|banking\s*&?\s*psu|short duration|low duration|dynamic bond|credit risk|floater|medium duration|long duration|income)\b/i, category: "Debt", asset: ASSET.DEBT, risk: RISK.LOW },
    { re: /\b(gold|silver)\b/i, category: "Gold / Silver", asset: ASSET.GOLD, risk: RISK.MODERATE },
    { re: /\b(us|nasdaq|s&p 500|global|international|greater china|emerging market|world|fang)\b/i, category: "International", asset: ASSET.INTL, risk: RISK.VERY_HIGH },
    { re: /\b(arbitrage)\b/i, category: "Arbitrage", asset: ASSET.HYBRID, risk: RISK.LOW },
    { re: /\b(balanced advantage|dynamic asset|equity savings|multi asset|conservative hybrid|aggressive hybrid|balanced|hybrid)\b/i, category: "Hybrid", asset: ASSET.HYBRID, risk: RISK.MODERATE },
    { re: /\b(elss|tax saver|tax saving|long term equity)\b/i, category: "ELSS (Tax Saver)", asset: ASSET.EQUITY, risk: RISK.HIGH },
    { re: /\b(small\s?cap)\b/i, category: "Small Cap", asset: ASSET.EQUITY, risk: RISK.VERY_HIGH },
    { re: /\b(mid\s?cap)\b/i, category: "Mid Cap", asset: ASSET.EQUITY, risk: RISK.VERY_HIGH },
    { re: /\b(large\s?&?\s?mid|large and mid)\b/i, category: "Large & Mid Cap", asset: ASSET.EQUITY, risk: RISK.HIGH },
    { re: /\b(flexi\s?cap|multi\s?cap|focused)\b/i, category: "Flexi / Multi Cap", asset: ASSET.EQUITY, risk: RISK.HIGH },
    { re: /\b(index|nifty|sensex|bse|etf)\b/i, category: "Index / ETF", asset: ASSET.EQUITY, risk: RISK.HIGH },
    { re: /\b(sectoral|thematic|technology|pharma|healthcare|banking|financial services|infrastructure|consumption|energy|manufacturing|digital|psu equity)\b/i, category: "Sectoral / Thematic", asset: ASSET.EQUITY, risk: RISK.VERY_HIGH },
    { re: /\b(large\s?cap|bluechip|top 100|top 200)\b/i, category: "Large Cap", asset: ASSET.EQUITY, risk: RISK.HIGH },
    { re: /\b(value|dividend yield|contra)\b/i, category: "Value / Contra", asset: ASSET.EQUITY, risk: RISK.HIGH },
    { re: /\b(equity|growth)\b/i, category: "Equity (Other)", asset: ASSET.EQUITY, risk: RISK.HIGH },
  ];

  function categorize(name) {
    var n = (name || "").toString();
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].re.test(n)) {
        return { category: RULES[i].category, asset: RULES[i].asset, risk: RULES[i].risk };
      }
    }
    return { category: "Unclassified", asset: ASSET.OTHER, risk: RISK.MODERATE };
  }

  // Also expose the AMC name pulled from the scheme string (first token-ish).
  var AMC_HINTS = [
    "HDFC", "ICICI Prudential", "ICICI", "SBI", "Axis", "Nippon India", "Nippon",
    "Kotak", "Aditya Birla Sun Life", "Aditya Birla", "Mirae Asset", "Mirae",
    "UTI", "DSP", "Franklin", "Tata", "Canara Robeco", "Canara", "Edelweiss",
    "Motilal Oswal", "Motilal", "PPFAS", "Parag Parikh", "Quant", "Invesco",
    "Sundaram", "HSBC", "Bandhan", "IDFC", "Baroda BNP Paribas", "PGIM",
    "Mahindra Manulife", "LIC", "JM Financial", "WhiteOak", "Bank of India",
    "Navi", "Groww", "Zerodha", "360 ONE", "NJ", "Samco", "Trust", "Helios",
  ];

  function amcOf(name) {
    var n = (name || "").toString();
    for (var i = 0; i < AMC_HINTS.length; i++) {
      // word-boundary-ish, case-insensitive
      var h = AMC_HINTS[i];
      if (new RegExp("(^|\\b)" + h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(n)) {
        // Normalise a couple of common short forms to their full house name.
        if (h === "ICICI") return "ICICI Prudential";
        if (h === "Nippon") return "Nippon India";
        if (h === "Aditya Birla") return "Aditya Birla Sun Life";
        if (h === "Mirae") return "Mirae Asset";
        if (h === "Motilal") return "Motilal Oswal";
        if (h === "Parag Parikh") return "PPFAS";
        if (h === "Canara") return "Canara Robeco";
        return h;
      }
    }
    return "Other";
  }

  /*
   * Curated universe for recommendations. Each fund carries:
   *   name, amc, category, asset, risk, ret (illustrative ~5Y CAGR %),
   *   vol (relative volatility 1-5), tags.
   * Figures are round, illustrative and clearly not advice — the engine uses
   * them only to rank within a risk bucket, never as a promise.
   */
  var FUND_UNIVERSE = [
    // --- Debt / very defensive ---
    { name: "ICICI Prudential Liquid Fund", amc: "ICICI Prudential", category: "Liquid / Overnight", asset: ASSET.DEBT, risk: RISK.LOW, ret: 6.5, vol: 1 },
    { name: "HDFC Corporate Bond Fund", amc: "HDFC", category: "Debt", asset: ASSET.DEBT, risk: RISK.LOW, ret: 7.2, vol: 1 },
    { name: "SBI Magnum Gilt Fund", amc: "SBI", category: "Gilt", asset: ASSET.DEBT, risk: RISK.LOW, ret: 7.5, vol: 2 },
    { name: "Kotak Arbitrage Fund", amc: "Kotak", category: "Arbitrage", asset: ASSET.HYBRID, risk: RISK.LOW, ret: 6.8, vol: 1 },

    // --- Hybrid / balanced ---
    { name: "ICICI Prudential Balanced Advantage Fund", amc: "ICICI Prudential", category: "Hybrid", asset: ASSET.HYBRID, risk: RISK.MODERATE, ret: 12.5, vol: 2 },
    { name: "HDFC Balanced Advantage Fund", amc: "HDFC", category: "Hybrid", asset: ASSET.HYBRID, risk: RISK.MODERATE, ret: 15.0, vol: 3 },
    { name: "SBI Equity Hybrid Fund", amc: "SBI", category: "Hybrid", asset: ASSET.HYBRID, risk: RISK.MODERATE, ret: 14.0, vol: 3 },
    { name: "Edelweiss Balanced Advantage Fund", amc: "Edelweiss", category: "Hybrid", asset: ASSET.HYBRID, risk: RISK.MODERATE, ret: 13.5, vol: 2 },

    // --- Gold ---
    { name: "Nippon India Gold Savings Fund", amc: "Nippon India", category: "Gold / Silver", asset: ASSET.GOLD, risk: RISK.MODERATE, ret: 13.0, vol: 3 },

    // --- Large cap / index (core equity) ---
    { name: "UTI Nifty 50 Index Fund", amc: "UTI", category: "Index / ETF", asset: ASSET.EQUITY, risk: RISK.HIGH, ret: 15.0, vol: 3 },
    { name: "ICICI Prudential Nifty Next 50 Index Fund", amc: "ICICI Prudential", category: "Index / ETF", asset: ASSET.EQUITY, risk: RISK.HIGH, ret: 16.0, vol: 4 },
    { name: "Mirae Asset Large Cap Fund", amc: "Mirae Asset", category: "Large Cap", asset: ASSET.EQUITY, risk: RISK.HIGH, ret: 15.5, vol: 3 },
    { name: "ICICI Prudential Bluechip Fund", amc: "ICICI Prudential", category: "Large Cap", asset: ASSET.EQUITY, risk: RISK.HIGH, ret: 16.5, vol: 3 },
    { name: "Nippon India Large Cap Fund", amc: "Nippon India", category: "Large Cap", asset: ASSET.EQUITY, risk: RISK.HIGH, ret: 17.5, vol: 3 },

    // --- Flexi / multi cap (all-rounder equity) ---
    { name: "Parag Parikh Flexi Cap Fund", amc: "PPFAS", category: "Flexi / Multi Cap", asset: ASSET.EQUITY, risk: RISK.HIGH, ret: 19.0, vol: 3 },
    { name: "HDFC Flexi Cap Fund", amc: "HDFC", category: "Flexi / Multi Cap", asset: ASSET.EQUITY, risk: RISK.HIGH, ret: 18.5, vol: 4 },
    { name: "Kotak Flexicap Fund", amc: "Kotak", category: "Flexi / Multi Cap", asset: ASSET.EQUITY, risk: RISK.HIGH, ret: 16.0, vol: 3 },

    // --- ELSS ---
    { name: "Mirae Asset ELSS Tax Saver Fund", amc: "Mirae Asset", category: "ELSS (Tax Saver)", asset: ASSET.EQUITY, risk: RISK.HIGH, ret: 17.0, vol: 4 },

    // --- Large & mid ---
    { name: "Kotak Equity Opportunities Fund", amc: "Kotak", category: "Large & Mid Cap", asset: ASSET.EQUITY, risk: RISK.HIGH, ret: 18.0, vol: 4 },

    // --- Mid cap (aggressive) ---
    { name: "HDFC Mid-Cap Opportunities Fund", amc: "HDFC", category: "Mid Cap", asset: ASSET.EQUITY, risk: RISK.VERY_HIGH, ret: 22.0, vol: 4 },
    { name: "Motilal Oswal Midcap Fund", amc: "Motilal Oswal", category: "Mid Cap", asset: ASSET.EQUITY, risk: RISK.VERY_HIGH, ret: 24.0, vol: 5 },

    // --- Small cap (very aggressive) ---
    { name: "Nippon India Small Cap Fund", amc: "Nippon India", category: "Small Cap", asset: ASSET.EQUITY, risk: RISK.VERY_HIGH, ret: 25.0, vol: 5 },
    { name: "Quant Small Cap Fund", amc: "Quant", category: "Small Cap", asset: ASSET.EQUITY, risk: RISK.VERY_HIGH, ret: 27.0, vol: 5 },

    // --- Thematic / international (satellite, aggressive) ---
    { name: "ICICI Prudential Technology Fund", amc: "ICICI Prudential", category: "Sectoral / Thematic", asset: ASSET.EQUITY, risk: RISK.VERY_HIGH, ret: 20.0, vol: 5 },
    { name: "Motilal Oswal Nasdaq 100 FOF", amc: "Motilal Oswal", category: "International", asset: ASSET.INTL, risk: RISK.VERY_HIGH, ret: 21.0, vol: 5 },
  ];

  var DISCLAIMER =
    "For educational use only. This tool does not provide investment advice. " +
    "Fund names and return figures are illustrative and based on historical " +
    "ranges — past performance does not guarantee future results. Mutual fund " +
    "investments are subject to market risks; read all scheme related documents " +
    "carefully. Consult a SEBI-registered investment adviser before investing.";

  root.MFA = root.MFA || {};
  root.MFA.ASSET = ASSET;
  root.MFA.RISK = RISK;
  root.MFA.RISK_ORDER = [RISK.LOW, RISK.MODERATE, RISK.HIGH, RISK.VERY_HIGH];
  root.MFA.categorize = categorize;
  root.MFA.amcOf = amcOf;
  root.MFA.FUND_UNIVERSE = FUND_UNIVERSE;
  root.MFA.DISCLAIMER = DISCLAIMER;
})(window);
