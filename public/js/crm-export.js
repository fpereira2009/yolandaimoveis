        // 6. EXPORTAÇÃO
        async function exportAllCsv() {
            const links = Array.from(document.querySelectorAll('a[data-export]'));
            for (const a of links) { a.click(); await new Promise(r => setTimeout(r, 700)); }
            showToast('Download das ' + links.length + ' bases iniciado.');
        }

        function closeModal(id) {
            document.getElementById(id).classList.add('hidden');
        }

        function refreshAll() {
            updateKPIs();
            renderFunnel();
            renderCrc();
            renderProps();
        }

        window.addEventListener('offline', () => {
            showReconnectToast('Sem conexão com a internet. Os dados serão sincronizados ao voltar.');
        });
        window.addEventListener('online', () => {
            showToast('Conexão restabelecida! Sincronizando...');
            loadAll();
        });

        window.onload = function() {
            lucide.createIcons();
            loadAll();
        };
