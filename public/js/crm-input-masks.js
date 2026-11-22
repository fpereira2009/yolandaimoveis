// Yolanda CRM 4.5.3 — máscaras brasileiras de telefone e valores inteiros (incluindo imóveis).
// Não cria campos adicionais e não altera contratos das APIs.
(function () {
    'use strict';
    const phoneIds = new Set(['lead-phone', 'crc-phone', 'interest-phone', 'owner-phone']);
    const moneyIds = new Set(['lead-value', 'prop-price']);
    const digitsOnly = value => String(value ?? '').replace(/\D/g, '');
    function formatPhone(value) {
        let digits = digitsOnly(value);
        if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
        digits = digits.slice(0, 11);
        if (!digits.length) return '';
        if (digits.length <= 2) return '(' + digits;
        const subscriber = digits.slice(2);
        // Telefones fixos usam 4+4; celulares completos usam 5+4.
        // Durante a digitação o hífen muda de posição quando chega o nono dígito.
        const prefixLength = subscriber.length > 8 ? 5 : 4;
        const formattedSubscriber = subscriber.length > prefixLength
            ? subscriber.slice(0, prefixLength) + '-' + subscriber.slice(prefixLength)
            : subscriber;
        return '(' + digits.slice(0, 2) + ') ' + formattedSubscriber;
    }
    function formatMoney(value) {
        const digits = digitsOnly(value).replace(/^0+(?=\d)/, '').slice(0, 10);
        return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    function applyMask(input) {
        if (!input || (!phoneIds.has(input.id) && !moneyIds.has(input.id))) return;
        const before = input.value;
        const pos = input.selectionStart ?? before.length;
        const digitOffset = digitsOnly(before.slice(0, pos)).length;
        const after = phoneIds.has(input.id) ? formatPhone(before) : formatMoney(before);
        input.value = after;
        if (document.activeElement === input && typeof input.setSelectionRange === 'function') {
            let at = 0, found = 0;
            while (at < after.length && found < digitOffset) {
                if (/\d/.test(after[at])) found++;
                at++;
            }
            if (digitOffset >= digitsOnly(after).length) at = after.length;
            input.setSelectionRange(at, at);
        }
    }
    document.addEventListener('input', function (event) { applyMask(event.target); });
    // Backspace/Delete sobre separadores devem apagar um DÍGITO, nunca travar a edição.
    document.addEventListener('keydown', function (event) {
        const input = event.target;
        if (!input || (!phoneIds.has(input.id) && !moneyIds.has(input.id)) ||
            !['Backspace', 'Delete'].includes(event.key) ||
            input.selectionStart !== input.selectionEnd) return;
        const position = input.selectionStart;
        const backward = event.key === 'Backspace';
        const adjacentIndex = backward ? position - 1 : position;
        if (adjacentIndex < 0 || adjacentIndex >= input.value.length || /\d/.test(input.value[adjacentIndex])) return;
        let digitPos = adjacentIndex;
        const step = backward ? -1 : 1;
        while (digitPos >= 0 && digitPos < input.value.length && !/\d/.test(input.value[digitPos])) digitPos += step;
        if (digitPos < 0 || digitPos >= input.value.length) return;
        event.preventDefault();
        const raw = input.value.slice(0, digitPos) + input.value.slice(digitPos + 1);
        input.value = raw;
        // Preserva a posição lógica (quantidade de dígitos antes do cursor).
        input.setSelectionRange(backward ? digitPos : position, backward ? digitPos : position);
        applyMask(input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    window.YolandaMasks = { digitsOnly, formatPhone, formatMoney, applyMask };
    // Também formata o valor preenchido programaticamente no modal de edição.
    document.addEventListener('focusin', function (event) { applyMask(event.target); });
})();
