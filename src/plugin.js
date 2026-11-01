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
