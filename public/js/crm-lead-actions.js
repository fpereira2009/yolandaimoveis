        // ---- Imóvel associado no formulário do lead ----
        const LINK_STAGES = ['Novo Lead', 'Qualificação', 'Visita Agendada', 'Proposta Enviada', 'Documentação/Crédito'];
        const HOLDING_STAGES = ['Proposta Enviada', 'Documentação/Crédito'];

        // 4.3.3: um imóvel reservado permanece selecionável se houver
        // pelo menos um lead ativo associado. Fechamentos e exclusões não contam.
        function isLinkableProperty(prop, alreadyLinkedCode = '') {
            if (!prop) return false;
            if (prop.code === alreadyLinkedCode) return true; // preserva vínculo histórico
            if (prop.status === 'Disponível') return true;
            return prop.status === 'Reservado' && leads.some(l =>
                l.propertyId === prop.code && l.stage !== 'Fechado' && l.closeResult !== 'Perdido' && l.category === 'Interessado');
        }

        function syncPropertyDatalist() {
            const dl = document.getElementById('property-options');
            if (!dl) return;
            const isCaptacao = (document.getElementById('lead-category') || {}).value === 'Captação';
            dl.innerHTML = isCaptacao
                ? ''
                : crmProps.filter(p => isLinkableProperty(p))
                    .map(p => `<option value="${esc(p.code + ' - ' + p.title)}"></option>`)
                    .join('');
        }

        function onLeadPropertyInput() {
            const field = document.getElementById('lead-property');
            if (isDatalistPreviewOnly(field)) return; // abrir opções não desfaz o vínculo atual
            const mode = document.getElementById('lead-prop-mode');
            if (document.getElementById('lead-category').value === 'Captação') return;
            const text = field.value.trim();
            const editing = leads.find(l => l.id === document.getElementById('lead-edit-id').value);
            const chosen = crmProps.find(p => isLinkableProperty(p, editing?.propertyId) &&
                (text === `${p.code} - ${p.title}` || text === p.code));
            const selected = document.getElementById('lead-prop-id');
            if (chosen) {
                mode.value = 'internal';
                selected.value = chosen.code;
            } else if (mode.value === 'internal') {
                // Texto manual é válido e não cria uma reserva por engano.
                mode.value = 'none';
                selected.value = '';
            }
            syncSelectedPropertyLabel();
            syncLeadPropertyBox();
        }

        function syncSelectedPropertyLabel() {
            const code = document.getElementById('lead-prop-id').value;
            const p = crmProps.find(x => x.code === code);
            document.getElementById('lead-prop-selected').textContent = code
                ? `${code} — ${p ? p.title : 'Imóvel vinculado'}`
                : 'Selecione um imóvel disponível ou reservado em negociação no campo abaixo.';
        }

        function populateLeadPropertySelect(lead) {
            document.getElementById('lead-prop-id').value = lead?.propertyId || '';
            syncSelectedPropertyLabel();
        }

        function syncLeadPropertyBox() {
            syncPropertyDatalist();
            const box = document.getElementById('lead-prop-box');
            if (!box) return;
            // O modal é compartilhado: na edição esses campos são exclusivos do card "Mover Lead".
            if (document.getElementById('lead-edit-id').value) {
                box.classList.add('hidden');
                document.getElementById('lead-prop-ext').required = false;
                return;
            }
            const stage = document.getElementById('lead-stage').value;
            const isCaptacao = document.getElementById('lead-category').value === 'Captação';
            const eligible = !isCaptacao && LINK_STAGES.includes(stage);
            if (!eligible && (isCaptacao || stage !== 'Fechado')) {
                // Ao editar um lead Fechado, preserva o modo para uma eventual
                // reabertura no mesmo formulário (sem desvincular o imóvel).
                document.getElementById('lead-prop-mode').value = 'none';
            }
            const mode = document.getElementById('lead-prop-mode').value;
            box.classList.toggle('hidden', !eligible);
            document.getElementById('lead-prop-internal').classList.toggle('hidden', mode !== 'internal');
            document.getElementById('lead-prop-external').classList.toggle('hidden', mode !== 'external');
            document.getElementById('lead-prop-ext').required = eligible && mode === 'external';
            document.getElementById('lead-prop-hint').classList.toggle('hidden', !(mode === 'internal' && HOLDING_STAGES.includes(stage)));
        }

        function syncLeadModalityOptions(preferredModality) {
            const catEl = document.getElementById('lead-category');
            const modEl = document.getElementById('lead-modality');
            if (!catEl || !modEl) return;

            const isCaptacao = catEl.value === 'Captação';
            const options = isCaptacao
                ? [{ value: 'Venda', label: '🏷️ Venda' }, { value: 'Aluguel', label: '🔑 Aluguel' }]
                : [{ value: 'Compra', label: '🏡 Compra' }, { value: 'Aluguel', label: '🔑 Aluguel' }];

            const rawVal = preferredModality !== undefined ? preferredModality : modEl.value;
            const mappedVal = isCaptacao && rawVal === 'Compra'
                ? 'Venda'
                : (!isCaptacao && rawVal === 'Venda' ? 'Compra' : rawVal);

            modEl.innerHTML = options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
            modEl.value = options.some(o => o.value === mappedVal) ? mappedVal : options[0].value;
        }

        function openNewLeadModalClean() {
            const f = document.getElementById('lead-name').closest('form');
            f.reset();
            document.getElementById('lead-edit-id').value = '';
            document.getElementById('lead-modal-title').textContent = 'Cadastrar Novo Lead';
            document.getElementById('lead-submit-btn').textContent = 'Salvar no Funil';
            document.getElementById('lead-delete-btn').classList.add('hidden');
            document.getElementById('lead-followup-date').value = tomorrowBR();
            document.getElementById('lead-property-field-wrapper').classList.remove('hidden');
            document.getElementById('lead-property').required = true;
            document.getElementById('lead-note').closest('div').classList.remove('hidden');
            syncLeadModalityOptions('Compra');
            populateLeadPropertySelect(null);
            document.getElementById('lead-prop-mode').value = 'none';
            document.getElementById('lead-prop-ext').value = '';
            syncLeadPropertyBox();
        }

        function openNewLeadModal() {
            openNewLeadModalClean();
            document.getElementById('new-lead-modal').classList.remove('hidden');
            lucide.createIcons();
        }

        function openEditLead(leadId) {
            const l = leads.find(x => x.id === leadId); if (!l) return;
            closeModal('lead-detail-modal');
            document.getElementById('lead-edit-id').value = l.id;
            document.getElementById('lead-modal-title').textContent = 'Editar Lead ' + l.id;
            document.getElementById('lead-submit-btn').textContent = 'Salvar Alterações';
            document.getElementById('lead-delete-btn').classList.remove('hidden');
            document.getElementById('lead-name').value = l.name;
            document.getElementById('lead-phone').value = String(l.phone || '').replace(/^55/, '');
            document.getElementById('lead-category').value = l.category || 'Interessado';
            syncLeadModalityOptions(l.modality);
            document.getElementById('lead-stage').value = l.stage;
            document.getElementById('lead-temp').value = l.temp;
            // Associação e imóvel/região agora são editados somente no card de movimentação.
            document.getElementById('lead-property-field-wrapper').classList.add('hidden');
            document.getElementById('lead-property').required = false;
            document.getElementById('lead-property').value = l.property;
            document.getElementById('lead-value').value = l.value;
            document.getElementById('lead-followup-date').value = l.followupAt || '';
            populateLeadPropertySelect(l);
            document.getElementById('lead-prop-mode').value = l.externalProperty ? 'external' : (l.propertyId ? 'internal' : 'none');
            document.getElementById('lead-prop-ext').value = l.externalPropertyRef || '';
            syncLeadPropertyBox();
            document.getElementById('lead-note').closest('div').classList.add('hidden');
            document.getElementById('new-lead-modal').classList.remove('hidden');
            lucide.createIcons();
        }

        async function handleCreateLead(event) {
            event.preventDefault();
            const editId = document.getElementById('lead-edit-id').value;
            const body = leadBody();
            if (body.link_mode === 'internal' && !body.property_code) {
                showToast('Selecione um imóvel disponível ou reservado em negociação no campo "Imóvel / Região de Interesse".');
                return;
            }
            const curLead = editId ? leads.find(l => l.id === editId) : null;
            if (body.stage === 'Fechado' && (!curLead || curLead.stage !== 'Fechado')) {
                showToast('Para fechar um lead use o botão "Encerramento" no detalhe do atendimento (resultado + observação).');
                return;
            }
            try {
                if (editId) {
                    delete body.note;
                    await api('/leads/' + editId, { method: 'PATCH', body });
                    closeModal('new-lead-modal'); await loadAll(); showToast('Lead atualizado!');
                    return;
                }
                let created;
                try { created = await api('/leads', { method: 'POST', body }); }
                catch (e) {
                    if (e.status === 409 && confirm(e.message + '\n\nCadastrar mesmo assim?')) {
                        created = await api('/leads', { method: 'POST', body: { ...body, force: true } });
                    } else throw e;
                }
                selectedStage = created.stage;
                closeModal('new-lead-modal'); event.target.reset(); await loadAll();
                showToast(`Lead ${created.name} adicionado ao funil` + (created.clientCreated ? ' e cadastrado no CRC!' : ' (já estava no CRC).'));
            } catch (e) { showToast(e.message); }
        }

        async function deleteLead() {
            const id = document.getElementById('lead-edit-id').value;
            if (!id || !confirm('Excluir este lead? O cliente no CRC continua cadastrado.')) return;
            try { await api('/leads/' + id, { method: 'DELETE' }); closeModal('new-lead-modal'); await loadAll(); showToast('Lead excluído.'); }
            catch (e) { showToast(e.message); }
        }

        // ---- Rotina de Fechamento (Ganho / Perdido + observação obrigatória) ----
        function openCloseLead(leadId) {
            const lead = leads.find(l => l.id === leadId);
            if (!lead) return;
            if (lead.stage === 'Fechado') { showToast('Este lead já está fechado.'); return; }
            // Evita fechar e vender/alugar o imóvel errado quando há edições ainda não salvas.
            if (!document.getElementById('lead-detail-modal').classList.contains('hidden') && document.getElementById('detail-property')) {
                const draft = detailPropertyPayload(lead);
                if (draft === null) return;
                const currentMode = lead.propertyId ? 'internal' : lead.externalProperty ? 'external' : 'none';
                const pending = draft.property !== lead.property ||
                    (lead.category !== 'Captação' && (draft.link_mode !== currentMode ||
                    (draft.link_mode === 'internal' && draft.property_code !== lead.propertyId) ||
                    (draft.link_mode === 'external' && draft.external_ref !== (lead.externalPropertyRef || ''))));
                if (pending) {
                    showToast('Salve primeiro as alterações do imóvel/região antes de fechar o lead.');
                    return;
                }
            }
            document.getElementById('close-lead-id').value = lead.id;
            document.getElementById('close-lead-title').textContent = `${lead.id} • ${lead.name}`;
            document.querySelectorAll('input[name="close-result"]').forEach(r => { r.checked = false; });
            document.getElementById('close-note').value = '';
            updateCloseHint();
            document.getElementById('lead-close-modal').classList.remove('hidden');
            lucide.createIcons();
        }

        function updateCloseHint() {
            const lead = leads.find(l => l.id === document.getElementById('close-lead-id').value);
            const res = (document.querySelector('input[name="close-result"]:checked') || {}).value;
            const box = document.getElementById('close-property-hint');
            let msg = '';
            if (lead && lead.propertyId && lead.propertyStatus && res) {
                if (res === 'Ganho' && (lead.propertyStatus === 'Disponível' || lead.propertyStatus === 'Reservado')) {
                    const competing = leads.filter(l => l.id !== lead.id && l.propertyId === lead.propertyId && l.stage !== 'Fechado');
                    msg = `O imóvel ${lead.propertyId} será marcado como ${lead.propertyPurpose === 'Alugar' ? 'Alugado' : 'Vendido'}.`;
                    if (competing.length) msg += ` ${competing.length} outro(s) lead(s) serão movidos para Qualificação, sem imóvel associado, com follow-up para hoje.`;
                } else if (res === 'Perdido' && lead.propertyStatus === 'Reservado') {
                    msg = `O imóvel ${lead.propertyId} voltará para Disponível (se nenhum outro lead ativo o mantiver reservado).`;
                }
            }
            if (lead && res === 'Ganho' && !lead.propertyId && /YTI-\d{4,}/i.test(lead.property || '')) {
                msg = 'A referência do imóvel está apenas no texto. Para aplicar a disputa, associe primeiro o imóvel do portfólio no card acima e salve a associação.';
            }
            box.textContent = msg;
            box.classList.toggle('hidden', !msg);
        }

        async function submitCloseLead(event) {
            event.preventDefault();
            const id = document.getElementById('close-lead-id').value;
            const result = (document.querySelector('input[name="close-result"]:checked') || {}).value;
            const note = document.getElementById('close-note').value.trim();
            if (!result) { showToast('Selecione o resultado: Ganho ou Perdido.'); return; }
            if (note.length < 3) { showToast('Informe a observação sobre o resultado.'); return; }
            const btn = document.getElementById('close-submit-btn');
            btn.disabled = true;
            try {
                const before = (leads.find(l => l.id === id) || {}).propertyStatus;
                const upd = await api('/leads/' + id + '/close', { method: 'POST', body: { result, note } });
                // 4.3.4: o fechamento como Ganho altera outros leads no servidor.
                // Recarregar o conjunto evita contadores, Kanban e cards obsoletos.
                upsert(leads, upd);
                selectedStage = 'Fechado';
                closeModal('lead-close-modal');
                await loadAll();
                openLeadDetail(id, false);
                let msg = `Lead fechado como ${result === 'Ganho' ? 'Ganho' : 'Perdido'}.`;
                if (upd.propertyId && upd.propertyStatus !== before) msg += ` Imóvel ${upd.propertyId}: ${upd.propertyStatus}.`;
                if (result === 'Ganho' && upd.disputeResolution?.enabled) {
                    msg += ` ${upd.disputeResolution.competitorsRequalified} outro(s) lead(s) requalificado(s).`;
                }
                if (result === 'Ganho' && upd.propertyId && !upd.disputeResolution?.enabled) {
                    showToast('Lead fechado, mas a API não confirmou a requalificação automática. Verifique a versão publicada.', { persistent: true, icon: 'alert-triangle', iconColor: 'text-amber-300' });
                } else {
                    showToast(msg);
                }
            } catch (e) { showToast(e.message); }
            finally { btn.disabled = false; }
        }

