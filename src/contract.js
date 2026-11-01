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
