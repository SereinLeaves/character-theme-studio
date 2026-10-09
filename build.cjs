// Package local, user-supplied artwork without changing the input vault.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const vaultArg=process.argv[2];
if(!vaultArg)throw Error('Usage: node build.cjs /path/to/your/vault');
const vault=path.resolve(vaultArg),out=path.join(__dirname,'dist/character-theme-studio');
const registry=JSON.parse(fs.readFileSync(path.join(__dirname,'registry.json'),'utf8'));
const override=fs.readFileSync(path.join(__dirname,'main-art.css'),'utf8');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
// Validate all resources before writing output.
const assets=registry.themes.map(t=>{
 const src=path.resolve(vault,t.source);
 if(!src.startsWith(vault+path.sep))throw Error('Resource outside vault: '+t.id);
 let css=fs.readFileSync(src,'utf8');
 if(sha(css)!==t.sourceSha256)throw Error('Source checksum mismatch: '+t.id);
 if(t.kind==='tessalume'){
  if(!css.includes(override))throw Error('Missing main-art override: '+t.id);
  css=css.replace(override,'');
 }
 if(sha(css)!==t.packagedSha256)throw Error('Packaged checksum mismatch: '+t.id);
 const notice=t.kind==='tessalume'?fs.readFileSync(path.join(path.dirname(src),'NOTICE.md'),'utf8'):null;
 return {id:t.id,css,notice};
});
const first=registry.themes.find(t=>t.kind==='tessalume');
const license=fs.readFileSync(path.join(vault,path.dirname(first.source),'MIT-LICENSE.txt'),'utf8');
const core=fs.readFileSync(path.join(__dirname,'core.js'),'utf8');
const entry=fs.readFileSync(path.join(__dirname,'main.js'),'utf8')
 .replace("require('./core')",`(()=>{const module={exports:{}};${core};return module.exports;})()`)
 .replace("require('./registry.json')",JSON.stringify(registry));
fs.mkdirSync(path.join(out,'themes'),{recursive:true});
for(const a of assets){
 fs.writeFileSync(path.join(out,'themes',a.id+'.css'),a.css);
 if(a.notice)fs.writeFileSync(path.join(out,'themes',a.id+'.NOTICE.md'),a.notice);
}
for(const f of ['manifest.json','styles.css','NOTICE.md'])fs.copyFileSync(path.join(__dirname,f),path.join(out,f));
fs.writeFileSync(path.join(out,'main.js'),entry);
fs.writeFileSync(path.join(out,'MIT-LICENSE.txt'),license);
console.log('Packaged 15 themes locally: '+out);
