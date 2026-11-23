(function () {
  "use strict";

  var navToggle = document.querySelector("[data-nav-toggle]");
  var nav = document.getElementById("site-nav");
  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        nav.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  var preview = document.querySelector("[data-panel]");
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-panel-btn]"));
  if (preview && tabs.length) {
    var panels = {
      recovery: preview.querySelector(".panel-recovery"),
      followups: preview.querySelector(".panel-followups"),
      report: preview.querySelector(".panel-report")
    };
    var title = preview.querySelector(".preview-title");
    var labels = { recovery: "Recovery queue", followups: "Today's follow-ups", report: "Recovery report" };
    function select(name) {
      Object.keys(panels).forEach(function (key) {
        if (panels[key]) panels[key].hidden = key !== name;
      });
      preview.setAttribute("data-panel", name);
      tabs.forEach(function (btn) {
        var on = btn.getAttribute("data-panel-btn") === name;
        btn.setAttribute("aria-selected", String(on));
        btn.tabIndex = on ? 0 : -1;
      });
      if (title) title.textContent = labels[name] || "";
    }
    tabs.forEach(function (btn) {
      btn.addEventListener("click", function () { select(btn.getAttribute("data-panel-btn")); });
      btn.addEventListener("keydown", function (event) {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        var index = tabs.indexOf(btn);
        var next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        select(next.getAttribute("data-panel-btn"));
      });
    });
    select("recovery");
  }

  var year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
})();
