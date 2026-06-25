(function () {
  var script = document.currentScript;
  var companyId =
    (script && (script.getAttribute("data-estateai") || script.getAttribute("data-setterai"))) || null;
  if (!companyId) {
    console.error("[EstateAI] Missing data-estateai attribute on script tag");
    return;
  }
  var origin = new URL(script.src).origin;

  // Floating button
  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Chat öffnen");
  btn.style.cssText = [
    "position:fixed", "bottom:20px", "right:20px", "z-index:2147483646",
    "width:56px", "height:56px", "border-radius:9999px", "border:0", "cursor:pointer",
    "background:linear-gradient(135deg,#0B1F3A,#13294B)", "color:#C9A961",
    "box-shadow:0 20px 50px -15px rgba(11,31,58,0.6)", "display:grid", "place-items:center",
    "transition:transform .2s",
  ].join(";");
  btn.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  btn.onmouseenter = function () { btn.style.transform = "scale(1.05)"; };
  btn.onmouseleave = function () { btn.style.transform = "scale(1)"; };

  // Iframe panel
  var frame = document.createElement("iframe");
  frame.src = origin + "/widget/" + encodeURIComponent(companyId);
  frame.title = "EstateAI Chat";
  frame.allow = "clipboard-write";
  frame.style.cssText = [
    "position:fixed", "bottom:90px", "right:20px", "z-index:2147483645",
    "width:380px", "max-width:calc(100vw - 40px)", "height:600px", "max-height:calc(100vh - 120px)",
    "border:0", "border-radius:20px", "background:transparent",
    "box-shadow:0 30px 60px -20px rgba(11,31,58,0.45)",
    "transform-origin:bottom right", "transition:transform .2s,opacity .2s",
    "opacity:0", "transform:scale(.95) translateY(8px)", "pointer-events:none",
    "display:block",
  ].join(";");

  var open = false;
  btn.onclick = function () {
    open = !open;
    if (open) {
      frame.style.opacity = "1";
      frame.style.transform = "scale(1) translateY(0)";
      frame.style.pointerEvents = "auto";
      btn.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    } else {
      frame.style.opacity = "0";
      frame.style.transform = "scale(.95) translateY(8px)";
      frame.style.pointerEvents = "none";
      btn.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    }
  };

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(btn);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
