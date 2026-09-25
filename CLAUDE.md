# CLAUDE.md

## Proje
Mekan içi sosyal oyun uygulaması (çalışma adı: Masa). Aynı mekandaki masalar konsept üzerine odalar kurar, oyun oynar ve sohbet eder. İki taraf da isterse oda sonunda fiziksel olarak tanışırlar.

Tüm ürün kararları, kapsam ve kilometre taşları `MVP_SPEC.md` içinde; v2 kapsamı ve teknik tasarımı `docs/SPEC_V2.md` içinde (onaylı, §12 sırasıyla uygulanır). Spec'te olmayan bir özelliği ekleme. Belirsizlikte varsayım yapma, sor.

## Stack
- `apps/mobile`: Expo (expo-router, development build), TypeScript strict, @supabase/supabase-js, TanStack Query, Zustand, NativeWind, expo-location, expo-notifications, posthog-react-native, @sentry/react-native, expo-updates. v2 için kurulu ama henüz kullanılmayan: @maplibre/maplibre-react-native, expo-image-picker, expo-image-manipulator
- `supabase/`: Postgres + PostGIS + RLS, Realtime, Edge Functions (Deno), pg_cron
- Monorepo, paket yöneticisi pnpm

## Komutlar
Node 22, pnpm 10, Docker (yerel Supabase için). Supabase CLI ve Deno root devDependency'dir; global kurulum gerekmez.
- `pnpm install`
- `pnpm typecheck` — mobil + scripts + `_shared/pure` (Deno/Node tipleri olmadan) + Edge Function'lar (`deno check`) + root testleri
- `pnpm lint` — ESLint (uyarı toleransı sıfır) + `deno lint supabase/functions`
- `pnpm test` — birim testleri, vitest (`scripts/**`, `_shared/pure/**` altındaki `*.test.ts`)
- `pnpm test:integration` — `supabase/tests/**`, yerel stack'e karşı (önce `pnpm supabase start`, `pnpm db:reset` ve `pnpm supabase functions serve`). Mekan testleri gerçek veri değil `supabase/tests/fixtures/venues.ts` kullanır.
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm supabase start` / `pnpm supabase stop` — `config.toml` değişince stop + start gerekir. İlk seferde `cp supabase/.env.example supabase/.env` (`config.toml`'daki `env()` değerleri; yerel placeholder'lar)
- `pnpm db:reset` — yerel DB'yi sıfırlar: migration'lar + `seed.sql`, ardından `supabase/local/secrets.sql` (yerel dev sırları; script yerel olmayan DB'ye uygulamayı reddeder). Çıplak `supabase db reset` Vault anahtarını kurmaz.
- `pnpm supabase functions serve` — Edge Function'ları yerelde çalıştırır
- `pnpm seed` — `content/*.json` → `supabase/seed.sql` (çıktı commit'lenir). `content/venues-test.json` boşsa atlanır (bkz. "Saha testi mekanı")
- `pnpm fetch:venues` — OpenStreetMap Overpass API'den Beylikdüzü kafeleri ve nargile kafeleri → `content/venues-pilot.json`. Sonucu elle kontrol et (`isActive: false` ile kapat; tekrar çekişte korunur), sonra `pnpm seed`. `overpass-api.de` erişimi gerekir.
- `pnpm gen:types` — çalışan yerel DB'den `supabase/functions/_shared/pure/database.ts` üretir; her migration'dan sonra çalıştır
- Yerel test numaraları (`config.toml` → `[auth.sms.test_otp]`): `+905550000001` … `+905550000003`, kod `123456`
- `pnpm admin:ban <userId>` — ban = telefon hash'ini `banned_phones`'a yazar, sonra hesabı siler (tüm veri cascade ile gider). Yalnızca geliştirici makinesinde, `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` ortam değişkenleriyle çalışır. Secret key hiçbir dosyaya yazılmaz, uygulamaya girmez.
- `pnpm admin:event add <venueId|sourceRef> "<başlık>" <başlangıç> [<bitiş>]` / `list` / `remove <id>` — Keşfet'teki planlı etkinlikler (`venue_events`). Saat `2026-09-29 20:00` (İstanbul) ya da ofsetli ISO; bitiş verilmezse 3 saat. `admin:ban` gibi yalnızca geliştirici makinesinde, `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` ortam değişkenleriyle.
- `pnpm admin:remove-photo <publicId>` — şikayet incelemesinden sonra profil fotoğrafını siler ve `photo_path`'i boşaltır (şikayet kopyası 30 gün kalır). `admin:ban` gibi yalnızca geliştirici makinesinde, `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` ortam değişkenleriyle. Ban ve hesap silme profil fotoğraflarını da siler.

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
   Anahtar asla değişmez (rotasyon yok; değişirse `banned_phones` geçersiz olur). `supabase/local/secrets.sql`'i barındırılan projede asla çalıştırma.
4. `pnpm supabase db push --include-seed` — migration'lar + `seed.sql` (takma ad kelimeleri, mekanlar; tekrar çalıştırılabilir). Yerel sırlar seed yolunda değildir, buradan barındırılan projeye gidemez.
5. `pnpm supabase functions deploy` — tüm fonksiyonlar. `verify_jwt = false` ayarı `config.toml`'dan gelir; token'ı fonksiyon kendisi doğrular.
6. **Twilio:**
   - Verify servisi oluştur; Account SID, Auth Token ve Verify Service SID'i al.
   - **Verify → Settings → Geo permissions: yalnızca Türkiye** açık (SMS pumping dolandırıcılığına karşı). Fraud Guard açık kalsın.
7. **Supabase paneli → Authentication:**
   - Sign In / Providers → **Email: kapalı**. **Phone: açık**, SMS sağlayıcı **Twilio Verify** (6. adımdaki değerler), telefonla kayıt açık.
   - Phone → test numaraları: `905550000001=123456` (yalnızca dev projesinde; pilot projesinde olmaz).
   - Rate Limits: saatlik SMS **100**; aynı numaraya tekrar gönderim aralığı **60 sn**.
   - Hooks → **Before User Created** → Postgres → şema `private`, fonksiyon `before_user_created`.
   - **Realtime → Settings → Allow public access: kapalı.** Tüm kanallar özeldir; kimin abone olup yayın yapacağına `realtime.messages` politikaları karar verir.
8. **Mobil:** `cp apps/mobile/.env.example apps/mobile/.env`; URL `https://<ref>.supabase.co`, anahtar Settings → API Keys'teki publishable key.
9. Sonraki değişikliklerde: yeni migration ya da içerik → `pnpm supabase db push --include-seed`; fonksiyon değişikliği → `pnpm supabase functions deploy <ad>`.

### Push (isteğe bağlı; hesaplar olmadan build kırılmaz)
- `EAS_PROJECT_ID`: `eas init` ile alınan Expo proje id'si. Yoksa uygulama push token kaydını sessizce atlar.
- `GOOGLE_SERVICES_JSON`: Firebase'in `google-services.json` yolu (varsayılan `apps/mobile/google-services.json`, git'e girmez). Dosya yoksa Android build'e eklenmez. FCM V1 anahtarı Expo paneline yüklenir.
- Gönderim Expo push API'si ile yapılır, sunucuda anahtar gerekmez.

### Hata raporlama (Sentry)
- `EXPO_PUBLIC_SENTRY_DSN` (EAS ortam değişkeni ya da mobil `.env`); yoksa hiçbir şey gönderilmez. Kullanıcı kimliği olarak yalnızca kullanıcı id'si gider. Telefon, konum, yazılan metin, istek gövdesi ve URL sorgu dizesi `_shared/pure/errorReporting.ts` ile telefondan çıkmadan silinir.
- Kaynak haritası yüklemesi kapalı (`SENTRY_DISABLE_AUTO_UPLOAD=true`, `eas.json`). Açmak için Sentry hesabı ve `SENTRY_AUTH_TOKEN` gerekir.
- Her rota grubunun `_layout.tsx`'i `RouteError`'ı `ErrorBoundary` olarak dışa verir: beyaz ekran yerine kısa bir mesaj, "Tekrar dene" ve "Ana ekrana dön".

### Neyi ne zaman yayınlamalı
`expo-updates` açık (`app.config.ts`, `EAS_PROJECT_ID` varsa). `runtimeVersion` native parmak izidir: bir OTA güncellemesi yalnızca aynı native koda sahip build'lere gider. Kanallar: `preview` build'i `preview` kanalını, `production` build'i `production` kanalını dinler.

| Değişiklik | Gereken |
| --- | --- |
| Yalnızca JS/TS, metin, stil, `@shared` kodu | `pnpm dlx eas-cli update --channel preview --message "…"` (`apps/mobile` içinde) |
| `EXPO_PUBLIC_*` değeri | EAS ortam değişkenini güncelle, sonra `eas update` (değerler JS paketine girer) |
| Yeni native modül, config plugin, `app.json`/`app.config.ts` native alanı (izin, paket adı, ikon, splash), Expo SDK yükseltmesi, `google-services.json` | Yeni `eas build --profile preview` ve APK'nın yeniden kurulması |
| Migration ya da `content/` (seed) | `pnpm supabase db push --include-seed` |
| Edge Function | `pnpm supabase functions deploy <ad>` |
| Panel ayarı (Auth, Realtime, Storage) | Panelden; `config push` asla |

- Sunucu değişikliği istemciden önce yayınlanır: yeni bir alan ya da action'ı kullanan JS güncellemesi, migration ve fonksiyonlar yayında olduktan sonra gönderilir.
- Yeni native bağımlılık eklendiyse önce build, sonra o build'i hedefleyen `eas update`. Parmak izi değiştiği için eski APK'lar bu güncellemeyi almaz, yanlış koda düşmez.

### Analitik, yasal metinler, mağaza (M7)
- Mobil `.env` (hepsi isteğe bağlı): `EXPO_PUBLIC_POSTHOG_KEY` (yoksa analitik hiçbir şey yapmaz), `EXPO_PUBLIC_POSTHOG_HOST` (varsayılan AB), `EXPO_PUBLIC_PRIVACY_URL` (yoksa uygulama içi taslak metin), `EXPO_PUBLIC_CONTACT_EMAIL`.
- Fonksiyon sırları (hesap silmede PostHog kişi silme; yoksa atlanır): `pnpm supabase secrets set POSTHOG_PERSONAL_API_KEY=… POSTHOG_PROJECT_ID=…` (`POSTHOG_HOST` isteğe bağlı). `pnpm admin:ban` aynı değişkenleri ortamdan okur.
- Event kataloğu ve izinli özellikler: `_shared/pure/analytics.ts`. PostHog'a yalnızca kullanıcı id'si gider.
- Yasal taslaklar `docs/legal/` (hukuki kontrol gerekli), mağaza metinleri `docs/store/listing-tr.md`, EAS profilleri `apps/mobile/eas.json`.

### Mobil (Android fiziksel cihaz, USB hata ayıklama açık)
1. `apps/mobile/.env` barındırılan dev projesini göstermeli (yukarıdaki 8. adım).
2. `pnpm --filter mobile android` — `expo run:android`, dev build'i derleyip cihaza kurar (Android SDK + JDK 17 gerekir)
3. Sonraki çalıştırmalarda `pnpm --filter mobile start` — Metro'yu dev client için başlatır

### Test APK'sı (`preview` profili): alma ve paylaşma
Dev client olmadan, tek başına çalışan bir Android APK'sı. Arkadaşa link ile gönderilir, USB ve Metro gerekmez. `EXPO_PUBLIC_*` değerleri yerel `.env`'den değil EAS ortam değişkenlerinden gelir: `.env` git'e girmediği için EAS'a yüklenmez.
1. **Expo hesabı** (ücretsiz) aç. `eas-cli` bağımlılık değildir, `pnpm dlx` ile çalıştırılır: `cd apps/mobile && pnpm dlx eas-cli login`
2. **Proje:** `pnpm dlx eas-cli init`. `app.config.ts` dinamik olduğu için id dosyaya yazılamaz; CLI'nin verdiği proje id'sini not et. Bu id `eas` komutlarını çalıştırdığın kabukta gerekir: `export EAS_PROJECT_ID=<id>`
3. **Ortam değişkenleri** (`preview` ortamı; bir kez, değer değişince tekrar):
   ```
   pnpm dlx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --visibility plaintext
   pnpm dlx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <publishable key> --visibility plaintext
   pnpm dlx eas-cli env:create --environment preview --name EAS_PROJECT_ID --value <id> --visibility plaintext
   ```
   İsteğe bağlı: `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_CONTACT_EMAIL`. Kontrol: `pnpm dlx eas-cli env:list --environment preview`. Publishable key zaten uygulamanın içindedir, gizli değildir. **Secret key asla eklenmez.**
4. **Build:** `pnpm dlx eas-cli build --platform android --profile preview`. İlk seferde Android keystore'u EAS'ın üretmesini kabul et (sonraki APK'lar aynı anahtarla imzalanır, üstüne kurulur). Ücretsiz planda kuyrukla birlikte 15–40 dk sürebilir.
5. **Paylaşma:** Build bitince CLI bir `expo.dev/.../builds/<id>` linki ve QR kodu verir; sonra `pnpm dlx eas-cli build:list` ya da expo.dev'deki proje sayfasından da bulunur. Linki arkadaşına gönder. Android'de linki Chrome'da açar, **Install** ile APK'yı indirir, "bilinmeyen uygulamaları yükleme" iznini Chrome'a verir ve kurar. Play Protect uyarısında "Yine de yükle" seçilir.
6. **Güncelleme:** kod ya da `EXPO_PUBLIC_*` değişince yeni build gerekir (değerler build anında pakete girer). Yeni APK eskisinin üstüne kurulur, oturum korunur. Sunucu değişiklikleri (migration, fonksiyon) yeni APK gerektirmez.
7. Push bu APK'da çalışmaz (Firebase yok, bkz. "Push"). Uygulama bunu sessizce atlar; bildirim izni sorulursa cevap önemsizdir.

### Barındırılan projede SMS'siz giriş (test numaraları)
Saha testinde gerçek numaralarla, SMS gönderilmeden, sabit kodla giriş yapılabilir. Twilio'ya ve SMS kotasına dokunmaz.
1. Supabase paneli → **Authentication → Sign In / Providers → Phone**.
2. **Test Phone Numbers and OTPs** alanına numara=kod çiftlerini virgülle yaz. Numara `+` olmadan, ülke koduyla: `905321234567=482915,905339876543=730264`.
3. **Test OTPs Valid Until:** testten sonraki güne bir tarih ver; o tarihten sonra bu çiftler çalışmaz.
4. Kaydet. Uygulamada numarayı her zamanki gibi gir (`5xx xxx xx xx`), SMS gelmez; kodu elle gir.
- Kodu `123456` gibi tahmin edilebilir seçme: numarayı ve kodu bilen herkes o hesaba girebilir. Test bitince çiftleri sil.
- Test numarası ban kontrolünden ve 18+/onay akışından muaf değildir. Hesap silme ve `pnpm admin:ban` aynı şekilde çalışır.
- Phone sağlayıcısı açık olmalı. Twilio henüz kurulmadıysa panel sağlayıcı alanlarını doldurmanı isteyebilir; test numaralarına SMS gönderilmez.
- Gerçek numara şart değil: dev projesindeki `905550000001=123456` gibi uydurma numaralar da aynı yolla çalışır.

### Saha testi mekanı (`content/venues-test.json`)
Pilot listesinde olmayan bir yerde test için elle girilen mekan. Dosya boşsa (`"venues": []`) seed onu atlar.
1. Mekanın koordinatını haritadan al (Google Maps'te noktaya uzun bas; ilk sayı enlem `lat`, ikinci boylam `lng`) ve dosyaya yaz:
   ```json
   { "venues": [{ "ref": "saha-1", "name": "Saha Testi", "lat": 41.00123, "lng": 28.64210 }] }
   ```
   `ref` kalıcı kimliktir (değiştirme; aynı `ref` güncellenir). İsteğe bağlı: `city` (varsayılan İstanbul), `district` (varsayılan Test), `isActive`.
2. `pnpm seed`, sonra `pnpm supabase db push --include-seed` (yerelde `pnpm db:reset`). `supabase/seed.sql` commit'lenir, yani koordinat git'e girer: ev adresi değil mekan koordinatı kullan.
3. Check-in 300 m içinden çalışır. İki telefon da mekanın yakınında olmalı.
4. Test bitince mekanı silmek yerine `"isActive": false` yapıp tekrar seed et (seed yalnızca ekler ya da günceller, silmez), ya da listeyi boşalt ve mekanı panelden pasif yap.
5. Uçtan uca senaryo: `docs/FIELD_TEST.md`.

## Değişmez kurallar
1. İstemci hiçbir tabloya doğrudan yazmaz. Tüm yazmalar Edge Function üzerinden yapılır. Dosya yüklemesi yalnızca bir Edge Function'ın tek yol için verdiği süreli imzalı URL'e yapılır ve aynı fonksiyonun `commit` eylemiyle kayda geçer; `storage.objects` üzerinde istemci politikası yoktur. İstemci okumaları RLS ile sınırlıdır. İstemcinin çağırdığı security definer RPC'ler yalnızca okur ve `set search_path = ''` ile tanımlanır. Yazan security definer fonksiyonlar istemciye kapalıdır (yalnızca service role).
2. Her tabloda RLS açıktır. Yeni tablo, politikalarıyla aynı migration'da gelir.
3. Oyun sunucu otoriterdir: tur süresi (`ends_at`), kart dağıtımı, eylem yetkisi (kim ne zaman hangi eylemi yapabilir) ve skor sunucuda hesaplanır. Yazılı oyunlarda ipucu doğrulama ve tahmin kontrolü de sunucudadır; sesli oyunlarda doğruluğa hakem masa karar verir, eylemi sunucu doğrular.
4. Anonimlik: diğer masalara varsayılan olarak yalnızca masa takma adı, kişi sayısı ve konsept gider. Masa profille katıldıysa lobi ve katılma isteği yalnızca 'profilli' işaretini görür; profil (görünen ad, fotoğraf, biyografi, rozetler) ve profil kimliği (`public_id`) yalnızca oda sürerken o odanın üyelerine gider. Arkadaşlar birbirinin profilini ve profil kimliğini görür. Arkadaşlık öncesi hiçbir yanıt (oyun geçmişi, arkadaşlık istekleri, Realtime yükleri dahil) profil kimliği taşımaz; istek, engelleme ve şikayet oyun geçmişi kaydıyla (`historyId`) yapılır. Koordinat, mekan ve aktif masa hiçbir kullanıcıya, arkadaşa da gitmez. Diğer kullanıcıların hesap kimliği istemciye asla gitmez. Masa oturum id'si, takma ad gibi check-in süresince geçerli bir takma kimliktir ve oda üyelerine gidebilir.
5. Katılma isteğinde red ve zaman aşımı, istek sahibine birebir aynı görünür (`unavailable`). API yanıtı ve okunabilir satırlar dahil. Aynı ilke tanışmada: karşılıklı "Evet" dışındaki her sonuç (hayır, cevapsız, ayrılma) yalnızca `reveal_ends_at`'te açıklanır; "Evet" diyen taraf bunları satırlardan, lobiden, kanal olaylarından ya da zamanlamadan ayırt edemez. Pencere sırasında o odadaki masaların açtığı açık odalar `reveal_ends_at`'e kadar lobide görünmez ve lobi yayını üretmez. Arkadaşlık isteğinde red, istek sahibine süresiz bekleyen istekle aynı görünür. Kalıcı red hesap çiftine bağlıdır: reddedilmiş ya da engellenmiş kişiye, hangi karşılaşmadan olursa olsun, yeni istek sessizce yutulur. Pencere bitmeden oda geçmişinden istek gönderilemez. Karşılıklı 'Evet' sonrasında 'Arkadaş ekle'ye yalnızca bir taraf basarsa hiçbir şey olmaz ve karşı taraf bunu hiçbir biçimde görmez.
6. Konum yalnızca check-in anında, uygulama açıkken alınır. Koordinat saklanmaz, sadece seçilen `venue_id` saklanır. Harita ve Keşfet kullanıcının konumunu göstermez; mekan elle seçilir, konum yalnızca check-in'de doğrulama için alınır. Yüklenen fotoğraflar istemcide yeniden kodlanır ve konum dahil bütün metadata (EXIF, XMP, IPTC, yorumlar) silinir; sunucu yalnızca metadata'sız JPEG kabul eder, metadata içeren dosyayı reddeder.
7. Metin eşleştirme ve küfür filtresi (oda sohbeti, DM, biyografi, görünen ad) yalnızca `supabase/functions/_shared/pure/trText.ts` ve `pure/profanity.ts` üzerinden yapılır. Bu dosyalar bağımlılıksız saf TypeScript'tir, mobil uygulama ve Edge Function aynı dosyayı kullanır. Değişiklikte testler de güncellenir.
8. Service role anahtarı mobil koda asla girmez.
9. Realtime kanalları özeldir (`private: true`, sunucu yayınları dahil). Abone olma ve yayın yetkisi `realtime.messages` üzerindeki RLS politikalarıyla (`private.realtime_topic_allowed`) verilir: oda kanallarına yalnızca odanın iki masası, masa kanalına yalnızca o masa, lobi kanalına mekandaki masalar abone olur; lobi ve masa kanallarında yalnızca sunucu yayın yapar. v2 ile `inbox:{user_id}` (yalnızca sahibi abone olur) ve `dm:{thread_id}` (konuşmanın iki üyesi) eklenir; ikisinde de yalnızca sunucu yayın yapar. Hiçbir Realtime yükü profil kimliği taşımaz (`rooms`'a profil kolonu eklenmez). Yeni kanal türü politikasıyla birlikte gelir.

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
