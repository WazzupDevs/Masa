# CLAUDE.md

## Proje
Mekan içi sosyal oyun uygulaması (çalışma adı: Masa). Aynı mekandaki masalar konsept üzerine odalar kurar, oyun oynar ve sohbet eder. İki taraf da isterse oda sonunda fiziksel olarak tanışırlar.

Tüm ürün kararları, kapsam ve kilometre taşları `MVP_SPEC.md` içinde. Spec'te olmayan bir özelliği ekleme. Belirsizlikte varsayım yapma, sor.

## Stack
- `apps/mobile`: Expo (expo-router, development build), TypeScript strict, @supabase/supabase-js, TanStack Query, Zustand, NativeWind, expo-location, expo-notifications, posthog-react-native
- `supabase/`: Postgres + PostGIS + RLS, Realtime, Edge Functions (Deno), pg_cron
- Monorepo, paket yöneticisi pnpm

## Komutlar
M0'da bu komutları gerçekten çalışır hale getir ve bu bölümü güncelle.
- `pnpm install`
- `pnpm --filter mobile start`
- `supabase start` / `supabase db reset` (migration + seed)
- `supabase functions serve`
- `pnpm typecheck` / `pnpm lint` / `pnpm test`

## Değişmez kurallar
1. İstemci hiçbir tabloya doğrudan yazmaz. Tüm yazmalar Edge Function üzerinden yapılır. İstemci okumaları RLS ile sınırlıdır.
2. Her tabloda RLS açıktır. Yeni tablo, politikalarıyla aynı migration'da gelir.
3. Oyun sunucu otoriterdir: tur süresi (`ends_at`), ipucu doğrulama, tahmin kontrolü ve skor sunucuda hesaplanır.
4. Anonimlik: diğer masalara yalnızca masa takma adı, kişi sayısı ve konsept gider. Kullanıcı takma adı, profil bilgisi ve koordinat asla gitmez.
5. Katılma isteğinde red ve zaman aşımı, istek sahibine birebir aynı görünür (`unavailable`). API yanıtı ve okunabilir satırlar dahil.
6. Konum yalnızca check-in anında, uygulama açıkken alınır. Koordinat saklanmaz, sadece seçilen `venue_id` saklanır.
7. Metin eşleştirme ve küfür filtresi yalnızca `supabase/functions/_shared/trText.ts` ve `profanity.ts` üzerinden yapılır. Bu dosyalar bağımlılıksız saf TypeScript'tir, mobil uygulama ve Edge Function aynı dosyayı kullanır. Değişiklikte testler de güncellenir.
8. Service role anahtarı mobil koda asla girmez.

## Kod kuralları
- Kod, tablo ve değişken adları İngilizce. Kullanıcıya görünen metinler Türkçe ve `apps/mobile/src/i18n/tr.ts` içinde. Bileşenlerde sabit metin yok.
- `any` yok. Veritabanı tipleri `supabase gen types` ile üretilir.
- Edge Function başına tek endpoint, `action` alanıyla yönlendirme, zod ile girdi doğrulama, tek tip hata formatı: `{ error: { code, message } }`.
- İçerik (kartlar, mekanlar, küfür listesi) `content/` altında JSON olarak durur ve seed script'iyle yüklenir. Koda gömülmez.
- Yeni bağımlılık eklemeden önce gerekçesini belirt.

## Çalışma şekli
- Kilometre taşlarıyla ilerle (`MVP_SPEC.md` §13). Bir taşın kabul kriterleri karşılanmadan sonrakine geçme.
- Her taşın sonunda: typecheck, lint ve testler temiz olmalı. Kısa bir özet yaz. Spec'ten sapma olduysa spec'i güncelle ve bunu açıkça belirt.
- `trText.ts` için önce testler, sonra implementasyon.
