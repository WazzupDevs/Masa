# CLAUDE.md

## Proje
Mekan içi sosyal oyun uygulaması (çalışma adı: Masa). Aynı mekandaki masalar konsept üzerine odalar kurar, oyun oynar ve sohbet eder. İki taraf da isterse oda sonunda fiziksel olarak tanışırlar.

Tüm ürün kararları, kapsam ve kilometre taşları `MVP_SPEC.md` içinde. Spec'te olmayan bir özelliği ekleme. Belirsizlikte varsayım yapma, sor.

## Stack
- `apps/mobile`: Expo (expo-router, development build), TypeScript strict, @supabase/supabase-js, TanStack Query, Zustand, NativeWind, expo-location, expo-notifications, posthog-react-native
- `supabase/`: Postgres + PostGIS + RLS, Realtime, Edge Functions (Deno), pg_cron
- Monorepo, paket yöneticisi pnpm

## Komutlar
Node 22, pnpm 10, Docker (yerel Supabase için). Supabase CLI root devDependency'dir; global kurulum gerekmez.
- `pnpm install`
- `pnpm typecheck` — mobil + scripts + `_shared/pure` (Deno/Node tipleri olmadan) + root testleri
- `pnpm lint` — ESLint, uyarı toleransı sıfır
- `pnpm test` — vitest (`scripts/**`, `_shared/pure/**` altındaki `*.test.ts`)
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm supabase start` / `pnpm supabase stop`
- `pnpm supabase db reset` — migration'lar + `supabase/seed.sql`
- `pnpm seed` — `content/*.json` → `supabase/seed.sql` (çıktı commit'lenir)
- `pnpm gen:types` — çalışan yerel DB'den `supabase/functions/_shared/pure/database.ts` üretir; her migration'dan sonra çalıştır
- `pnpm supabase functions serve` — M1'de ilk fonksiyonla birlikte doğrulanacak
- Mobil (Android fiziksel cihaz, USB hata ayıklama açık):
  1. `cp apps/mobile/.env.example apps/mobile/.env` ve URL'e bilgisayarın LAN IP'sini, anahtara `pnpm supabase status` çıktısındaki publishable key'i yaz
  2. `pnpm --filter mobile android` — `expo run:android`, dev build'i derleyip cihaza kurar (Android SDK + JDK 17 gerekir)
  3. Sonraki çalıştırmalarda `pnpm --filter mobile start` — Metro'yu dev client için başlatır

## Değişmez kurallar
1. İstemci hiçbir tabloya doğrudan yazmaz. Tüm yazmalar Edge Function üzerinden yapılır. İstemci okumaları RLS ile sınırlıdır. İstemcinin çağırdığı security definer RPC'ler yalnızca okur ve `set search_path = ''` ile tanımlanır.
2. Her tabloda RLS açıktır. Yeni tablo, politikalarıyla aynı migration'da gelir.
3. Oyun sunucu otoriterdir: tur süresi (`ends_at`), ipucu doğrulama, tahmin kontrolü ve skor sunucuda hesaplanır.
4. Anonimlik: diğer masalara yalnızca masa takma adı, kişi sayısı ve konsept gider. Kullanıcı takma adı, profil bilgisi ve koordinat asla gitmez.
5. Katılma isteğinde red ve zaman aşımı, istek sahibine birebir aynı görünür (`unavailable`). API yanıtı ve okunabilir satırlar dahil.
6. Konum yalnızca check-in anında, uygulama açıkken alınır. Koordinat saklanmaz, sadece seçilen `venue_id` saklanır.
7. Metin eşleştirme ve küfür filtresi yalnızca `supabase/functions/_shared/pure/trText.ts` ve `pure/profanity.ts` üzerinden yapılır. Bu dosyalar bağımlılıksız saf TypeScript'tir, mobil uygulama ve Edge Function aynı dosyayı kullanır. Değişiklikte testler de güncellenir.
8. Service role anahtarı mobil koda asla girmez.

## Kod kuralları
- Kod, tablo ve değişken adları İngilizce. Kullanıcıya görünen metinler Türkçe ve `apps/mobile/src/i18n/tr.ts` içinde. Bileşenlerde sabit metin yok.
- `any` yok. Veritabanı tipleri `pnpm gen:types` (`supabase gen types`) ile tek dosyaya üretilir: `supabase/functions/_shared/pure/database.ts`. Mobil uygulama bunu alias ile okur, kopya tutulmaz.
- Paylaşılan kod `supabase/functions/_shared/pure/` altındadır. Mobil `@shared/*` alias'ı yalnızca bu klasörü gösterir. `pure/` içine Deno API'si (`Deno.*`), `npm:`/`jsr:`/URL import'u ya da herhangi bir dış bağımlılık giremez; göreli import'lar `.ts` uzantısıyla yazılır.
- İş mantığı `pure/` modüllerindedir ve vitest ile test edilir. Edge Function handler'ları incedir: girdi doğrulama, yetki, veritabanı çağrısı, yanıt.
- Tek test çatısı vitest'tir. `deno test` ve jest-expo kullanılmaz.
- Edge Function başına tek endpoint, `action` alanıyla yönlendirme, zod (v4) ile girdi doğrulama, tek tip hata formatı: `{ error: { code, message } }`. İstemci yalnızca native uygulama olduğu için CORS başlıkları eklenmez.
- İçerik (kartlar, mekanlar, küfür listesi) `content/` altında JSON olarak durur ve seed script'iyle yüklenir. Koda gömülmez.
- Yeni bağımlılık eklemeden önce gerekçesini belirt.

## Çalışma şekli
- Kilometre taşlarıyla ilerle (`MVP_SPEC.md` §13). Bir taşın kabul kriterleri karşılanmadan sonrakine geçme.
- Her taşın sonunda: typecheck, lint ve testler temiz olmalı. Kısa bir özet yaz. Spec'ten sapma olduysa spec'i güncelle ve bunu açıkça belirt.
- `trText.ts` için önce testler, sonra implementasyon.
