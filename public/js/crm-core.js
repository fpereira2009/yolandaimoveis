
        const STAGES = [
            "Novo Lead",
            "Qualificação",
            "Visita Agendada",
            "Proposta Enviada",
            "Documentação/Crédito",
            "Fechado"
        ];

        const STAGE_WEIGHTS = {
            "Novo Lead": 0.10,
            "Qualificação": 0.20,
            "Visita Agendada": 0.35,
            "Proposta Enviada": 0.60,
            "Documentação/Crédito": 0.85,
            "Fechado": 1.00
        };

        let leads = [];
        let crcClients = [];
        let toastTimer = null;

        function showToast(msg, { persistent = false, actionLabel = '', onAction = null, icon = 'check-circle-2', iconColor = 'text-whatsapp' } = {}) {
            const toast = document.getElementById('toast');
            const msgEl = document.getElementById('toast-msg');
            const actBtn = document.getElementById('toast-action');
            const iconEl = document.getElementById('toast-icon');

            if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
            msgEl.textContent = msg;
            iconEl.setAttribute('data-lucide', icon);
            iconEl.className = `w-5 h-5 ${iconColor} shrink-0`;

            if (actionLabel && typeof onAction === 'function') {
                actBtn.textContent = actionLabel;
                actBtn.onclick = onAction;
                actBtn.classList.remove('hidden');
            } else {
                actBtn.classList.add('hidden');
                actBtn.onclick = null;
            }

            toast.classList.remove('hidden');
            if (window.lucide) lucide.createIcons();
            if (!persistent) {
                toastTimer = setTimeout(() => toast.classList.add('hidden'), 3800);
            }
        }

        function showReconnectToast(customMsg) {
            showToast(
                customMsg || 'Conexão instável ou sessão expirada. Toque para reconectar.',
                {
                    persistent: true,
                    actionLabel: 'Reconectar',
                    onAction: () => location.reload(),
                    icon: 'wifi-off',
                    iconColor: 'text-amber-300'
                }
            );
        }

        async function api(path, { method = 'GET', body } = {}) {
            let r;
            try {
                r = await fetch('/api' + path, {
                    method,
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'application/json',
                        ...(body || method !== 'GET' ? { 'Content-Type': 'application/json' } : {})
                    },
                    body: body ? JSON.stringify(body) : undefined
                });
            } catch (e) {
                const msg = navigator.onLine
                    ? 'Sessão expirada ou falha de rede. Reconecte para continuar.'
                    : 'Você está sem internet. Verifique o sinal e reconecte.';
                showReconnectToast(msg);
                throw new Error(msg);
            }

            const ctype = (r.headers.get('content-type') || '').toLowerCase();
            if (r.status === 401 || r.status === 403 || ctype.includes('text/html')) {
                const msg = 'Sessão expirada no Cloudflare Access. Reconecte para continuar.';
                showReconnectToast(msg);
                const err = new Error(msg);
                err.status = r.status || 401;
                throw err;
            }

            let data = null;
            try { data = await r.json(); } catch (e) {}
            if (!r.ok) {
                const err = new Error((data && data.error) || 'Erro ' + r.status);
                err.status = r.status;
                throw err;
            }
            return data;
        }

        function esc(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        function upsert(list, item) {
            const i = list.findIndex(x => x.id === item.id);
            if (i >= 0) list[i] = item; else list.unshift(item);
        }

        const addDaysBR = (days = 1) => new Date(Date.now() + days * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const todayBR = () => addDaysBR(0);
        const tomorrowBR = () => addDaysBR(1);

        function normPhone(p) {
            const digits = String(p || '').replace(/\D/g, '');
            if (!digits) return '';
            return digits.startsWith('55') ? digits : '55' + digits;
        }

        function findClientForLead(lead) {
            const cid = lead.clientId || lead.client_id;
            if (cid) {
                const byId = crcClients.find(c => String(c.id) === String(cid));
                if (byId) return byId;
            }
            const lp = normPhone(lead.phone);
            return lp ? crcClients.find(c => normPhone(c.phone) === lp) || null : null;
        }

        function findLeadsForClient(client) {
            const cp = normPhone(client.phone);
            return leads.filter(l => {
                const cid = l.clientId || l.client_id;
                if (cid && String(cid) === String(client.id)) return true;
                return cp && normPhone(l.phone) === cp;
            });
        }

        async function loadAll() {
            try {
                const [l, c, pr] = await Promise.all([api('/leads'), api('/clients'), api('/properties')]);
                leads = l.items || [];
                crcClients = c.items || [];
                crmProps = pr.items || [];
                refreshAll();
            } catch (e) {
                showReconnectToast('Não foi possível sincronizar os dados: ' + e.message);
            }
        }

        async function reloadProps() {
            try { crmProps = (await api('/properties')).items || []; } catch (e) { /* mantém a lista atual */ }
        }

        function logoutApp() { location.href = '/cdn-cgi/access/logout'; }

        // UI State
        let currentMainTab = 'funil';
        let funnelViewMode = 'tabs';
        let funnelModalityFilter = 'Todos';
        let funnelCategoryFilter = 'Todas';
        let funnelFollowupOnly = false;
        let selectedStage = 'Novo Lead';
        let activeCrcFilter = 'Todos';

        function formatBRL(val) {
            return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
        }

