# Risco — aplicativo Android

App para o responsável acompanhar reservas e controlar os serviços publicados no site. Cada instalação é vinculada ao estabelecimento por um código de uso único. O app usa a API compartilhada; não mantém uma agenda independente.

## Integração com a plataforma

A API central está sendo implementada no repositório [sistema-agendamento](https://github.com/restoffkaua08-afk/sistema-agendamento). O app espera estes contratos:

- `POST /v1/mobile/pair` — trocar código de uso único por sessão.
- `GET /v1/owner/:slug/appointments?month=YYYY-MM` — listar a agenda mensal.
- `GET /v1/owner/:slug/services` — consultar serviços.
- `PATCH /v1/owner/:slug/appointments/:id` — atualizar o estado de uma reserva.
- `PUT /v1/owner/:slug/services/:id` — publicar/pausar um serviço.
- `POST /v1/owner/:slug/mobile-pairings` — emitir um código para outro aparelho.

**Estado atual:** estes endpoints de gestão/pareamento ainda não estão implementados na API central. O fluxo público de catálogo e agendamento está sendo ligado primeiro. Por isso, não considere a conexão real do aplicativo pronta até que os endpoints acima, autenticação e isolamento de tenant estejam implementados e testados.

## Publicar a demonstração no Netlify

Este repositório usa `npm run build` e publica `www`. Configure `MOBILE_API_URL` nas variáveis do Netlify quando a API HTTPS estiver implantada. Até lá, a interface abre, mas não conecta a um estabelecimento.

O botão **Experimentar demonstração grátis** permite explorar todas as abas sem código, cadastro ou API. A demonstração gera horários, clientes e serviços fictícios, permite simular alterações de reservas e serviços e apresenta um exemplo de código de conexão. Não envia mensagens, não altera estabelecimentos reais e não salva sessões ou dados: ao sair ou recarregar a página, a simulação é descartada.

## Gerar APK nativo

```powershell
npm install
$env:MOBILE_API_URL = "https://endereco-da-api"
npm test
npm run android:build
```

Antes de sincronizar ou compilar, o projeto valida a API HTTPS, o endpoint `/health` (incluindo a configuração de persistência) e o CORS do pareamento para a origem Android `https://localhost`. A API deve permitir essa origem, `POST`, `Authorization` e `Content-Type`; sem configuração funcional, a compilação para com uma mensagem clara. Essa verificação não substitui testar um pareamento real com o código de cada estabelecimento.

O APK de teste fica em `android/app/build/outputs/apk/debug/app-debug.apk`. Para distribuição, configure a assinatura de lançamento no Android Studio. Um conversor de site para APK gera um WebView e não inclui automaticamente os plugins nativos de sessão segura e WhatsApp deste app.

O app Risco usa Android Keystore para guardar a sessão e abre uma mensagem pronta no WhatsApp após confirmar/cancelar; a loja revisa e envia manualmente. Push com o app fechado ainda não está configurado. O fluxo completo de pareamento será documentado quando os endpoints estiverem implementados. O identificador Android existente foi preservado para não quebrar instalações anteriores.
