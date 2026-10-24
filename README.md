# Meu Player

Player de IPTV proprio para os seus clientes (ate ~200 TVs). O servidor so liga "MAC da TV -> credenciais da lista"; o video vai direto do seu provedor para a TV.

```
meu-player/
├── backend/   FastAPI + SQLite: ativacao por MAC + painel admin
└── tv-app/    React + Vite: app para Samsung (Tizen) e LG (webOS)
```

## 1. Backend

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export ADMIN_PASSWORD='uma-senha-forte' SECRET_KEY='texto-aleatorio-longo'
uvicorn main:app --host 0.0.0.0 --port 8000
```

- Painel: `http://SEU-SERVIDOR:8000/admin`
- Em producao coloque HTTPS na frente (Caddy ou Cloudflare). O app da TV chama a API pela internet.
- `TRIAL_DAYS=3` (opcional) ativa um teste automatico para MACs novos. Padrao 0: voce ativa manualmente.
- Faca backup periodico do arquivo `player.db`.

Fluxo: cliente abre o app -> aparece o MAC na tela -> voce cadastra o MAC no painel, ativa e adiciona a lista (Xtream ou M3U) -> o cliente aperta "Atualizar".

## 2. App de TV

1. Edite `tv-app/src/config.js` e troque `API_BASE` pelo dominio do seu backend.
2. Coloque um `icon.png` (115x115 ou maior) em `tv-app/public/`.
3. `npm install && npm run build` (gera `dist/`).
4. Teste no PC: `npm run dev` e abra no navegador (setas + Enter; Backspace = Voltar).

### Samsung (Tizen)
Siga o fluxo de Developer Mode + Tizen Studio (certificado Samsung) e empacote a pasta `dist/` como .wgt. O `config.xml` ja esta em `public/` e vai para o `dist/`.

### LG (webOS)
`ares-package ./dist` e `ares-install` com o Developer Mode ativo. O `appinfo.json` ja esta em `public/`.

## Pendencias conhecidas
- Testar em TV real: se a tela ficar preta por causa de `type="module"` em `file://`, me avise que ajusto o build para formato classico.
- Samsung: formatos como MKV/AC3 podem exigir a API nativa `webapis.avplay` (ainda nao implementada).
- Roku: projeto separado (BrightScript), ainda nao criado.
- Ainda nao tem: EPG, favoritos, busca global e retomar de onde parou.
