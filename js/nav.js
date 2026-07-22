/**
 * QuarkMemory site navigation — single source of truth for header links.
 * Mount: <nav id="qm-site-nav" data-root=""></nav>
 * Optional: data-active="register" to force active tab (overrides auto-detect).
 */
(function () {
  var ITEMS = [
    { id: "home", label: "Home", href: "index.html" },
    { id: "solutions", label: "Solutions", href: "solutions.html" },
    { id: "capabilities", label: "Capabilities", href: "capabilities.html" },
    { id: "about", label: "About", href: "about.html" },
    { id: "register", label: "Register", href: "register.html" },
  ];

  var PAGE_IDS = {
    "": "home",
    "index.html": "home",
    "solutions.html": "solutions",
    "capabilities.html": "capabilities",
    "about.html": "about",
    "register.html": "register",
    "terms.html": "terms",
    "pricing.html": "home",
  };

  function currentPageId() {
    var file = window.location.pathname.split("/").pop() || "index.html";
    return PAGE_IDS[file] || null;
  }

  function init() {
    var mount = document.getElementById("qm-site-nav");
    if (!mount) return;

    var root = mount.getAttribute("data-root") || "";
    var activeId = mount.getAttribute("data-active") || currentPageId();

    var links = ITEMS.map(function (item) {
      var cls = item.id === activeId ? ' class="active"' : "";
      return '<a href="' + root + item.href + '"' + cls + ">" + item.label + "</a>";
    }).join("\n        ");

    var demoHref = activeId === "home" ? "#demo" : root + "index.html#demo";

    mount.innerHTML =
      '<div class="nav-inner">' +
      '<a href="' + root + 'index.html" class="nav-logo" aria-label="QuarkMemory home"></a>' +
      '<div class="nav-links">' +
      links +
      '<a href="' + demoHref + '" class="btn-primary">Book a Demo</a>' +
      "</div>" +
      "</div>";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
