// Verificações adicionais sem rede: deep linking, conversão, máscara, UI e textos legais.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { vitrineScript } from './helpers/source-fixture.mjs';
const read = file => fs.readFileSync(new URL('../'+file, import.meta.url), 'utf8');
let checks = 0;
function check(value,message) { assert.ok(value,message); checks++; }
const handlers = {};
const maskWin = {};
const maskDoc = { activeElement:null,addEventListener(name,fn){handlers[name]=fn;} };
vm.runInNewContext(read('public/js/crm-input-masks.js'),{window:maskWin,document:maskDoc,Event:class{constructor(name){this.type=name;}}});
const mask = maskWin.YolandaMasks;
assert.equal(mask.formatPhone('24999999999'),'(24) 99999-9999'); checks++;
assert.equal(mask.formatPhone('2499999999'),'(24) 9999-9999'); checks++;
assert.equal(mask.formatPhone('5524999999999'),'(24) 99999-9999'); checks++;
assert.equal(mask.formatMoney('1250000'),'1.250.000'); checks++;
assert.equal(mask.formatMoney('1.250.000'),'1.250.000'); checks++;
const field = {id:'lead-phone',value:'24999999999',selectionStart:11,selectionEnd:11,
  setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;},dispatchEvent(){}};
maskDoc.activeElement=field;
handlers.input({target:field});
assert.equal(field.value,'(24) 99999-9999');checks++;
// Valida a remoção do DDD enquanto cursor está à direita dos caracteres literais.
field.selectionStart=5;field.selectionEnd=5;
handlers.keydown({key:'Backspace',target:field,preventDefault(){}});
check(field.value.replace(/\D/g,'').length===10,'Backspace em máscara remove dígito');
const property = {codigo:'YTI-0001',titulo:'Apartamento teste', finalidade:'Comprar', tipo:'Apartamento',bairro:'Centro',cidade:'Resende',valor:500000,
  area_m2:70,quartos:2,banheiros:1,vagas:1,descricao:'Teste',images:[],foto_url:''};
const events={};
const ui={};
function el(id){if(!ui[id])ui[id]={innerHTML:'',textContent:'',value:'',style:{},dataset:{},classList:{add(){},remove(){},contains(){return false},toggle(){}}};return ui[id];}
const location={origin:'https://preview.example.test',pathname:'/',search:'',href:'https://preview.example.test/'};
const eventsHistory=[];
const history={pushState(state,unused,url){eventsHistory.push(['push',String(url)]);const u=new URL(url);Object.assign(location,{search:u.search,href:u.href});},
  replaceState(state,unused,url){eventsHistory.push(['replace',String(url)]);const u=new URL(url);Object.assign(location,{search:u.search,href:u.href});},
  back(){eventsHistory.push(['back']);location.search='';location.href=location.origin+'/';}};
const contacts=[];
const context={console,URL,URLSearchParams,location,history,Date,Image:undefined,
  window:{location,history,open(url){contacts.push(url)},addEventListener(name,cb){events[name]=cb},
    localStorage:{getItem(key){return key==='yti_catalog_v2'?JSON.stringify({items:[property]}):null;},setItem(){}}},
  document:{readyState:'loading',addEventListener(name,cb){events[name]=cb},body:{style:{}},head:{appendChild(){}},
    querySelectorAll(){return []},getElementById:el},
  setTimeout:()=>1,clearTimeout(){},YolandaDescription:{toHtml:()=>'<p>Teste</p>'}};
vm.runInNewContext(vitrineScript,context);
// O clique do botão não abre o modal e envia o link exato ao WhatsApp.
let stopped=0;
context.window.openCardInterestWhatsApp({preventDefault(){stopped++},stopPropagation(){stopped++}},'YTI-0001');
assert.equal(stopped,2);checks++;
assert.equal(contacts.length,1);checks++;
const message=new URL(contacts[0]).searchParams.get('text');
check(message.includes('YTI-0001')&&message.includes('Apartamento teste')&&message.includes('?imovel=YTI-0001'),'WhatsApp possui código, título e URL direta');
check(!eventsHistory.length,'card não aciona modal / history');
context.window.openPropertyModal('YTI-0001');
check(eventsHistory.length===1&&eventsHistory[0][0]==='push','detalhe faz pushState');
check(location.search==='?imovel=YTI-0001','URL de imóvel específica');
check(el('property-modal-content').innerHTML.includes('interest-form'),'formulário preservado no detalhe');
context.window.closePropertyModal();
check(eventsHistory.at(-1)[0]==='back','fechar detalhe retorna pelo histórico');
// Compartilhar o endereço e abri-lo diretamente deve resolver o imóvel após catálogo.
location.search='?imovel=YTI-0001';location.href=location.origin+'/?imovel=YTI-0001';
await context.window.loadCatalog(false); // simula retorno do catálogo local, sem rede.
check(el('property-modal-content').innerHTML.includes('Apartamento teste'),'URL compartilhada abre o imóvel após carregar o catálogo');
check(eventsHistory.filter(x=>x[0]==='push').length===1,'URL direta não cria nova entrada no histórico');
context.window.closePropertyModal(true);
location.search='';location.href=location.origin+'/';
// Links devem ser compatíveis com rotas, sem mudar rotas existentes.
const vitrine = read('public/js/vitrine-app.js');
check(vitrine.includes('syncPropertyModalWithUrl()')&&vitrine.includes("addEventListener('popstate'"),'abertura automática e navegação Voltar');
check(vitrine.includes('loading="lazy"')&&vitrine.includes('fetchpriority="high"'),'carregamento progressivo de imagens');
const crmHtml=read('public/app/index.html');
check(crmHtml.includes('data-crc="recent"')&&crmHtml.includes('data-crc="inactive_recent"')&&crmHtml.includes('data-crc="inactive_old"')&&crmHtml.includes('data-crc="Aniversariante"'),'filtros CRC de relacionamento mantidos');
check(crmHtml.includes('/js/crm-input-masks.js'),'máscara incluída na interface');
check(read('public/index.html').includes('/js/crm-input-masks.js'),'máscara também ativa no formulário público');
check(read('public/js/crm-input-masks.js').includes('interest-phone')&&read('public/js/crm-input-masks.js').includes('owner-phone'),'telefone mascarado nos formulários públicos de leads');
for (const file of ['public/privacidade.html','public/termos.html']) {
 const page=read(file);
 check(page.includes('21 de novembro de 2026 (versão 4.4.0)'),'legal vigente '+file);
 check(page.includes('?imovel=YTI-0001'),'link público explicado '+file);
}
for (const file of ['public/js/crm-funnel.js','public/js/crm-clients.js','public/js/crm-lead-detail.js']) {
 check(read(file).includes('aria-label=')&&read(file).includes('tel:+'),'botão acessível e ligação '+file);
}
console.log(`PASSOU: ${checks} verificações específicas de funcionalidades 4.4.0.`);
