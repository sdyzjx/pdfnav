(function() {
  var SCRIPT_ID = "pdfnav-mathjax-script";
  var DEFAULT_SELECTOR = ".page-inner";
  var loading = null;

  function prepareMathPlaceholders(root) {
    if (!root) {
      return;
    }

    var nodes = root.querySelectorAll(".pdfnav-math-inline[data-latex], .pdfnav-math-block[data-latex]");
    Array.prototype.forEach.call(nodes, function(node) {
      var latex = node.getAttribute("data-latex");
      if (!latex) {
        return;
      }

      var isBlock = node.classList.contains("pdfnav-math-block");
      node.textContent = (isBlock ? "\\[" : "\\(") + latex + (isBlock ? "\\]" : "\\)");
      node.setAttribute("data-math-ready", "true");
    });
  }

  function ensureMathJax() {
    if (window.MathJax && window.MathJax.typesetPromise) {
      return Promise.resolve(window.MathJax);
    }

    if (loading) {
      return loading;
    }

    window.MathJax = window.MathJax || {
      tex: {
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
        processEscapes: true,
      },
      svg: {
        fontCache: "global",
      },
      options: {
        skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      },
      startup: {
        typeset: false,
      },
    };

    loading = new Promise(function(resolve, reject) {
      var existing = document.getElementById(SCRIPT_ID);
      if (existing) {
        existing.addEventListener("load", function() {
          resolve(window.MathJax);
        }, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      var script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
      script.onload = function() {
        resolve(window.MathJax);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });

    return loading;
  }

  function getRoot(root) {
    if (root && root.nodeType === 1) {
      return root;
    }

    return document.querySelector(DEFAULT_SELECTOR);
  }

  function typesetCurrentPage(root) {
    return ensureMathJax().then(function(MathJax) {
      var container = getRoot(root);
      if (!container || !MathJax.typesetPromise) {
        return;
      }
      prepareMathPlaceholders(container);
      if (MathJax.typesetClear) {
        MathJax.typesetClear([container]);
      }
      return MathJax.typesetPromise([container]);
    }).catch(function(error) {
      console.error("MathJax render failed", error);
    });
  }

  window.pdfnavMath = {
    ensureMathJax: ensureMathJax,
    prepareMathPlaceholders: prepareMathPlaceholders,
    typeset: typesetCurrentPage,
  };

  window.addEventListener("pdfnav:rendered", function(event) {
    var detail = event && event.detail ? event.detail : null;
    typesetCurrentPage(detail && detail.root ? detail.root : null);
  });

  if (window.gitbook && window.gitbook.events) {
    window.gitbook.events.bind("page.change", typesetCurrentPage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", typesetCurrentPage, { once: true });
  } else {
    typesetCurrentPage();
  }
})();
