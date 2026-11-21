        // ===== GERADOR DE CARD PARA REDES SOCIAIS (1080x1350) =====
        function loadCanvasImageSafe(src, useCors) {
            return new Promise(resolve => {
                if (!src) { resolve(null); return; }
                const img = new Image();
                if (useCors) img.crossOrigin = 'anonymous';
                const timer = setTimeout(() => resolve(null), 9000);
                img.onload = () => { clearTimeout(timer); resolve(img); };
                img.onerror = () => { clearTimeout(timer); resolve(null); };
                img.src = src;
            });
        }

        async function loadCleanSocialImage(rawUrl) {
            const clean = String(rawUrl || '').trim();
            if (!clean) return null;

            // Use o proxy same-origin para gerar cards, inclusive quando a vitrine
            // utiliza domínio público R2 com política CORS diferente.
            const r2Key = clean.match(/(?:^|\/)(properties\/\d+\/[0-9a-f-]{36}\.(?:webp|jpg))$/);
            if (r2Key) {
                const img = await loadCanvasImageSafe('/api/media/file/' + r2Key[1], false);
                if (img) return img;
            }

            let targetUrl = clean;
            const driveMatch = clean.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([a-zA-Z0-9_-]+)/i);
            if (driveMatch && driveMatch[1]) {
                targetUrl = `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1200`;
            }

            const directImg = await loadCanvasImageSafe(targetUrl, true);
            if (directImg) return directImg;

            if (/^https?:\/\//i.test(targetUrl)) {
                const proxiedImg = await loadCanvasImageSafe('https://corsproxy.io/?' + encodeURIComponent(targetUrl), true);
                if (proxiedImg) return proxiedImg;
            }
            return null;
        }

        function drawSocialRoundedRect(ctx, x, y, w, h, r) {
            const radius = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.arcTo(x + w, y, x + w, y + h, radius);
            ctx.arcTo(x + w, y + h, x, y + h, radius);
            ctx.arcTo(x, y + h, x, y, radius);
            ctx.arcTo(x, y, x + w, y, radius);
            ctx.closePath();
        }

        function drawSocialCoverImage(ctx, img, x, y, w, h) {
            const imgRatio = img.width / img.height;
            const boxRatio = w / h;
            let drawW = w, drawH = h, offsetX = x, offsetY = y;
            if (imgRatio > boxRatio) {
                drawW = h * imgRatio;
                offsetX = x - (drawW - w) / 2;
            } else {
                drawH = w / imgRatio;
                offsetY = y - (drawH - h) / 2;
            }
            ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
        }

        function wrapSocialText(ctx, text, maxWidth, maxLines) {
            const words = String(text || '').split(/\s+/).filter(Boolean);
            const lines = [];
            let current = '';

            for (let i = 0; i < words.length; i++) {
                const test = current ? current + ' ' + words[i] : words[i];
                if (ctx.measureText(test).width <= maxWidth) {
                    current = test;
                } else {
                    if (current) lines.push(current);
                    current = words[i];
                    if (lines.length === maxLines) break;
                }
            }
            if (current && lines.length < maxLines) lines.push(current);
            if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
                let last = lines[maxLines - 1];
                while (ctx.measureText(last + '…').width > maxWidth && last.length > 4) {
                    last = last.slice(0, -1);
                }
                lines[maxLines - 1] = last.replace(/[.,;:\s]+$/, '') + '…';
            }
            return lines;
        }

        async function downloadPropertySocialCard(code, btnEl) {
            const p = crmProps.find(item => item.code === code);
            if (!p) return;

            if (btnEl) {
                btnEl.disabled = true;
                btnEl.classList.add('opacity-60');
            }
            showToast(`Gerando card ${p.code} para redes sociais...`);

            try {
                const W = 1080;
                const H = 1350;
                const canvas = document.createElement('canvas');
                canvas.width = W;
                canvas.height = H;
                const ctx = canvas.getContext('2d');
                const FONT_SCALE = 1.15;
                const fs = px => Math.round(px * FONT_SCALE);

                const [photoImg, localLogo] = await Promise.all([
                    loadCleanSocialImage(p.photo_url),
                    loadCanvasImageSafe('/img/logo.png', true)
                ]);
                const logoImg = localLogo || await loadCleanSocialImage('/img/logo.png');

                ctx.fillStyle = '#F5F2EB';
                ctx.fillRect(0, 0, W, H);

                ctx.fillStyle = '#2C4A3E';
                ctx.fillRect(0, 0, W, 146);

                if (logoImg) {
                    const maxLogoH = 74;
                    const scale = maxLogoH / logoImg.height;
                    const logoW = Math.min(96, logoImg.width * scale);
                    const logoH = logoImg.height * (logoW / logoImg.width);
                    ctx.drawImage(logoImg, 56, (146 - logoH) / 2, logoW, logoH);
                }

                const textStartX = logoImg ? 168 : 56;
                ctx.fillStyle = '#FFFFFF';
                ctx.font = `800 ${fs(32)}px "Plus Jakarta Sans", sans-serif`;
                ctx.fillText('Yolanda Transações Imobiliárias', textStartX, 66);

                ctx.fillStyle = '#E5DFD3';
                ctx.font = `600 ${fs(21)}px "Inter", sans-serif`;
                ctx.fillText('Iêda Holanda • CRECI-RJ 112406 • Resende e Região', textStartX, 106);

                const imgX = 56, imgY = 180, imgW = W - 112, imgH = 580;
                ctx.save();
                drawSocialRoundedRect(ctx, imgX, imgY, imgW, imgH, 32);
                ctx.clip();

                if (photoImg) {
                    drawSocialCoverImage(ctx, photoImg, imgX, imgY, imgW, imgH);
                } else {
                    const grad = ctx.createLinearGradient(imgX, imgY, imgX + imgW, imgY + imgH);
                    grad.addColorStop(0, '#2C4A3E');
                    grad.addColorStop(1, '#1E342B');
                    ctx.fillStyle = grad;
                    ctx.fillRect(imgX, imgY, imgW, imgH);

                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#F5F2EB';
                    ctx.font = '700 30px "Plus Jakarta Sans", sans-serif';
                    ctx.fillText('Yolanda Transações Imobiliárias', W / 2, imgY + imgH / 2 - 10);
                    ctx.fillStyle = '#C86D51';
                    ctx.font = '600 22px "Inter", sans-serif';
                    ctx.fillText(`${p.type || 'Imóvel'} • ${p.neighborhood || ''} - ${p.city || ''}`, W / 2, imgY + imgH / 2 + 28);
                    ctx.textAlign = 'left';
                }
                ctx.restore();

                ctx.strokeStyle = '#E5E0D5';
                ctx.lineWidth = 3;
                drawSocialRoundedRect(ctx, imgX, imgY, imgW, imgH, 32);
                ctx.stroke();

                const isRental = p.purpose === 'Alugar';
                const finLabel = isRental ? 'ALUGUEL' : 'VENDA';
                ctx.font = `800 ${fs(22)}px "Plus Jakarta Sans", sans-serif`;
                const finW = ctx.measureText(finLabel).width + 48;

                ctx.fillStyle = isRental ? '#C86D51' : '#2C4A3E';
                drawSocialRoundedRect(ctx, imgX + 26, imgY + 26, finW, 50, 25);
                ctx.fill();
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(finLabel, imgX + 50, imgY + 59);

                const codeLabel = String(p.code || 'YTI');
                ctx.font = `700 ${fs(22)}px monospace`;
                const codeW = ctx.measureText(codeLabel).width + 44;
                ctx.fillStyle = 'rgba(35, 40, 37, 0.88)';
                drawSocialRoundedRect(ctx, imgX + imgW - codeW - 26, imgY + 26, codeW, 50, 16);
                ctx.fill();
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(codeLabel, imgX + imgW - codeW - 4, imgY + 60);

                const badgeText = String(p.badge || '').trim();
                if (badgeText) {
                    ctx.font = `800 ${fs(21)}px "Plus Jakarta Sans", sans-serif`;
                    const badgeStartX = imgX + 26 + finW + 14;
                    const maxBadgeW = (imgX + imgW - codeW - 40) - badgeStartX;

                    if (maxBadgeW > 80) {
                        let displayBadge = badgeText;
                        while (ctx.measureText(displayBadge).width + 44 > maxBadgeW && displayBadge.length > 3) {
                            displayBadge = displayBadge.slice(0, -1);
                        }
                        if (displayBadge !== badgeText) {
                            displayBadge = displayBadge.trim() + '…';
                        }

                        const badgeW = ctx.measureText(displayBadge).width + 44;
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
                        drawSocialRoundedRect(ctx, badgeStartX, imgY + 26, badgeW, 50, 25);
                        ctx.fill();

                        ctx.fillStyle = '#2C4A3E';
                        ctx.fillText(displayBadge, badgeStartX + 22, imgY + 60);
                    }
                }

                const cardX = 56, cardY = 790, cardW = W - 112, cardH = 446;
                ctx.fillStyle = '#FFFFFF';
                drawSocialRoundedRect(ctx, cardX, cardY, cardW, cardH, 32);
                ctx.fill();
                ctx.strokeStyle = '#E5E0D5';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.fillStyle = '#C86D51';
                ctx.font = `700 ${fs(24)}px "Plus Jakarta Sans", sans-serif`;
                ctx.fillText(`${p.type || 'Imóvel'}  •  ${p.neighborhood || ''}, ${p.city || ''}`, cardX + 40, cardY + 56);

                ctx.fillStyle = '#2C4A3E';
                ctx.font = `800 ${fs(38)}px "Plus Jakarta Sans", sans-serif`;
                const titleLineH = fs(46);
                const titleLines = wrapSocialText(ctx, p.title || 'Imóvel Selecionado', cardW - 80, 2);
                titleLines.forEach((line, idx) => {
                    ctx.fillText(line, cardX + 40, cardY + 110 + idx * titleLineH);
                });

                const priceY = titleLines.length > 1 ? cardY + 124 + titleLineH * 2 : cardY + 194;
                ctx.fillStyle = '#232825';
                ctx.font = `800 ${fs(50)}px "Plus Jakarta Sans", sans-serif`;
                ctx.fillText(formatBRL(p.price) + (isRental ? '/mês' : ''), cardX + 40, priceY);
                
                const specsY = cardY + 286;
                const boxGap = 18;
                const boxW = (cardW - 80 - boxGap * 3) / 4;
                const boxH = 118;
                const specs = [
                    { val: `${p.area_m2 || '-'} m²`, lbl: 'Área Total' },
                    { val: String(p.bedrooms || 0), lbl: 'Quartos' },
                    { val: String(p.bathrooms || 0), lbl: 'Banheiros' },
                    { val: String(p.parking || 0), lbl: 'Vagas' }
                ];

                specs.forEach((sp, idx) => {
                    const bx = cardX + 40 + idx * (boxW + boxGap);
                    ctx.fillStyle = '#F5F2EB';
                    drawSocialRoundedRect(ctx, bx, specsY, boxW, boxH, 20);
                    ctx.fill();

                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#2C4A3E';
                    ctx.font = `800 ${fs(30)}px "Plus Jakarta Sans", sans-serif`;
                    ctx.fillText(sp.val, bx + boxW / 2, specsY + 54);

                    ctx.fillStyle = '#5A625E';
                    ctx.font = `600 ${fs(20)}px "Inter", sans-serif`;
                    ctx.fillText(sp.lbl, bx + boxW / 2, specsY + 92);
                });
                ctx.textAlign = 'left';

                ctx.fillStyle = '#1E342B';
                ctx.fillRect(0, H - 84, W, 84);

                ctx.fillStyle = '#F5F2EB';
                ctx.font = `700 ${fs(23)}px "Plus Jakarta Sans", sans-serif`;
                ctx.fillText('WhatsApp: (24) 99904-0775  •  yolandaimoveis.com.br', 56, H - 33);

                ctx.fillStyle = '#C86D51';
                ctx.font = `800 ${fs(22)}px "Plus Jakarta Sans", sans-serif`;
                ctx.textAlign = 'right';
                ctx.fillText('CRECI-RJ 112406', W - 56, H - 33);
                ctx.textAlign = 'left';

                const fileName = `card-${String(p.code || 'imovel').replace(/[^a-zA-Z0-9_-]/g, '')}.png`;
                const link = document.createElement('a');
                link.download = fileName;
                link.href = canvas.toDataURL('image/png');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                showToast(`Card ${fileName} salvo com sucesso!`);
            } catch (err) {
                showToast('Não foi possível gerar a imagem deste imóvel.');
            } finally {
                if (btnEl) {
                    btnEl.disabled = false;
                    btnEl.classList.remove('opacity-60');
                }
            }
        }

        function parseCsv(text) {
            const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
            const rows = []; let row = [], cur = '', q = false;
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
                else if (ch === '"') q = true;
                else if (ch === delim) { row.push(cur); cur = ''; }
                else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(c => c.trim())) rows.push(row); row = []; }
                else cur += ch;
            }
            row.push(cur); if (row.some(c => c.trim())) rows.push(row);
            return rows;
        }
        function brNumber(v) {
            let t = String(v || '').replace(/[^\d.,]/g, '');
            if (!t) return 0;
            if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
            return Math.round(Number(t)) || 0;
        }
        async function importPropsCsv(input) {
            const file = input.files[0]; input.value = '';
            if (!file) return;
            const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
            if (rows.length < 2) { showToast('CSV vazio ou sem linhas de dados.'); return; }
            const head = rows[0].map(h => normTxt(h).trim().replace(/\s+/g, '_'));
            const col = (r, names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0 && String(r[i] || '').trim()) return String(r[i]).trim(); } return ''; };
            const items = rows.slice(1).map(r => ({
                title: col(r, ['titulo', 'title', 'nome', 'imovel']),
                purpose: /alug|loca/.test(normTxt(col(r, ['finalidade', 'modalidade', 'operacao']))) ? 'Alugar' : 'Comprar',
                type: col(r, ['tipo', 'categoria']) || 'Casa', neighborhood: col(r, ['bairro', 'regiao', 'localidade']),
                city: col(r, ['cidade', 'municipio']) || 'Resende - RJ', price: brNumber(col(r, ['valor', 'preco', 'price'])),
                area_m2: brNumber(col(r, ['area_m2', 'area', 'metragem'])), bedrooms: brNumber(col(r, ['quartos', 'dormitorios'])),
                bathrooms: brNumber(col(r, ['banheiros', 'wc'])), parking: brNumber(col(r, ['vagas', 'garagem'])),
                badge: col(r, ['destaque', 'selo']), description: col(r, ['descricao', 'detalhes']),
                status: PROP_STATUS.find(s => normTxt(s) === normTxt(col(r, ['status', 'situacao']))) || 'Disponível'
            }));
            if (!confirm(`Importar ${items.length} imóveis? Cada um receberá um novo código YTI-####.`)) return;
            let created = 0, skipped = [];
            try {
                for (let i = 0; i < items.length; i += 50) {
                    const r = await api('/properties/import', { method: 'POST', body: { rows: items.slice(i, i + 50) } });
                    created += r.created; skipped = skipped.concat(r.skipped.map(x => ({ row: i + x.row, error: x.error })));
                }
            } catch (e) { showToast(e.message); }
            await loadAll();
            showToast(`${created} imóveis importados` + (skipped.length ? `; ${skipped.length} ignorados (ex.: linha ${skipped[0].row + 1}: ${skipped[0].error})` : '.'));
        }

