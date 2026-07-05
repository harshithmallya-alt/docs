/*
 * sample.js — a realistic demo portfolio so the dashboard is always usable
 * without uploading anything. Values are illustrative.
 */
(function (root) {
  "use strict";
  var raw = [
    { scheme: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth", units: 812.34, nav: 78.9, cost: 45000, value: 64085 },
    { scheme: "Mirae Asset Large Cap Fund - Regular Plan - Growth", units: 420.11, nav: 105.2, cost: 38000, value: 44196 },
    { scheme: "HDFC Mid-Cap Opportunities Fund - Growth", units: 210.5, nav: 168.4, cost: 26000, value: 35449 },
    { scheme: "Nippon India Small Cap Fund - Direct Growth", units: 156.2, nav: 178.6, cost: 20000, value: 27897 },
    { scheme: "UTI Nifty 50 Index Fund - Direct Plan - Growth", units: 980.0, nav: 32.1, cost: 28000, value: 31458 },
    { scheme: "SBI Equity Hybrid Fund - Regular Plan - Growth", units: 340.7, nav: 62.4, cost: 20000, value: 21260 },
    { scheme: "ICICI Prudential Corporate Bond Fund - Growth", units: 900.0, nav: 27.8, cost: 24000, value: 25020 },
    { scheme: "Nippon India Gold Savings Fund - Growth", units: 1100.0, nav: 24.3, cost: 24000, value: 26730 },
  ];
  root.MFA = root.MFA || {};
  root.MFA.sampleHoldings = function () {
    return raw.map(function (h) { return root.MFA.parser.enrich(Object.assign({}, h)); });
  };
})(window);
