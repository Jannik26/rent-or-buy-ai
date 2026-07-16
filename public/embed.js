(function () {
  "use strict";

  // Prevent double-mounting if the script tag is included more than once.
  if (window.__ESTATEAI_WIDGET_LOADED__) return;
  window.__ESTATEAI_WIDGET_LOADED__ = true;

  var script = document.currentScript;
  var companyId =
    (script && (script.getAttribute("data-estateai") || script.getAttribute("data-setterai"))) || null;
  if (!companyId) {
    console.error("[EstateAI] Missing data-estateai attribute on script tag");
    return;
  }
  var origin = new URL(script.src).origin;

  // ---------------------------------------------------------------------
  // Config — central place for every size, color, timing and position.
  // ---------------------------------------------------------------------
  var BUTTON_SIZE = 60; // px, spec range 56-60 (desktop)
  var BUTTON_SIZE_MOBILE = 56; // px, spec range 52-56 (mobile)
  var BUTTON_MARGIN = 24; // px, distance from viewport edge (desktop)
  var BUTTON_MARGIN_MOBILE = 16; // px, distance from viewport edge (mobile)
  var MOBILE_BREAKPOINT = 640; // px
  var PANEL_GAP = 12; // px, gap between button and chat panel
  var PANEL_WIDTH = 380; // px
  var PANEL_HEIGHT = 640; // px
  var VIEWPORT_PADDING = 24; // px, min space panel must keep from screen edges
  var Z_INDEX = 999999;

  var BUTTON_SHADOW_REST = "0 10px 30px rgba(0,0,0,.12)";
  var BUTTON_SHADOW_HOVER = "0 14px 34px rgba(0,0,0,.16)";

  var HOVER_TRANSITION_MS = 220; // 200-250ms per spec
  var PANEL_TRANSITION_MS = 240;
  var FADE_IN_MS = 320;
  var TYPING_DELAY_MS = 2500; // wait before showing "typing" state
  var TYPING_DURATION_MS = 2600; // how long the typing dots animate
  var DOT_POP_MS = 260;

  var UNREAD_DOT_SIZE = 13; // px, spec range 12-14
  var UNREAD_DOT_COLOR = "#22C55E";
  var UNREAD_DOT_BORDER = "2px solid #FFFFFF";

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var THEMES = {
    estateai: { bg: "#FFFFFF", icon: "#000000", border: "rgba(0,0,0,.08)" },
    dark: { bg: "#111111", icon: "#FFFFFF", border: "#2A2A2A" },
    remax: { bg: "#FFFFFF", icon: "#003DA5", border: "#E5E5E5" },
  };
  var themeName = (script.getAttribute("data-theme") || "estateai").toLowerCase();
  var theme = THEMES[themeName] || THEMES.estateai;

  // Positions describe where the button sits and which side the panel
  // opens toward. Default is right-center per spec; more presets can be
  // added here without touching the rest of the widget.
  var POSITION_PRESETS = {
    "right-center": function () {
      return {
        buttonTransform: "translateY(-50%)",
        panelTransform: "translateY(-50%)",
        button: ["right:" + BUTTON_MARGIN + "px", "top:50%"],
        panel: ["right:" + (BUTTON_MARGIN + BUTTON_SIZE + PANEL_GAP) + "px", "top:50%"],
      };
    },
    "bottom-right": function () {
      return {
        buttonTransform: "",
        panelTransform: "",
        button: ["right:" + BUTTON_MARGIN + "px", "bottom:" + BUTTON_MARGIN + "px"],
        panel: [
          "right:" + BUTTON_MARGIN + "px",
          "bottom:" + (BUTTON_MARGIN + BUTTON_SIZE + PANEL_GAP) + "px",
        ],
      };
    },
  };
  var positionName = (script.getAttribute("data-position") || "right-center").toLowerCase();
  var position = (POSITION_PRESETS[positionName] || POSITION_PRESETS["right-center"])();

  // Combines a preset's base placement transform (e.g. vertical centering)
  // with a transient animation transform (e.g. scale) without either
  // clobbering the other, since CSS keeps only the last `transform` value.
  function combineTransform(base, extra) {
    return (base ? base + " " : "") + extra;
  }

  var readStorageKey = "estateai_widget_read_" + companyId;
  function hasReadGreeting() {
    try {
      return localStorage.getItem(readStorageKey) === "1";
    } catch (e) {
      return false;
    }
  }
  function markGreetingRead() {
    try {
      localStorage.setItem(readStorageKey, "1");
    } catch (e) {
      /* storage unavailable (private mode etc.) — fail silently */
    }
  }

  // ---------------------------------------------------------------------
  // Styles — scoped keyframes, injected once.
  // ---------------------------------------------------------------------
  function injectStyles() {
    var style = document.createElement("style");
    style.id = "estateai-widget-styles";
    style.textContent = [
      "@keyframes estateai-dot-pop { 0% { opacity:0; transform:scale(.3) } 60% { opacity:1; transform:scale(1.15) } 100% { opacity:1; transform:scale(1) } }",
      "@keyframes estateai-typing-bounce { 0%, 60%, 100% { transform:translateY(0); opacity:.35 } 30% { transform:translateY(-3px); opacity:1 } }",
      "#estateai-launcher-btn.estateai-typing-active .estateai-dot { animation: estateai-typing-bounce 1.3s ease-in-out infinite; }",
      "#estateai-launcher-btn .estateai-dot:nth-child(2) { animation-delay: .15s; }",
      "#estateai-launcher-btn .estateai-dot:nth-child(3) { animation-delay: .3s; }",
      "@media (max-width: " + MOBILE_BREAKPOINT + "px) {",
      "  #estateai-launcher-btn { right:" + BUTTON_MARGIN_MOBILE + "px !important; width:" + BUTTON_SIZE_MOBILE + "px !important; height:" + BUTTON_SIZE_MOBILE + "px !important; }",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------
  var ICON_CHAT =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_CLOSE =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  // ---------------------------------------------------------------------
  // Button
  // ---------------------------------------------------------------------
  function createButton() {
    var btn = document.createElement("button");
    btn.id = "estateai-launcher-btn";
    btn.setAttribute("aria-label", "Chat öffnen");
    var initialTransform = prefersReducedMotion
      ? position.buttonTransform || "none"
      : combineTransform(position.buttonTransform, "scale(.9)");
    btn.style.cssText = [
      "position:fixed",
      position.button.join(";"),
      "transform:" + initialTransform,
      "z-index:" + Z_INDEX,
      "width:" + BUTTON_SIZE + "px",
      "height:" + BUTTON_SIZE + "px",
      "border-radius:9999px",
      "border:1px solid " + theme.border,
      "background:" + theme.bg,
      "color:" + theme.icon,
      "cursor:pointer",
      "box-shadow:" + BUTTON_SHADOW_REST,
      "display:grid",
      "place-items:center",
      "padding:0",
      "opacity:0",
      "transition:transform " + HOVER_TRANSITION_MS + "ms ease, box-shadow " + HOVER_TRANSITION_MS + "ms ease, opacity " + FADE_IN_MS + "ms ease",
    ].join(";");

    var iconClosed = document.createElement("span");
    iconClosed.className = "estateai-icon-closed";
    iconClosed.style.cssText = "display:grid;place-items:center;line-height:0;";
    iconClosed.innerHTML = ICON_CHAT;

    var iconOpen = document.createElement("span");
    iconOpen.className = "estateai-icon-open";
    iconOpen.style.cssText = "display:none;line-height:0;";
    iconOpen.innerHTML = ICON_CLOSE;

    var typing = document.createElement("span");
    typing.className = "estateai-typing";
    typing.style.cssText = "display:none;align-items:center;gap:4px;line-height:0;";
    for (var i = 0; i < 3; i++) {
      var dot = document.createElement("span");
      dot.className = "estateai-dot";
      dot.style.cssText =
        "display:inline-block;width:5px;height:5px;border-radius:9999px;background:" + theme.icon + ";";
      typing.appendChild(dot);
    }

    var unreadDot = document.createElement("span");
    unreadDot.className = "estateai-unread-dot";
    unreadDot.style.cssText = [
      "display:none",
      "position:absolute",
      "top:-2px",
      "right:-2px",
      "width:" + UNREAD_DOT_SIZE + "px",
      "height:" + UNREAD_DOT_SIZE + "px",
      "border-radius:9999px",
      "background:" + UNREAD_DOT_COLOR,
      "border:" + UNREAD_DOT_BORDER,
      "box-sizing:border-box",
    ].join(";");

    btn.appendChild(iconClosed);
    btn.appendChild(iconOpen);
    btn.appendChild(typing);
    btn.appendChild(unreadDot);

    var baseTransform = position.buttonTransform || "";
    btn.onmouseenter = function () {
      btn.style.transform = combineTransform(baseTransform, "scale(1.06)");
      btn.style.boxShadow = BUTTON_SHADOW_HOVER;
    };
    btn.onmouseleave = function () {
      btn.style.transform = baseTransform || "none";
      btn.style.boxShadow = BUTTON_SHADOW_REST;
    };

    return {
      el: btn,
      iconClosed: iconClosed,
      iconOpen: iconOpen,
      typing: typing,
      unreadDot: unreadDot,
      baseTransform: baseTransform,
    };
  }

  // ---------------------------------------------------------------------
  // Chat panel (iframe) — isolated by nature, no shadow DOM needed.
  // ---------------------------------------------------------------------
  function createPanel() {
    var frame = document.createElement("iframe");
    frame.src = origin + "/widget/" + encodeURIComponent(companyId);
    frame.title = "EstateAI Chat";
    frame.allow = "clipboard-write";
    frame.style.cssText = [
      "position:fixed",
      position.panel.join(";"),
      "z-index:" + (Z_INDEX - 1),
      "width:" + PANEL_WIDTH + "px",
      "max-width:calc(100vw - " + (BUTTON_SIZE + BUTTON_MARGIN + PANEL_GAP + VIEWPORT_PADDING) + "px)",
      "height:" + PANEL_HEIGHT + "px",
      "max-height:calc(100vh - " + VIEWPORT_PADDING * 2 + "px)",
      "border:0",
      "border-radius:20px",
      "background:transparent",
      "box-shadow:0 30px 60px -20px rgba(11,31,58,0.45)",
      "opacity:0",
      "transform:" + combineTransform(position.panelTransform, "scale(.97)"),
      "pointer-events:none",
      "transition:transform " + PANEL_TRANSITION_MS + "ms ease, opacity " + PANEL_TRANSITION_MS + "ms ease",
    ].join(";");
    return frame;
  }

  // ---------------------------------------------------------------------
  // Assemble + behaviour
  // ---------------------------------------------------------------------
  injectStyles();
  var button = createButton();
  var frame = createPanel();

  var open = false;
  var pendingTimers = [];
  function clearPendingTimers() {
    pendingTimers.forEach(clearTimeout);
    pendingTimers = [];
  }

  function showTypingThenDot() {
    if (hasReadGreeting() || open) return;

    if (prefersReducedMotion) {
      // Skip the typing animation entirely, just fade the dot in softly.
      pendingTimers.push(
        setTimeout(function () {
          if (hasReadGreeting() || open) return;
          showUnreadDot();
        }, TYPING_DELAY_MS),
      );
      return;
    }

    pendingTimers.push(
      setTimeout(function () {
        if (hasReadGreeting() || open) return;
        button.el.classList.add("estateai-typing-active");
        button.iconClosed.style.display = "none";
        button.typing.style.display = "inline-flex";

        pendingTimers.push(
          setTimeout(function () {
            button.el.classList.remove("estateai-typing-active");
            button.typing.style.display = "none";
            button.iconClosed.style.display = "grid";
            if (hasReadGreeting() || open) return;
            showUnreadDot();
            pulseOnce();
          }, TYPING_DURATION_MS),
        );
      }, TYPING_DELAY_MS),
    );
  }

  function showUnreadDot() {
    button.unreadDot.style.display = "block";
    button.unreadDot.style.animation = "estateai-dot-pop " + DOT_POP_MS + "ms ease";
  }

  function hideUnreadDot() {
    button.unreadDot.style.display = "none";
  }

  function pulseOnce() {
    if (prefersReducedMotion) return;
    var el = button.el;
    var base = button.baseTransform || "";
    var restTransform = base || "none";
    var pulseTransform = (base ? base + " " : "") + "scale(1.06)";

    el.style.transform = pulseTransform;
    setTimeout(function () {
      el.style.transform = restTransform;
    }, 300);
  }

  function openPanel() {
    open = true;
    clearPendingTimers();
    button.el.classList.remove("estateai-typing-active");
    button.typing.style.display = "none";
    button.iconClosed.style.display = "none";
    button.iconOpen.style.display = "grid";
    hideUnreadDot();
    markGreetingRead();

    frame.style.opacity = "1";
    frame.style.transform = combineTransform(position.panelTransform, "scale(1)");
    frame.style.pointerEvents = "auto";
  }

  function closePanel() {
    open = false;
    button.iconOpen.style.display = "none";
    button.iconClosed.style.display = "grid";

    frame.style.opacity = "0";
    frame.style.transform = combineTransform(position.panelTransform, "scale(.97)");
    frame.style.pointerEvents = "none";
  }

  button.el.onclick = function () {
    if (open) closePanel();
    else openPanel();
  };

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(button.el);

    requestAnimationFrame(function () {
      button.el.style.opacity = "1";
      button.el.style.transform = button.baseTransform || "none";
    });

    if (!hasReadGreeting()) {
      showTypingThenDot();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
