// Yolanda CRM 4.5.1 — máscaras não intrusivas de telefone e valor inteiro.
// Não cria campos adicionais e não altera contratos das APIs.
(function () {
    'use strict';
    const phoneIds = new Set(['lead-phone', 'crc-phone', 'interest-phone', 'owner-phone']);
    const moneyIds = new Set(['lead-value']);
    const digitsOnly = value => String(value ?? '').replace(/\D/g, '');
    function formatPhone(value) {
        let digits = digitsOnly(value);
        if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
        digits = digits.slice(0, 11);
        if (!digits.length) return '';
        if (digits.length <= 2) return '(' + digits;
        return '(' + digits.slice(0, 2) + ') ' + digits.slice(2);
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
    // Ao apagar uma máscara literal no limite do DDD/separador, apaga o dígito anterior.
    document.addEventListener('keydown', function (event) {
        const input = event.target;
        if (event.key !== 'Backspace' || !input || !phoneIds.has(input.id) || input.selectionStart !== input.selectionEnd) return;
        const position = input.selectionStart;
        if (!position || /\d/.test(input.value[position - 1])) return;
        let digitPos = position - 1;
        while (digitPos >= 0 && !/\d/.test(input.value[digitPos])) digitPos--;
        if (digitPos < 0) return;
        event.preventDefault();
        const raw = input.value.slice(0, digitPos) + input.value.slice(digitPos + 1);
        input.value = raw;
        input.setSelectionRange(digitPos, digitPos);
        applyMask(input);
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    window.YolandaMasks = { digitsOnly, formatPhone, formatMoney, applyMask };
    // Também formata o valor preenchido programaticamente no modal de edição.
    document.addEventListener('focusin', function (event) { applyMask(event.target); });
})();
