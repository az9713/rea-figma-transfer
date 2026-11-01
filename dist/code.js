const PLUGIN_HTML="<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Transfer Contract Inspector</title><style>body{background:#111827;color:#e5e7eb;font:15px system-ui;margin:24px;max-width:1000px}button,input,textarea{font:inherit;background:#1f2937;color:#fff;border:1px solid #64748b;border-radius:5px;padding:9px;margin:4px 0}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:9px;border:1px solid #475569;overflow-wrap:anywhere}td{max-width:190px}summary{cursor:pointer;margin:14px 0}textarea{width:96%;height:210px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b1020;padding:16px}label{display:block}a{color:#93c5fd}.warning{color:#fbbf24}</style><h1>Transfer Contract Inspector</h1><p>Capture a selection, transfer it, then compare the same root and child ordering. Review constraints, text, fonts, bindings and component properties in one report.</p><p id=\"mode\" class=\"warning\"></p><button id=\"capture\">Capture baseline</button> <button id=\"compare\">Compare current selection</button><label>Baseline contract<textarea id=\"baseline\" spellcheck=\"false\" aria-label=\"Baseline JSON\"></textarea></label><label>Single object path for constraint repair <input id=\"path\" value=\"0/0\"></label><button id=\"preview\">Preview constraints</button> <button id=\"apply\" disabled>Apply previewed constraint repair</button><p>Repairs affect one constraints property. Other findings require manual review. Missing or mixed values never count as a pass.</p><div id=\"summary\" role=\"status\">Ready.</div><details><summary>JSON details</summary><pre id=\"out\">Ready.</pre></details><script>'use strict';\nvar TransferContract = (() => {\n  const fields = ['name','type','visible','opacity','constraints','layoutMode','layoutSizingHorizontal','layoutSizingVertical','width','height','rotation','fontName','fontSize','characters','boundVariables','explicitVariableModes','componentProperties','overrides'];\n  const limit = 2500;\n  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);\n  function unknown(v) { return !!v&&typeof v==='object'&&(own(v,'$unknown')||Object.keys(v).some(k=>unknown(v[k]))); }\n  function value(v, depth=0) {\n    if (depth>24) throw Error('Property nesting exceeds supported depth');\n    if (v === undefined || typeof v === 'symbol') return {$unknown:'mixed or unavailable'};\n    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;\n    if (typeof v === 'number') { if(!Number.isFinite(v)) throw Error('Non-finite property'); return v; }\n    if (Array.isArray(v)) { if(v.length>limit) throw Error('Property array too large'); return v.map(x=>value(x,depth+1)); }\n    if (typeof v !== 'object') throw Error('Unsupported property type');\n    const out=Object.create(null), keys=Object.keys(v).sort();\n    if(keys.length>limit) throw Error('Property object too large');\n    for(const k of keys) { if(['__proto__','constructor','prototype'].includes(k)) throw Error('Unsafe property key'); out[k]=value(v[k],depth+1); }\n    return out;\n  }\n  function capture(roots) {\n    if(!Array.isArray(roots)||!roots.length) throw Error('Select at least one object');\n    const nodes=[], seen=new Set();\n    function visit(n,path,depth) {\n      if(depth>64||nodes.length>=limit) throw Error('Selection exceeds supported node/depth limit');\n      if(seen.has(n)) throw Error('Repeated/cyclic selection; select non-overlapping roots');\n      seen.add(n);\n      const properties=Object.create(null);\n      for(const k of fields) if(k in n) {\n        try { properties[k]=value(n[k]); }\n        catch(e) { properties[k]={$unknown:String(e.message)}; }\n      }\n      nodes.push({path,properties});\n      if('children' in n) for(let i=0;i<n.children.length;i++) visit(n.children[i],path+'/'+i,depth+1);\n    }\n    roots.forEach((n,i)=>visit(n,String(i),0));\n    return {schema:'transfer-contract/v1',mapping:'selection-order-and-child-index',nodes};\n  }\n  function validate(c) {\n    if(!c||c.schema!=='transfer-contract/v1'||c.mapping!=='selection-order-and-child-index'||!Array.isArray(c.nodes)||!c.nodes.length||c.nodes.length>limit) throw Error('Invalid transfer contract');\n    const seen=new Set();\n    for(const n of c.nodes) {\n      if(!n||typeof n.path!=='string'||!/^\\d+(\\/\\d+)*$/.test(n.path)||n.path.length>512||seen.has(n.path)) throw Error('Invalid or duplicate structural path');\n      seen.add(n.path);\n      if(!n.properties||typeof n.properties!=='object'||Array.isArray(n.properties)) throw Error('Invalid properties');\n      for(const k of Object.keys(n.properties)) if(!fields.includes(k)) throw Error('Unknown contract field: '+k);\n      value(n.properties);\n    }\n    return c;\n  }\n  function parse(text) { if(typeof text!=='string'||text.length>2_000_000) throw Error('Contract must be text under 2 MB'); return validate(JSON.parse(text)); }\n  function canonical(v) { return JSON.stringify(value(v)); }\n  function compare(before,after) {\n    validate(before);validate(after);\n    const findings=[], left=new Map(before.nodes.map(n=>[n.path,n.properties])), right=new Map(after.nodes.map(n=>[n.path,n.properties]));\n    for(const path of new Set([...left.keys(),...right.keys()])) {\n      const a=left.get(path),b=right.get(path);\n      if(!a||!b) { findings.push({path,field:'$node',kind:!b?'missing-node':'added-node'}); continue; }\n      for(const field of new Set([...Object.keys(a),...Object.keys(b)])) {\n        const av=a[field],bv=b[field];\n        if(unknown(av)||unknown(bv)) {\n          findings.push({path,field,kind:'unknown',before:av,after:bv});continue;\n        }\n        if(canonical(av)!==canonical(bv)) findings.push({path,field,kind:!own(b,field)?'missing-field':!own(a,field)?'added-field':'changed',before:av,after:bv});\n      }\n    }\n    return {mapping:before.mapping,findings,passes:findings.length===0,scope:'Declared fields only; matching structural position does not prove component or variable identity equivalence.'};\n  }\n  function constraintRepair(before, roots, path) {\n    validate(before);\n    const target=before.nodes.find(n=>n.path===path), current=capture(roots);\n    const currentNode=current.nodes.find(n=>n.path===path);\n    if(!target||!currentNode||target.properties.type!==currentNode.properties.type||target.properties.name!==currentNode.properties.name) throw Error('Structural identity guard failed');\n    const c=target.properties.constraints;\n    if(!c||!['MIN','MAX','CENTER','STRETCH','SCALE'].includes(c.horizontal)||!['MIN','MAX','CENTER','STRETCH','SCALE'].includes(c.vertical)||Object.keys(c).length!==2) throw Error('Unsupported constraints');\n    let node=roots[Number(path.split('/')[0])];\n    for(const step of path.split('/').slice(1)) node=node.children[Number(step)];\n    if(!node||!('constraints' in node)) throw Error('Target does not support constraints');\n    return {node,constraints:{horizontal:c.horizontal,vertical:c.vertical},guard:canonical(current),path};\n  }\n  return {capture,validate,parse,compare,canonical,constraintRepair};\n})();\nif(typeof module!=='undefined') module.exports=TransferContract;\n</script><script>\r\nconst $=id=>document.getElementById(id);let demo=window.parent===window;\r\n$('mode').textContent=demo?'Browser demonstration: synthetic objects, not a live Figma document.':'Figma plugin: capture and compare selected objects.';\r\nconst fixture={schema:'transfer-contract/v1',mapping:'selection-order-and-child-index',nodes:[{path:'0',properties:{name:'Card',type:'FRAME'}},{path:'0/0',properties:{name:'Title',type:'TEXT',characters:'E = mc²',constraints:{horizontal:'STRETCH',vertical:'MIN'},fontName:{family:'Inter',style:'Regular'}}}]};\r\nfunction renderResult(result){const box=$('summary');box.replaceChildren();const title=document.createElement('p');title.textContent=result.passes?'Declared contract passes.':'Review '+result.findings.length+' difference or unknown item(s).';box.append(title);const table=document.createElement('table');const head=document.createElement('tr');for(const name of ['Object','Field','Before','After','Status']){const th=document.createElement('th');th.textContent=name;head.append(th);}table.append(head);for(const f of result.findings){const row=document.createElement('tr');for(const v of [f.path,f.field,f.before,f.after,f.kind]){const td=document.createElement('td');td.textContent=v===undefined?'Not captured':typeof v==='object'?JSON.stringify(v):String(v);row.append(td);}table.append(row);}box.append(table);$('out').textContent=JSON.stringify(result,null,2);}\r\nfunction send(type){$('apply').disabled=true;if(demo){try{if(type==='capture'){$('baseline').value=JSON.stringify(fixture,null,2);$('out').textContent='Synthetic baseline captured.';$('summary').textContent='Synthetic baseline captured. Compare to see the changed constraint.';}else if(type==='compare'){const current=JSON.parse(JSON.stringify(fixture));current.nodes[1].properties.constraints.horizontal='MIN';renderResult(TransferContract.compare(TransferContract.parse($('baseline').value),current));}else $('out').textContent='Repairs run only inside Figma.';}catch(e){$('out').textContent=e.message;$('summary').textContent=e.message;}return;}parent.postMessage({pluginMessage:{type,baseline:$('baseline').value,path:$('path').value}},'*');}\r\n$('capture').onclick=()=>send('capture');$('compare').onclick=()=>send('compare');$('preview').onclick=()=>send('preview-repair');$('apply').onclick=()=>send('apply-repair');$('baseline').oninput=()=>{$('apply').disabled=true};$('path').oninput=()=>{$('apply').disabled=true};\r\nwindow.onmessage=e=>{if(e.source!==parent||!e.data||!e.data.pluginMessage)return;const m=e.data.pluginMessage;if(m.type==='baseline')$('baseline').value=JSON.stringify(m.contract,null,2);if(m.result)renderResult(m.result);else{$('out').textContent=JSON.stringify(m,null,2);$('summary').textContent=m.type==='preview'?'Preview '+m.path+': '+JSON.stringify(m.constraints):m.message||m.type;}$('apply').disabled=m.type!=='preview';};\r\n</script></html>\r\n";
'use strict';
var TransferContract = (() => {
  const fields = ['name','type','visible','opacity','constraints','layoutMode','layoutSizingHorizontal','layoutSizingVertical','width','height','rotation','fontName','fontSize','characters','boundVariables','explicitVariableModes','componentProperties','overrides'];
  const limit = 2500;
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function unknown(v) { return !!v&&typeof v==='object'&&(own(v,'$unknown')||Object.keys(v).some(k=>unknown(v[k]))); }
  function value(v, depth=0) {
    if (depth>24) throw Error('Property nesting exceeds supported depth');
    if (v === undefined || typeof v === 'symbol') return {$unknown:'mixed or unavailable'};
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if(!Number.isFinite(v)) throw Error('Non-finite property'); return v; }
    if (Array.isArray(v)) { if(v.length>limit) throw Error('Property array too large'); return v.map(x=>value(x,depth+1)); }
    if (typeof v !== 'object') throw Error('Unsupported property type');
    const out=Object.create(null), keys=Object.keys(v).sort();
    if(keys.length>limit) throw Error('Property object too large');
    for(const k of keys) { if(['__proto__','constructor','prototype'].includes(k)) throw Error('Unsafe property key'); out[k]=value(v[k],depth+1); }
    return out;
  }
  function capture(roots) {
    if(!Array.isArray(roots)||!roots.length) throw Error('Select at least one object');
    const nodes=[], seen=new Set();
    function visit(n,path,depth) {
      if(depth>64||nodes.length>=limit) throw Error('Selection exceeds supported node/depth limit');
      if(seen.has(n)) throw Error('Repeated/cyclic selection; select non-overlapping roots');
      seen.add(n);
      const properties=Object.create(null);
      for(const k of fields) if(k in n) {
        try { properties[k]=value(n[k]); }
        catch(e) { properties[k]={$unknown:String(e.message)}; }
      }
      nodes.push({path,properties});
      if('children' in n) for(let i=0;i<n.children.length;i++) visit(n.children[i],path+'/'+i,depth+1);
    }
    roots.forEach((n,i)=>visit(n,String(i),0));
    return {schema:'transfer-contract/v1',mapping:'selection-order-and-child-index',nodes};
  }
  function validate(c) {
    if(!c||c.schema!=='transfer-contract/v1'||c.mapping!=='selection-order-and-child-index'||!Array.isArray(c.nodes)||!c.nodes.length||c.nodes.length>limit) throw Error('Invalid transfer contract');
    const seen=new Set();
    for(const n of c.nodes) {
      if(!n||typeof n.path!=='string'||!/^\d+(\/\d+)*$/.test(n.path)||n.path.length>512||seen.has(n.path)) throw Error('Invalid or duplicate structural path');
      seen.add(n.path);
      if(!n.properties||typeof n.properties!=='object'||Array.isArray(n.properties)) throw Error('Invalid properties');
      for(const k of Object.keys(n.properties)) if(!fields.includes(k)) throw Error('Unknown contract field: '+k);
      value(n.properties);
    }
    return c;
  }
  function parse(text) { if(typeof text!=='string'||text.length>2_000_000) throw Error('Contract must be text under 2 MB'); return validate(JSON.parse(text)); }
  function canonical(v) { return JSON.stringify(value(v)); }
  function compare(before,after) {
    validate(before);validate(after);
    const findings=[], left=new Map(before.nodes.map(n=>[n.path,n.properties])), right=new Map(after.nodes.map(n=>[n.path,n.properties]));
    for(const path of new Set([...left.keys(),...right.keys()])) {
      const a=left.get(path),b=right.get(path);
      if(!a||!b) { findings.push({path,field:'$node',kind:!b?'missing-node':'added-node'}); continue; }
      for(const field of new Set([...Object.keys(a),...Object.keys(b)])) {
        const av=a[field],bv=b[field];
        if(unknown(av)||unknown(bv)) {
          findings.push({path,field,kind:'unknown',before:av,after:bv});continue;
        }
        if(canonical(av)!==canonical(bv)) findings.push({path,field,kind:!own(b,field)?'missing-field':!own(a,field)?'added-field':'changed',before:av,after:bv});
      }
    }
    return {mapping:before.mapping,findings,passes:findings.length===0,scope:'Declared fields only; matching structural position does not prove component or variable identity equivalence.'};
  }
  function constraintRepair(before, roots, path) {
    validate(before);
    const target=before.nodes.find(n=>n.path===path), current=capture(roots);
    const currentNode=current.nodes.find(n=>n.path===path);
    if(!target||!currentNode||target.properties.type!==currentNode.properties.type||target.properties.name!==currentNode.properties.name) throw Error('Structural identity guard failed');
    const c=target.properties.constraints;
    if(!c||!['MIN','MAX','CENTER','STRETCH','SCALE'].includes(c.horizontal)||!['MIN','MAX','CENTER','STRETCH','SCALE'].includes(c.vertical)||Object.keys(c).length!==2) throw Error('Unsupported constraints');
    let node=roots[Number(path.split('/')[0])];
    for(const step of path.split('/').slice(1)) node=node.children[Number(step)];
    if(!node||!('constraints' in node)) throw Error('Target does not support constraints');
    return {node,constraints:{horizontal:c.horizontal,vertical:c.vertical},guard:canonical(current),path};
  }
  return {capture,validate,parse,compare,canonical,constraintRepair};
})();
if(typeof module!=='undefined') module.exports=TransferContract;

'use strict';
figma.showUI(PLUGIN_HTML,{width:660,height:690,themeColors:true});
let pending=null;
figma.ui.onmessage = message => {
  try {
    if(!message||typeof message.type!=='string') throw Error('Invalid request');
    const roots=Array.from(figma.currentPage.selection);
    if(message.type==='capture') {
      pending=null;
      figma.ui.postMessage({type:'baseline',contract:TransferContract.capture(roots)});
    } else if(message.type==='compare') {
      pending=null;
      const baseline=TransferContract.parse(message.baseline);
      figma.ui.postMessage({type:'result',result:TransferContract.compare(baseline,TransferContract.capture(roots))});
    } else if(message.type==='preview-repair') {
      const baseline=TransferContract.parse(message.baseline);
      pending=TransferContract.constraintRepair(baseline,roots,message.path);
      pending.baseline=baseline;
      figma.ui.postMessage({type:'preview',path:pending.path,constraints:pending.constraints});
    } else if(message.type==='apply-repair') {
      if(!pending) throw Error('Preview a repair first');
      if(TransferContract.canonical(TransferContract.capture(roots))!==pending.guard) { pending=null;throw Error('Selection changed; preview again'); }
      if(TransferContract.constraintRepair(pending.baseline,roots,pending.path).node!==pending.node) { pending=null;throw Error('Selected object identity changed; preview again'); }
      const repair=pending;pending=null;
      repair.node.constraints=repair.constraints;
      figma.commitUndo();
      figma.ui.postMessage({type:'applied',path:repair.path});
    } else throw Error('Unsupported request');
  } catch(error) { pending=null;figma.ui.postMessage({type:'error',message:String(error.message)}); }
};
