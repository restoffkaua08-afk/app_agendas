# Risco — aplicativo Android

App universal para o responsável acompanhar reservas e controlar os serviços publicados no site. Cada instalação é vinculada ao estabelecimento por um código de uso único. O app exige a API compartilhada para conectar e carregar dados; sem `MOBILE_API_URL`, a tela de conexão é apenas uma demonstração visual.

## Publicar a demonstração no Netlify

Este repositório usa `npm run build` e publica `www`. Configure `MOBILE_API_URL` nas variáveis do Netlify quando a API HTTPS estiver implantada. Até lá, a interface abre, mas não conecta a um estabelecimento.

## Gerar APK nativo

```powershell
npm install
$env:MOBILE_API_URL = "https://endereco-da-api"
npm test
npm run android:build
```

Antes de sincronizar ou compilar, o projeto valida a API HTTPS, o endpoint `/health` (incluindo a configuração de persistência) e o CORS do pareamento para a origem Android `https://localhost`. A API deve permitir essa origem, `POST`, `Authorization` e `Content-Type`; sem configuração funcional, a compilação para com uma mensagem clara. Essa verificação não substitui testar um pareamento real com o código de cada estabelecimento.

O APK de teste fica em `android/app/build/outputs/apk/debug/app-debug.apk`. Para distribuição, configure a assinatura de lançamento no Android Studio. Um conversor de site para APK gera um WebView e não inclui automaticamente os plugins nativos de sessão segura e WhatsApp deste app.

O app Risco usa Android Keystore para guardar a sessão e abre uma mensagem pronta no WhatsApp após confirmar/cancelar; a loja revisa e envia manualmente. Push com o app fechado ainda não está configurado. No monorepo, o fluxo completo de pareamento está em `docs/MOBILE-PAIRING.md`. O identificador Android existente foi preservado para não quebrar instalações anteriores.
