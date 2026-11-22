        // ===== IMÓVEIS (código automático YTI-####) =====
        let crmProps = [];
        const PROP_STATUS = ['Disponível', 'Reservado', 'Vendido', 'Alugado', 'Inativo'];
        const normTxt = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        function renderProps() {
            const q = normTxt(document.getElementById('prop-search').value);
            const st = document.getElementById('prop-status-filter').value;
            const list = crmProps.filter(p => (!st || p.status === st) &&
                (!q || normTxt([p.code, p.title, p.neighborhood, p.type, p.city].join(' ')).includes(q)));
            document.getElementById('prop-count').textContent = list.length + (list.length === 1 ? ' imóvel' : ' imóveis') + (list.length !== crmProps.length ? ' (de ' + crmProps.length + ')' : '');
            syncPropertyDatalist();
            document.getElementById('prop-grid').innerHTML = list.length ? list.map(p => {
                const activeLinkedLeads = leads.filter(l => l.stage !== 'Fechado' && l.closeResult !== 'Perdido' && l.category !== 'Captação' && l.propertyId === p.code);
                const negotiationBadge = activeLinkedLeads.length
                    ? `<span title="${esc(activeLinkedLeads.map(l => l.name).join(', '))}" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-terracotta-soft text-terracotta border border-terracotta/25 text-[11px] font-bold"><i data-lucide="handshake" class="w-3 h-3"></i> Em negociação${activeLinkedLeads.length > 1 ? ' (' + activeLinkedLeads.length + ')' : ''}</span>`
                    : '';
                return `
                <article class="bg-white rounded-3xl border border-sand-border shadow-card overflow-hidden flex flex-col">
                    <div class="relative h-40 bg-sand">
                        ${p.photo_url ? `<img src="${esc(p.photo_url)}" loading="lazy" referrerpolicy="no-referrer" alt="" class="w-full h-full object-cover" onerror="this.style.display='none'">` : ''}
                        <span class="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/90 text-moss">${esc(p.code)}</span>
                        <span class="absolute top-2 right-2 text-[11px] font-bold px-2 py-0.5 rounded-md bg-moss text-white">${p.purpose === 'Alugar' ? 'Aluguel' : 'Venda'}</span>
                    </div>
                    <div class="p-4 space-y-1.5 flex-1">
                        ${negotiationBadge ? `<div class="flex flex-wrap items-center gap-1.5">${negotiationBadge}</div>` : ''}
                        <h4 class="font-heading font-bold text-moss text-sm leading-snug">${esc(p.title)}</h4>
                        <p class="text-xs text-charcoal/70">${esc(p.type)} • ${esc(p.neighborhood)} • ${esc(p.city)}</p>
                        <p class="font-heading font-extrabold text-terracotta">${formatBRL(p.price)}${p.purpose === 'Alugar' ? '/mês' : ''}</p>
                        <p class="text-[11px] text-charcoal/60">${p.bedrooms} qts • ${p.bathrooms} banh. • ${p.parking} vagas • ${p.area_m2} m²</p>
                    </div>
                    <div class="p-3 border-t border-sand-border flex items-center gap-2">
                        <select onchange="changePropStatus('${esc(p.code)}', this.value)" class="flex-1 min-w-0 px-2.5 py-2 rounded-xl bg-sand/70 border border-sand-border text-xs font-semibold text-moss">
                            ${PROP_STATUS.map(o => `<option${o === p.status ? ' selected' : ''}>${o}</option>`).join('')}
                        </select>
                        <button type="button" onclick="downloadPropertySocialCard('${esc(p.code)}', this)" title="Baixar card para Instagram / Facebook" class="px-3 py-2 rounded-xl bg-terracotta-soft hover:bg-terracotta text-terracotta hover:text-white font-heading font-bold text-xs inline-flex items-center gap-1.5 shrink-0 transition-colors">
                            <i data-lucide="image-down" class="w-3.5 h-3.5"></i>
                            <span>Salvar Card</span>
                        </button>
                        <button type="button" onclick="openEditProperty('${esc(p.code)}')" class="px-3.5 py-2 rounded-xl bg-moss hover:bg-moss-light text-white font-heading font-bold text-xs shrink-0 transition-colors">Editar</button>
                    </div>
                </article>`;
            }).join('')
                : '<p class="col-span-full text-center text-sm text-charcoal/60 py-10">Nenhum imóvel cadastrado ainda. Use "Novo Imóvel" ou importe um CSV.</p>';
            if (window.lucide) lucide.createIcons();
        }

        // Texto formatado no editor é persistido como Markdown seguro no D1.
        function syncPropertyDescription() {
            const markdown = YolandaDescription.fromHtml(document.getElementById('prop-description-editor').innerHTML);
            document.getElementById('prop-description').value = markdown;
            const count = document.getElementById('prop-description-count');
            count.textContent = `${markdown.length} / 2000`;
            count.classList.toggle('text-red-700', markdown.length > 2000);
            return markdown;
        }
        function pastePropertyDescription(event) {
            event.preventDefault();
            const html = event.clipboardData?.getData('text/html');
            const text = event.clipboardData?.getData('text/plain') || '';
            const markdown = html ? YolandaDescription.fromHtml(html) : text;
            document.execCommand('insertHTML', false, YolandaDescription.toHtml(markdown));
            syncPropertyDescription();
        }
        function formatPropertyDescription(command) {
            document.getElementById('prop-description-editor').focus();
            document.execCommand(command, false, null);
            syncPropertyDescription();
        }

        // Galeria R2: foto principal, seleção em lote e processamento no navegador.
        let propExistingImages = [];
        let propPendingPhotos = [];
        let propCoverChoice = null;
        let propNextLocalId = 0;
        let propSaving = false;

        function releasePendingPropertyPhotos() {
            for (const item of propPendingPhotos) URL.revokeObjectURL(item.preview);
            propPendingPhotos = [];
        }
        function renderPropertyPhotoEditor() {
            const box = document.getElementById('prop-gallery-editor');
            const count = propExistingImages.length + propPendingPhotos.length;
            document.getElementById('prop-gallery-count').textContent = count + ' de 10 fotos';
            const items = [
                ...propExistingImages.map(i => ({ type: 'existing', id: i.id, url: i.url })),
                ...propPendingPhotos.map(i => ({ type: 'new', id: i.id, url: i.preview }))
            ];
            box.innerHTML = items.map(item => {
                const selected = propCoverChoice && propCoverChoice.type === item.type && propCoverChoice.id === item.id;
                const action = item.type === 'existing'
                    ? `removePropertyImage(${item.id})` : `removePendingPropertyPhoto(${item.id})`;
                return `<div class="rounded-xl border ${selected ? 'border-terracotta ring-2 ring-terracotta/40' : 'border-sand-border'} overflow-hidden bg-sand/60">
                  <img src="${esc(item.url)}" class="w-full aspect-[4/3] object-cover" alt="Foto do imóvel">
                  <div class="p-2 space-y-1.5">
                    <button type="button" onclick="setPropertyCover('${item.type}', ${item.id})"
                       class="w-full text-[11px] font-bold px-2 py-1.5 rounded-lg ${selected ? 'bg-terracotta text-white' : 'bg-white text-moss border border-sand-border'}">
                       ${selected ? '★ Capa selecionada' : 'Definir capa'}</button>
                    <button type="button" onclick="${action}" class="w-full text-[11px] text-red-700 font-semibold py-1">Remover foto</button>
                  </div>
                </div>`;
            }).join('');
        }
        function setPropertyCover(type, id) {
            if (propSaving) return;
            propCoverChoice = { type, id };
            renderPropertyPhotoEditor();
        }
        function selectPropertyPhotos(event) {
            if (propSaving) { event.target.value = ''; return; }
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            const slots = 10 - propExistingImages.length - propPendingPhotos.length;
            if (files.length > slots) showToast(`Limite de 10 fotos. Você pode adicionar mais ${Math.max(0, slots)}.`);
            for (const file of files.slice(0, Math.max(0, slots))) {
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                    showToast('Use fotos JPEG, PNG ou WebP.'); continue;
                }
                const item = { id: ++propNextLocalId, file, preview: URL.createObjectURL(file) };
                propPendingPhotos.push(item);
                if (!propCoverChoice) propCoverChoice = { type: 'new', id: item.id };
            }
            renderPropertyPhotoEditor();
        }
        function removePendingPropertyPhoto(id) {
            if (propSaving) return;
            const index = propPendingPhotos.findIndex(p => p.id === id);
            if (index < 0) return;
            URL.revokeObjectURL(propPendingPhotos[index].preview);
            propPendingPhotos.splice(index, 1);
            if (propCoverChoice && propCoverChoice.type === 'new' && propCoverChoice.id === id) {
                propCoverChoice = propExistingImages.length ? {type:'existing', id:propExistingImages[0].id}
                    : propPendingPhotos.length ? {type:'new', id:propPendingPhotos[0].id} : null;
            }
            renderPropertyPhotoEditor();
        }
        async function refreshPropertyImageState(code) {
            const data = await api('/media/properties/' + code + '/images');
            propExistingImages = data.images || [];
            const list = await api('/properties');
            crmProps = list.items || [];
            const p = crmProps.find(x => x.code === code);
            if (p) {
                const currentCover = propExistingImages.find(i => i.cover);
                if (!propCoverChoice || (propCoverChoice.type === 'existing' && !propExistingImages.some(i => i.id === propCoverChoice.id))) {
                    propCoverChoice = currentCover ? {type:'existing', id:currentCover.id} : null;
                }
            }
            renderProps();
            renderPropertyPhotoEditor();
        }
        async function removePropertyImage(id) {
            const code = document.getElementById('prop-edit-id').value;
            if (!code || propSaving || !confirm('Remover esta foto permanentemente do imóvel?')) return;
            try {
                await api('/media/properties/' + code + '/images/' + id, {method:'DELETE'});
                if (propCoverChoice && propCoverChoice.type === 'existing' && propCoverChoice.id === id) propCoverChoice = null;
                await refreshPropertyImageState(code);
                showToast('Foto removida.');
            } catch (error) { showToast(error.message); }
        }
        async function optimizePropertyPhoto(file) {
            let img;
            let objectUrl;
            try {
                if ('createImageBitmap' in window) img = await createImageBitmap(file, { imageOrientation: 'from-image' });
                else {
                    objectUrl = URL.createObjectURL(file);
                    img = await new Promise((resolve, reject) => {
                        const element = new Image();
                        element.onload = () => resolve(element);
                        element.onerror = reject;
                        element.src = objectUrl;
                    });
                }
                const sw = img.width, sh = img.height;
                if (!sw || !sh) throw new Error('Imagem inválida.');
                const ratio = Math.min(1, 1600 / Math.max(sw, sh));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(sw * ratio));
                canvas.height = Math.max(1, Math.round(sh * ratio));
                const ctx = canvas.getContext('2d', {alpha:false});
                if (!ctx) throw new Error('Não foi possível otimizar a imagem.');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const toBlob = (type, quality) => new Promise(r => canvas.toBlob(r, type, quality));
                let blob = await toBlob('image/webp', 0.82);
                if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.80);
                if (blob && blob.size > 6 * 1024 * 1024) blob = await toBlob('image/jpeg', 0.68);
                if (!blob || blob.size > 6 * 1024 * 1024) throw new Error('Imagem não pôde ser reduzida a menos de 6 MB.');
                return blob;
            } finally {
                if (img && typeof img.close === 'function') img.close();
                if (objectUrl) URL.revokeObjectURL(objectUrl);
            }
        }
        async function sendPropertyImage(code, blob) {
            const resp = await fetch('/api/media/properties/' + encodeURIComponent(code) + '/images', {
                method:'PUT', credentials:'same-origin', headers:{'Content-Type':blob.type, 'Accept':'application/json'}, body:blob
            });
            const result = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(result.error || `Falha no upload (HTTP ${resp.status}).`);
            return result.item;
        }

        function fillPropForm(p) {
            releasePendingPropertyPhotos();
            propExistingImages = Array.isArray(p?.images) ? p.images.map(i => ({...i})) : [];
            const existingCover = propExistingImages.find(i => i.cover) || propExistingImages[0];
            propCoverChoice = existingCover ? {type:'existing', id:existingCover.id} : null;
            document.getElementById('prop-files').value = '';
            renderPropertyPhotoEditor();
            const set = (id, v) => document.getElementById(id).value = v;
            set('prop-edit-id', p ? p.code : '');
            set('prop-title', p ? p.title : ''); set('prop-purpose', p ? p.purpose : 'Comprar');
            set('prop-type', p ? p.type : 'Casa'); set('prop-price', p ? window.YolandaMasks.formatMoney(p.price) : '');
            set('prop-status', p ? p.status : 'Disponível'); set('prop-neighborhood', p ? p.neighborhood : '');
            set('prop-city', p ? p.city : 'Resende - RJ'); set('prop-area', p ? p.area_m2 : '');
            set('prop-bedrooms', p ? p.bedrooms : ''); set('prop-bathrooms', p ? p.bathrooms : '');
            set('prop-parking', p ? p.parking : '');
            set('prop-badge', p ? p.badge : ''); set('prop-description', p ? p.description : '');
            document.getElementById('prop-description-editor').innerHTML = YolandaDescription.toHtml(p ? p.description : '');
            syncPropertyDescription();
            document.getElementById('prop-modal-title').textContent = p ? 'Editar ' + p.code : 'Novo Imóvel';
            document.getElementById('prop-code-note').classList.toggle('hidden', !!p);
            document.getElementById('prop-delete-btn').classList.toggle('hidden', !p);
            document.getElementById('property-modal').classList.remove('hidden');
            lucide.createIcons();
        }
        function openNewPropertyModal() { fillPropForm(null); }
        function openEditProperty(code) { const p = crmProps.find(x => x.code === code); if (p) fillPropForm(p); }

        async function handleSaveProperty(event) {
            event.preventDefault();
            if (propSaving) return;
            const g = id => document.getElementById(id).value;
            const markdown = syncPropertyDescription();
            if (markdown.length > 2000) { showToast('A descrição pode ter até 2.000 caracteres.'); return; }
            const body = {
                title: g('prop-title'), purpose: g('prop-purpose'), type: g('prop-type'), price: window.YolandaMasks.digitsOnly(g('prop-price')),
                status: g('prop-status'), neighborhood: g('prop-neighborhood'), city: g('prop-city'), area_m2: g('prop-area'),
                bedrooms: g('prop-bedrooms'), bathrooms: g('prop-bathrooms'), parking: g('prop-parking'),
                badge: g('prop-badge'), description: markdown
            };
            const editId = g('prop-edit-id');
            const button = document.getElementById('prop-save-btn');
            const oldLabel = button.textContent;
            let saved;
            propSaving = true; button.disabled = true; document.getElementById('prop-files').disabled = true;
            try {
                saved = editId
                    ? await api('/properties/' + editId, { method: 'PATCH', body })
                    : await api('/properties', { method: 'POST', body });
                document.getElementById('prop-edit-id').value = saved.code;
                const uploadedIds = new Map();
                for (const pending of [...propPendingPhotos]) {
                    button.textContent = `Otimizando e enviando foto ${uploadedIds.size + 1} / ${propPendingPhotos.length}…`;
                    const blob = await optimizePropertyPhoto(pending.file);
                    const created = await sendPropertyImage(saved.code, blob);
                    uploadedIds.set(pending.id, created.id);
                    if (propCoverChoice?.type === 'new' && propCoverChoice.id === pending.id) {
                        propCoverChoice = {type:'existing', id:created.id};
                    }
                    URL.revokeObjectURL(pending.preview);
                    propPendingPhotos = propPendingPhotos.filter(i => i.id !== pending.id);
                }
                let coverId = null;
                if (propCoverChoice?.type === 'existing') coverId = propCoverChoice.id;
                if (propCoverChoice?.type === 'new') coverId = uploadedIds.get(propCoverChoice.id);
                if (coverId) await api('/media/properties/' + saved.code + '/images/' + coverId, {method:'PATCH', body:{cover:true}});
                propCoverChoice = null;
                await refreshPropertyImageState(saved.code);
                closeModal('property-modal');
                showToast(editId ? `${saved.code} atualizado!` : `Imóvel cadastrado com o código ${saved.code}!`);
            } catch (e) {
                if (saved?.code) {
                    try { await refreshPropertyImageState(saved.code); } catch (refreshError) { console.error(refreshError); }
                    showToast('Dados salvos, mas a galeria não foi concluída. ' + e.message + ' Reabra ou tente salvar novamente.');
                } else showToast(e.message);
            } finally {
                propSaving = false; button.disabled = false; button.textContent = oldLabel;
                document.getElementById('prop-files').disabled = false;
            }
        }
        function upsertBy(list, item, key) { const i = list.findIndex(x => x[key] === item[key]); if (i >= 0) list[i] = item; else list.unshift(item); }

        async function changePropStatus(code, status) {
            try { upsertBy(crmProps, await api('/properties/' + code, { method: 'PATCH', body: { status } }), 'code'); showToast(`${code}: ${status}`); renderProps(); }
            catch (e) { showToast(e.message); renderProps(); }
        }

        async function deleteProperty() {
            const code = document.getElementById('prop-edit-id').value;
            if (!code || !confirm(`Excluir ${code}? Ele sai do site imediatamente.`)) return;
            try { await api('/properties/' + code, { method: 'DELETE' }); crmProps = crmProps.filter(p => p.code !== code); closeModal('property-modal'); renderProps(); showToast(code + ' excluído.'); }
            catch (e) { showToast(e.message); }
        }
