
        (function () {
            "use strict";

            const BROKER_PHONE = "5524999040775";
            const BROKER_AVATAR = "/img/fotocorretora-480.webp";

            // Sem foto cadastrada ou com falha de carregamento: texto, nunca imagem ilustrativa.
            const PROPERTY_IMAGE_UNAVAILABLE = "Imagem não disponível";

            // Mapa instantâneo para links ImgBB conhecidos
            const KNOWN_IMGBB_MAP = {
                "https://ibb.co/sd7SvxgQ": "https://i.ibb.co/JwZLR6c2/casa.png",
                "https://ibb.co/3mvthgsG": "/img/fotocorretora.jpeg"
            };

            const inFlightImageResolutions = {};

            // Último catálogo válido fica guardado no navegador; nunca se exibem imóveis de exemplo.
            const CATALOG_CACHE_KEY = "yti_catalog_v3";
            const LEGACY_CATALOG_CACHE_KEY = "yti_catalog_v2";
            const featureNumber = new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 21 });
            const catalogTextFields = ['bairro', 'cidade', 'descricao', 'destaque', 'finalidade',
                'tipo', 'status', 'foto_url', 'resolved_foto_url', 'url'];
            const catalogNumericFields = ['area_m2', 'quartos', 'banheiros', 'vagas', 'valor', 'coverImageId'];
            const imageNumericFields = ['id', 'position', 'sizeBytes', 'width', 'height', 'thumbWidth', 'thumbHeight'];

            // Mesmo contrato de propertyFeatures no SSR. A suíte compara as duas saídas.
            function numericFeature(value, integer = false) {
                if (typeof value === 'number') return Number.isFinite(value) ? value : null;
                if (typeof value !== 'string') return null;
                const text = value.trim();
                if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(text)) return null;
                const pattern = integer ? /^(?:\d+(?:[.,]0+)?|[.,]0+)$/ : /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
                if (!pattern.test(text)) return null;
                const number = Number(text.replace(',', '.'));
                return Number.isFinite(number) ? number : null;
            }

            function propertyFeatures({area_m2, bedrooms, bathrooms, parking}) {
                const features = [];
                const area = numericFeature(area_m2);
                if (area > 0) {
                    features.push({key:'area_m2', value:area, label:'Área', display:featureNumber.format(area) + ' m²'});
                }
                for (const [key, raw, singular, plural, minimum] of [
                    ['bedrooms', bedrooms, 'Quarto', 'Quartos', 1],
                    ['bathrooms', bathrooms, 'Banheiro', 'Banheiros', 1],
                    ['parking', parking, 'Vaga', 'Vagas', 0],
                ]) {
                    const value = numericFeature(raw, true);
                    if (Number.isSafeInteger(value) && value >= minimum) {
                        features.push({key, value, label:value === 1 ? singular : plural, display:featureNumber.format(value)});
                    }
                }
                return features;
            }

            function catalogFeatures({caracteristicas, area_m2, quartos, banheiros, vagas}) {
                if (Array.isArray(caracteristicas) && caracteristicas.length <= 4 &&
                    caracteristicas.every(feature => feature && typeof feature.key === 'string' && typeof feature.value === 'number')) {
                    const values = Object.fromEntries(caracteristicas.map(({key, value}) => [key, value]));
                    const normalized = propertyFeatures(values);
                    if (normalized.length === caracteristicas.length && normalized.every((feature, index) => {
                        const supplied = caracteristicas[index];
                        return feature.key === supplied.key && feature.value === supplied.value &&
                            feature.label === supplied.label && feature.display === supplied.display;
                    })) return caracteristicas;
                }
                return propertyFeatures({area_m2, bedrooms:quartos, bathrooms:banheiros, parking:vagas});
            }

            function isOptionalText(value) {
                return value == null || typeof value === 'string';
            }

            function isOptionalNumber(value) {
                return value == null || typeof value === 'string' || Number.isFinite(value);
            }

            function isLocalCatalogUrl(value, pattern) {
                if (value == null || value === '') return true;
                if (typeof value !== 'string' || /[\s,\\]/.test(value)) return false;
                try {
                    const {origin} = window.location;
                    const url = new URL(value, origin);
                    return url.origin === origin && !url.username && !url.password &&
                        pattern.test(url.pathname + url.search + url.hash);
                } catch (e) { return false; }
            }

            function isCatalogImage(image) {
                const mediaPath = /^\/api\/media\/file\/[a-z0-9_./%-]+$/i;
                return image && typeof image === 'object' && !Array.isArray(image) &&
                    typeof image.url === 'string' && image.url !== '' &&
                    isLocalCatalogUrl(image.url, mediaPath) && isLocalCatalogUrl(image.thumbUrl, mediaPath) &&
                    (image.cover == null || typeof image.cover === 'boolean') &&
                    isOptionalText(image.mimeType) && imageNumericFields.every(key => isOptionalNumber(image[key]));
            }

            function prepareCatalog(items) {
                if (!Array.isArray(items)) throw new Error('Catálogo incompatível');
                const codes = new Set();
                return items.map(item => {
                    if (!item || typeof item.codigo !== 'string' || !/^YTI-\d{4,}$/.test(item.codigo) ||
                        typeof item.titulo !== 'string' || !item.titulo.trim() || codes.has(item.codigo) ||
                        !catalogTextFields.every(key => isOptionalText(item[key])) ||
                        !catalogNumericFields.every(key => isOptionalNumber(item[key])) ||
                        !isLocalCatalogUrl(item.url, /^(?:\/imoveis\/[a-z0-9-]+|\/\?imovel=YTI-\d{4,})$/) ||
                        (item.images != null && (!Array.isArray(item.images) ||
                            !item.images.every(isCatalogImage)))) {
                        throw new Error('Imóvel incompatível no catálogo');
                    }
                    codes.add(item.codigo);
                    return {...item, caracteristicas:catalogFeatures(item)};
                });
            }

            function isDeprecatedPhotoPlaceholder(url) {
                const value = String(url || "");
                // Descarta fotos fictícias deixadas no cache por versões anteriores.
                return value.includes("photo-1600585154340-be6161a56a0c") ||
                    value.includes("Carregando+Foto+do+Im");
            }
            function readCatalogCache() {
                for (const key of [CATALOG_CACHE_KEY, LEGACY_CATALOG_CACHE_KEY]) {
                    try {
                        const snapshot = JSON.parse(safeGetStorage(key, "null"));
                        return prepareCatalog(snapshot?.items).map(item => {
                            if (isDeprecatedPhotoPlaceholder(item.foto_url)) item.foto_url = "";
                            if (isDeprecatedPhotoPlaceholder(item.resolved_foto_url)) item.resolved_foto_url = "";
                            return item;
                        });
                    } catch (e) { /* Tenta a versão anterior sem renovar o cache. */ }
                }
                return null;
            }
            function saveCatalogCache(items) {
                safeSetStorage(CATALOG_CACHE_KEY, JSON.stringify({ at: Date.now(), items: items }));
            }
            function esc(v) {
                return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
                    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
                });
            }
            let catalogFailed = false;
            let lastValidCatalog = readCatalogCache();
            let properties = lastValidCatalog ?? [];
            let activeFinalidade = "Todos";
            let propertyHistoryEntry = false;
            let catalogLoaded = false;
            const prefetchedPropertyImages = new Set();
            // Códigos públicos válidos no parâmetro ?imovel=YTI-0001.
            function getLinkedPropertyCode() {
                const current = typeof location !== 'undefined' ? location : window.location;
                const params = new URLSearchParams(current.search || '');
                const code = params.get('interesse') || params.get('imovel');
                return /^YTI-\d{4,}$/.test(code || '') ? code : '';
            }
            function propertyDeepLink(prop) {
                const current = typeof location !== 'undefined' ? location : window.location;
                if (prop.url) return new URL(prop.url, current.origin).href;
                const url = new URL(current.pathname || '/', current.origin);
                url.searchParams.set('imovel', prop.codigo);
                return url.href;
            }
            function preloadPropertyImage(url, critical = false) {
                if (typeof url !== 'string' || !url.startsWith('/api/media/file/properties/') || prefetchedPropertyImages.has(url)) return;
                if (typeof Image === 'undefined' || typeof document.createElement !== 'function') return;
                prefetchedPropertyImages.add(url);
                if (prefetchedPropertyImages.size > 48) prefetchedPropertyImages.clear();
                if (critical) {
                    const link = document.createElement('link');
                    link.rel = 'preload'; link.as = 'image'; link.href = url;
                    document.head.appendChild(link);
                    link.addEventListener('load', () => link.remove(), { once: true });
                    link.addEventListener('error', () => link.remove(), { once: true });
                } else {
                    const img = new Image(); img.decoding = 'async'; img.src = url;
                }
            }
            function prefetchPropertyGallery(images, index = 0) {
                if (!images.length) return;
                preloadPropertyImage(images[index], true);
                // Apenas a vizinhança da foto ativa, sem carregar as 10 de uma só vez.
                if (images.length > 1) preloadPropertyImage(images[(index + 1) % images.length]);
                if (images.length > 2) preloadPropertyImage(images[(index + images.length - 1) % images.length]);
            }
            function syncPropertyModalWithUrl() {
                if (!catalogLoaded) return;
                const code = getLinkedPropertyCode();
                if (code) {
                    const prop = properties.find(p => p.codigo === code);
                    if (prop) openPropertyModal(code, true);
                    else showToast('Este imóvel não está disponível no catálogo atual.');
                } else {
                    const modal = document.getElementById('property-modal');
                    if (modal && !modal.classList.contains('hidden')) closePropertyModal(true);
                }
            }

            // ==================== HELPERS SEGUROS ====================
            function safeRefreshIcons() {
                try {
                    if (window.lucide && typeof window.lucide.createIcons === "function") {
                        window.lucide.createIcons();
                    }
                } catch (e) {
                    // Ignora falhas de ícone para nunca quebrar a UI
                }
            }

            function safeGetStorage(key, fallback) {
                try {
                    const val = window.localStorage.getItem(key);
                    return val !== null ? val : fallback;
                } catch (e) {
                    return fallback;
                }
            }

            function safeSetStorage(key, value) {
                try {
                    window.localStorage.setItem(key, value);
                } catch (e) {
                    // Ignora em modo privado restrito
                }
            }

            function getResolvedImageCache() {
                try {
                    const raw = safeGetStorage(RESOLVED_IMG_CACHE_KEY, "{}");
                    const parsed = JSON.parse(raw);
                    return parsed && typeof parsed === "object" ? parsed : {};
                } catch (e) {
                    return {};
                }
            }

            function saveResolvedImageCache(key, directUrl) {
                try {
                    const cache = getResolvedImageCache();
                    cache[key] = directUrl;
                    safeSetStorage(RESOLVED_IMG_CACHE_KEY, JSON.stringify(cache));
                } catch (e) {
                    // Ignora erro de quota
                }
            }

            function normalizeImgbbViewerUrl(url) {
                const trimmed = String(url || "").trim();
                const match = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?ibb\.co\/([a-zA-Z0-9]+)\/?$/i);
                if (!match || !match[1]) return null;
                return "https://ibb.co/" + match[1];
            }

            function extractDirectImgbbFromHtml(html) {
                const text = String(html || "");
                // 1. Prioriza meta og:image
                const ogMatch1 = text.match(/<meta[^>]+property=["']og:image["'][^>]+content=["'](https:\/\/i\.ibb\.co\/[^"']+)["']/i);
                if (ogMatch1 && ogMatch1[1]) return ogMatch1[1];

                const ogMatch2 = text.match(/<meta[^>]+content=["'](https:\/\/i\.ibb\.co\/[^"']+)["'][^>]+property=["']og:image["']/i);
                if (ogMatch2 && ogMatch2[1]) return ogMatch2[1];

                // 2. Fallback: qualquer <img src="https://i.ibb.co/..."> (ignorando avatares pequenos)
                const imgRegex = /<img[^>]+src=["'](https:\/\/i\.ibb\.co\/[^"']+)["']/gi;
                let m;
                while ((m = imgRegex.exec(text)) !== null) {
                    if (m[1] && m[1].indexOf("/avatar/") === -1) {
                        return m[1];
                    }
                }
                return null;
            }

            function applyResolvedUrlToDom(normalizedKey, directUrl) {
                // Atualiza em memória na lista de imóveis
                properties.forEach(function (p) {
                    if (normalizeImgbbViewerUrl(p.foto_url) === normalizedKey || p.foto_url === normalizedKey) {
                        p.resolved_foto_url = directUrl;
                    }
                });

                // Atualiza imediatamente todas as imagens (cards e modal aberto) com esse link
                document.querySelectorAll("img[data-raw-img]").forEach(function (imgEl) {
                    if (imgEl.getAttribute("data-raw-img") === normalizedKey) {
                        if (directUrl) {
                            imgEl.style.display = "";
                            const fallback = imgEl.closest(".property-image-frame")?.querySelector("[data-image-unavailable]");
                            if (fallback) fallback.style.display = "none";
                            imgEl.src = directUrl;
                        } else {
                            handlePropertyImgError(imgEl);
                        }
                    }
                });
            }

            async function fetchAndCacheImgbbDirectUrl(normalizedKey) {
                if (inFlightImageResolutions[normalizedKey]) {
                    return inFlightImageResolutions[normalizedKey];
                }

                const proxies = [
                    "https://api.allorigins.win/raw?url=" + encodeURIComponent(normalizedKey),
                    "https://corsproxy.io/?" + encodeURIComponent(normalizedKey)
                ];

                const task = (async function () {
                    for (let i = 0; i < proxies.length; i++) {
                        try {
                            const resp = await fetch(proxies[i]);
                            if (!resp.ok) continue;
                            const html = await resp.text();
                            const directUrl = extractDirectImgbbFromHtml(html);
                            if (directUrl) {
                                saveResolvedImageCache(normalizedKey, directUrl);
                                applyResolvedUrlToDom(normalizedKey, directUrl);
                                return directUrl;
                            }
                        } catch (err) {
                            // Tenta o próximo proxy
                        }
                    }
                    // URL de imagem não resolvida: mantém a mensagem, sem foto de substituição.
                    applyResolvedUrlToDom(normalizedKey, "");
                    return "";
                })().finally(function () {
                    delete inFlightImageResolutions[normalizedKey];
                });

                inFlightImageResolutions[normalizedKey] = task;
                return task;
            }

            // Resolvedor Universal de Imagens para Google Sheets (ImgBB viewer, Google Drive e URLs diretas)
            function resolvePropertyImageUrl(rawUrl, imgElement) {
                const clean = String(rawUrl || "").trim();
                if (!clean) {
                    if (imgElement) handlePropertyImgError(imgElement);
                    return "";
                }

                // 1. Conversão automática para links de compartilhamento do Google Drive
                const driveMatch = clean.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([a-zA-Z0-9_-]+)/i);
                if (driveMatch && driveMatch[1]) {
                    const driveDirect = "https://drive.google.com/thumbnail?id=" + driveMatch[1] + "&sz=w1200";
                    if (imgElement) imgElement.src = driveDirect;
                    return driveDirect;
                }

                // 2. Resolução automática para páginas de visualização ImgBB (https://ibb.co/<codigo>)
                const normalizedImgbb = normalizeImgbbViewerUrl(clean);
                if (normalizedImgbb) {
                    if (imgElement) {
                        imgElement.setAttribute("data-raw-img", normalizedImgbb);
                    }

                    // 2a. Verifica mapa instantâneo embutido
                    if (KNOWN_IMGBB_MAP[normalizedImgbb]) {
                        const mapped = KNOWN_IMGBB_MAP[normalizedImgbb];
                        if (imgElement) imgElement.src = mapped;
                        return mapped;
                    }

                    // 2b. Verifica cache persistente no localStorage
                    const cache = getResolvedImageCache();
                    if (cache[normalizedImgbb]) {
                        const cachedUrl = cache[normalizedImgbb];
                        if (imgElement) imgElement.src = cachedUrl;
                        return cachedUrl;
                    }

                    // 2c. Não exibe foto fictícia durante a tentativa de resolver URL legada.
                    if (imgElement) handlePropertyImgError(imgElement);
                    fetchAndCacheImgbbDirectUrl(normalizedImgbb);
                    return "";
                }

                // 3. URL já direta (i.ibb.co, Unsplash, etc.)
                if (imgElement) imgElement.src = clean;
                return clean;
            }

            function responsiveCoverAttributes(prop) {
                const images=Array.isArray(prop.images)?prop.images:[];
                const cover=images.find(i=>i && i.cover && i.url) || images.find(i=>i && i.url);
                if (!cover) return '';
                const w=Number(cover.width), h=Number(cover.height);
                const tw=Number(cover.thumbWidth), th=Number(cover.thumbHeight);
                const valid=(a,b)=>Number.isInteger(a)&&Number.isInteger(b)&&a>0&&b>0&&a<=1600&&b<=1600;
                const sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';
                const dims=valid(w,h)?' width="'+w+'" height="'+h+'"':'';
                const responsive=(cover.thumbUrl && valid(tw,th) && valid(w,h) && tw<w)
                    ? ' srcset="'+esc(cover.thumbUrl)+' '+tw+'w, '+esc(cover.url)+' '+w+'w" sizes="'+sizes+'"' : '';
                return dims+responsive;
            }
            function getPropertyCoverUrl(prop) {
                // 4.3.3: fotos de anúncios vêm EXCLUSIVAMENTE da galeria R2.
                // Nunca recorrer ao campo legado foto_url nem a imagens genéricas,
                // inclusive quando há uma cópia antiga do catálogo no navegador.
                const gallery = Array.isArray(prop.images) ? prop.images : [];
                const cover = gallery.find(function (img) { return img && img.cover && img.url; }) ||
                    gallery.find(function (img) { return img && img.url; });
                return cover ? cover.url : "";
            }

            function unavailablePropertyImageHtml(visible) {
                return '<div data-image-unavailable="1" class="absolute inset-0 items-center justify-center p-5 text-center" style="display:' + (visible ? 'flex' : 'none') + '">' +
                    '<div class="flex flex-col items-center gap-2 text-moss/70">' +
                        '<i data-lucide="image-off" aria-hidden="true" class="w-7 h-7"></i>' +
                        '<span class="font-heading text-sm sm:text-base font-semibold">' + PROPERTY_IMAGE_UNAVAILABLE + '</span>' +
                    '</div>' +
                '</div>';
            }

            function handlePropertyImgError(imgEl) {
                if (!imgEl) return;
                imgEl.dataset.fallbackApplied = "1";
                imgEl.style.display = "none";
                const fallback = imgEl.closest(".property-image-frame")?.querySelector("[data-image-unavailable]");
                if (fallback) fallback.style.display = "flex";
            }

            function normalizeText(str) {
                return String(str || "")
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .trim();
            }

            function normalizeFinalidade(raw) {
                const n = normalizeText(raw);
                if (n.includes("alug") || n.includes("loca")) return "Alugar";
                return "Comprar";
            }

            function isInactiveStatus(rawStatus) {
                const n = normalizeText(rawStatus);
                return n === "vendido" || n === "alugado" || n === "inativo" || n === "indisponivel";
            }

            function parseNumber(raw) {
                if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
                const str = String(raw || "").trim();
                if (!str) return 0;

                // Formato brasileiro com vírgula decimal (ex: R$ 680.000,00)
                if (str.indexOf(",") !== -1) {
                    const brCleaned = str
                        .replace(/R\$/gi, "")
                        .replace(/\./g, "")
                        .replace(",", ".")
                        .replace(/[^\d.-]/g, "");
                    const brNum = parseFloat(brCleaned);
                    return isNaN(brNum) ? 0 : brNum;
                }

                // Formato com pontos de milhar sem centavos (ex: 680.000)
                if (/^\D*\d{1,3}(\.\d{3})+\D*$/.test(str)) {
                    const thousandsCleaned = str.replace(/\./g, "").replace(/[^\d-]/g, "");
                    const tNum = parseFloat(thousandsCleaned);
                    return isNaN(tNum) ? 0 : tNum;
                }

                const cleaned = str.replace(/[^\d.-]/g, "");
                const num = parseFloat(cleaned);
                return isNaN(num) ? 0 : num;
            }

            function formatCurrency(value, finalidade) {
                const num = Number(value) || 0;
                const formatted = num.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0
                });
                return finalidade === "Alugar" ? formatted + "/mês" : formatted;
            }

            function showToast(msg) {
                const toast = document.getElementById("toast");
                const textEl = document.getElementById("toast-message");
                if (!toast || !textEl) return;
                textEl.textContent = msg;
                toast.classList.remove("hidden");
                clearTimeout(window.__yolandaToastTimer);
                window.__yolandaToastTimer = setTimeout(function () {
                    toast.classList.add("hidden");
                }, 3800);
            }

            function updateSyncStatusUI(state, label) {
                const dot = document.getElementById("sheets-live-dot");
                const text = document.getElementById("sheets-live-text");

                let dotColor = "bg-emerald-500";
                if (state === "loading") dotColor = "bg-amber-500 animate-pulse";
                else if (state === "empty") dotColor = "bg-terracotta";
                else if (state === "error") dotColor = "bg-amber-600";

                if (dot) dot.className = "w-2 h-2 rounded-full " + dotColor;
                if (text) text.textContent = label;
            }

            function renderCatalog(items, unavailable, selectedLocation) {
                properties = items;
                catalogFailed = unavailable;
                populateLocationDropdown();
                const locationFilter = document.getElementById("filter-location");
                if (locationFilter && selectedLocation !== undefined) locationFilter.value = selectedLocation;
                applyFilters();
                catalogLoaded = true;
                syncPropertyModalWithUrl();
            }

            let catalogRequest = 0;
            async function loadCatalog(manualTrigger) {
                const request = ++catalogRequest;
                const syncIcon = document.getElementById("sync-icon");
                if (syncIcon) syncIcon.classList.add("animate-spin");
                updateSyncStatusUI("loading", "Atualizando catálogo...");
                let selectedLocation;
                let timer;
                try {
                    const ctrl = new AbortController();
                    timer = setTimeout(function () { ctrl.abort(); }, 8000);
                    const resp = await fetch("/api/public/properties", { signal: ctrl.signal });
                    clearTimeout(timer);
                    if (!resp.ok) throw new Error("HTTP " + resp.status);
                    const data = await resp.json();
                    if (request !== catalogRequest) return;
                    const items = prepareCatalog(data?.items).map(function (p) {
                        // Não importar ou resolver URLs legadas, mesmo que venham do D1.
                        // Somente a galeria R2 define fotos de anúncios.
                        p.foto_url = getPropertyCoverUrl(p);
                        p.resolved_foto_url = "";
                        return p;
                    });
                    selectedLocation = document.getElementById("filter-location")?.value;
                    renderCatalog(items, false);
                    lastValidCatalog = items;
                    saveCatalogCache(items);
                } catch (err) {
                    if (request !== catalogRequest) return;
                    lastValidCatalog ??= readCatalogCache();
                    renderCatalog(lastValidCatalog ?? [], lastValidCatalog === null, selectedLocation);
                    updateSyncStatusUI("error", "Sem conexão com o catálogo • exibindo última versão salva");
                    if (manualTrigger) showToast("Não foi possível atualizar agora. Tente novamente em instantes.");
                    return;
                } finally {
                    clearTimeout(timer);
                    if (request === catalogRequest && syncIcon) syncIcon.classList.remove("animate-spin");
                }
                const count = lastValidCatalog.length;
                const nowStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                updateSyncStatusUI("connected", "Atualizado • " + count + (count === 1 ? " imóvel (" : " imóveis (") + nowStr + ")");
                if (manualTrigger) showToast(count + (count === 1 ? " imóvel disponível." : " imóveis disponíveis."));
            }

            // Cadastra o contato no CRC (cliente + lead) e devolve { ok, status, error }
            async function sendContactAsync(payload) {
                try {
                    const ctrl = new AbortController();
                    const timer = setTimeout(function () { ctrl.abort(); }, 8000);
                    const r = await fetch("/api/public/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
                    clearTimeout(timer);
                    let d = null; try { d = await r.json(); } catch (e) {}
                    if (r.ok) return { ok: true, recorded: r.status === 201 };
                    return { ok: false, status: r.status, error: (d && d.error) || "Não foi possível registrar o seu contato." };
                } catch (e) {
                    return { ok: false, status: 0, error: "Sem conexão para registrar o seu contato." };
                }
            }
            // A janela do WhatsApp é aberta no clique (senão o navegador bloqueia) e só recebe o link depois do cadastro
            function openBlankWindow() {
                const w = window.open("about:blank", "_blank");
                try { if (w) w.opener = null; } catch (e) {}
                return w;
            }
            function goToWhatsApp(url, w) {
                if (w && !w.closed) w.location.href = url; else window.location.href = url;
            }
            function setBusy(btn, busy) {
                if (!btn) return;
                btn.disabled = busy;
                btn.classList.toggle("opacity-60", busy);
            }

            async function submitInterest(event, codigo) {
                event.preventDefault();
                const prop = properties.find(function (p) { return p.codigo === codigo; });
                if (!prop) return;
                const name = document.getElementById("interest-name").value.trim();
                const phone = document.getElementById("interest-phone").value.trim();
                const digits = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
                if (name.length < 2 || digits.length < 10 || digits.length > 11) {
                    showToast("Informe seu nome e seu WhatsApp com DDD, ex.: (24) 99999-9999.");
                    return;
                }
                const btn = document.getElementById("interest-submit");
                const w = openBlankWindow();
                setBusy(btn, true);
                const res = await sendContactAsync({ kind: "interesse", name: name, phone: phone, property_code: codigo, website: (document.getElementById("interest-website") || {}).value || "" });
                setBusy(btn, false);
                if (!res.ok && res.status === 400) { window.YTIAnalytics?.track('lead_error', prop, 'interest_form'); if (w) w.close(); showToast(res.error); return; }
                if (res.recorded) window.YTIAnalytics?.track('lead_whatsapp', prop, 'interest_form');
                else if (!res.ok) window.YTIAnalytics?.track('lead_error', prop, 'interest_form');
                window.YTIAnalytics?.track('whatsapp_click', prop, 'interest_form');
                goToWhatsApp(getWhatsAppPropertyLink(prop, name), w);
                showToast(res.ok ? "Contato registrado! Abrindo o WhatsApp da Iêda Holanda..." : "Abrindo o WhatsApp (não foi possível registrar o contato agora).");
            }

// ==================== FILTROS & RENDERIZAÇÃO DO PORTFÓLIO ====================
            function populateLocationDropdown() {
                const select = document.getElementById("filter-location");
                if (!select) return;
                const previousVal = select.value;

                // Extrai exclusivamente os bairros/localidades de imóveis ativos e com status 'Disponível'
                const locationsMap = new Map();

                properties.forEach(function (p) {
                    const isAvailable = normalizeText(p.status) === "disponivel";
                    if (!isAvailable) return;

                    const bairro = String(p.bairro || "").trim();
                    if (bairro) {
                        const key = normalizeText(bairro);
                        if (!locationsMap.has(key)) {
                            locationsMap.set(key, bairro);
                        }
                    }
                });

                const sorted = Array.from(locationsMap.values()).sort(function (a, b) {
                    return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
                });

                select.innerHTML = '<option value="Todos">Todas as localidades</option>' +
                    sorted.map(function (loc) {
                        return '<option value="' + esc(loc) + '">' + esc(loc) + '</option>';
                    }).join("");

                if (sorted.indexOf(previousVal) !== -1) {
                    select.value = previousVal;
                } else {
                    select.value = "Todos";
                }
            }

            function getWhatsAppPropertyLink(prop, name) {
                const msg =
                    "Olá Iêda Holanda! " +
                    (name ? "Meu nome é *" + name + "*. " : "") +
                    "Tenho interesse no imóvel *" +
                    prop.codigo + " - " + prop.titulo +
                    "* (" + prop.bairro + ", " + prop.cidade + ") anunciado no site da Yolanda Transações Imobiliárias. Veja o anúncio: " +
                    propertyDeepLink(prop);
                return "https://wa.me/" + BROKER_PHONE + "?text=" + encodeURIComponent(msg);
            }

            function openCardInterestWhatsApp(event, codigo) {
                if (event) { event.preventDefault(); event.stopPropagation(); }
                const prop = properties.find(p => p.codigo === codigo);
                if (!prop) return;
                // Ação síncrona ao clique: nenhum modal ou requisição bloqueia a conversão.
                window.YTIAnalytics?.track('whatsapp_click', prop, 'card');
                window.open(getWhatsAppPropertyLink(prop), '_blank', 'noopener,noreferrer');
            }

            function getSharePropertyWhatsAppLink(prop) {
                const pageUrl = propertyDeepLink(prop);
                const msg =
                    "Olha este imóvel que encontrei na *Yolanda Transações Imobiliárias*:\n\n" +
                    "*" + prop.titulo + "* (Cód.: " + prop.codigo + ")\n" +
                    "• *Finalidade:* " + prop.finalidade + "\n" +
                    "• *Localização:* " + prop.bairro + " - " + prop.cidade + "\n" +
                    "• *Valor:* " + formatCurrency(prop.valor, prop.finalidade) + "\n\n" +
                    "Veja mais detalhes no site: " + pageUrl;

                return "https://api.whatsapp.com/send?text=" + encodeURIComponent(msg);
            }

            function renderPropertyFeatures(prop, modal = false) {
                const features = prop.caracteristicas;
                if (!Array.isArray(features) || !features.length || features.length > 4) return '';
                const columns = modal && features.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-' + features.length;
                const grid = modal ? 'gap-2.5' : 'gap-2 pt-2 border-t border-sand-border';
                const tile = modal ? 'bg-sand p-3 rounded-2xl border border-sand-border' : 'bg-sand/70 py-2 px-1 rounded-xl';
                const valueStyle = modal ? 'font-extrabold text-sm' : 'font-bold text-xs';
                const labelStyle = modal ? 'text-[11px]' : 'text-[10px]';
                return '<div data-property-features class="grid ' + columns + ' ' + grid + ' text-center">' +
                    features.map(({display, label}) => '<div class="' + tile + '">' +
                        '<span class="block font-heading text-moss ' + valueStyle + '">' + esc(display) + '</span>' +
                        '<span class="block text-charcoal/65 ' + labelStyle + '">' + esc(label) + '</span></div>').join('') +
                    '</div>';
            }

 function renderProperties(list) {
                const grid = document.getElementById("properties-grid");
                const counter = document.getElementById("results-counter");
                if (!grid) return;

                // Mantem o modal original 4.5.5 para visitantes na vitrine, sem bloquear SEO.
                // O href continua sendo a pagina SSR, aberta normalmente sem JavaScript ou em nova aba.
                if (typeof grid.addEventListener === 'function' && grid.dataset?.yolandaModalHandlerInstalled !== '1') {
                    if (grid.dataset) grid.dataset.yolandaModalHandlerInstalled = '1';
                    grid.addEventListener('click', function (event) {
                        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                        const target = event.target;
                        const link = target && typeof target.closest === 'function'
                            ? target.closest('a[data-property-modal-code]') : null;
                        if (!link) return;
                        const code = link.getAttribute('data-property-modal-code');
                        if (!properties.some(function (p) { return p.codigo === code; })) return;
                        event.preventDefault();
                        openPropertyModal(code);
                    });
                }

                if (counter) {
                    counter.textContent = "Exibindo " + list.length + (list.length === 1 ? " imóvel" : " imóveis");
                }

                if (list.length === 0) {
                    grid.innerHTML =
                        '<div class="col-span-full bg-white rounded-3xl border border-sand-border p-10 text-center space-y-3">' +
                            '<p class="font-heading font-bold text-moss text-lg">' + (catalogFailed ? "Catálogo temporariamente indisponível" : "Nenhum imóvel encontrado com esses filtros") + '</p>' +
                            '<p class="text-xs sm:text-sm text-charcoal/70">Tente limpar os filtros ou fale diretamente com a Iêda Holanda para opções fora do catálogo.</p>' +
                            '<div class="pt-2">' +
                                '<button type="button" onclick="resetFilters()" class="px-5 py-2.5 rounded-xl bg-moss text-white font-heading font-bold text-xs">Limpar Filtros</button>' +
                            '</div>' +
                        '</div>';
                    return;
                }

                grid.innerHTML = list.map(function (prop) {
                    const isRental = prop.finalidade === "Alugar";
                    const badgeClass = isRental ? "bg-terracotta text-white" : "bg-moss text-white";
                    const destaqueHtml = prop.destaque
                        ? '<span class="px-2.5 py-1 rounded-full bg-white/95 text-moss font-heading font-bold text-[11px] shadow-xs">' + esc(prop.destaque) + '</span>'
                        : "";

                    const resolvedImg = getPropertyCoverUrl(prop);
                    const normalizedRawKey = normalizeImgbbViewerUrl(prop.foto_url) || String(prop.foto_url || "").trim();

                    return (
                        '<article class="bg-white rounded-3xl border border-sand-border shadow-card overflow-hidden flex flex-col justify-between group hover:border-moss/35 transition-all">' +
                            '<div>' +
                                '<div class="property-image-frame relative aspect-[16/10] bg-moss-soft overflow-hidden">' +
                                    (resolvedImg ?
                                        '<img src="' + esc(resolvedImg) + '" ' +
                                             'data-raw-img="' + esc(normalizedRawKey) + '" ' +
                                             responsiveCoverAttributes(prop) + ' ' +
                                             'onerror="handlePropertyImgError(this)" loading="lazy" decoding="async" ' +
                                             'alt="' + esc(prop.titulo) + '" draggable="false" ' +
                                             'class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">'
                                        : '') +
                                    unavailablePropertyImageHtml(!resolvedImg) +
                                    '<div class="absolute top-3 left-3 flex flex-wrap gap-1.5">' +
                                        '<span class="px-3 py-1 rounded-full text-[11px] font-heading font-bold ' + badgeClass + '">' + esc(prop.finalidade) + '</span>' +
                                        destaqueHtml +
                                    '</div>' +
                                    '<span class="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-charcoal/80 text-white font-mono text-[11px] font-bold">' + esc(prop.codigo) + '</span>' +
                                '</div>' +

                                '<div class="p-5 space-y-3">' +
                                    '<div>' +
                                        '<p class="text-xs font-semibold text-terracotta flex items-center gap-1">' +
                                            '<i data-lucide="map-pin" class="w-3.5 h-3.5"></i>' +
                                            '<span>' + esc(prop.bairro) + ' • ' + esc(prop.cidade) + '</span>' +
                                        '</p>' +
                                        '<h3 class="font-heading font-bold text-moss text-base sm:text-lg leading-snug mt-1 line-clamp-2">' + esc(prop.titulo) + '</h3>' +
                                    '</div>' +

                                    '<p class="font-heading font-extrabold text-charcoal text-xl sm:text-2xl">' +
                                        formatCurrency(prop.valor, prop.finalidade) +
                                    '</p>' +

                                    renderPropertyFeatures(prop) +
                                '</div>' +
                            '</div>' +

                            '<div class="px-5 pb-5 pt-1 flex items-center gap-2">' +
                                '<a data-property-modal-code="' + esc(prop.codigo) + '" href="' + esc(propertyDeepLink(prop)) + '" ' +
                                    'class="inline-flex items-center justify-center py-3 px-4 rounded-xl bg-sand hover:bg-moss hover:text-white text-moss font-heading font-bold text-xs text-center whitespace-nowrap transition-colors">' +
                                    'Ver Detalhes' +
                                '</a>' +
                                '<button type="button" onclick="openCardInterestWhatsApp(event, \'' + esc(prop.codigo) + '\')" ' +
                                   'title="Tenho interesse pelo WhatsApp" aria-label="Tenho interesse pelo WhatsApp" ' +
                                   'class="flex-1 py-3 px-3 rounded-xl bg-terracotta hover:bg-terracotta-hover text-white font-heading font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors">' +
                                    '<i data-lucide="message-circle" class="w-4 h-4" aria-hidden="true"></i>' +
                                    '<span>Tenho Interesse</span>' +
                                '</button>' +
                                '<a data-share-code="' + esc(prop.codigo) + '" href="' + esc(getSharePropertyWhatsAppLink(prop)) + '" target="_blank" rel="noopener noreferrer" ' +
                                   'title="Encaminhar anúncio pelo WhatsApp" aria-label="Encaminhar anúncio pelo WhatsApp" ' +
                                   'class="p-3 rounded-xl bg-sand hover:bg-moss-soft text-moss border border-sand-border inline-flex items-center justify-center shrink-0 transition-colors">' +
                                    '<i data-lucide="share-2" class="w-4 h-4"></i>' +
                                '</a>' +
                            '</div>' +
                        '</article>'
                    );
                }).join("");

                safeRefreshIcons();
            }

            function setFinalidadeFilter(fin) {
                activeFinalidade = fin;
                document.querySelectorAll(".fin-pill").forEach(function (btn) {
                    const isSelected = btn.getAttribute("data-fin") === fin;
                    btn.className = isSelected
                        ? "fin-pill px-4 py-2 rounded-xl text-xs sm:text-sm font-heading font-bold bg-moss text-white transition-all"
                        : "fin-pill px-4 py-2 rounded-xl text-xs sm:text-sm font-heading font-semibold bg-sand text-moss hover:bg-moss-soft transition-all";
                });
                applyFilters('property_filter');
            }

            let discoveryTimer;
            let lastDiscovery = '';
            function applyFilters(eventName) {
                const locVal = document.getElementById("filter-location") ? document.getElementById("filter-location").value : "Todos";
                const typeVal = document.getElementById("filter-type") ? document.getElementById("filter-type").value : "Todos";
                const bedsVal = Number(document.getElementById("filter-bedrooms") ? document.getElementById("filter-bedrooms").value : 0);
                const searchVal = normalizeText(document.getElementById("filter-search") ? document.getElementById("filter-search").value : "");

                const filtered = properties.filter(function (p) {
                    const matchFin = activeFinalidade === "Todos" || p.finalidade === activeFinalidade;
                    const matchLoc = locVal === "Todos" ||
                        normalizeText(p.bairro).includes(normalizeText(locVal)) ||
                        normalizeText(p.cidade).includes(normalizeText(locVal));
                    const matchType = typeVal === "Todos" || normalizeText(p.tipo).includes(normalizeText(typeVal));
                    const matchBeds = bedsVal === 0 || Number(p.quartos) >= bedsVal;
                    const matchSearch = !searchVal ||
                        normalizeText(p.codigo).includes(searchVal) ||
                        normalizeText(p.titulo).includes(searchVal) ||
                        normalizeText(p.bairro).includes(searchVal) ||
                        normalizeText(p.cidade).includes(searchVal) ||
                        normalizeText(p.descricao).includes(searchVal);

                    return matchFin && matchLoc && matchType && matchBeds && matchSearch;
                });

                renderProperties(filtered);
                if (eventName === 'property_filter' || eventName === 'property_search') {
                    clearTimeout(discoveryTimer);
                    const snapshot = {
                        purpose: activeFinalidade, type: typeVal,
                        location: locVal === 'Todos' || properties.some(p => String(p.bairro || '').trim() === locVal) ? locVal : null,
                        bedrooms: bedsVal, searchUsed: Boolean(searchVal), count: filtered.length
                    };
                    const signature = JSON.stringify([eventName, snapshot, searchVal]);
                    const emit = () => {
                        if (signature === lastDiscovery) return;
                        lastDiscovery = signature;
                        window.YTIAnalytics?.track(eventName, null, 'filters', snapshot);
                    };
                    if (eventName === 'property_search') discoveryTimer = setTimeout(emit, 700);
                    else emit();
                }
            }

            function resetFilters() {
                activeFinalidade = "Todos";
                const locEl = document.getElementById("filter-location");
                const typeEl = document.getElementById("filter-type");
                const bedsEl = document.getElementById("filter-bedrooms");
                const searchEl = document.getElementById("filter-search");
                if (locEl) locEl.value = "Todos";
                if (typeEl) typeEl.value = "Todos";
                if (bedsEl) bedsEl.value = "0";
                if (searchEl) searchEl.value = "";
                setFinalidadeFilter("Todos");
            }

            // Carrossel do detalhe: lista completa, setas e gesto de deslizar no mobile.
            let activePropertyImages = [];
            let activePropertyImageIndex = 0;
            function movePropertyGallery(step) {
                if (!activePropertyImages.length) return;
                resetPropertyZoom();
                activePropertyImageIndex = (activePropertyImageIndex + step + activePropertyImages.length) % activePropertyImages.length;
                const image = document.getElementById('modal-property-img');
                const counter = document.getElementById('property-gallery-counter');
                if (image) {
                    const url = resolvePropertyImageUrl(activePropertyImages[activePropertyImageIndex]);
                    if (url) {
                        image.dataset.fallbackApplied = '0';
                        image.style.display = '';
                        const fallback = image.closest('.property-image-frame')?.querySelector('[data-image-unavailable]');
                        if (fallback) fallback.style.display = 'none';
                        image.src = url;
                    } else {
                        handlePropertyImgError(image);
                    }
                }
                if (counter) counter.textContent = (activePropertyImageIndex + 1) + ' / ' + activePropertyImages.length;
                prefetchPropertyGallery(activePropertyImages, activePropertyImageIndex);
            }

            // Zoom por duplo clique no desktop ou dois toques no celular.
            // O gesto de arrastar move a área de interesse quando a foto está ampliada.
            let propertyZoomed = false;
            let propertyZoomOrigin = {x: 50, y: 50};
            function resetPropertyZoom() {
                propertyZoomed = false;
                propertyZoomOrigin = {x: 50, y: 50};
                const image = document.getElementById('modal-property-img');
                const area = document.getElementById('property-gallery-swipe');
                if (image) { image.style.transform = ''; image.style.transformOrigin = ''; }
                if (area) area.classList.remove('is-zoomed');
            }
            function togglePropertyZoom(clientX, clientY) {
                const area = document.getElementById('property-gallery-swipe');
                const image = document.getElementById('modal-property-img');
                if (!area || !image) return;
                if (propertyZoomed) { resetPropertyZoom(); return; }
                const r = area.getBoundingClientRect();
                propertyZoomOrigin.x = Math.max(0, Math.min(100, 100 * (clientX - r.left) / r.width));
                propertyZoomOrigin.y = Math.max(0, Math.min(100, 100 * (clientY - r.top) / r.height));
                propertyZoomed = true;
                image.style.transformOrigin = `${propertyZoomOrigin.x}% ${propertyZoomOrigin.y}%`;
                image.style.transform = 'scale(2.2)';
                area.classList.add('is-zoomed');
            }
            function attachPropertyImageGestures(area) {
                let tapAt = 0, tapX = 0, tapY = 0, lastTouch = 0, start = null, drag = null;
                area.addEventListener('dblclick', e => {
                    if (Date.now() - lastTouch < 650 || e.target.closest('button')) return;
                    e.preventDefault(); togglePropertyZoom(e.clientX, e.clientY);
                });
                area.addEventListener('touchstart', e => {
                    if (e.touches.length !== 1 || e.target.closest('button')) { start = null; return; }
                    const touch = e.touches[0]; start = {x:touch.clientX,y:touch.clientY};
                    if (propertyZoomed) drag = {...start, ox:propertyZoomOrigin.x, oy:propertyZoomOrigin.y};
                }, {passive:true});
                area.addEventListener('touchmove', e => {
                    if (!propertyZoomed || !drag || e.touches.length !== 1) return;
                    e.preventDefault();
                    const rect = area.getBoundingClientRect();
                    const touch = e.touches[0];
                    propertyZoomOrigin.x = Math.max(0, Math.min(100, drag.ox - (touch.clientX-drag.x)/rect.width*80));
                    propertyZoomOrigin.y = Math.max(0, Math.min(100, drag.oy - (touch.clientY-drag.y)/rect.height*80));
                    document.getElementById('modal-property-img').style.transformOrigin = `${propertyZoomOrigin.x}% ${propertyZoomOrigin.y}%`;
                }, {passive:false});
                area.addEventListener('touchend', e => {
                    const touch = e.changedTouches[0];
                    if (!touch || !start) return;
                    const distance = Math.hypot(touch.clientX-start.x,touch.clientY-start.y);
                    if (distance < 25) {
                        const now = Date.now();
                        if (now-tapAt < 370 && Math.hypot(touch.clientX-tapX,touch.clientY-tapY) < 45) {
                            e.preventDefault(); lastTouch = now;
                            togglePropertyZoom(touch.clientX,touch.clientY); tapAt = 0;
                        } else {tapAt=now;tapX=touch.clientX;tapY=touch.clientY;}
                    } else if (!propertyZoomed && distance > 45 && activePropertyImages.length > 1) {
                        movePropertyGallery(touch.clientX < start.x ? 1 : -1);
                    }
                    start = null; drag = null;
                }, {passive:false});
                let mouse = null;
                area.addEventListener('pointerdown', e => {
                    if (!propertyZoomed || e.pointerType !== 'mouse' || e.target.closest('button')) return;
                    mouse = {x:e.clientX,y:e.clientY,ox:propertyZoomOrigin.x,oy:propertyZoomOrigin.y};
                });
                area.addEventListener('pointermove', e => {
                    if (!mouse || !propertyZoomed) return;
                    const rect=area.getBoundingClientRect();
                    propertyZoomOrigin.x = Math.max(0,Math.min(100,mouse.ox-(e.clientX-mouse.x)/rect.width*80));
                    propertyZoomOrigin.y = Math.max(0,Math.min(100,mouse.oy-(e.clientY-mouse.y)/rect.height*80));
                    document.getElementById('modal-property-img').style.transformOrigin = `${propertyZoomOrigin.x}% ${propertyZoomOrigin.y}%`;
                });
                ['pointerup','pointercancel','pointerleave'].forEach(name=>area.addEventListener(name,()=>{mouse=null;}));
            }

            // ==================== MODAL DETALHES DO IMÓVEL ====================
            function openPropertyModal(codigo, fromUrl = false) {
                const prop = properties.find(function (p) { return p.codigo === codigo; });
                const modal = document.getElementById("property-modal");
                const content = document.getElementById("property-modal-content");
                if (!prop || !modal || !content) return;

                window.YTIAnalytics?.track('property_view', prop, 'modal');
                const isRental = prop.finalidade === "Alugar";
                const badgeClass = isRental ? "bg-terracotta text-white" : "bg-moss text-white";
                const resolvedImg = getPropertyCoverUrl(prop);
                const normalizedRawKey = normalizeImgbbViewerUrl(prop.foto_url) || String(prop.foto_url || "").trim();
                activePropertyImages = Array.isArray(prop.images) && prop.images.length
                    ? prop.images.map(i => i.url).filter(Boolean) : (resolvedImg ? [resolvedImg] : []);
                activePropertyImageIndex = 0;
                prefetchPropertyGallery(activePropertyImages);
                if (!fromUrl && typeof location !== 'undefined' && typeof history !== 'undefined') {
                    const newUrl = propertyDeepLink(prop);
                    if (location.href !== newUrl) {
                        history.pushState({ yolandaProperty: codigo }, '', newUrl);
                        propertyHistoryEntry = true;
                    }
                }

                content.innerHTML =
                    '<div id="property-gallery-swipe" class="property-image-frame relative aspect-[16/9] bg-moss-soft touch-pan-y overflow-hidden" aria-label="' + (resolvedImg ? 'Dê dois cliques ou dois toques para ampliar a foto' : PROPERTY_IMAGE_UNAVAILABLE) + '">' +
                        (resolvedImg ?
                            '<img id="modal-property-img" ' +
                                 'src="' + esc(resolvedImg) + '" ' +
                                 'data-raw-img="' + esc(normalizedRawKey) + '" ' +
                                 'onerror="handlePropertyImgError(this)" decoding="async" fetchpriority="high" ' +
                                 'alt="' + esc(prop.titulo) + '" ' +
                                 'class="w-full h-full object-cover" draggable="false">'
                            : '') +
                        unavailablePropertyImageHtml(!resolvedImg) +
                        (activePropertyImages.length > 1 ?
                            '<button type="button" onclick="movePropertyGallery(-1)" aria-label="Foto anterior" class="absolute top-1/2 -translate-y-1/2 left-3 p-2 rounded-full bg-white/90 text-moss shadow-md hover:bg-sand">' +
                                '<i data-lucide="chevron-left" class="w-5 h-5"></i></button>' +
                            '<button type="button" onclick="movePropertyGallery(1)" aria-label="Próxima foto" class="absolute top-1/2 -translate-y-1/2 right-3 p-2 rounded-full bg-white/90 text-moss shadow-md hover:bg-sand">' +
                                '<i data-lucide="chevron-right" class="w-5 h-5"></i></button>' +
                            '<span id="property-gallery-counter" aria-live="polite" class="absolute bottom-4 right-4 rounded-lg bg-charcoal/80 text-white text-xs font-bold px-2.5 py-1">1 / ' + activePropertyImages.length + '</span>'
                        : '') +
                        '<button type="button" onclick="closePropertyModal()" aria-label="Fechar detalhes" ' +
                                'class="absolute top-4 right-4 p-2.5 rounded-full bg-white/95 text-charcoal hover:bg-terracotta hover:text-white shadow-md transition-colors">' +
                            '<i data-lucide="x" class="w-5 h-5"></i>' +
                        '</button>' +
                        '<div class="absolute bottom-4 left-4 flex items-center gap-2">' +
                            '<span class="px-3 py-1 rounded-full text-xs font-heading font-bold ' + badgeClass + '">' + esc(prop.finalidade) + '</span>' +
                            '<span class="px-3 py-1 rounded-full bg-charcoal/85 text-white font-mono text-xs font-bold">' + esc(prop.codigo) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="p-5 sm:p-7 space-y-5">' +
                        '<div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">' +
                            '<div>' +
                                '<p class="text-xs font-bold text-terracotta">' + esc(prop.tipo) + ' • ' + esc(prop.bairro) + ', ' + esc(prop.cidade) + '</p>' +
                                '<h3 class="font-heading font-extrabold text-moss text-xl sm:text-2xl mt-1">' + esc(prop.titulo) + '</h3>' +
                                '<p class="font-heading font-extrabold text-charcoal text-2xl sm:text-3xl mt-2">' + formatCurrency(prop.valor, prop.finalidade) + '</p>' +
                            '</div>' +
                            '<a data-share-code="' + esc(prop.codigo) + '" href="' + esc(getSharePropertyWhatsAppLink(prop)) + '" target="_blank" rel="noopener noreferrer" ' +
                               'title="Encaminhar este anúncio para um contato no WhatsApp" aria-label="Encaminhar anúncio no WhatsApp" ' +
                               'class="self-start shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sand hover:bg-moss-soft text-moss border border-sand-border font-heading font-bold text-xs transition-colors">' +
                                '<i data-lucide="share-2" class="w-3.5 h-3.5 text-terracotta"></i>' +
                                '' +
                            '</a>' +
                        '</div>' +

                        renderPropertyFeatures(prop, true) +

                        '<div class="space-y-1.5">' +
                            '<h4 class="font-heading font-bold text-moss text-sm">Descrição do Imóvel</h4>' +
                            '<div class="property-description text-xs sm:text-sm text-charcoal/80 leading-relaxed">' + YolandaDescription.toHtml(prop.descricao, {legacyHtml:true}) + '</div>' +
                        '</div>' +

                        '<form id="interest-form" onsubmit="submitInterest(event, \'' + prop.codigo + '\')" class="space-y-2">' +
                            '<h4 class="font-heading font-bold text-moss text-sm">Quero falar sobre este imóvel</h4>' +
                            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                                '<input type="text" id="interest-name" required minlength="2" maxlength="120" autocomplete="name" placeholder="Seu nome *" class="w-full px-4 py-3 rounded-xl bg-sand/70 border border-sand-border text-sm focus:outline-none focus:ring-2 focus:ring-moss/30">' +
                                '<input type="tel" id="interest-phone" required autocomplete="tel" placeholder="Seu WhatsApp com DDD *" class="w-full px-4 py-3 rounded-xl bg-sand/70 border border-sand-border text-sm focus:outline-none focus:ring-2 focus:ring-moss/30">' +
                            '</div>' +
                            '<input type="text" id="interest-website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hidden">' +
                            '<p class="text-[11px] text-charcoal/60">Seu contato fica registrado para a Iêda retornar, e o WhatsApp abre em seguida.</p>' +
                        '</form>' +

                        '<div class="pt-4 border-t border-sand-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-sand p-4 rounded-2xl">' +
                            '<div class="flex items-center gap-3">' +
                                '<img src="' + esc(BROKER_AVATAR) + '\" ' +
                                     'onerror="this.onerror=null;this.src=\'https://placehold.co/200x200/2C4A3E/F5F2EB?text=IH\';" ' +
                                     'alt="Iêda Holanda" ' +
                                     'class="w-12 h-12 aspect-square rounded-full object-cover object-top border-2 border-terracotta shrink-0">' +
                                '<div>' +
                                    '<p class="font-heading font-bold text-moss text-sm">Iêda Holanda</p>' +
                                    '<p class="text-xs text-charcoal/70">CRECI-RJ 112406 • (24) 99904-0775</p>' +
                                '</div>' +
                            '</div>' +

                            '<button type="submit" form="interest-form" id="interest-submit" title="Enviar e chamar no WhatsApp" aria-label="Enviar e chamar no WhatsApp" ' +
                               'class="py-3.5 px-6 rounded-xl bg-whatsapp hover:brightness-105 text-white font-heading font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all">' +
                                '<i data-lucide="message-circle" class="w-5 h-5" aria-hidden="true"></i>' +
                                '<span>Enviar e chamar no WhatsApp</span>' +
                            '</button>' +
                        '</div>' +
                    '</div>';

                modal.classList.remove("hidden");
                document.body.style.overflow = "hidden";

                const swipeArea = document.getElementById('property-gallery-swipe');
                if (swipeArea && activePropertyImages.length) attachPropertyImageGestures(swipeArea);

                safeRefreshIcons();
            }

            function closePropertyModal(fromHistory = false) {
                const modal = document.getElementById("property-modal");
                if (modal) modal.classList.add("hidden");
                document.body.style.overflow = "";
                resetPropertyZoom();
                if (!fromHistory && typeof history !== 'undefined' && (propertyHistoryEntry || getLinkedPropertyCode())) {
                    if (propertyHistoryEntry) {
                        propertyHistoryEntry = false;
                        history.back();
                    } else {
                        const clean = new URL(location.href);
                        clean.searchParams.delete('imovel');
                        clean.searchParams.delete('interesse');
                        history.replaceState(history.state, '', clean);
                    }
                }
            }

            // ==================== ÁREA DA CORRETORA: agora em /app (Cloudflare Access) ====================
            async function handleOwnerSubmit(event) {
                event.preventDefault();
                const form = event.target;
                const btn = form.querySelector('button[type="submit"]');
                const name = document.getElementById("owner-name").value.trim();
                const phone = document.getElementById("owner-phone").value.trim();
                const purpose = document.getElementById("owner-purpose").value;
                const typeLoc = document.getElementById("owner-type").value.trim();
                const notes = document.getElementById("owner-notes").value.trim();

                let msg = "Olá Iêda Holanda! Gostaria de anunciar um imóvel com a Yolanda Transações Imobiliárias.\n\n";
                msg += "• *Proprietário:* " + name + "\n";
                msg += "• *Contato:* " + phone + "\n";
                msg += "• *Finalidade:* " + purpose + "\n";
                msg += "• *Imóvel / Local:* " + typeLoc;
                if (notes) msg += "\n• *Detalhes:* " + notes;

                const w = openBlankWindow();
                setBusy(btn, true);
                const res = await sendContactAsync({ kind: "proprietario", name: name, phone: phone, purpose: purpose, what: typeLoc, message: notes, website: (document.getElementById("owner-website") || {}).value || "" });
                setBusy(btn, false);
                if (!res.ok && res.status === 400) { window.YTIAnalytics?.track('lead_error', null, 'owner_form'); if (w) w.close(); showToast(res.error); return; }
                if (res.recorded) window.YTIAnalytics?.track('owner_lead', null, 'owner_form');
                else if (!res.ok) window.YTIAnalytics?.track('lead_error', null, 'owner_form');
                window.YTIAnalytics?.track('whatsapp_click', null, 'owner_form');
                goToWhatsApp("https://wa.me/" + BROKER_PHONE + "?text=" + encodeURIComponent(msg), w);
                form.reset();
                showToast(res.ok ? "Cadastro recebido! Abrindo o WhatsApp da Iêda Holanda..." : "Abrindo o WhatsApp (não foi possível registrar o cadastro agora).");
            }

            function toggleMobileMenu() {
                const menu = document.getElementById("mobile-menu");
                if (menu) menu.classList.toggle("hidden");
            }

            // Protecao de uso casual das imagens publicas da vitrine (nao protege capturas
            // de tela nem requisicoes de rede). Ouvintes delegados cobrem fotos de anuncios,
            // logos e imagens institucionais sem impedir o duplo clique, swipe ou zoom.
            let propertyPhotoProtectionInstalled = false;
            function installPropertyPhotoProtection() {
                if (propertyPhotoProtectionInstalled) return;
                propertyPhotoProtectionInstalled = true;
                document.addEventListener('contextmenu', function (event) {
                    if (event.target && typeof event.target.closest === 'function' &&
                        event.target.closest('img, .property-image-frame')) {
                        event.preventDefault();
                    }
                }, true);
                document.addEventListener('dragstart', function (event) {
                    if (event.target && typeof event.target.closest === 'function' &&
                        event.target.closest('img')) {
                        event.preventDefault();
                    }
                }, true);
                document.addEventListener('selectstart', function (event) {
                    if (event.target && typeof event.target.closest === 'function' &&
                        event.target.closest('img')) {
                        event.preventDefault();
                    }
                }, true);
            }

            // Expor funções no escopo global para atributos onclick/onsubmit
            window.resolvePropertyImageUrl = resolvePropertyImageUrl;
            window.handlePropertyImgError = handlePropertyImgError;
            window.loadCatalog = loadCatalog;
            window.submitInterest = submitInterest;
            document.addEventListener('click', function(e) {
                const link = e.target?.closest?.('[data-share-code]');
                if (link) window.YTIAnalytics?.track('property_share', properties.find(p => p.codigo === link.dataset.shareCode), link.closest('#property-modal') ? 'modal' : 'card');
            });
            window.openCardInterestWhatsApp = openCardInterestWhatsApp;
            window.setFinalidadeFilter = setFinalidadeFilter;
            window.applyFilters = applyFilters;
            window.resetFilters = resetFilters;
            window.openPropertyModal = openPropertyModal;
            window.movePropertyGallery = movePropertyGallery;
            window.closePropertyModal = closePropertyModal;
            window.handleOwnerSubmit = handleOwnerSubmit;
            window.toggleMobileMenu = toggleMobileMenu;

            // Inicialização Protegida com DOMContentLoaded + try/catch
            function initApp() {
                try {
                    installPropertyPhotoProtection();
                    const yearEl = document.getElementById("current-year");
                    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

                    populateLocationDropdown();
                    renderProperties(properties);
                    safeRefreshIcons();

                    // Carrega o catálogo do banco ao abrir a página
                    window.addEventListener('popstate', function () {
                        propertyHistoryEntry = false;
                        syncPropertyModalWithUrl();
                    });
                    loadCatalog(false);
                } catch (err) {
                    /* mantém a página sem imóveis de exemplo */
                }
            }

            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", initApp);
            } else {
                initApp();
            }
        })();
