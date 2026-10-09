"use strict";
const DEFAULTS = Object.freeze({ clarity: 50, width: 840, cards: false, motion: false });
function clamp(value, min, max, fallback) {
  const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function profile(raw = {}) {
  return { clarity: clamp(raw.clarity, 0, 100, 50), width: clamp(raw.width, 480, 1100, 840),
    cards: raw.cards === true, motion: raw.motion === true };
}
function settings(raw, themes) {
  const source = raw && typeof raw === "object" ? raw : {};
  const profiles = {};
  for (const t of themes) profiles[t.id] = profile(source.profiles?.[t.id]);
  const valid=id=>themes.some(t=>t.id===id), selected=valid(source.selected)?source.selected:themes[0].id;
  const a=source.automatic||{};
  const dayStart=Math.round(clamp(a.dayStart,0,23,7));
  let nightStart=Math.round(clamp(a.nightStart,0,23,19));
  if(dayStart===nightStart)nightStart=(dayStart+12)%24;
  return { active: source.active !== false, selected,
    automatic:{mode:['clock','appearance'].includes(a.mode)?a.mode:'off',day:valid(a.day)?a.day:selected,night:valid(a.night)?a.night:selected,dayStart,nightStart},
    profiles, restoreSnippets: Array.isArray(source.restoreSnippets) ? source.restoreSnippets.filter(x => typeof x === "string") : [],
    ownership: source.ownership === true };
}
function scheduledTheme(s, dark=false, date=new Date()) {
  const a=s.automatic;
  if(!a||a.mode==='off')return s.selected;
  if(a.mode==='appearance')return dark?a.night:a.day;
  const h=date.getHours()+date.getMinutes()/60;
  const day=a.dayStart<a.nightStart?h>=a.dayStart&&h<a.nightStart:h>=a.dayStart||h<a.nightStart;
  return day?a.day:a.night;
}
function tuningCss(theme, raw) {
  const p = profile(raw), stage = '.workspace-split.mod-root .workspace-leaf-content[data-type="markdown"]';
  let css = `body.theme-light,body.theme-dark{--file-line-width:${p.width}px!important;--line-width:${p.width}px!important;--tl-motion-state:${p.motion?'running':'paused'}!important;--qx-play:${p.motion?'running':'paused'}!important;--ct-play:${p.motion?'running':'paused'}!important;}
${stage} .markdown-preview-sizer{max-width:${p.width}px!important;}
`;
  if (theme.kind === 'tessalume') {
    for (const mode of ['light', 'dark']) {
      const base = mode === 'light' ? [86,70,42,24] : [94,82,58,38];
      const alphas = base.map((x,i) => clamp(x-(p.clarity-50)*.4,i===0?60:0,100,x));
      css += `body.theme-${mode}{--tl-reading-veil:linear-gradient(90deg,${alphas.map((a,i)=>`color-mix(in srgb,var(--tl-bg) ${a}%,transparent) ${[0,32,60,100][i]}%`).join(',')})!important;}\n`;
    }
    css += `${stage}{background-image:var(--tl-motif),var(--tl-reading-veil),var(--tl-chat)!important;}\n`;
    if (!p.cards) css += `${stage}::before,${stage}::after,${stage}>.view-content::before,${stage}>.view-content::after{content:none!important;display:none!important;animation:none!important;}
${stage} :is(.markdown-preview-view,.cm-scroller){padding-left:28px!important;padding-right:28px!important;}\n`;
    // Guard card stacking by pane height, even in horizontal splits.
    else css += `${stage}[data-cts-short]> .view-content::before,${stage}[data-cts-short]::after{display:none!important;}
${stage}[data-cts-tiny]::before,${stage}[data-cts-tiny]::after,${stage}[data-cts-tiny]> .view-content::before,${stage}[data-cts-tiny]> .view-content::after{display:none!important;}
${stage}[data-cts-tiny] :is(.markdown-preview-view,.cm-scroller){padding-left:28px!important;padding-right:28px!important;}\n`;
  } else {
    const prefix = theme.prefix, originals = { qx:[.72,.5],ct:[.62,.55],wb:[.42,.62] }[prefix];
    const alpha = clamp(originals[0]+(p.clarity-50)*.006, .1, 1, originals[0]);
    const surface = clamp(originals[1]-(p.clarity-50)*.004, .25, .9, originals[1]);
    css += `body.theme-light,body.theme-dark{--${prefix}-portrait-alpha:${alpha}!important;--${prefix}-surface-alpha:${surface}!important;}\n`;
  }
  if (!p.motion) css += `.workspace-split.mod-root *, .workspace-split.mod-root *::before,.workspace-split.mod-root *::after,body::before,body::after,.app-container::before,.app-container::after{animation-play-state:paused!important;}\n`;
  css += `@media(prefers-reduced-motion:reduce){.workspace-split.mod-root *,.workspace-split.mod-root *::before,.workspace-split.mod-root *::after,body::before,body::after,.app-container::before,.app-container::after{animation:none!important;}}
@media print{body.theme-light,body.theme-dark{--tl-ink:#111!important;--tl-accent:#333!important;--qx-ink:#111!important;--ct-ink:#111!important;--wb-ink:#111!important;--text-normal:#111!important;}
${stage},${stage} .markdown-preview-view{background:white!important;color:#111!important;}
${stage} .markdown-preview-view{padding:0!important;}
${stage} .markdown-preview-view :is(p,li,td,h1,h2,h3,a){color:#111!important;}
.workspace-split.mod-root .workspace-leaf::before,.workspace-split.mod-root .workspace-leaf::after,${stage}::before,${stage}::after,${stage}>.view-content::before,${stage}>.view-content::after{display:none!important;}}
`;
  return css;
}
module.exports = { DEFAULTS, profile, settings, scheduledTheme, tuningCss };
