        // 2. NAVIGATION BETWEEN MAIN TABS
        function switchMainTab(tab) {
            currentMainTab = tab;
            ['funil', 'crc', 'imoveis', 'exportar'].forEach(t => {
                document.getElementById(`view-${t}`).classList.toggle('hidden', t !== tab);
            });

            document.querySelectorAll('.nav-tab-mobile').forEach(btn => {
                const isTarget = btn.dataset.tab === tab;
                btn.className = isTarget
                    ? 'nav-tab-mobile flex-1 flex flex-col items-center justify-center py-2 rounded-xl text-moss font-bold bg-sand/70'
                    : 'nav-tab-mobile flex-1 flex flex-col items-center justify-center py-2 rounded-xl text-charcoal/60 font-medium';
            });

            document.querySelectorAll('.nav-tab-desktop').forEach(btn => {
                const isTarget = btn.dataset.tab === tab;
                btn.className = isTarget
                    ? 'nav-tab-desktop w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white text-moss font-heading font-bold text-sm transition-all'
                    : 'nav-tab-desktop w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sand/85 hover:bg-white/10 font-heading font-semibold text-sm transition-all';
            });

            const headerCta = document.getElementById('header-primary-cta');
            if (tab === 'imoveis') {
                headerCta.onclick = openNewPropertyModal;
                headerCta.innerHTML = `<i data-lucide="building-2" class="w-4 h-4"></i><span>Novo Imóvel</span>`;
            } else if (tab === 'crc') {
                headerCta.onclick = openNewCrcModal;
                headerCta.innerHTML = `<i data-lucide="user-plus" class="w-4 h-4"></i><span>Novo Cliente</span>`;
            } else {
                headerCta.onclick = openNewLeadModal;
                headerCta.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i><span>Novo Lead</span>`;
            }

            lucide.createIcons();
        }

        // 3. KPI CALCULATIONS & CLICKABLE HANDLERS
        function getCommissionBreakdown() {
            const activeInterested = leads.filter(l => l.stage !== 'Fechado' && l.category !== 'Captação');
            let salesWeighted = 0;
            let rentalWeighted = 0;
            activeInterested.forEach(l => {
                const w = STAGE_WEIGHTS[l.stage] ?? 0.15;
                const v = Number(l.value) || 0;
                if (l.modality === 'Aluguel') rentalWeighted += v * 1.0 * w;
                else salesWeighted += v * 0.05 * w;
            });
            return { salesWeighted, rentalWeighted, total: salesWeighted + rentalWeighted };
        }

        function updateKPIs() {
            const active = leads.filter(l => l.stage !== 'Fechado');
            const followups = active.filter(l => l.followupStatus === 'Hoje' || l.followupStatus === 'Atrasado');
            const visits = leads.filter(l => l.stage === 'Visita Agendada');
            const proposals = leads.filter(l => l.closeResult !== 'Perdido' && (l.stage === 'Proposta Enviada' || l.stage === 'Documentação/Crédito'));
            const comm = getCommissionBreakdown();

            document.getElementById('kpi-active-leads').textContent = active.length;
            document.getElementById('kpi-followups').textContent = followups.length;
            document.getElementById('kpi-visits').textContent = visits.length;
            document.getElementById('kpi-proposals').textContent = proposals.length;
            document.getElementById('kpi-commission').textContent = formatBRL(comm.total);

            document.getElementById('sidebar-leads-badge').textContent = active.length;
            document.getElementById('sidebar-crc-badge').textContent = crcClients.length;
        }

        function clearFunnelSpecialFilter() {
            funnelFollowupOnly = false;
            document.getElementById('funnel-kpi-banner').classList.add('hidden');
            document.getElementById('kpi-card-followups').classList.remove('ring-2', 'ring-terracotta');
            renderFunnel();
        }

        function handleKpiClick(type) {
            switchMainTab('funil');
            if (type !== 'followups') {
                funnelFollowupOnly = false;
                document.getElementById('funnel-kpi-banner').classList.add('hidden');
                document.getElementById('kpi-card-followups').classList.remove('ring-2', 'ring-terracotta');
            }

            if (type === 'active') {
                document.getElementById('funnel-search').value = '';
                funnelCategoryFilter = 'Todas';
                setFunnelModality('Todos');
                if (selectedStage === 'Fechado') selectedStage = 'Novo Lead';
                renderFunnel();
            } else if (type === 'followups') {
                funnelFollowupOnly = !funnelFollowupOnly;
                document.getElementById('funnel-kpi-banner').classList.toggle('hidden', !funnelFollowupOnly);
                document.getElementById('kpi-card-followups').classList.toggle('ring-2', funnelFollowupOnly);
                document.getElementById('kpi-card-followups').classList.toggle('ring-terracotta', funnelFollowupOnly);
                if (funnelFollowupOnly) {
                    const firstDue = leads.find(l => l.stage !== 'Fechado' && (l.followupStatus === 'Atrasado' || l.followupStatus === 'Hoje'));
                    if (firstDue) selectedStage = firstDue.stage;
                }
                renderFunnel();
            } else if (type === 'visits') {
                selectedStage = 'Visita Agendada';
                renderFunnel();
            } else if (type === 'proposals') {
                const hasProp = leads.some(l => l.stage === 'Proposta Enviada');
                selectedStage = hasProp ? 'Proposta Enviada' : 'Documentação/Crédito';
                renderFunnel();
            } else if (type === 'commission') {
                const comm = getCommissionBreakdown();
                funnelCategoryFilter = 'Interessado';
                const hasDoc = leads.some(l => l.stage === 'Documentação/Crédito' && l.category !== 'Captação');
                selectedStage = hasDoc ? 'Documentação/Crédito' : 'Proposta Enviada';
                renderFunnel();
                showToast(`Comissão ponderada: ${formatBRL(comm.salesWeighted)} (vendas 5%) + ${formatBRL(comm.rentalWeighted)} (1º aluguel).`);
            }
        }
