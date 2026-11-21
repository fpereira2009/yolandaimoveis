        // 5. CRC RENDERING & BUCKETS DE ÚLTIMO CONTATO / FOLLOW-UP
        function getCrcContactBucket(client) {
            const minus30Iso = addDaysBR(-30);
            const minus365Iso = addDaysBR(-365);
            // Follow-up futuro é agendamento, NÃO é último contato.
            const raw = client.lastContactAt || client.updatedAt || client.createdAt;
            let refIso = null;
            if (raw) {
                const parsed = new Date(raw);
                if (!Number.isNaN(parsed.getTime())) {
                    refIso = parsed.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                }
            }
            if (!refIso || refIso >= minus30Iso) {
                return { key: 'recent', label: 'Recentes / Ativos', badgeClass: 'bg-moss-soft text-moss' };
            }
            if (refIso >= minus365Iso) {
                return { key: 'inactive_recent', label: 'Inativos Recentes (+30d)', badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200' };
            }
            return { key: 'inactive_old', label: 'Inativos Antigos (+1 ano)', badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200' };
        }

        function setCrcFilter(filter) {
            activeCrcFilter = filter;
            document.querySelectorAll('.crc-filter-btn').forEach(btn => {
                const active = btn.dataset.crc === filter;
                // Altera somente classes de cor/ênfase, preservando a grade responsiva da 2ª linha.
                btn.classList.remove('bg-moss', 'bg-terracotta', 'bg-sand', 'text-white',
                    'text-moss', 'text-terracotta', 'text-charcoal/80', 'font-bold', 'font-semibold');
                if (active) {
                    btn.classList.add(btn.dataset.crc === 'Aluguel' ? 'bg-terracotta' : 'bg-moss', 'text-white', 'font-bold');
                } else {
                    const color = btn.dataset.crc === 'Aluguel' ? 'text-terracotta'
                        : ['Compra', 'Venda'].includes(btn.dataset.crc) ? 'text-moss' : 'text-charcoal/80';
                    btn.classList.add('bg-sand', color, 'font-semibold');
                }
                btn.setAttribute('aria-pressed', String(active));
            });
            renderCrc();
        }

        function getCrcWhatsAppUrl(client) {
            const firstName = String(client.name || '').trim().split(/\s+/)[0] || 'Cliente';
            const regionsText = String(client.regions || '').trim();
            const phone = normPhone(client.phone);
            let msg = `Olá ${firstName}, tudo bem? Aqui é a Iêda Holanda, da Yolanda Transações Imobiliárias! `;
            if (client.birthdayMonth) {
                msg += `Passando também para desejar um feliz aniversário e muitas realizações! `;
            }
            msg += `Lembrei do seu perfil (${regionsText}) e gostaria de compartilhar uma novidade com você.`;
            return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
        }

        function renderCrc() {
            const query = document.getElementById('crc-search').value.trim().toLowerCase();
            const grid = document.getElementById('crc-cards-grid');

            const filtered = crcClients.filter(c => {
                const bucket = getCrcContactBucket(c);
                const matchSearch = !query ||
                    c.name.toLowerCase().includes(query) ||
                    c.regions.toLowerCase().includes(query) ||
                    c.preferences.toLowerCase().includes(query) ||
                    c.modality.toLowerCase().includes(query) ||
                    bucket.label.toLowerCase().includes(query);

                let matchFilter = true;
                if (activeCrcFilter === 'Compra') matchFilter = c.modality === 'Compra';
                else if (activeCrcFilter === 'Venda') matchFilter = c.modality === 'Venda';
                else if (activeCrcFilter === 'Aluguel') matchFilter = c.modality === 'Aluguel';
                else if (activeCrcFilter === 'Follow-up') matchFilter = c.pendingFollowup;
                else if (activeCrcFilter === 'recent' || activeCrcFilter === 'inactive_recent' || activeCrcFilter === 'inactive_old') {
                    matchFilter = bucket.key === activeCrcFilter;
                }
                else if (activeCrcFilter === 'Aniversariante') matchFilter = c.birthdayMonth;
                return matchSearch && matchFilter;
            });

            if (filtered.length === 0) {
                grid.innerHTML = `
                    <div class="col-span-full bg-white rounded-3xl border border-sand-border p-10 text-center">
                        <p class="font-heading font-bold text-moss text-base">Nenhum cliente encontrado neste filtro do CRC</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = sortClientsByFollowup(filtered).map(c => {
                const clientLeads = findLeadsForClient(c);
                const activeLead = clientLeads.find(l => l.stage !== 'Fechado') || clientLeads[0];
                const nextFu = clientNextFollowup(c);
                const fuOverdue = !!nextFu && nextFu < todayBR();
                const bucket = getCrcContactBucket(c);
                return `
                <article id="crc-card-${esc(c.id)}" class="${fuOverdue ? 'bg-red-50/40 border-red-300' : 'bg-white border-sand-border'} rounded-3xl border shadow-card p-5 flex flex-col justify-between space-y-4 transition-all">
                    <div class="space-y-3">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <div class="flex flex-wrap items-center gap-1.5 mb-1">
                                    ${getModalityBadge(c.modality)}
                                    <span class="px-2.5 py-0.5 rounded-md ${bucket.badgeClass} text-[11px] font-bold">${esc(bucket.label)}</span>
                                    ${c.pendingFollowup ? `<span class="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold">⏰ Follow-up</span>` : ''}
                                    ${nextFu ? (fuOverdue
                                        ? `<span class="px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold">Atrasado • ${dmyBR(nextFu)}</span>`
                                        : `<span class="px-2 py-0.5 rounded-md bg-moss-soft text-moss text-[11px] font-semibold">📅 ${nextFu === todayBR() ? 'Hoje' : dmyBR(nextFu)}</span>`) : ''}
                                    ${c.birthdayMonth ? `<span class="px-2 py-0.5 rounded-md bg-terracotta-soft text-terracotta text-[11px] font-bold">🎂 Aniversariante</span>` : ''}
                                </div>
                                <h4 class="font-heading font-bold text-moss text-base">${esc(c.name)}</h4>
                                <p class="text-xs font-semibold text-terracotta mt-0.5">${esc(c.regions)} • ${esc(c.budget)}</p>
                            </div>
                            <button type="button" onclick="openLeadFromCrc('${esc(c.id)}')" title="${activeLead ? 'Abrir lead no Funil' : 'Criar lead no Funil'}"
                                    class="shrink-0 px-2.5 py-1.5 rounded-xl ${activeLead ? 'bg-terracotta-soft text-terracotta hover:bg-terracotta hover:text-white' : 'bg-sand text-moss hover:bg-moss hover:text-white'} text-[11px] font-heading font-bold inline-flex items-center gap-1 transition-colors">
                                <i data-lucide="kanban" class="w-3.5 h-3.5"></i>
                                <span>${activeLead ? esc(activeLead.stage) : '+ Funil'}</span>
                            </button>
                        </div>

                        <div class="bg-sand/70 p-3 rounded-2xl border border-sand-border space-y-1.5">
                            <p class="text-[11px] font-bold uppercase tracking-wider text-moss/70">Preferências</p>
                            <p class="text-xs text-charcoal/85 leading-relaxed">${esc(c.preferences)}</p>
                        </div>

                        <div class="space-y-1 text-xs">
                            <p class="text-charcoal/65"><strong class="text-moss">Último contato:</strong> ${esc(c.lastInteraction)}</p>
                            <p class="text-charcoal/85"><strong class="text-terracotta">Próxima ação:</strong> ${esc(c.nextAction)}</p>
                        </div>
                    </div>

                    <div class="pt-3 border-t border-sand-border flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <a href="${esc(getCrcWhatsAppUrl(c))}" target="_blank" rel="noopener noreferrer"
                           aria-label="Chamar ${esc(c.name)} no WhatsApp" title="Chamar ${esc(c.name)} no WhatsApp"
                           class="flex-1 min-w-0 py-2.5 px-3 rounded-xl bg-whatsapp hover:brightness-105 text-white font-heading font-bold text-xs inline-flex items-center justify-center gap-1.5">
                            <i data-lucide="message-circle" class="w-4 h-4" aria-hidden="true"></i>
                            <span>WhatsApp</span>
                        </a>
                        <a href="tel:+${esc(normPhone(c.phone))}" aria-label="Ligar para ${esc(c.name)}" title="Ligar para ${esc(c.name)}"
                           class="sm:hidden shrink-0 p-2.5 rounded-xl bg-sand text-moss inline-flex items-center justify-center">
                            <i data-lucide="phone" class="w-4 h-4" aria-hidden="true"></i>
                        </a>
                        <button onclick="openEditClient('${esc(c.id)}')" title="Editar cliente" class="py-2.5 px-3 rounded-xl bg-sand hover:bg-moss hover:text-white text-moss text-xs transition-colors">✎</button>
                        <button onclick="markCrcContactDone('${esc(c.id)}')" title="Registrar contato realizado hoje"
                                class="py-2.5 px-3 rounded-xl bg-sand hover:bg-moss hover:text-white text-moss font-heading font-bold text-xs transition-colors">
                            ✓ Feito
                        </button>
                    </div>
                </article>
            `}).join('');

            lucide.createIcons();
        }

        function crcBody() {
            return {
                name: document.getElementById('crc-name').value,
                phone: document.getElementById('crc-phone').value,
                modality: document.getElementById('crc-modality').value,
                regions: document.getElementById('crc-regions').value,
                budget: document.getElementById('crc-budget').value,
                preferences: document.getElementById('crc-preferences').value,
                next_action: document.getElementById('crc-next-action').value,
                birthday_month: document.getElementById('crc-birthday').value === 'true'
            };
        }

        function openNewCrcModal() {
            const f = document.getElementById('crc-name').closest('form');
            f.reset();
            document.getElementById('crc-edit-id').value = '';
            document.getElementById('crc-modal-title').textContent = 'Novo Contato no CRC';
            document.getElementById('crc-delete-btn').classList.add('hidden');
            document.getElementById('new-crc-modal').classList.remove('hidden');
            lucide.createIcons();
        }

        function openEditClient(clientId) {
            const c = crcClients.find(x => x.id === clientId); if (!c) return;
            document.getElementById('crc-edit-id').value = c.id;
            document.getElementById('crc-modal-title').textContent = 'Editar Cliente ' + c.id;
            document.getElementById('crc-delete-btn').classList.remove('hidden');
            document.getElementById('crc-name').value = c.name;
            document.getElementById('crc-phone').value = window.YolandaMasks?.formatPhone(c.phone) || String(c.phone || '').replace(/^55(?=\d{10,11}$)/, '');
            document.getElementById('crc-modality').value = c.modality;
            document.getElementById('crc-regions').value = c.regions;
            document.getElementById('crc-budget').value = c.budget === 'A definir' ? '' : c.budget;
            document.getElementById('crc-preferences').value = c.preferences;
            document.getElementById('crc-next-action').value = c.nextAction;
            document.getElementById('crc-birthday').value = c.birthdayMonth ? 'true' : 'false';
            document.getElementById('new-crc-modal').classList.remove('hidden');
            lucide.createIcons();
        }

        async function handleCreateCrc(event) {
            event.preventDefault();
            const editId = document.getElementById('crc-edit-id').value;
            try {
                if (editId) {
                    await api('/clients/' + editId, { method: 'PATCH', body: crcBody() });
                    closeModal('new-crc-modal'); await loadAll(); showToast('Cliente atualizado!');
                    return;
                }
                const c = await api('/clients', { method: 'POST', body: crcBody() });
                closeModal('new-crc-modal'); event.target.reset(); await loadAll();
                showToast(`${c.name} cadastrado no CRC` + (c.leadCreated ? ' e adicionado ao funil como lead!' : '!'));
            } catch (e) { showToast(e.message); }
        }

        async function deleteClient() {
            const id = document.getElementById('crc-edit-id').value;
            if (!id || !confirm('Excluir este cliente do CRC? Os leads dele continuam no funil.')) return;
            try { await api('/clients/' + id, { method: 'DELETE' }); closeModal('new-crc-modal'); await loadAll(); showToast('Cliente excluído.'); }
            catch (e) { showToast(e.message); }
        }

        async function markCrcContactDone(clientId) {
            try {
                const c = await api('/clients/' + clientId, { method: 'PATCH', body: { contact_done: true } });
                upsert(crcClients, c); renderCrc();
                showToast(`Contato registrado para ${c.name}!`);
            } catch (e) { showToast(e.message); }
        }

