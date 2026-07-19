// Apply the saved theme before the stylesheet paints to avoid a flash.
(function () {
  var t = localStorage.getItem("theme");
  if (t) document.documentElement.dataset.theme = t;
  var colors = { pink: "#e8577e", plum: "#2a1b26", navy: "#0d1220" };
  var c = colors[t] || colors.plum; // Plum is the default theme
  document.querySelector('meta[name="theme-color"]').setAttribute("content", c);
})();
