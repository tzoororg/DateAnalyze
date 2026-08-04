// Apply the saved theme before the stylesheet paints to avoid a flash.
(function () {
  var t = localStorage.getItem("theme");
  // migrate legacy theme values from before the dusk-plum/candle/twilight rename
  if (t === "pink") { localStorage.removeItem("theme"); t = null; }
  if (t === "navy") { t = "twilight"; localStorage.setItem("theme", t); }
  if (t) document.documentElement.dataset.theme = t;
  var colors = { plum: "#2a1b26", candle: "#211511", twilight: "#141126" };
  var c = colors[t] || colors.plum; // Plum is the default theme
  document.querySelector('meta[name="theme-color"]').setAttribute("content", c);
})();
