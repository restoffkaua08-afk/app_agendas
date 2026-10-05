# Agenda — aplicativo Android

App universal para o responsável acompanhar reservas e controlar os serviços publicados no site. Cada instalação é vinculada ao estabelecimento por um código de uso único. O app exige a API compartilhada para conectar e carregar dados; sem `MOBILE_API_URL`, a tela de conexão é apenas uma demonstração visual.

## Publicar a demonstração no Netlify

Este repositório usa `npm run build` e publica `www`. Configure `MOBILE_API_URL` nas variáveis do Netlify quando a API HTTPS estiver implantada. Até lá, a interface abre, mas não conecta a um estabelecimento.

## Gerar APK nativo

```powershell
npm install
$env:MOBILE_API_URL = "https://endereco-da-api"
npm run cap:sync
Set-Location android
.\gradlew.bat assembleDebug
```

O APK de teste fica em `android/app/build/outputs/apk/debug/app-debug.apk`. Para distribuição, configure a assinatura de lançamento no Android Studio. Um conversor de site para APK gera um WebView e não inclui automaticamente os plugins nativos de sessão segura e WhatsApp deste app.

O app usa Android Keystore para guardar a sessão e abre uma mensagem pronta no WhatsApp após confirmar/cancelar; a loja revisa e envia manualmente. Push com o app fechado ainda não está configurado. No monorepo, o fluxo completo de pareamento está em `docs/MOBILE-PAIRING.md`.
