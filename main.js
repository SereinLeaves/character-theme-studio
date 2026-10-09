"use strict";
const { Plugin, PluginSettingTab, Setting, FuzzySuggestModal, Notice } = require('obsidian');
const { profile, settings, scheduledTheme, tuningCss } = require('./core');
const registry = require('./registry.json');
// The only private-API dependency. Verified against installed Obsidian.
function cssBridge(app) {
  const c = app.customCss;
  if (!c || !(c.enabledSnippets instanceof Set) || typeof c.setCssEnabledStatus !== 'function')
    throw Error('当前 Obsidian 不支持片段兼容接口；没有接管主题，请保留原 CSS。');
  return c;
}
class ThemePicker extends FuzzySuggestModal {
  constructor(plugin) { super(plugin.app); this.plugin=plugin; this.setPlaceholder('搜索角色或主题（Tessalume / 原版）'); }
  getItems() { return registry.themes; }
  getItemText(t) { return t.name; }
  onChooseItem(t) { this.plugin.choose(t.id).catch(e=>this.plugin.fail(e)); }
}
class ThemeSettings extends PluginSettingTab {
  constructor(app,plugin) { super(app,plugin);this.plugin=plugin; }
  display() {
    const el=this.containerEl,p=this.plugin;el.empty();el.addClass('character-theme-studio-settings');
    el.createEl('h2',{text:'角色主题工作室'});
    el.createEl('p',{text:'15 套本地主题 · 切换与调节即时生效 · 每个角色独立保存 · 不改原 CSS'});
    new Setting(el).setName('插件接管主题').setDesc('关闭会恢复接管前启用的主题片段，不删除任何主题。')
      .addToggle(t=>t.setValue(p.settings.active).onChange(v=>p.setActive(v).then(()=>this.display()).catch(e=>{p.fail(e);this.display()})));
    const auto=p.settings.automatic;
    new Setting(el).setName('主题切换方式').setDesc('先选择切换方式，再配置对应角色；切换方式不会清除已保存的选择。')
      .addDropdown(d=>d.addOption('off','固定主题').addOption('appearance','跟随 Obsidian 明暗').addOption('clock','按时间切换').setValue(auto.mode).onChange(v=>p.setAutomatic('mode',v).then(()=>this.display()).catch(e=>{p.fail(e);this.display()})));
    if(auto.mode==='off')new Setting(el).setName('角色主题').addDropdown(d=>{
      for(const t of registry.themes)d.addOption(t.id,t.name);
      d.setValue(p.settings.selected).onChange(id=>p.choose(id).then(()=>this.display()).catch(e=>{p.fail(e);this.display()}));
    });
    const labels=auto.mode==='appearance'?[['day','浅色主题'],['night','深色主题']]:[['day','白天主题'],['night','夜晚主题']];
    if(auto.mode!=='off')for(const [key,label] of labels)new Setting(el).setName(label).addDropdown(d=>{
      for(const t of registry.themes)d.addOption(t.id,t.name);
      d.setValue(auto[key]).onChange(v=>p.setAutomatic(key,v).then(()=>this.display()).catch(e=>p.fail(e)));
    });
    if(auto.mode==='clock')for(const [key,label] of [['dayStart','白天开始'],['nightStart','夜晚开始']])new Setting(el).setName(label).setDesc('每天整点切换；两个开始时间不能相同。').addDropdown(d=>{
      for(let h=0;h<24;h++)d.addOption(String(h),String(h).padStart(2,'0')+':00');
      d.setValue(String(auto[key])).onChange(v=>p.setAutomatic(key,Number(v)).then(()=>this.display()).catch(e=>p.fail(e)));
    });
    this.displayedStatus=p.statusText();el.createEl('p',{text:this.displayedStatus});
    const theme=p.theme(),value=p.settings.profiles[theme.id];
    el.createEl('p',{text:'当前调节：'+theme.name+'（参数按角色保存）'});
    const slide=(label,key,min,max,step,desc)=>new Setting(el).setName(label).setDesc(desc).addSlider(s=>s.setLimits(min,max,step).setValue(value[key]).setDynamicTooltip().onChange(v=>p.update(key,v).catch(e=>p.fail(e))));
    slide('主图清晰度','clarity',0,100,1,'数值越大，图片越明显；不会改动图片文件。默认 50。');
    slide('正文最大宽度','width',480,1100,20,'单位 px；窄窗口自动适配。默认 840。');
    new Setting(el).setName('显示四角角色卡').setDesc(theme.kind==='tessalume'?'默认隐藏；打开恢复相框卡及对应留白。低矮窗格自动收起堆叠卡。':'原版主题没有 Tessalume 四角卡，此选项不适用。')
      .addToggle(t=>t.setValue(value.cards).setDisabled(theme.kind!=='tessalume').onChange(v=>p.update('cards',v).catch(e=>p.fail(e))));
    new Setting(el).setName('角色动效').setDesc(theme.id==='legacy-aemeath'?'原版爱弥斯源样式设为静态；此开关不强行改写其设计。':'默认静态。系统“减少动态效果”始终优先。')
      .addToggle(t=>t.setValue(value.motion).onChange(v=>p.update('motion',v).catch(e=>p.fail(e))));
    new Setting(el).setName('重置当前角色参数').addButton(b=>b.setButtonText('重置').onClick(()=>p.reset().then(()=>this.display()).catch(e=>p.fail(e))));
    new Setting(el).setName('查看主题索引').addButton(b=>b.setButtonText('打开说明').onClick(()=>p.app.workspace.openLinkText('主页/角色主题插件使用说明','',false)));
    const preview=theme.preview;
    if(preview){el.createEl('h3',{text:'主题示意（静态预览，不反映滑块的实时数值）'});const img=el.createEl('img',{cls:'character-theme-studio-preview',attr:{alt:theme.name}});img.src=p.app.vault.adapter.getResourcePath(preview);}
    if(p.lastError)el.createEl('p',{cls:'character-theme-studio-error',text:p.lastError});
  }
}
module.exports = class CharacterThemeStudio extends Plugin {
  async onload() {
    this.disposed=false;this.queue=Promise.resolve();this.saveQueue=Promise.resolve();this.cache=new Map();
    const saved=await this.loadData();this.settings=settings(saved,registry.themes);
    if(!saved){
      const appearance=JSON.parse(await this.app.vault.adapter.read(this.app.vault.configDir+'/appearance.json'));
      const current=registry.themes.find(t=>(appearance.enabledCssSnippets||[]).includes(t.snippet));
      if(current)this.settings.selected=current.id;
    }
    this.settingTab=new ThemeSettings(this.app,this);this.addSettingTab(this.settingTab);
    this.addCommand({id:'choose-character',name:'切换角色主题',callback:()=>new ThemePicker(this).open()});
    this.addCommand({id:'toggle-theme',name:'暂停 / 恢复角色主题',callback:()=>this.setActive(!this.settings.active).catch(e=>this.fail(e))});
    this.addRibbonIcon('palette','切换角色主题',()=>new ThemePicker(this).open());
    this.observed=new Set();
    this.observer=new ResizeObserver(entries=>{for(const e of entries){e.target.toggleAttribute('data-cts-short',e.contentRect.height<520);e.target.toggleAttribute('data-cts-tiny',e.contentRect.height<300);}});
    this.registerEvent(this.app.workspace.on('layout-change',()=>this.watchPanes()));
    this.modeObserver=new MutationObserver(()=>this.checkAutomatic());
    this.modeObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
    this.registerInterval(window.setInterval(()=>this.checkAutomatic(),30000));
    this.app.workspace.onLayoutReady(()=>{if(!this.disposed&&this.settings.active)this.enqueue(()=>this.apply()).catch(e=>this.fail(e));});
  }
  theme(){const id=scheduledTheme(this.settings,document.body.classList.contains('theme-dark'));return registry.themes.find(t=>t.id===id)||registry.themes[0];}
  statusText(){if(!this.settings.active)return '已暂停接管 · 当前使用原有外观片段';const mode=this.settings.automatic.mode,label=mode==='off'?'固定主题':mode==='clock'?'按时间切换':document.body.classList.contains('theme-dark')?'深色模式':'浅色模式';return '当前生效：'+this.theme().name+' · '+label;}
  checkAutomatic(){if(this.disposed||!this.settings.active||this.settings.automatic.mode==='off')return;this.enqueue(async()=>{if(this.settings.active&&this.styleTheme!==this.theme().id)await this.apply();if(this.settingTab.containerEl?.isConnected&&this.settingTab.displayedStatus!==this.statusText())this.settingTab.display();}).catch(e=>this.fail(e));}
  setAutomatic(key,value){return this.enqueue(async()=>{
    if(!['mode','day','night','dayStart','nightStart'].includes(key))throw Error('未知昼夜设置');
    const old=this.settings.automatic,next={...old,[key]:value};
    if(next.dayStart===next.nightStart)throw Error('白天与夜晚的开始时间不能相同');
    this.settings.automatic=settings({...this.settings,automatic:next},registry.themes).automatic;
    try{if(this.settings.active)await this.apply();else await this.persist()}catch(e){this.settings.automatic=old;throw e;}
  });}
  watchPanes(){if(this.disposed)return;const panes=new Set(document.querySelectorAll('.workspace-split.mod-root .workspace-leaf-content[data-type="markdown"]'));for(const el of this.observed)if(!panes.has(el)){this.observer.unobserve(el);el.removeAttribute('data-cts-short');el.removeAttribute('data-cts-tiny');this.observed.delete(el);}for(const el of panes)if(!this.observed.has(el)){this.observed.add(el);this.observer.observe(el);}}
  fail(e){this.lastError=e.message||String(e);console.error('[角色主题工作室]',e);new Notice(this.lastError,8000);}
  enqueue(job){const next=this.queue.then(()=>{if(!this.disposed)return job()});this.queue=next.catch(()=>{});return next;}
  persist(){const snapshot=JSON.parse(JSON.stringify(this.settings));const next=this.saveQueue.then(()=>this.saveData(snapshot));this.saveQueue=next.catch(()=>{});return next;}
  async takeOwnership(){
    const bridge=cssBridge(this.app),managed=new Set(registry.conflicts);
    if(!this.settings.ownership){
      this.settings.restoreSnippets=[...bridge.enabledSnippets].filter(x=>managed.has(x));
      this.settings.ownership=true;await this.persist();
    }
    if(this.disposed)return;
    let changed=false;
    for(const id of [...bridge.enabledSnippets])if(managed.has(id)){bridge.setCssEnabledStatus(id,false);changed=true;}
    if(changed&&typeof bridge.loadSnippets==='function')await bridge.loadSnippets();
  }
  restore(){
    if(!this.settings.ownership)return;
    const bridge=cssBridge(this.app),managed=new Set(registry.conflicts);
    // Respect a user's manually selected appearance instead of overwriting it.
    const alreadySelected=[...bridge.enabledSnippets].some(x=>managed.has(x));
    if(!alreadySelected)for(const id of this.settings.restoreSnippets)bridge.setCssEnabledStatus(id,true);
    this.settings.ownership=false;this.settings.restoreSnippets=[];
  }
  async apply(){
    const t=this.theme();let css=this.cache.get(t.id);
    if(!css){css=await this.app.vault.adapter.read(this.manifest.dir+'/themes/'+t.id+'.css');this.cache.clear();this.cache.set(t.id,css);}
    if(this.disposed)return;
    // Load before disabling anything, so a missing asset cannot blank the theme.
    try{await this.takeOwnership()}catch(e){if(!this.style&&this.settings.ownership){try{this.restore();await this.persist()}catch(restoreError){console.error('[角色主题工作室]恢复失败',restoreError)}}throw e;}
    if(this.disposed)return;
    if(!this.style){this.style=document.createElement('style');this.style.id='character-theme-studio-active';document.head.append(this.style);}
    if(this.styleTheme!==t.id){this.style.textContent=css;this.styleTheme=t.id;}
    if(!this.tuning){this.tuning=document.createElement('style');this.tuning.id='character-theme-studio-tuning';document.head.append(this.tuning);}
    this.tuning.textContent=tuningCss(t,this.settings.profiles[t.id]);this.watchPanes();
    this.lastError='';await this.persist();
  }
  choose(id){return this.enqueue(async()=>{
    if(!registry.themes.some(t=>t.id===id))throw Error('未知角色主题');
    const previous=this.settings.selected,mode=this.settings.automatic.mode;this.settings.selected=id;this.settings.automatic.mode='off';this.settings.active=true;
    try{await this.apply()}catch(e){this.settings.selected=previous;this.settings.automatic.mode=mode;throw e;}
  });}
  update(key,value){return this.enqueue(async()=>{
    if(!['clarity','width','cards','motion'].includes(key))throw Error('未知设置项');
    const id=this.theme().id;this.settings.profiles[id]=profile({...this.settings.profiles[id],[key]:value});
    if(this.settings.active)await this.apply();else await this.persist();
  });}
  reset(){return this.enqueue(async()=>{this.settings.profiles[this.theme().id]=profile();if(this.settings.active)await this.apply();else await this.persist();});}
  setActive(active){return this.enqueue(async()=>{
    if(active){this.settings.active=true;await this.apply()}
    else{this.restore();this.settings.active=false;this.style?.remove();this.tuning?.remove();this.style=null;this.tuning=null;this.styleTheme=null;await this.persist();}
  });}
  onunload(){this.disposed=true;this.modeObserver?.disconnect();this.style?.remove();this.tuning?.remove();this.style=null;this.observer?.disconnect();for(const el of this.observed||[]){el.removeAttribute('data-cts-short');el.removeAttribute('data-cts-tiny');}try{this.restore()}catch(e){console.error('[角色主题工作室]恢复片段失败',e)} }
};
