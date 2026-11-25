# Correção de upload - pacote para branch dev

Este pacote **não contém versões antigas dos arquivos do projeto**. O script aplica modificações pontuais aos arquivos existentes na branch dev atualizada e aborta antes de qualquer escrita caso o código-base esperado tenha mudado.

## Aplicação no VS Code (PowerShell)

1. `git switch dev`
2. `git pull --ff-only origin dev`
3. Copie `aplicar_hotfix.py` para a raiz do repositório.
4. `py aplicar_hotfix.py --check`
5. `py aplicar_hotfix.py`
6. `node --check public/js/crm-properties.js`
7. `node --check 'functions/api/media/[[path]].js'`
8. `npm test`
9. `git diff --check`
10. Revise `git diff`, teste upload de JPEG, PNG, WebP, HEIC no Safari iPhone, defina capa, remova foto e confira R2/D1 Preview.
11. Após aprovação: `git add public/js/crm-properties.js public/app/index.html 'functions/api/media/[[path]].js'` e commit/push pelo fluxo habitual da branch dev.

## Importante

- Não modifica nenhum banco nem requer migration.
- A seleção HEIC está habilitada, mas sua decodificação depende do navegador. Quando não houver suporte, aparece mensagem clara. Um conversor HEIC universal exige biblioteca ou serviço de conversão adicional.
- O preview de arquivos HEIC também depende do navegador.
- O script é para aplicação **uma vez**; a segunda execução será bloqueada pelo validador.
- Verifique possíveis mudanças concorrentes no repositório antes de aplicar.
