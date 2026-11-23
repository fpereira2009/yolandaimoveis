// Galeria e envio de interesse; a página já chega renderizada pelo servidor (SSR).
(() => {
  'use strict';
  const area=document.getElementById('seo-gallery');
  const slides=[...area?.querySelectorAll('[data-slide]') || []];
  const counter=document.getElementById('seo-counter');
  let index=0, touchStart=null, zoomed=false, lastTap=0;
  function show(n) {
    if (!slides.length) return;
    index=(n+slides.length)%slides.length;
    slides.forEach((s,i)=>{s.classList.toggle('hidden',i!==index);s.querySelector('img')?.style.setProperty('transform','');});
    if (counter) counter.textContent=`${index+1} / ${slides.length}`;
    zoomed=false;
    const nextImg=slides[(index+1)%slides.length]?.querySelector('img');
    if (nextImg && nextImg.loading==='lazy') nextImg.loading='eager';
  }
  document.getElementById('seo-prev')?.addEventListener('click',()=>show(index-1));
  document.getElementById('seo-next')?.addEventListener('click',()=>show(index+1));
  area?.addEventListener('touchstart',e=>{if(e.touches.length===1)touchStart={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
  area?.addEventListener('touchend',e=>{
    if (!touchStart || e.changedTouches.length!==1) return;
    const dx=e.changedTouches[0].clientX-touchStart.x;
    touchStart=null;
    if (!zoomed && Math.abs(dx)>45) show(index+(dx<0?1:-1));
  },{passive:true});
  area?.addEventListener('dblclick',()=>{
    const img=slides[index]?.querySelector('img');if(!img)return;
    zoomed=!zoomed;img.style.transform=zoomed?'scale(2)':'';
  });
  area?.addEventListener('touchend',()=>{
    const now=Date.now();if(now-lastTap<330){const img=slides[index]?.querySelector('img');if(img){zoomed=!zoomed;img.style.transform=zoomed?'scale(2)':'';}}lastTap=now;
  },{passive:true});
  document.addEventListener('contextmenu',e=>{if(e.target?.closest('img'))e.preventDefault();},true);
  area?.addEventListener('dragstart',e=>{if(e.target?.closest('img'))e.preventDefault();});
  document.getElementById('seo-share')?.addEventListener('click',async()=>{
    if(navigator.share) { try {await navigator.share({title:document.title,url:PROPERTY_URL});return;} catch(e){if(e.name==='AbortError')return;} }
    if(navigator.clipboard?.writeText) {try {await navigator.clipboard.writeText(PROPERTY_URL); alert('Link copiado!');return;}catch{}}
    window.prompt('Copie o link do imóvel:',PROPERTY_URL);
  });
  const form=document.getElementById('seo-interest');
  form?.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!form.reportValidity()) return;
    const button=form.querySelector('button[type="submit"]');
    const msg=document.getElementById('seo-form-message');
    button.disabled=true;msg.textContent='Registrando atendimento...';
    // Janela aberta ainda no clique: pop-up não é bloqueado pelo await.
    let tab=null;try {tab=window.open('about:blank','_blank');}catch{}
    try {
      const data=new FormData(form);
      const response=await fetch('/api/public/contact',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'interesse',name:data.get('name'),phone:data.get('phone'),property_code:PROPERTY_CODE,website:data.get('website')||''})});
      if(!response.ok) throw new Error('Não foi possível registrar o atendimento.');
      msg.textContent='Atendimento recebido. Abrindo o WhatsApp...';
    } catch(e) { msg.textContent='Não foi possível registrar agora. Você ainda pode falar diretamente pelo WhatsApp.'; }
    finally {button.disabled=false; if(tab)tab.location.href=WA_LINK;else window.location.href=WA_LINK;}
  });
})();
