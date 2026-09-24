# CLAUDE.md

## Proje
Mekan içi sosyal oyun uygulaması (çalışma adı: Masa). Aynı mekandaki masalar konsept üzerine odalar kurar, oyun oynar ve sohbet eder. İki taraf da isterse oda sonunda fiziksel olarak tanışırlar.

Tüm ürün kararları, kapsam ve kilometre taşları `MVP_SPEC.md` içinde. Spec'te olmayan bir özelliği ekleme. Belirsizlikte varsayım yapma, sor.

## Stack
- `apps/mobile`: Expo (expo-router, development build), TypeScript strict, @supabase/supabase-js, TanStack Query, Zustand, NativeWind, expo-location, expo-notifications, posthog-react-native
- `supabase/`: Postgres + PostGIS + RLS, Realtime, Edge Functions (Deno), pg_cron
- Monorepo, paket yöneticisi pnpm

## Komutlar
Node 22, pnpm 10, Docker (yerel Supabase için). Supabase CLI ve Deno root devDependency'dir; global kurulum gerekmez.
- `pnpm install`
- `pnpm typecheck` — mobil + scripts + `_shared/pure` (Deno/Node tipleri olmadan) + Edge Function'lar (`deno check`) + root testleri
- `pnpm lint` — ESLint (uyarı toleransı sıfır) + `deno lint supabase/functions`
- `pnpm test` — birim testleri, vitest (`scripts/**`, `_shared/pure/**` altındaki `*.test.ts`)
- `pnpm test:integration` — `supabase/tests/**`, yerel stack'e karşı (önce `pnpm supabase start` ve `pnpm supabase functions serve`)
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm supabase start` / `pnpm supabase stop` — `config.toml` değişince stop + start gerekir. İlk seferde `cp supabase/.env.example supabase/.env` (`config.toml`'daki `env()` değerleri; yerel placeholder'lar)
- `pnpm supabase db reset` — migration'lar + `seed.sql` + `seed.local.sql` (yalnızca yerel dev sırları)
- `pnpm supabase functions serve` — Edge Function'ları yerelde çalıştırır
- `pnpm seed` — `content/*.json` → `supabase/seed.sql` (çıktı commit'lenir)
- `pnpm gen:types` — çalışan yerel DB'den `supabase/functions/_shared/pure/database.ts` üretir; her migration'dan sonra çalıştır
- Yerel test numaraları (`config.toml` → `[auth.sms.test_otp]`): `+905550000001` … `+905550000003`, kod `123456`
- `pnpm admin:ban <userId>` — ban = telefon hash'ini `banned_phones`'a yazar, sonra hesabı siler (tüm veri cascade ile gider). Yalnızca geliştirici makinesinde, `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` ortam değişkenleriyle çalışır. Secret key hiçbir dosyaya yazılmaz, uygulamaya girmez.

## Ortamlar
- **Yerel (container, CI, entegrasyon testleri):** `pnpm supabase start`. SMS gönderilmez, yalnızca test numaraları çalışır.
- **Barındırılan dev projesi (cihaz testleri):** mobil `.env` bu projeyi gösterir. Dağıtımı proje sahibi yapar.
- **`supabase config push` asla çalıştırılmaz.** `config.toml` yalnızca yerel ortamı tanımlar (placeholder SMS sağlayıcısı, test numaraları); barındırılan projenin auth ayarları panelden yapılır.
- Edge Function bağımlılıkları `supabase/functions/_shared/deps.ts` içinde sabit sürümlü `npm:` import'larıdır (import map yok). Deno 24 saatten yeni sürümleri reddeder; yeni yayımlanmış bir sürüme hemen geçme.

### Barındırılan dev projesi kurulumu (tek seferlik)
1. **Supabase:** yeni proje aç (bölge: Frankfurt `eu-central-1`). Proje ref'ini not et.
2. `pnpm supabase login` ve `pnpm supabase link --project-ref <ref>`
3. **Vault anahtarı:** `openssl rand -hex 32` ile üret, parola yöneticisine kaydet, SQL Editor'da çalıştır:
   `select vault.create_secret('<anahtar>', 'phone_hash_key');`
   Anahtar asla değişmez (rotasyon yok; değişirse `banned_phones` geçersiz olur). `seed.local.sql`'i barındırılan projede asla çalıştırma.
4. `pnpm supabase db push` — migration'lar
5. `pnpm supabase functions deploy account` — `verify_jwt = false` ayarı `config.toml`'dan gelir; token'ı fonksiyon kendisi doğrular.
6. **Twilio:**
   - Verify servisi oluştur; Account SID, Auth Token ve Verify Service SID'i al.
   - **Verify → Settings → Geo permissions: yalnızca Türkiye** açık (SMS pumping dolandırıcılığına karşı). Fraud Guard açık kalsın.
7. **Supabase paneli → Authentication:**
   - Sign In / Providers → **Email: kapalı**. **Phone: açık**, SMS sağlayıcı **Twilio Verify** (6. adımdaki değerler), telefonla kayıt açık.
   - Phone → test numaraları: `905550000001=123456` (yalnızca dev projesinde; pilot projesinde olmaz).
   - Rate Limits: saatlik SMS **100**; aynı numaraya tekrar gönderim aralığı **60 sn**.
   - Hooks → **Before User Created** → Postgres → şema `private`, fonksiyon `before_user_created`.
8. **Mobil:** `cp apps/mobile/.env.example apps/mobile/.env`; URL `https://<ref>.supabase.co`, anahtar Settings → API Keys'teki publishable key.
9. Sonraki değişikliklerde: yeni migration → `pnpm supabase db push`; fonksiyon değişikliği → `pnpm supabase functions deploy <ad>`.

### Mobil (Android fiziksel cihaz, USB hata ayıklama açık)
1. `apps/mobile/.env` barındırılan dev projesini göstermeli (yukarıdaki 8. adım).
2. `pnpm --filter mobile android` — `expo run:android`, dev build'i derleyip cihaza kurar (Android SDK + JDK 17 gerekir)
3. Sonraki çalıştırmalarda `pnpm --filter mobile start` — Metro'yu dev client için başlatır

## Değişmez kurallar
1. İstemci hiçbir tabloya doğrudan yazmaz. Tüm yazmalar Edge Function üzerinden yapılır. İstemci okumaları RLS ile sınırlıdır. İstemcinin çağırdığı security definer RPC'ler yalnızca okur ve `set search_path = ''` ile tanımlanır. Yazan security definer fonksiyonlar istemciye kapalıdır (yalnızca service role).
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
