(function() {
  function isFileMode() {
    return window.location.protocol === "file:";
  }

  function findAnchorTarget(hash) {
    if (!hash) {
      return null;
    }
    var id = decodeURIComponent(hash.replace(/^#/, ""));
    return document.getElementById(id) || document.querySelector(hash);
  }

  function setActiveSummaryLink(targetHref) {
    var links = document.querySelectorAll(".summary a");
    Array.prototype.forEach.call(links, function(link) {
      var href = link.getAttribute("href") || "";
      var item = link.closest("li.chapter");
      if (!item) {
        return;
      }
      if (href === targetHref) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  function handleLocalNavigation(anchor) {
    var url = new URL(anchor.href, window.location.href);
    var current = new URL(window.location.href);

    if (url.pathname === current.pathname) {
      if (url.hash) {
        history.replaceState(null, "", url.hash);
        var target = findAnchorTarget(url.hash);
        if (target) {
          target.scrollIntoView();
        }
        setActiveSummaryLink(anchor.getAttribute("href") || "");
      }
      return;
    }

    window.location.assign(url.href);
  }

  document.addEventListener("click", function(event) {
    if (!isFileMode()) {
      return;
    }

    var anchor = event.target.closest("a[href]");
    if (!anchor) {
      return;
    }

    var href = anchor.getAttribute("href") || "";
    if (!href || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:") || href.startsWith("javascript:")) {
      return;
    }

    if (!anchor.closest(".summary") && !anchor.closest(".navigation")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleLocalNavigation(anchor);
  }, true);
})();
