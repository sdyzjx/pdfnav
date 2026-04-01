(function() {
  var THEME_KEY = "pdfnav-theme";
  var allowedTags = new Set([
    "a",
    "b",
    "blockquote",
    "br",
    "caption",
    "code",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "i",
    "li",
    "ol",
    "p",
    "pre",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
  ]);
  var allowedAttrs = new Set(["align", "border", "colspan", "rowspan"]);
  var lightboxRoot = null;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isHtmlLike(text) {
    return /<\s*([a-z][a-z0-9]*)\b[^>]*>/i.test(String(text || ""));
  }

  function isCaptionLike(text) {
    var normalized = String(text || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return /^(fig\.|figure|table\s+[ivx\d]+|table\b)/i.test(normalized);
  }

  function stripMathDelimiters(value) {
    var trimmed = String(value || "").trim();
    if (!trimmed) {
      return trimmed;
    }

    var patterns = [
      [/^\$\$([\s\S]+)\$\$$/, 1],
      [/^\\\[([\s\S]+)\\\]$/, 1],
      [/^\$([\s\S]+)\$$/, 1],
      [/^\\\(([\s\S]+)\\\)$/, 1],
    ];

    for (var i = 0; i < patterns.length; i += 1) {
      var pattern = patterns[i][0];
      var group = patterns[i][1];
      var match = trimmed.match(pattern);
      if (match) {
        return match[group].trim();
      }
    }

    return trimmed;
  }

  function collapseLetterSpacing(value) {
    return value
      .replace(/\\operatorname\s*\{\s*([A-Za-z ]+)\s*\}/g, function(_, group) {
        return "\\operatorname{" + group.replace(/\s+/g, "") + "}";
      })
      .replace(/\\mathrm\s*\{\s*([A-Za-z ]+)\s*\}/g, function(_, group) {
        return "\\mathrm{" + group.replace(/\s+/g, "") + "}";
      })
      .replace(/\\text\s*\{\s*([A-Za-z ]+)\s*\}/g, function(_, group) {
        return "\\text{" + group.replace(/\s+/g, "") + "}";
      });
  }

  function normalizeMathMacros(value) {
    var circledDigits = {
      "0": "⓪",
      "1": "①",
      "2": "②",
      "3": "③",
      "4": "④",
      "5": "⑤",
      "6": "⑥",
      "7": "⑦",
      "8": "⑧",
      "9": "⑨",
      "10": "⑩",
      "11": "⑪",
      "12": "⑫",
      "13": "⑬",
      "14": "⑭",
      "15": "⑮",
      "16": "⑯",
      "17": "⑰",
      "18": "⑱",
      "19": "⑲",
      "20": "⑳",
    };

    return value.replace(/\\textcircled\s*\{\s*([^{}]+)\s*\}/g, function(_, group) {
      var key = String(group || "").trim();
      if (circledDigits[key]) {
        return "\\text{" + circledDigits[key] + "}";
      }
      return "\\text{(" + key + ")}";
    });
  }

  function normalizeMathText(value) {
    var trimmed = stripMathDelimiters(value);
    return normalizeMathMacros(collapseLetterSpacing(trimmed)).replace(/\s+/g, " ").trim();
  }

  function buildInlineMathHtml(latex) {
    return (
      '<span class="pdfnav-math-inline" data-latex="' +
      escapeHtml(normalizeMathText(latex)) +
      '"></span>'
    );
  }

  function tokenizeInlineMath(text) {
    var source = String(text || "");
    var tokens = [];
    var index = 0;
    var patterns = [
      { kind: "display", regex: /^\$\$([\s\S]+?)\$\$/ },
      { kind: "display", regex: /^\\\[([\s\S]+?)\\\]/ },
      { kind: "inline", regex: /^\$([^$\n]+?)\$/ },
      { kind: "inline", regex: /^\\\(([\s\S]+?)\\\)/ },
    ];

    while (index < source.length) {
      var remaining = source.slice(index);
      var matched = null;

      for (var i = 0; i < patterns.length; i += 1) {
        var pattern = patterns[i];
        var match = remaining.match(pattern.regex);
        if (match && match.index === 0) {
          matched = {
            kind: pattern.kind,
            raw: match[0],
            latex: match[1],
          };
          break;
        }
      }

      if (matched) {
        tokens.push(matched);
        index += matched.raw.length;
        continue;
      }

      var nextMathIndex = remaining.search(/\$\$|\\\[|\$|\\\(/);
      if (nextMathIndex === -1) {
        tokens.push({
          kind: "text",
          raw: remaining,
        });
        break;
      }

      if (nextMathIndex > 0) {
        tokens.push({
          kind: "text",
          raw: remaining.slice(0, nextMathIndex),
        });
        index += nextMathIndex;
        continue;
      }

      tokens.push({
        kind: "text",
        raw: remaining.slice(0, 1),
      });
      index += 1;
    }

    return tokens;
  }

  function renderInlineText(line) {
    var tokens = tokenizeInlineMath(line);
    return tokens
      .map(function(token) {
        if (token.kind === "inline") {
          return buildInlineMathHtml(token.latex);
        }

        if (token.kind === "display") {
          return (
            '<span class="inline-display-math"><span class="pdfnav-math-inline" data-latex="' +
            escapeHtml(normalizeMathText(token.latex)) +
            '"></span></span>'
          );
        }

        return escapeHtml(token.raw);
      })
      .join("");
  }

  function sanitizeHtmlFragment(html) {
    var template = document.createElement("template");
    template.innerHTML = html;

    function sanitizeNode(node) {
      var children = Array.from(node.childNodes);
      for (var i = 0; i < children.length; i += 1) {
        var child = children[i];
        if (child.nodeType === Node.TEXT_NODE) {
          continue;
        }

        if (child.nodeType !== Node.ELEMENT_NODE) {
          child.remove();
          continue;
        }

        var element = child;
        var tag = element.tagName.toLowerCase();
        if (!allowedTags.has(tag)) {
          element.replaceWith.apply(element, Array.from(element.childNodes));
          continue;
        }

        Array.from(element.attributes).forEach(function(attribute) {
          if (!allowedAttrs.has(attribute.name.toLowerCase())) {
            element.removeAttribute(attribute.name);
          }
        });

        sanitizeNode(element);
      }
    }

    sanitizeNode(template.content);
    return template.innerHTML;
  }

  function textToHtml(text) {
    var trimmed = String(text || "").trim();
    if (!trimmed) {
      return "";
    }

    if (isHtmlLike(trimmed)) {
      return sanitizeHtmlFragment(trimmed);
    }

    var blocks = trimmed
      .split(/\n{2,}/)
      .map(function(part) {
        return part.trim();
      })
      .filter(Boolean);

    return blocks
      .map(function(block) {
        var heading = block.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
          var level = Math.min(6, heading[1].length + 1);
          return "<h" + level + ">" + renderInlineText(heading[2]) + "</h" + level + ">";
        }

        var lines = block.split(/\n+/).map(function(line) {
          return renderInlineText(line);
        });
        return "<p>" + lines.join("<br />") + "</p>";
      })
      .join("");
  }

  function buildRichText(text, options) {
    var html = textToHtml(text);
    var classes = ["rich-text"];
    if ((options && options.caption) || isCaptionLike(text)) {
      classes.push("caption-block");
    }
    return '<div class="' + classes.join(" ") + '">' + html + "</div>";
  }

  function buildTableHtml(text) {
    return (
      '<div class="table-wrap rich-table">' + sanitizeHtmlFragment(String(text || "")) + "</div>"
    );
  }

  function buildFormulaHtml(text) {
    var latex = normalizeMathText(text);
    return (
      '<div class="formula-card">' +
      '<div class="pdfnav-math-block" data-latex="' + escapeHtml(latex) + '"></div>' +
      '<details class="formula-raw"><summary>Raw</summary><pre>' +
      escapeHtml(String(text || "")) +
      "</pre></details>" +
      "</div>"
    );
  }

  function buildNodeBodyHtml(node) {
    if (!node) {
      return "";
    }

    if (node.type === "formula" && node.text) {
      return buildFormulaHtml(node.text);
    }

    if (node.type === "table" && node.text) {
      return buildTableHtml(node.text);
    }

    if (node.type === "figure") {
      var parts = [];
      if (node.assetUrl) {
        parts.push(
          '<figure class="figure-block"><img class="figure-image" src="' +
            escapeHtml(node.assetUrl) +
            '" alt="' +
            escapeHtml(node.title || node.text || node.nodeId || "figure") +
            '" loading="lazy" data-caption="' +
            escapeHtml(node.text || node.title || "") +
            '" /></figure>',
        );
      }
      if (node.text) {
        parts.push(buildRichText(node.text, { caption: true }));
      }
      return parts.join("");
    }

    if (node.text) {
      return buildRichText(node.text);
    }

    return '<div class="empty-state">No content.</div>';
  }

  function buildBlockBodyHtml(block) {
    if (!block) {
      return "";
    }

    if (block.type === "formula" && block.content) {
      return buildFormulaHtml(block.content);
    }

    if (block.type === "table" && block.content) {
      return buildTableHtml(block.content);
    }

    if (block.assetUrl) {
      return (
        '<figure class="figure-block"><img class="figure-image" src="' +
        escapeHtml(block.assetUrl) +
        '" alt="' +
        escapeHtml(block.blockId || "asset") +
        '" loading="lazy" data-caption="' +
        escapeHtml(block.content || "") +
        '" /></figure>'
      );
    }

    if (block.content) {
      return buildRichText(block.content);
    }

    return "";
  }

  function preferredTheme() {
    var stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }

    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function applyTheme(theme) {
    var nextTheme = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
    document.body.setAttribute("data-theme", nextTheme);
    window.localStorage.setItem(THEME_KEY, nextTheme);
    return nextTheme;
  }

  function initThemeToggle(button, labelMap) {
    if (!button) {
      return;
    }

    function render(theme) {
      button.dataset.theme = theme;
      if (labelMap) {
        button.textContent = labelMap[theme] || theme;
      }
    }

    render(applyTheme(preferredTheme()));
    button.addEventListener("click", function() {
      var current = document.documentElement.getAttribute("data-theme") || preferredTheme();
      var next = current === "dark" ? "light" : "dark";
      render(applyTheme(next));
    });
  }

  function typeset(root) {
    if (window.pdfnavMath && typeof window.pdfnavMath.typeset === "function") {
      return window.pdfnavMath.typeset(root);
    }

    window.dispatchEvent(
      new CustomEvent("pdfnav:rendered", {
        detail: {
          root: root || null,
        },
      }),
    );
    return Promise.resolve();
  }

  function ensureLightbox() {
    if (lightboxRoot) {
      return lightboxRoot;
    }

    var shell = document.createElement("div");
    shell.className = "media-lightbox";
    shell.setAttribute("aria-hidden", "true");
    shell.innerHTML =
      '<div class="media-lightbox-backdrop" data-close="true"></div>' +
      '<div class="media-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Image preview">' +
      '<button class="media-lightbox-close" type="button" aria-label="Close image preview">×</button>' +
      '<img class="media-lightbox-image" alt="" />' +
      '<div class="media-lightbox-caption"></div>' +
      "</div>";

    function closeLightbox() {
      shell.classList.remove("open");
      shell.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("has-lightbox");
    }

    shell.addEventListener("click", function(event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.dataset.close === "true" || target.classList.contains("media-lightbox-close")) {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", function(event) {
      if (event.key === "Escape" && shell.classList.contains("open")) {
        closeLightbox();
      }
    });

    shell.open = function(image) {
      var imageEl = shell.querySelector(".media-lightbox-image");
      var captionEl = shell.querySelector(".media-lightbox-caption");
      if (!(imageEl instanceof HTMLImageElement) || !(captionEl instanceof HTMLElement)) {
        return;
      }

      imageEl.src = image.currentSrc || image.src;
      imageEl.alt = image.alt || "";
      captionEl.textContent = image.dataset.caption || image.alt || "";
      shell.classList.add("open");
      shell.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("has-lightbox");
    };

    shell.close = closeLightbox;
    document.body.appendChild(shell);
    lightboxRoot = shell;
    return shell;
  }

  function bindZoomableImages(root) {
    var scope = root instanceof HTMLElement ? root : document;
    var images = scope.querySelectorAll(".figure-image, .page-preview-image");
    var lightbox = ensureLightbox();

    Array.from(images).forEach(function(image) {
      if (!(image instanceof HTMLImageElement) || image.dataset.zoomBound === "true") {
        return;
      }

      image.dataset.zoomBound = "true";
      image.classList.add("interactive-image");
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      if (!image.dataset.caption) {
        var figure = image.closest("figure");
        var caption = figure && figure.querySelector("figcaption");
        if (!caption) {
          var block = image.closest(".book-figure-block, .node-body, .page-inspector");
          caption = block && block.querySelector(".book-caption, .caption-block");
        }
        if (caption instanceof HTMLElement) {
          image.dataset.caption = caption.textContent ? caption.textContent.trim() : "";
        }
      }
      image.setAttribute(
        "aria-label",
        image.alt ? "Open image: " + image.alt : "Open image preview",
      );

      image.addEventListener("click", function(event) {
        event.preventDefault();
        event.stopPropagation();
        lightbox.open(image);
      });

      image.addEventListener("keydown", function(event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          lightbox.open(image);
        }
      });
    });
  }

  window.pdfnavRenderUtils = {
    applyTheme: applyTheme,
    buildBlockBodyHtml: buildBlockBodyHtml,
    buildNodeBodyHtml: buildNodeBodyHtml,
    bindZoomableImages: bindZoomableImages,
    escapeHtml: escapeHtml,
    initThemeToggle: initThemeToggle,
    isCaptionLike: isCaptionLike,
    normalizeMathText: normalizeMathText,
    sanitizeHtmlFragment: sanitizeHtmlFragment,
    textToHtml: textToHtml,
    typeset: typeset,
  };
})();
