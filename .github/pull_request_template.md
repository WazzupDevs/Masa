## Özet

## Kontrol listesi

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` ve `pnpm format:check` temiz; `supabase/`'e dokunduysa `pnpm test:integration` da.
- [ ] Native değişiklik (native bağımlılık eklendi ya da güncellendi, config plugin, `app.json`/`app.config.ts`'te native bir alan) **varsa** `app.json` → `version` artırıldı ve "Yayın"da **yeni build** yazıyor. **Yoksa** `version` aynı ve "Yayın"da **OTA** yazıyor. (`runtimeVersion` = `version`; artırmayı unutmak eski APK'ları çökertir. CLAUDE.md → "Neyi ne zaman yayınlamalı".)
- [ ] Migration ya da Edge Function değiştiyse "Yayın" bölümü sunucuyu istemciden önce yayınlıyor.

## Yayın
