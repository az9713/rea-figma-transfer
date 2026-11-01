'use strict';
const fs=require('node:fs');process.chdir(require('node:path').resolve(__dirname,'..'));fs.mkdirSync('dist',{recursive:true});
const core=fs.readFileSync('src/contract.js','utf8');
fs.writeFileSync('docs/contract.js',core);
const html=fs.readFileSync('docs/plugin-ui.html','utf8').replace('<script src="contract.js"></script>','<script>'+core+'</script>');
fs.writeFileSync('dist/code.js','const PLUGIN_HTML='+JSON.stringify(html)+';\n'+core+'\n'+fs.readFileSync('src/plugin.js','utf8'));
fs.writeFileSync('dist/manifest.json',JSON.stringify({name:'Transfer Contract Inspector',api:'1.0.0',main:'code.js',editorType:['figma'],documentAccess:'dynamic-page',networkAccess:{allowedDomains:['none']}},null,2));
console.log('Built dist/code.js and manifest.json');
