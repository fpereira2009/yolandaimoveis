        let followupTouched = false;

        function openLeadDetail(leadId, focusMove = false) {
            const lead = leads.find(l => l.id === leadId);
            if (!lead) return;
            followupTouched = false;
            const linkedClient = findClientForLead(lead);

            const container = document.getElementById('lead-detail-content');
            container.innerHTML = `
                <div class="flex items-start justify-between gap-2 pb-3 border-b border-sand-border">
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="text-[11px] font-bold px-2 py-0.5 rounded-md bg-moss-soft text-moss">${esc(lead.id)}</span>
                            ${getModalityBadge(lead.modality)}${getCategoryBadge(lead.category)}
                            ${getTempBadge(lead.temp)}
                        </div>
                        <h3 class="font-heading font-extrabold text-moss text-xl mt-1">${esc(lead.name)}</h3>
                        <p class="text-xs text-charcoal/70">${esc(lead.property)} • <strong>${formatBRL(lead.value)}${lead.modality === 'Aluguel' ? '/mês' : ''}</strong></p>
                        ${getLeadPropertyChips(lead, false)}${getExternalRefLine(lead)}
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        ${linkedClient ? `
                            <button type="button" onclick="openClientFromLead('${esc(lead.id)}')" title="Ver ficha no CRC" class="px-2.5 py-2 rounded-xl bg-moss-soft hover:bg-moss hover:text-white text-moss font-heading font-bold text-xs inline-flex items-center gap-1 transition-colors">
                                <i data-lucide="user-check" class="w-4 h-4"></i>
                                <span class="hidden sm:inline">Ver no CRC</span>
                            </button>
                        ` : ''}
                        <button onclick="openEditLead('${esc(lead.id)}')" title="Editar lead" class="p-2 rounded-xl bg-sand text-moss"><i data-lucide="pencil" class="w-5 h-5"></i></button>
                        <button onclick="closeModal('lead-detail-modal')" class="p-2 rounded-xl bg-sand text-charcoal">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>

                <!-- Imóvel associado + região: posicionados junto à movimentação do funil -->
                <form onsubmit="saveLeadProperty(event, '${esc(lead.id)}')" class="bg-sand/60 px-4 py-3 rounded-2xl border border-sand-border space-y-2.5">
                    ${lead.stage === 'Fechado' ? `
                    <div class="space-y-1">
                        <label class="block text-xs font-heading font-bold text-moss">Imóvel associado ao atendimento</label>
                        <p class="text-xs text-charcoal/70">${esc(lead.propertyId ? lead.propertyId + ' • ' + (lead.propertyTitle || '') : lead.externalProperty ? (lead.externalPropertyRef || 'Imóvel externo') : 'Nenhum imóvel associado')}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="block text-xs font-heading font-bold text-moss">Imóvel / Região de Interesse</label>
                        <p class="text-xs text-charcoal/70 break-words">${esc(lead.property || '')}</p>
                    </div>` : `
                    ${lead.category === 'Captação' ? `
                    <div class="space-y-1">
                        <label class="block text-xs font-heading font-bold text-moss">Imóvel associado ao atendimento</label>
                        <p class="text-xs text-charcoal/60">Não disponível para leads de Captação.</p>
                    </div>` : `
                    <div class="space-y-2">
                        <label for="detail-prop-mode" class="block text-xs font-heading font-bold text-moss">Imóvel associado ao atendimento</label>
                        <select id="detail-prop-mode" onchange="syncDetailPropertyBox()" class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sand-border text-xs sm:text-sm">
                            <option value="none" ${!lead.propertyId && !lead.externalProperty ? 'selected' : ''}>Nenhum imóvel associado</option>
                            <option value="internal" ${lead.propertyId ? 'selected' : ''}>Imóvel do nosso portfólio (disponíveis ou em negociação)</option>
                            <option value="external" ${lead.externalProperty ? 'selected' : ''}>Imóvel de outra imobiliária (parceria)</option>
                        </select>
                        <input id="detail-prop-id" type="hidden" value="${esc(lead.propertyId || '')}">
                        <div id="detail-prop-internal" class="${lead.propertyId ? '' : 'hidden'} space-y-1.5">
                            <span id="detail-prop-selected" class="inline-flex max-w-full items-center px-2.5 py-1 rounded-lg bg-white border border-sand-border text-moss text-xs font-semibold break-words">${lead.propertyId ? esc(lead.propertyId + ' — ' + (lead.propertyTitle || 'Imóvel vinculado')) : 'Selecione um imóvel disponível ou reservado em negociação no campo abaixo.'}</span>
                            <p class="text-[11px] font-semibold text-amber-800">Em “Proposta Enviada” ou “Documentação/Crédito” o imóvel é reservado automaticamente.</p>
                        </div>
                        <div id="detail-prop-external" class="${lead.externalProperty ? '' : 'hidden'}">
                            <input type="text" id="detail-prop-ext" maxlength="300" value="${esc(lead.externalPropertyRef || '')}" placeholder="Nome da imobiliária, código ou link do anúncio" class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sand-border text-xs sm:text-sm">
                        </div>
                    </div>`}
                    <div class="space-y-1.5">
                        <label for="detail-property" class="block text-xs font-heading font-bold text-moss">Imóvel / Região de Interesse *</label>
                        <div class="flex flex-col sm:flex-row gap-2">
                            <input type="text" id="detail-property" list="detail-property-options" onpointerdown="openFullDatalist(event)" onfocus="openFullDatalist(event)" oninput="commitDatalistEdit(event); onDetailPropertyInput('${esc(lead.id)}')" onchange="onDetailPropertyInput('${esc(lead.id)}')" onblur="restoreDatalistOnBlur(event)" required maxlength="200" value="${esc(lead.property || '')}" placeholder="Selecione um imóvel disponível, reservado ou digite..."
                                   class="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-white border border-sand-border text-xs sm:text-sm focus:outline-none focus:border-moss">
                            <button type="submit" class="px-4 py-2.5 rounded-xl bg-terracotta hover:bg-terracotta-hover text-white font-heading font-bold text-xs shrink-0">Associar imóvel</button>
                        </div>
                        <datalist id="detail-property-options">
                            ${lead.category === 'Captação' ? '' : crmProps.filter(p => isLinkableProperty(p, lead.propertyId)).map(p => `<option value="${esc(p.code + ' - ' + p.title)}"></option>`).join('')}
                        </datalist>
                        ${lead.category !== 'Captação' ? `
                        <div class="flex justify-end">
                            <button id="detail-clear-association" type="button" onclick="clearLeadAssociation('${esc(lead.id)}')" class="px-3.5 py-2 rounded-xl bg-white border border-sand-border text-terracotta hover:bg-sand font-heading font-bold text-xs inline-flex items-center justify-center gap-2 transition-colors">
                                <i data-lucide="unlink" class="w-4 h-4" aria-hidden="true"></i>
                                <span>Limpar associação</span>
                            </button>
                        </div>` : ''}
                    </div>`}
                </form>

                <!-- 1-Tap Stage Mover -->
                <div class="bg-sand/80 p-4 rounded-2xl border ${focusMove ? 'border-terracotta ring-2 ring-terracotta/20' : 'border-sand-border'} space-y-2.5">
                    <label class="block text-xs font-heading font-bold text-moss">Mover Etapa no Funil (Toque para alterar):</label>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        ${STAGES.map(st => `
                            <button onclick="moveLeadStage('${esc(lead.id)}', '${st}')" 
                                    class="py-2.5 px-3 rounded-xl text-xs font-bold border text-left transition-all ${lead.stage === st ? 'bg-moss text-white border-moss' : 'bg-white text-charcoal/80 border-sand-border hover:border-moss'}">
                                ${lead.stage === st ? '✓ ' : ''}${st}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- Ações de contato rápido -->
                <div class="flex items-center gap-2.5">
                    <a href="${esc(getLeadWhatsAppUrl(lead))}" target="_blank" rel="noopener noreferrer"
                       aria-label="Chamar no WhatsApp" title="Chamar ${esc(lead.name)} no WhatsApp"
                       class="shrink-0 w-12 py-3.5 rounded-xl bg-whatsapp text-white font-heading font-bold text-sm flex items-center justify-center">
                        <i data-lucide="message-circle" class="w-5 h-5" aria-hidden="true"></i>
                    </a>
                    <a href="tel:+${esc(normPhone(lead.phone))}" aria-label="Ligar para ${esc(lead.name)}" title="Ligar para ${esc(lead.name)}"
                       class="sm:hidden shrink-0 w-12 py-3.5 rounded-xl bg-sand text-moss inline-flex items-center justify-center">
                        <i data-lucide="phone" class="w-5 h-5" aria-hidden="true"></i>
                    </a>
                </div>

                <!-- Próximo follow-up + atalhos de 1 toque -->
                <div class="bg-sand/60 px-4 py-3 rounded-2xl border border-sand-border space-y-2.5">
                    <div class="flex items-center justify-between gap-3">
                        <div class="min-w-0">
                            <span class="text-xs font-heading font-bold text-moss">Próximo follow-up:</span>
                            <p class="text-[11px] text-charcoal/60">${lead.stage === 'Fechado' ? 'Lead fechado: sem follow-up.' : 'Muda para amanhã a cada nota ou etapa; altere abaixo.'}</p>
                        </div>
                        <input type="date" id="detail-followup" value="${esc(lead.followupAt || '')}" ${lead.stage === 'Fechado' ? 'disabled' : ''}
                               onchange="saveLeadFollowup('${esc(lead.id)}', this.value)"
                               class="shrink-0 px-3 py-2 rounded-xl bg-white border ${lead.followupStatus === 'Atrasado' ? 'border-red-400 text-red-700' : 'border-sand-border text-moss'} text-xs font-semibold focus:outline-none focus:border-moss disabled:opacity-50">
                    </div>
                    ${lead.stage !== 'Fechado' ? `
                    <div class="flex flex-wrap items-center gap-1.5 pt-1 border-t border-sand-border/80">
                        <button type="button" onclick="saveLeadFollowup('${esc(lead.id)}', '${todayBR()}')" class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-moss hover:text-white border border-sand-border text-moss text-[11px] font-bold transition-colors">Hoje</button>
                        <button type="button" onclick="saveLeadFollowup('${esc(lead.id)}', '${tomorrowBR()}')" class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-moss hover:text-white border border-sand-border text-moss text-[11px] font-bold transition-colors">Amanhã</button>
                        <button type="button" onclick="saveLeadFollowup('${esc(lead.id)}', '${addDaysBR(3)}')" class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-moss hover:text-white border border-sand-border text-moss text-[11px] font-bold transition-colors">+3 dias</button>
                        <button type="button" onclick="saveLeadFollowup('${esc(lead.id)}', '${addDaysBR(7)}')" class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-moss hover:text-white border border-sand-border text-moss text-[11px] font-bold transition-colors">+7 dias</button>
                        <button type="button" onclick="saveLeadFollowup('${esc(lead.id)}', '')" class="ml-auto px-2.5 py-1.5 rounded-lg bg-white hover:bg-red-50 border border-sand-border text-charcoal/65 hover:text-red-700 text-[11px] font-semibold transition-colors">Limpar</button>
                    </div>` : ''}
                </div>

                <!-- Add New Follow-up Note -->
                <form onsubmit="addLeadNote(event, '${esc(lead.id)}')" class="space-y-2">
                    <label class="block text-xs font-heading font-bold text-moss">Registrar Nova Interação / Follow-up:</label>
                    <div class="flex flex-col sm:flex-row gap-2">
                        <input type="text" id="new-note-text" required placeholder="Ex: Cliente retornou ligação, visita confirmada..." 
                               class="flex-1 px-3.5 py-2.5 rounded-xl bg-sand/60 border border-sand-border text-xs sm:text-sm focus:outline-none focus:border-moss">
                        <button type="submit" class="px-4 py-2.5 rounded-xl bg-terracotta text-white font-heading font-bold text-xs shrink-0">
                            Salvar Nota
                        </button>
                    </div>
                </form>

                ${lead.stage === 'Fechado' && lead.closeResult ? `
                <!-- Resultado do fechamento -->
                <div class="px-4 py-3 rounded-2xl border ${lead.closeResult === 'Ganho' ? 'bg-emerald-50 border-emerald-200' : 'bg-sand/60 border-sand-border'} space-y-1">
                    <p class="text-xs font-heading font-bold ${lead.closeResult === 'Ganho' ? 'text-emerald-800' : 'text-charcoal/80'}">
                        ${lead.closeResult === 'Ganho' ? '✅ Ganho (Convertido)' : '✖ Perdido (Não Convertido)'}
                        ${lead.closedAt ? `<span class="font-medium text-charcoal/60">• ${esc(new Date(lead.closedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>` : ''}
                    </p>
                    <p class="text-xs text-charcoal/85">${esc(lead.closeNote)}</p>
                </div>` : ''}

                <!-- Interaction Timeline -->
                <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                    <p class="text-xs font-heading font-bold text-moss">Histórico de Atendimento:</p>
                    ${(lead.history || []).map(item => `
                        <div class="p-3 rounded-xl bg-sand/50 border border-sand-border text-xs space-y-0.5">
                            <span class="text-[11px] font-bold text-terracotta">${esc(item.date)}</span>
                            <p class="text-charcoal/85">${esc(item.text)}</p>
                        </div>
                    `).join('')}
                </div>

                <!-- Ação final do atendimento: o X no cabeçalho fecha a janela -->
                ${lead.stage !== 'Fechado' ? `
                <div class="pt-2">
                    <button type="button"
                        onclick="openCloseLead('${esc(lead.id)}')"
                        class="w-full py-3 rounded-xl bg-terracotta hover:bg-terracotta-hover text-white font-heading font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors">

                        <i data-lucide="flag" class="w-4 h-4" aria-hidden="true"></i>

                        <span>Encerrar Lead (Ganho ou Perda)</span>
                    </button>
                </div>` : ''}
            `;

            document.getElementById('lead-detail-modal').classList.remove('hidden');
            lucide.createIcons();
        }

        function chosenFollowup() {
            const el = document.getElementById('detail-followup');
            return followupTouched && el ? { followup_at: el.value || null } : {};
        }

        async function quickRescheduleFollowup(leadId, days) {
            const targetDate = addDaysBR(days);
            try {
                const upd = await api('/leads/' + leadId, { method: 'PATCH', body: { followup_at: targetDate } });
                upsert(leads, upd);
                refreshAll();
                showToast(`Follow-up de ${upd.name} agendado para ${upd.followupDate}.`);
            } catch (e) { showToast(e.message); }
        }

        async function saveLeadFollowup(leadId, value) {
            followupTouched = true;
            try {
                const upd = await api('/leads/' + leadId, { method: 'PATCH', body: { followup_at: value || null } });
                upsert(leads, upd);
                refreshAll();
                if (!document.getElementById('lead-detail-modal').classList.contains('hidden')) {
                    openLeadDetail(leadId, false);
                }
                showToast(value ? 'Follow-up agendado: ' + upd.followupDate + '.' : 'Follow-up removido.');
            } catch (e) { showToast(e.message); }
        }

        async function moveLeadStage(leadId, newStage) {
            const lead = leads.find(l => l.id === leadId);
            if (!lead || lead.stage === newStage) return;
            if (newStage === 'Fechado') { openCloseLead(leadId); return; }
            const linkBody = detailPropertyPayload(lead);
            if (linkBody === null) return;
            try {
                const before = lead.propertyStatus;
                // A mudança de etapa e de imóvel segue em uma única requisição e DB.batch na API.
                const upd = await api('/leads/' + leadId, { method: 'PATCH', body: { ...linkBody, stage: newStage, ...chosenFollowup() } });
                upsert(leads, upd);
                if (upd.propertyId || lead.propertyId) await reloadProps();
                selectedStage = newStage;
                refreshAll(); openLeadDetail(leadId, false);
                let msg = `Lead movido para "${newStage}". Follow-up: ${upd.followupDate}.`;
                if (upd.propertyId && upd.propertyStatus !== before) msg += ` Imóvel ${upd.propertyId}: ${upd.propertyStatus}.`;
                showToast(msg);
            } catch (e) { showToast(e.message); }
        }

        async function changeLeadModality(leadId, newModality) {
            const lead = leads.find(l => l.id === leadId);
            if (!lead || lead.modality === newModality) return;
            try {
                upsert(leads, await api('/leads/' + leadId, { method: 'PATCH', body: { modality: newModality } }));
                refreshAll(); openLeadDetail(leadId, false);
                showToast(`Modalidade alterada para ${newModality}`);
            } catch (e) { showToast(e.message); }
        }

        // Campos do imóvel no card "Mover Lead", respeitando a seleção do portfólio
        // e aceitando qualquer texto na região sem criar vínculo interno implícito.
        function syncDetailPropertyBox() {
            const mode = document.getElementById('detail-prop-mode');
            if (!mode) return;
            const intern = document.getElementById('detail-prop-internal');
            const extern = document.getElementById('detail-prop-external');
            intern.classList.toggle('hidden', mode.value !== 'internal');
            extern.classList.toggle('hidden', mode.value !== 'external');
            document.getElementById('detail-prop-ext').required = mode.value === 'external';
            const code = document.getElementById('detail-prop-id').value;
            const prop = crmProps.find(p => p.code === code);
            document.getElementById('detail-prop-selected').textContent = code
                ? `${code} — ${prop ? prop.title : 'Imóvel vinculado'}`
                : 'Selecione um imóvel disponível ou reservado em negociação no campo abaixo.';
        }

        function onDetailPropertyInput(leadId) {
            const lead = leads.find(l => l.id === leadId);
            const mode = document.getElementById('detail-prop-mode');
            const field = document.getElementById('detail-property');
            if (!lead || !mode || !field || isDatalistPreviewOnly(field)) return;
            const value = field.value.trim();
            const chosen = crmProps.find(p => isLinkableProperty(p, lead.propertyId) &&
                (value === `${p.code} - ${p.title}` || value === p.code));
            if (chosen) {
                mode.value = 'internal';
                document.getElementById('detail-prop-id').value = chosen.code;
            } else if (mode.value === 'internal') {
                mode.value = 'none';
                document.getElementById('detail-prop-id').value = '';
            }
            syncDetailPropertyBox();
        }

        function detailPropertyPayload(lead) {
            // Lead fechado só permite reabrir a etapa, sem modificar imóvel vendido/alugado.
            if (lead.stage === 'Fechado') return {};
            const field = document.getElementById('detail-property');
            if (!field) return {};
            const value = field.value.trim();
            if (!value) { showToast('Informe o imóvel ou a região de interesse.'); return null; }
            const body = { property: value };
            if (lead.category === 'Captação') return body;
            const mode = document.getElementById('detail-prop-mode').value;
            body.link_mode = mode;
            if (mode === 'internal') {
                const code = document.getElementById('detail-prop-id').value;
                if (!code) { showToast('Selecione um imóvel disponível ou reservado em negociação no campo "Imóvel / Região de Interesse".'); return null; }
                body.property_code = code;
            } else if (mode === 'external') {
                const ref = document.getElementById('detail-prop-ext').value.trim();
                if (ref.length < 2) { showToast('Informe o nome, código ou link do imóvel de outra imobiliária.'); return null; }
                body.external_ref = ref;
            }
            return body;
        }

        // 4.3.5: remove o vínculo interno/externo sem apagar o texto livre de
        // imóvel/região de interesse. O PATCH existente libera a reserva somente
        // se nenhum outro lead ativo ainda a mantiver (DB.batch na API).
        async function clearLeadAssociation(leadId) {
            const lead = leads.find(l => l.id === leadId);
            if (!lead || lead.stage === 'Fechado' || lead.category === 'Captação') return;

            const mode = document.getElementById('detail-prop-mode');
            const code = document.getElementById('detail-prop-id');
            const external = document.getElementById('detail-prop-ext');
            const btn = document.getElementById('detail-clear-association');
            const linked = Boolean(lead.propertyId || lead.externalProperty);

            // Sem vínculo salvo: apenas desfaz a seleção ainda não confirmada.
            if (!linked) {
                mode.value = 'none';
                code.value = '';
                external.value = '';
                syncDetailPropertyBox();
                showToast('Seleção de imóvel limpa. A região de interesse foi mantida.');
                return;
            }

            const display = lead.propertyId || lead.externalPropertyRef || 'o imóvel associado';
            if (!confirm(`Remover a associação com ${display}? A região de interesse será mantida. Se o imóvel estiver reservado, a reserva será reavaliada para os demais leads.`)) return;
            if (btn) btn.disabled = true;
            try {
                const updated = await api('/leads/' + leadId, {
                    method: 'PATCH', body: { link_mode: 'none' }
                });
                upsert(leads, updated);
                await reloadProps();
                refreshAll();
                openLeadDetail(leadId, false);
                showToast('Associação removida. A região de interesse foi mantida.');
            } catch (error) {
                showToast(error.message);
                if (btn) btn.disabled = false;
            }
        }

        async function saveLeadProperty(event, leadId) {
            event.preventDefault();
            const lead = leads.find(l => l.id === leadId);
            if (!lead || lead.stage === 'Fechado') return;
            const body = detailPropertyPayload(lead);
            if (body === null) return;
            try {
                upsert(leads, await api('/leads/' + leadId, { method: 'PATCH', body }));
                await reloadProps();
                refreshAll(); openLeadDetail(leadId, false);
                showToast('Imóvel / região de interesse atualizado.');
            } catch (e) { showToast(e.message); }
        }

        async function addLeadNote(event, leadId) {
            event.preventDefault();
            const input = document.getElementById('new-note-text');
            const text = input.value.trim();
            if (!text) return;
            try {
                upsert(leads, await api('/leads/' + leadId + '/notes', { method: 'POST', body: { text, ...chosenFollowup() } }));
                refreshAll(); openLeadDetail(leadId, false);
                showToast('Nota registrada! Follow-up: ' + leads.find(l => l.id === leadId).followupDate + '.');
            } catch (e) { showToast(e.message); }
        }

        function leadBody() {
            const editId = document.getElementById('lead-edit-id').value;
            const body = {
                name: document.getElementById('lead-name').value,
                phone: document.getElementById('lead-phone').value,
                modality: document.getElementById('lead-modality').value,
                category: document.getElementById('lead-category').value,
                stage: document.getElementById('lead-stage').value,
                temp: document.getElementById('lead-temp').value,
                value: String(document.getElementById('lead-value').value).replace(/\D/g, ''),
                note: document.getElementById('lead-note').value
            };
            // Associação e região: só no cadastro; em leads existentes são geridas no card "Mover Lead".
            if (!editId) {
                body.property = document.getElementById('lead-property').value;
                const propBox = document.getElementById('lead-prop-box');
                if (propBox && !propBox.classList.contains('hidden')) {
                    const mode = document.getElementById('lead-prop-mode').value;
                    body.link_mode = mode;
                    if (mode === 'internal') body.property_code = document.getElementById('lead-prop-id').value;
                    if (mode === 'external') body.external_ref = document.getElementById('lead-prop-ext').value;
                } else if (document.getElementById('lead-category').value === 'Captação') {
                    body.link_mode = 'none';
                }
            }
            body.followup_at = document.getElementById('lead-followup-date').value || null;
            return body;
        }

        // V4.3.2: listas pesquisáveis exibem TODAS as opções ao receber um toque/foco.
        // A seleção anterior é preservada até o usuário realmente editar o campo.
        const datalistPreviousSelections = new WeakMap();

        function openFullDatalist(event) {
            const field = event.currentTarget || event.target;
            if (!field || !field.list) return;
            const pending = datalistPreviousSelections.get(field);
            if (field.value && (!pending || pending.edited)) {
                datalistPreviousSelections.set(field, { value: field.value, edited: false });
                field.value = '';
            }
            // showPicker está disponível em alguns navegadores; outros utilizam
            // normalmente a seta do datalist ou o teclado nativo.
            if (event.type === 'focus' || document.activeElement === field) {
                try { if (typeof field.showPicker === 'function') field.showPicker(); } catch (_) {}
            }
        }

        function commitDatalistEdit(event) {
            const field = event.currentTarget || event.target;
            const pending = datalistPreviousSelections.get(field);
            if (pending) pending.edited = true;
        }

        function isDatalistPreviewOnly(field) {
            const pending = field && datalistPreviousSelections.get(field);
            return !!(pending && !pending.edited && !field.value);
        }

        function restoreDatalistOnBlur(event) {
            const field = event.currentTarget || event.target;
            const pending = datalistPreviousSelections.get(field);
            if (!pending) return;
            if (!pending.edited && !field.value) field.value = pending.value;
            datalistPreviousSelections.delete(field);
        }

