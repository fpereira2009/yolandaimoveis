        // 4. FUNNEL RENDERING & CROSS-NAVIGATION
        function setFunnelCategory(cat) {
            funnelCategoryFilter = cat;
            renderFunnel();
        }

        function setFunnelModality(mod) {
            funnelModalityFilter = mod;
            document.querySelectorAll('.funnel-mod-btn').forEach(btn => {
                const isSelected = btn.dataset.mod === mod;
                if (isSelected) {
                    btn.className = mod === 'Aluguel'
                        ? 'funnel-mod-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-terracotta text-white shrink-0 flex items-center gap-1.5 transition-all'
                        : 'funnel-mod-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-moss text-white shrink-0 flex items-center gap-1.5 transition-all';
                } else {
                    const colorClass = btn.dataset.mod === 'Aluguel' ? 'text-terracotta' : 'text-moss';
                    btn.className = `funnel-mod-btn px-3.5 py-2 rounded-xl text-xs font-semibold bg-sand ${colorClass} hover:opacity-85 shrink-0 flex items-center gap-1.5 transition-all`;
                }
            });
            renderFunnel();
        }

        function setFunnelMode(mode) {
            funnelViewMode = mode;
            const tabsBtn = document.getElementById('mode-tabs-btn');
            const kanbanBtn = document.getElementById('mode-kanban-btn');

            if (mode === 'tabs') {
                tabsBtn.className = 'px-3 py-2 rounded-lg text-xs font-bold bg-moss text-white flex items-center gap-1.5 transition-all';
                kanbanBtn.className = 'px-3 py-2 rounded-lg text-xs font-semibold text-charcoal/75 hover:text-moss flex items-center gap-1.5 transition-all';
                document.getElementById('funnel-tabs-container').classList.remove('hidden');
                document.getElementById('funnel-kanban-container').classList.add('hidden');
            } else {
                kanbanBtn.className = 'px-3 py-2 rounded-lg text-xs font-bold bg-moss text-white flex items-center gap-1.5 transition-all';
                tabsBtn.className = 'px-3 py-2 rounded-lg text-xs font-semibold text-charcoal/75 hover:text-moss flex items-center gap-1.5 transition-all';
                document.getElementById('funnel-tabs-container').classList.add('hidden');
                document.getElementById('funnel-kanban-container').classList.remove('hidden');
            }
            renderFunnel();
        }

        function selectStage(stage) {
            selectedStage = stage;
            renderFunnel();
        }

        function getCategoryBadge(category) {
            if (category !== 'Captação') return '';
            return '<span class="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wide">Captação</span>';
        }

        function getModalityBadge(modality) {
            if (modality === 'Aluguel') {
                return `<span class="px-2 py-0.5 rounded-md bg-terracotta text-white text-[11px] font-bold">🔑 Aluguel</span>`;
            }
            if (modality === 'Venda') {
                return `<span class="px-2 py-0.5 rounded-md bg-moss text-white text-[11px] font-bold">🏷️ Venda</span>`;
            }
            return `<span class="px-2 py-0.5 rounded-md bg-moss text-white text-[11px] font-bold">🏡 Compra</span>`;
        }

        function getTempBadge(temp) {
            if (temp === 'Quente') return `<span class="px-2 py-0.5 rounded-md bg-terracotta-soft text-terracotta text-[11px] font-bold">🔥 Quente</span>`;
            if (temp === 'Morno') return `<span class="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-bold">☀️ Morno</span>`;
            return `<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold">❄️ Frio</span>`;
        }

        function getFollowupBadge(lead) {
            const label = esc(lead.followupDate || 'Sem data');
            if (lead.followupStatus === 'Atrasado') {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold"><i data-lucide="alert-circle" class="w-3 h-3"></i> ${label}</span>`;
            }
            if (lead.followupStatus === 'Hoje') {
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold"><i data-lucide="clock" class="w-3 h-3"></i> ${label}</span>`;
            }
            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-moss-soft text-moss text-[11px] font-semibold"><i data-lucide="calendar" class="w-3 h-3"></i> ${label}</span>`;
        }

        const dmyBR = iso => String(iso || '').slice(8, 10) + '/' + String(iso || '').slice(5, 7);
        const cmpFollowup = (a, b) => {
            const x = a || '', y = b || '';
            if (!x && !y) return 0;
            if (!x) return 1;
            if (!y) return -1;
            return x < y ? -1 : (x > y ? 1 : 0);
        };
        const sortByFollowup = list => [...list].sort((a, b) => cmpFollowup(a.followupAt, b.followupAt));
        function clientNextFollowup(client) {
            const dates = findLeadsForClient(client).filter(l => l.stage !== 'Fechado' && l.followupAt).map(l => l.followupAt).sort();
            return dates[0] || null;
        }
        function sortClientsByFollowup(list) {
            const keyed = list.map(c => [c, clientNextFollowup(c)]);
            keyed.sort((a, b) => cmpFollowup(a[1], b[1]));
            return keyed.map(x => x[0]);
        }
        const isOverdueLead = lead => lead.stage !== 'Fechado' && lead.followupStatus === 'Atrasado';

        function getLeadPropertyChips(lead, includeResult = true) {
            const chips = [];
            if (lead.propertyId) {
                const st = lead.propertyStatus || '';
                const cls = st === 'Reservado' ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : (st === 'Vendido' || st === 'Alugado') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-moss-soft text-moss';
                chips.push(`<span title="${esc(lead.propertyTitle || '')}" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${cls} text-[11px] font-bold"><i data-lucide="building-2" class="w-3 h-3"></i> ${esc(lead.propertyId)}${st ? ' • ' + esc(st) : ''}</span>`);
            } else if (lead.externalProperty) {
                chips.push(`<span title="${esc(lead.externalPropertyRef || '')}" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-bold"><i data-lucide="handshake" class="w-3 h-3"></i> Imóvel externo</span>`);
            }
            if (includeResult && lead.stage === 'Fechado' && lead.closeResult) {
                chips.push(lead.closeResult === 'Ganho'
                    ? `<span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">✅ Ganho</span>`
                    : `<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold">✖ Perdido</span>`);
            }
            return chips.length ? `<div class="flex flex-wrap items-center gap-1.5 mt-1.5">${chips.join('')}</div>` : '';
        }

        function getExternalRefLine(lead) {
            if (!lead.externalProperty || !lead.externalPropertyRef) return '';
            const ref = lead.externalPropertyRef;
            const shown = /^https?:\/\/\S+$/i.test(ref)
                ? `<a href="${esc(ref)}" target="_blank" rel="noopener noreferrer" class="underline text-moss break-all">${esc(ref)}</a>`
                : esc(ref);
            return `<p class="text-[11px] text-charcoal/65 mt-1">Outra imobiliária: ${shown}</p>`;
        }

        function getLeadWhatsAppUrl(lead) {
            const firstName = String(lead.name || '').trim().split(/\s+/)[0] || 'Cliente';
            const propText = String(lead.property || '').trim();
            const phone = normPhone(lead.phone);
            const msg = `Olá ${firstName}, tudo bem? Aqui é a Iêda Holanda, da Yolanda Transações Imobiliárias. Estou passando para dar sequência ao nosso atendimento sobre o imóvel (${propText}). Como está sua disponibilidade?`;
            return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
        }

        function buildLeadCardHTML(lead) {
            const isRental = lead.modality === 'Aluguel';
            const linkedClient = findClientForLead(lead);
            return `
                <div id="lead-card-${esc(lead.id)}" class="${isOverdueLead(lead) ? 'bg-red-50/40 border-red-300' : 'bg-white border-sand-border'} rounded-2xl border shadow-card p-4 flex flex-col justify-between space-y-3 hover:border-moss/30 transition-all">
                    <div class="space-y-2.5">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <div class="flex flex-wrap items-center gap-1.5 mb-1">
                                    ${getModalityBadge(lead.modality)}${getCategoryBadge(lead.category)}
                                    ${getTempBadge(lead.temp)}
                                </div>
                                <h4 class="font-heading font-bold text-moss text-sm sm:text-base leading-snug">${esc(lead.name)}</h4>
                                <p class="text-xs font-medium text-charcoal/75 mt-0.5">${esc(lead.property)}</p>
                                ${getLeadPropertyChips(lead)}
                            </div>
                            ${linkedClient ? `
                                <button type="button" onclick="openClientFromLead('${esc(lead.id)}')" title="Abrir ficha no CRC"
                                        class="shrink-0 px-2 py-1 rounded-lg bg-moss-soft hover:bg-moss hover:text-white text-moss text-[10px] font-heading font-bold inline-flex items-center gap-1 transition-colors">
                                    <i data-lucide="user-check" class="w-3 h-3"></i>
                                    <span>CRC</span>
                                </button>
                            ` : ''}
                        </div>

                        <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <span class="font-heading font-extrabold text-charcoal text-sm sm:text-base">
                                ${formatBRL(lead.value)}${isRental ? '/mês' : ''}
                            </span>
                            ${getFollowupBadge(lead)}
                        </div>

                        ${lead.stage !== 'Fechado' ? `
                        <div class="flex items-center gap-1.5 pt-0.5">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-charcoal/50 mr-0.5">Reagendar:</span>
                            <button type="button" onclick="quickRescheduleFollowup('${esc(lead.id)}', 1)" class="px-2 py-1 rounded-lg bg-sand hover:bg-moss hover:text-white text-moss text-[11px] font-bold transition-colors">Amanhã</button>
                            <button type="button" onclick="quickRescheduleFollowup('${esc(lead.id)}', 3)" class="px-2 py-1 rounded-lg bg-sand hover:bg-moss hover:text-white text-moss text-[11px] font-bold transition-colors">+3d</button>
                            <button type="button" onclick="quickRescheduleFollowup('${esc(lead.id)}', 7)" class="px-2 py-1 rounded-lg bg-sand hover:bg-moss hover:text-white text-moss text-[11px] font-bold transition-colors">+7d</button>
                        </div>` : ''}

                        ${lead.history && lead.history.length ? `
                        <p class="text-xs text-charcoal/70 bg-sand/60 p-2.5 rounded-xl border border-sand-border line-clamp-2">
                            "${esc(lead.history[0].text)}"
                        </p>` : ''}
                    </div>

                    <!-- Touch-friendly Action Footer -->
                    <div class="pt-2 border-t border-sand-border flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <a href="${esc(getLeadWhatsAppUrl(lead))}" target="_blank" rel="noopener noreferrer"
                           aria-label="Chamar ${esc(lead.name)} no WhatsApp" title="Chamar ${esc(lead.name)} no WhatsApp"
                           class="py-2.5 px-3 rounded-xl bg-whatsapp hover:brightness-105 text-white font-heading font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs">
                            <i data-lucide="message-circle" class="w-4 h-4" aria-hidden="true"></i>
                            <span>WhatsApp</span>
                        </a>
                        <a href="tel:+${esc(normPhone(lead.phone))}" aria-label="Ligar para ${esc(lead.name)}" title="Ligar para ${esc(lead.name)}"
                           class="sm:hidden p-2.5 rounded-xl bg-sand text-moss inline-flex items-center justify-center">
                            <i data-lucide="phone" class="w-4 h-4" aria-hidden="true"></i>
                        </a>

                        <button onclick="openLeadDetail('${esc(lead.id)}', true)" class="flex-1 py-2.5 px-2.5 rounded-xl bg-sand hover:bg-moss hover:text-white text-moss font-heading font-bold text-xs inline-flex items-center justify-center gap-1 transition-colors">
                            <i data-lucide="arrow-right-left" class="w-3.5 h-3.5"></i>
                            <span>Mover Etapa</span>
                        </button>

                        <button onclick="openLeadDetail('${esc(lead.id)}', false)" aria-label="Detalhes do Lead" class="p-2.5 rounded-xl bg-sand hover:bg-moss/10 text-moss">
                            <i data-lucide="file-text" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        function renderFunnel() {
            const query = document.getElementById('funnel-search').value.trim().toLowerCase();

            // O Kanban exibe apenas leads ativos; a visualização por etapas mantém o histórico Fechado.
            const visibleLeads = funnelViewMode === 'kanban'
                ? leads.filter(l => l.stage !== 'Fechado')
                : leads;
            document.getElementById('count-cat-todas').textContent = visibleLeads.length;
            document.getElementById('count-cat-interessado').textContent = visibleLeads.filter(l => l.category !== 'Captação').length;
            document.getElementById('count-cat-captacao').textContent = visibleLeads.filter(l => l.category === 'Captação').length;
            document.querySelectorAll('.funnel-cat-btn').forEach(b => {
                const on = b.dataset.cat === funnelCategoryFilter;
                b.className = 'funnel-cat-btn px-3.5 py-2 rounded-xl text-xs shrink-0 flex items-center gap-1.5 transition-colors ' +
                    (on ? 'font-bold bg-moss text-white' : 'font-semibold bg-sand text-moss hover:bg-moss/10');
            });

            const baseLeads = visibleLeads.filter(l => {
                const matchCat = funnelCategoryFilter === 'Todas' || l.category === funnelCategoryFilter;
                const matchDue = !funnelFollowupOnly || (l.stage !== 'Fechado' && (l.followupStatus === 'Hoje' || l.followupStatus === 'Atrasado'));
                return matchCat && matchDue;
            });

            const searchMatched = baseLeads.filter(l =>
                !query ||
                l.name.toLowerCase().includes(query) ||
                l.property.toLowerCase().includes(query) ||
                l.stage.toLowerCase().includes(query) ||
                l.modality.toLowerCase().includes(query)
            );

            document.getElementById('count-funnel-todos').textContent = searchMatched.length;
            document.getElementById('count-funnel-compra').textContent = searchMatched.filter(l => l.modality === 'Compra').length;
            document.getElementById('count-funnel-venda').textContent = searchMatched.filter(l => l.modality === 'Venda').length;
            document.getElementById('count-funnel-aluguel').textContent = searchMatched.filter(l => l.modality === 'Aluguel').length;

            const filteredLeads = sortByFollowup(searchMatched.filter(l => {
                if (funnelModalityFilter === 'Todos') return true;
                return l.modality === funnelModalityFilter;
            }));

            const pillsBar = document.getElementById('stage-pills-bar');
            pillsBar.innerHTML = STAGES.map(stage => {
                const count = filteredLeads.filter(l => l.stage === stage).length;
                const active = stage === selectedStage;
                return `
                    <button onclick="selectStage('${stage}')" 
                            class="px-4 py-2.5 rounded-2xl text-xs font-heading font-bold shrink-0 flex items-center gap-2 border transition-all ${active ? 'bg-moss text-white border-moss shadow-xs' : 'bg-white text-charcoal/80 border-sand-border hover:border-moss/30'}">
                        <span>${stage}</span>
                        <span class="px-2 py-0.5 rounded-full text-[11px] ${active ? 'bg-terracotta text-white' : 'bg-sand text-moss'}">${count}</span>
                    </button>
                `;
            }).join('');

            const stageGrid = document.getElementById('stage-cards-grid');
            const stageLeads = filteredLeads.filter(l => l.stage === selectedStage);
            if (stageLeads.length === 0) {
                stageGrid.innerHTML = `
                    <div class="col-span-full bg-white rounded-3xl border border-sand-border p-10 text-center">
                        <p class="font-heading font-bold text-moss text-base">Nenhum lead na etapa "${esc(selectedStage)}"</p>
                        <p class="text-xs text-charcoal/65 mt-1">Cadastre um novo atendimento ou mova um lead de outra etapa.</p>
                    </div>
                `;
            } else {
                stageGrid.innerHTML = stageLeads.map(l => buildLeadCardHTML(l)).join('');
            }

            // Kanban: somente etapas ativas. O histórico Fechado permanece nas abas e no D1.
            const kanbanStages = STAGES.filter(stage => stage !== 'Fechado');
            const kanbanWrapper = document.getElementById('kanban-columns-wrapper');
            kanbanWrapper.innerHTML = kanbanStages.map(stage => {
                const colLeads = filteredLeads.filter(l => l.stage === stage);
                return `
                    <div class="w-80 bg-sand-dark/60 rounded-3xl p-3.5 border border-sand-border space-y-3">
                        <div class="flex items-center justify-between px-1">
                            <h4 class="font-heading font-bold text-moss text-sm">${stage}</h4>
                            <span class="px-2.5 py-0.5 rounded-full bg-white text-moss text-xs font-bold border border-sand-border">${colLeads.length}</span>
                        </div>
                        <div class="space-y-3">
                            ${colLeads.length ? colLeads.map(l => buildLeadCardHTML(l)).join('') : `<p class="text-xs text-charcoal/50 text-center py-6">Vazio</p>`}
                        </div>
                    </div>
                `;
            }).join('');

            lucide.createIcons();
        }

        function openClientFromLead(leadId) {
            const lead = leads.find(l => l.id === leadId);
            if (!lead) return;
            const client = findClientForLead(lead);
            if (!client) {
                showToast('Este lead ainda não possui ficha vinculada no CRC.');
                return;
            }
            closeModal('lead-detail-modal');
            switchMainTab('crc');
            document.getElementById('crc-search').value = '';
            setCrcFilter('Todos');
            requestAnimationFrame(() => {
                const el = document.getElementById('crc-card-' + client.id);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.remove('card-highlight');
                    void el.offsetWidth;
                    el.classList.add('card-highlight');
                }
            });
        }

        function openLeadFromCrc(clientId) {
            const client = crcClients.find(c => c.id === clientId);
            if (!client) return;
            const matchedLeads = findLeadsForClient(client);

            if (matchedLeads.length === 0) {
                openNewLeadModal();
                const isVenda = client.modality === 'Venda';
                document.getElementById('lead-name').value = client.name || '';
                document.getElementById('lead-phone').value = String(client.phone || '').replace(/^55/, '');
                document.getElementById('lead-category').value = isVenda ? 'Captação' : 'Interessado';
                syncLeadModalityOptions(client.modality || 'Compra');
                document.getElementById('lead-property').value = client.regions || '';
                showToast(`Dados de ${client.name} preenchidos para novo lead.`);
                return;
            }

            switchMainTab('funil');
            clearFunnelSpecialFilter();
            funnelCategoryFilter = 'Todas';
            setFunnelModality('Todos');

            const primaryLead = matchedLeads.find(l => l.stage !== 'Fechado') || matchedLeads[0];
            if (matchedLeads.length === 1) {
                document.getElementById('funnel-search').value = '';
                selectedStage = primaryLead.stage;
                renderFunnel();
                openLeadDetail(primaryLead.id, false);
            } else {
                document.getElementById('funnel-search').value = client.name;
                selectedStage = primaryLead.stage;
                renderFunnel();
                showToast(`${matchedLeads.length} leads encontrados para ${client.name}.`);
            }
        }

