/* 4.3.1: Markdown seguro para descrições; nenhuma tag HTML é armazenada no D1. */
(function(root) {
'use strict';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function inline(line) {
  return esc(line).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g,'$1<em>$2</em>');
}
function toHtml(markdown) {
  let paragraphs=[], block=[], list=null;
  const flush=()=>{if(block.length){paragraphs.push('<p>'+block.map(inline).join('<br>')+'</p>');block=[];}};
  const close=()=>{if(list){paragraphs.push('</'+list+'>');list=null;}};
  for (const raw of String(markdown??'').replace(/\r\n?/g,'\n').split('\n')) {
    const line=raw.trim();
    if(!line){flush();close();continue;}
    const title=line.match(/^#{1,3}\s+(.+)$/);
    const bullet=line.match(/^[-*•]\s+(.+)$/);
    const numbered=line.match(/^\d+[.)]\s+(.+)$/);
    if(title){flush();close();paragraphs.push('<h4>'+inline(title[1])+'</h4>');}
    else if(bullet||numbered){flush();const next=bullet?'ul':'ol';if(list!==next){close();paragraphs.push('<'+next+'>');list=next;}paragraphs.push('<li>'+inline((bullet||numbered)[1])+'</li>');}
    else{close();block.push(line);}
  }
  flush();close();return paragraphs.join('')||'<p></p>';
}
function fromHtml(html) {
  if(typeof DOMParser==='undefined')throw new Error('DOMParser indisponível');
  const doc=new DOMParser().parseFromString('<div id="description-root">'+html+'</div>','text/html');
  const rootNode=doc.getElementById('description-root');
  const banned=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','IMG','VIDEO','AUDIO']);
  function walk(node){
    if(node.nodeType===3)return (node.nodeValue||'').replace(/\u00a0/g,' ');
    if(node.nodeType!==1||banned.has(node.tagName))return '';
    const tag=node.tagName;
    const content=Array.from(node.childNodes).map(walk).join('');
    if(tag==='BR')return '\n';
    if(tag==='B'||tag==='STRONG')return '**'+content.trim()+'**';
    if(tag==='I'||tag==='EM')return '*'+content.trim()+'*';
    if(/^H[1-6]$/.test(tag))return '\n\n## '+content.trim()+'\n\n';
    if(tag==='LI')return content.trim();
    if(tag==='UL'||tag==='OL'){
      let i=0;return '\n'+Array.from(node.children).filter(x=>x.tagName==='LI').map(li=>(tag==='UL'?'- ':++i+'. ')+walk(li).trim()).join('\n')+'\n\n';
    }
    if(['DIV','P','SECTION','ARTICLE','BLOCKQUOTE'].includes(tag))return '\n\n'+content.trim()+'\n\n';
    return content;
  }
  return Array.from(rootNode.childNodes).map(walk).join('').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
root.YolandaDescription={toHtml,fromHtml};
})(typeof window==='undefined'?globalThis:window);
