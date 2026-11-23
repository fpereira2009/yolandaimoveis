import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('public/app/index.html');
const js = read('public/js/crm-properties.js');
let tests = 0;
const check = (test, label) => { assert.ok(test, label); tests++; };
const equal = (a,b,label) => { assert.equal(a,b,label); tests++; };

check(!html.includes('id="prop-type-options"'), 'datalist legado removido');
check(!/<input\b[^>]*\bid="prop-type"/.test(html), 'tipo não é mais input');
const select = html.match(/<select\b[^>]*\bid="prop-type"[^>]*>([\s\S]*?)<\/select>/);
check(Boolean(select), 'dropdown nativo id prop-type presente');
check(select?.[0].includes('w-full') && select?.[0].includes('rounded-xl'), 'classes responsivas preservadas');
check(html.includes('for="prop-type"'), 'rótulo acessível');
const options = [...select[1].matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(x=>[x[1],x[2]]);
equal(JSON.stringify(options), JSON.stringify([
  ['Casa','Casa'],['Apartamento','Apartamento'],['Terreno','Terreno'],
  ['Comercial','Comercial'],['Chácara/Sítio','Chácara/Sítio'],['Cobertura','Cobertura']
]), 'seis opções originais, sem alterar valor do banco');
check(html.includes('crm-properties.js?v=4.5.3-hf1'), 'cache-busting específico do hotfix');
check(/type: g\('prop-type'\)/.test(js), 'payload original mantém o valor do campo');
check(/function openNewPropertyModal\(\) \{ fillPropForm\(null\); \}/.test(js), 'modal de inclusão preservado');
check(/function openEditProperty\(code\)/.test(js), 'modal de edição preservado');
check(/setPropertyType\(p \? p\.type : 'Casa'\)/.test(js), 'preenchimento respeita tipo atual');

// Exercita a função real de compatibilidade com tipos já cadastrados.
const fnSrc = js.match(/        function setPropertyType\(value\) \{[\s\S]*?\r?\n        \}\r?\n(?=\r?\n        function fillPropForm)/)?.[0];
check(Boolean(fnSrc), 'helper de compatibilidade existente');
const field = { value:'', options: options.map(([value,textContent])=>({value,textContent,dataset:{}})),
  querySelectorAll(selector) { return selector==='option[data-legacy-type]' ? this.options.filter(o=>o.dataset.legacyType) : []; },
  appendChild(option) { this.options.push(option); }
};
const doc = {
  getElementById(id) { equal(id,'prop-type','helper usa o ID existente'); return field; },
  createElement(tag) {
    equal(tag,'option','cria option segura');
    const item = {value:'',textContent:'',dataset:{}};
    item.remove = () => {field.options.splice(field.options.indexOf(item),1)};
    return item;
  }
};
const setPropertyType = vm.runInNewContext('('+fnSrc.trim()+')',{document:doc,Array,String});
setPropertyType('Casa');
equal(field.value,'Casa','cadastro novo mantém o padrão Casa');
setPropertyType('Galpão');
equal(field.value,'Galpão','tipo personalizado é selecionado ao editar');
check(field.options.some(o=>o.value==='Galpão' && o.dataset.legacyType==='true'), 'valor legado não se perde');
setPropertyType('Terreno');
equal(field.value,'Terreno','tipo oficial pode ser selecionado na edição');
check(!field.options.some(o=>o.value==='Galpão'), 'opção temporária é removida ao trocar');
setPropertyType('Galpão');
setPropertyType(null);
equal(field.value,'Casa','novo cadastro remove tipo legado e retorna Casa');
check(!field.options.some(o=>o.dataset.legacyType), 'dropdown não fica com opções antigas');
setPropertyType('<img src=x onerror=alert(1)>');
check(field.options.some(o=>o.textContent==='<img src=x onerror=alert(1)>'), 'tipo legado inserido como texto e não como HTML');
check(read('wrangler.toml').includes('yolanda-crm-dev'), 'D1 de Preview permanece isolado');
console.log(`PASSOU: ${tests} verificações do hotfix 4.5.3 dropdown de Tipo.`);
