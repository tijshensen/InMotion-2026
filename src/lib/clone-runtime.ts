/**
 * Static clone is HTML+CSS only. Builder layouts still need the original
 * body/wrapper classes, and two tiny owned helpers (mobile nav, simple slides).
 * We do not replay WordPress/Divi/jQuery.
 */

const DROP_BODY_CLASS = new Set([
  "seraph-accel-js-lzl-ing",
  "seraph-accel-view-cmn",
  "logged-in",
  "admin-bar",
  "customize-support",
  "lzl",
  "js-lzl-ing",
]);

export function sanitizeBodyClass(raw: string): string {
  const tokens = raw
    .split(/\s+/)
    .filter(
      (c) =>
        c &&
        !DROP_BODY_CLASS.has(c) &&
        !c.startsWith("seraph-") &&
        !c.startsWith("lzl"),
    );
  if (!tokens.includes("cms-clone")) tokens.push("cms-clone");
  return tokens.join(" ");
}

export function extractHtmlLang(html: string): string {
  const m = html.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i);
  return (m?.[1] || "en").trim();
}

export function extractBodyClass(html: string): string {
  const m = html.match(/<body\b[^>]*\bclass\s*=\s*["']([^"']*)["']/i);
  return sanitizeBodyClass(m?.[1] || "");
}

export function ensureBuilderBodyClass(builder: string, bodyClass: string): string {
  const tokens = new Set(sanitizeBodyClass(bodyClass).split(/\s+/).filter(Boolean));
  if (builder === "divi") {
    tokens.add("et_divi_theme");
    tokens.add("et-db");
    tokens.add("et_pb_gutters3");
    tokens.add("et_pb_gutter");
  } else if (builder === "elementor") {
    tokens.add("elementor-default");
    tokens.add("elementor-page");
  }
  return [...tokens].join(" ");
}

/** Keep descendant selectors like `.et_pb_gutters3 .et_pb_column_3_5` working. */
export function wrapSectionsInBuilderChrome(
  builder: string,
  header: string,
  footer: string,
  sectionsToken = "{{sections}}",
): string {
  if (builder === "divi") {
    return `<div id="page-container">
<div id="et-boc" class="et-boc">
${header}
<div id="et-main-area">
<div id="main-content">
<div class="et-l et-l--post">
<div class="et_builder_inner_content et_pb_gutters3">
${sectionsToken}
</div>
</div>
</div>
${footer}
</div>
</div>
</div>`;
  }
  if (builder === "elementor") {
    return `${header}
<div class="elementor">
${sectionsToken}
</div>
${footer}`;
  }
  if (builder === "wpbakery") {
    return `${header}
<div class="entry-content">
${sectionsToken}
</div>
${footer}`;
  }
  return `${header}
${sectionsToken}
${footer}`;
}

export const CLONE_FIX_CSS = `
.et_animated,.et-waypoint,.et_had_animation{opacity:1!important;animation:none!important;transform:none!important}
.lzl,.lzl-ing{display:revert!important;opacity:1!important}
img.lzl,img.lzl-ing{opacity:1!important}
.et_pb_row:after,.et_pb_row_inner:after{content:"";display:table;clear:both}
.row-slider .et_pb_row{display:none}
.row-slider .et_pb_row.inactive{display:none!important}
.row-slider .et_pb_row.active,.row-slider .et_pb_row.cms-slide-active,
.row-slider .et_pb_row:first-of-type:not(.inactive){display:block!important}
.et_pb_slider .et_pb_slide{display:none}
.et_pb_slider .et_pb_slide.et-pb-active-slide,
.et_pb_slider .et_pb_slide.cms-slide-active{display:block!important}
.row-slider-nav,.row-slider-tabs,.row-slider-tabs a,.row-slider-nav button,
.et-pb-arrow-prev,.et-pb-arrow-next,.dg_at_nav,.et_pb_tabs_controls{pointer-events:auto!important}
.et_pb_module.dgat_advancedtabitem{display:none}
.et_pb_module.dgat_advancedtabitem.cms-tab-active{display:block!important}
.dg_at_all_tabs>.et_pb_module.dgat_advancedtabitem:first-child:not(.cms-tab-inactive){display:block}
.et_pb_tabs .et_pb_tab{display:none}
.et_pb_tabs .et_pb_tab.et_pb_active_content,.et_pb_tabs .et_pb_tab.cms-tab-active{display:block!important}
.cms-clone .mobile_menu_bar:before{
  content:"☰"!important;
  font-family:inherit!important;
  font-size:28px!important;
  line-height:1;
  color:inherit;
}
.et_mobile_menu,#mobile_menu{
  float:none!important;
  width:100%!important;
  max-width:100%;
  position:absolute;
  left:0;right:0;
  z-index:99999;
  margin:0;
  padding:8px 0;
  list-style:none;
  background:#162934;
  box-shadow:0 12px 32px rgba(0,0,0,.22);
}
.mobile_nav.closed>.et_mobile_menu,
.mobile_nav.closed>#mobile_menu,
.mobile_nav.closed>.cms-clone-mobile-menu{display:none!important}
.mobile_nav.opened>.et_mobile_menu,
.mobile_nav.opened>#mobile_menu,
.mobile_nav.opened>.cms-clone-mobile-menu{display:block!important}
.et_mobile_menu li,.et_mobile_menu a,
#mobile_menu li,#mobile_menu a{
  float:none!important;
  display:block!important;
  width:100%!important;
  position:static!important;
  margin:0!important;
}
.et_mobile_menu a,#mobile_menu a{
  color:#fff!important;
  padding:10px 16px!important;
  text-decoration:none;
}
.et_mobile_menu .sub-menu,#mobile_menu .sub-menu{
  display:none;
  position:static!important;
  width:100%!important;
  box-shadow:none!important;
  background:rgba(255,255,255,.06);
  padding-left:12px;
}
.et_mobile_menu .cms-clone-sub-open>.sub-menu,
#mobile_menu .cms-clone-sub-open>.sub-menu{display:block!important}
`.trim();

export const CLONE_REVIVE_JS = `
(function(){
  if (window.__cmsCloneRevive) return;
  window.__cmsCloneRevive = true;

  function onReady(fn){
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function showSlides(slides, tabs, index){
    var n = slides.length;
    if (!n) return 0;
    var i = ((index % n) + n) % n;
    for (var s = 0; s < n; s++){
      var on = s === i;
      slides[s].classList.toggle("active", on);
      slides[s].classList.toggle("inactive", !on);
      slides[s].classList.toggle("et-pb-active-slide", on);
      slides[s].classList.toggle("cms-slide-active", on);
    }
    if (tabs && tabs.length){
      for (var t = 0; t < tabs.length; t++){
        tabs[t].classList.toggle("active", t === i);
      }
    }
    return i;
  }

  function bindClicks(nodes, fn){
    if (!nodes) return;
    for (var i = 0; i < nodes.length; i++){
      nodes[i].addEventListener("click", function(e){
        e.preventDefault();
        fn(e);
      });
    }
  }

  function initRowSlider(section){
    var slides = Array.prototype.filter.call(section.querySelectorAll(".et_pb_row"), function(el){
      return !el.parentElement || !el.parentElement.closest || !el.parentElement.closest(".et_pb_row");
    });
    if (slides.length < 2) return;
    var tabs = document.querySelectorAll(".row-slider-tabs a[data-slide], .row-slider-tabs a");
    var i = showSlides(slides, tabs, 0);
    bindClicks(document.querySelectorAll(".row-slider-nav .row-prev"), function(){
      i = showSlides(slides, tabs, i - 1);
    });
    bindClicks(document.querySelectorAll(".row-slider-nav .row-next"), function(){
      i = showSlides(slides, tabs, i + 1);
    });
    for (var t = 0; t < tabs.length; t++){
      (function(idx){
        tabs[idx].addEventListener("click", function(e){
          e.preventDefault();
          var raw = parseInt(tabs[idx].getAttribute("data-slide") || String(idx), 10);
          i = showSlides(slides, tabs, isNaN(raw) ? idx : raw);
        });
      })(t);
    }
  }

  function initTabs(root){
    var navs = root.querySelectorAll(".dg_at_nav");
    var panes = root.querySelectorAll(".et_pb_module.dgat_advancedtabitem");
    if (!panes.length) {
      navs = root.querySelectorAll(".et_pb_tabs_controls li");
      panes = root.querySelectorAll(".et_pb_tab");
    }
    if (panes.length < 2) return;
    function show(index){
      for (var i = 0; i < panes.length; i++){
        var on = i === index;
        panes[i].classList.toggle("cms-tab-active", on);
        panes[i].classList.toggle("cms-tab-inactive", !on);
        panes[i].classList.toggle("et_pb_active_content", on);
      }
      for (var n = 0; n < navs.length; n++){
        navs[n].classList.toggle("dg_at_nav_active", n === index);
        navs[n].classList.toggle("et_pb_tab_active", n === index);
      }
    }
    show(0);
    for (var n = 0; n < navs.length; n++){
      (function(idx){
        navs[idx].addEventListener("click", function(e){
          e.preventDefault();
          show(idx);
        });
      })(n);
    }
  }

  function initDiviSlider(root){
    var slides = Array.prototype.slice.call(root.querySelectorAll(".et_pb_slide"));
    if (slides.length < 2) return;
    var i = showSlides(slides, null, 0);
    bindClicks(root.querySelectorAll(".et-pb-arrow-prev"), function(){
      i = showSlides(slides, null, i - 1);
    });
    bindClicks(root.querySelectorAll(".et-pb-arrow-next"), function(){
      i = showSlides(slides, null, i + 1);
    });
    var dots = root.querySelectorAll(".et-pb-controllers a, .et-pb-controllers button");
    for (var d = 0; d < dots.length; d++){
      (function(idx){
        dots[idx].addEventListener("click", function(e){
          e.preventDefault();
          i = showSlides(slides, dots, idx);
        });
      })(d);
    }
  }

  function desktopMenu(){
    return document.querySelector(".et-menu") ||
      document.querySelector(".et_pb_menu__menu ul") ||
      document.querySelector("#top-menu") ||
      document.querySelector("header ul.nav") ||
      document.querySelector("header ul");
  }

  function ensureMobileList(nav){
    var menu = nav.querySelector("ul.et_mobile_menu, ul#mobile_menu, ul.cms-clone-mobile-menu");
    if (menu) return menu;
    var src = desktopMenu();
    if (!src) return null;
    menu = src.cloneNode(true);
    menu.id = "mobile_menu";
    menu.className = "et_mobile_menu cms-clone-mobile-menu";
    menu.removeAttribute("role");
    nav.appendChild(menu);
    return menu;
  }

  function initMobileNav(wrap){
    var nav = wrap.classList.contains("mobile_nav") ? wrap : wrap.querySelector(".mobile_nav") || wrap;
    if (!nav || nav.dataset.cmsCloneNav) return;
    nav.dataset.cmsCloneNav = "1";
    if (!nav.classList.contains("opened")) nav.classList.add("closed");
    wrap.addEventListener("click", function(e){
      var t = e.target;
      if (t && t.nodeType !== 1) t = t.parentElement;
      if (t && t.closest && t.closest("ul")) return;
      e.preventDefault();
      var open = !nav.classList.contains("opened");
      nav.classList.toggle("opened", open);
      nav.classList.toggle("closed", !open);
      var menu = ensureMobileList(nav);
      if (menu) menu.style.display = open ? "block" : "none";
    });
  }

  onReady(function(){
    var rowSliders = document.querySelectorAll(".row-slider");
    for (var r = 0; r < rowSliders.length; r++) initRowSlider(rowSliders[r]);
    var diviSliders = document.querySelectorAll(".et_pb_slider");
    for (var s = 0; s < diviSliders.length; s++) initDiviSlider(diviSliders[s]);
    var tabRoots = document.querySelectorAll(".dg_at_container, .et_pb_tabs");
    for (var tr = 0; tr < tabRoots.length; tr++) initTabs(tabRoots[tr]);
    var mobiles = document.querySelectorAll(".et_mobile_nav_menu, .mobile_nav");
    for (var m = 0; m < mobiles.length; m++) initMobileNav(mobiles[m]);
    document.addEventListener("click", function(e){
      var t = e.target;
      if (t && t.nodeType !== 1) t = t.parentElement;
      var a = t && t.closest && t.closest(".cms-clone-mobile-menu .menu-item-has-children > a");
      if (!a) return;
      var li = a.parentElement;
      var sub = li && li.querySelector(":scope > .sub-menu, :scope > ul");
      if (!sub) return;
      e.preventDefault();
      e.stopPropagation();
      var open = !li.classList.contains("cms-clone-sub-open");
      li.classList.toggle("cms-clone-sub-open", open);
      sub.style.display = open ? "block" : "none";
    });
  });
})();
`.trim();

export function cloneFixStyleTag(): string {
  return `<style data-cms-clone-fix="1">\n${CLONE_FIX_CSS}\n</style>`;
}

export function cloneReviveScriptTag(): string {
  return `<script data-cms-clone-revive="1">\n${CLONE_REVIVE_JS}\n</script>`;
}
