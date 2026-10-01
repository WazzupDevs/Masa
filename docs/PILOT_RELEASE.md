# Pilot yayını (Kabuk v1, Sakarya Üniversitesi)

Pilotun yayın sırası: üretim Supabase projesi, production build, `MIN_APP_BUILD`, Play iç test ve kampüsün açılması. Adımlar sırayla yapılır; bir adım bitmeden sonrakine geçilmez. Kurulumun gerekçeleri ve dev/üretim farkları `CLAUDE.md` → "Üretim Supabase projesi" bölümündedir; burada yalnızca sıra ve komutlar var.

Komutlar **Windows cmd** içindir. Her komut bloğunun başında nerede çalıştığı yazar:

- **Repo kökü:** `C:\…\Masa` (içinde `package.json` ve `supabase\` olan klasör).
- **`apps\mobile`:** repo kökünden `cd apps\mobile`; geri dönmek için `cd ..\..`.

EAS komutları `npx eas-cli …` ile çalışır (`eas-cli` bağımlılık değildir). Tarayıcıdan giriş isteyen komutlar (`pnpm supabase login`, `npx eas-cli login`) bir kez yapılır.

**Asla:** `supabase config push`; `supabase\local\secrets.sql`'i barındırılan projede çalıştırmak; secret key'i ya da inceleme kodunu bir dosyaya yazmak; dev Vault anahtarını üretimde kullanmak.

---

## 0. Hazırlık (bir kez)

Repo kökü:

```
git checkout main
git pull
pnpm install
pnpm supabase login
```

`apps\mobile`:

```
cd apps\mobile
npx eas-cli login
npx eas-cli whoami
cd ..\..
```

## 1. Kampüsü içerikte aç

Gerçek poligon ve nokta adları (S1) geldikten sonra. Bu adım bir PR'dır: main'e yalnızca yeşil `ci` ile girer.

1. `content\venues-campus.json`:
   - `boundary`: gerçek dış halka (GeoJSON, `[boylam, enlem]`, kapalı, saat yönünün tersine).
   - `spots`: gerçek nokta adları. `ref` kalıcıdır (`a-z0-9-`).
   - `"isActive": true`.
   - `note` alanındaki "YER TUTUCU" metni kaldırılır.
2. `content\venues-test.json`: `"venues": []` ya da her mekan `"isActive": false` (test mekanı üretimde görünmesin).
3. Repo kökü:

   ```
   pnpm seed
   pnpm test
   ```

   `pnpm seed` hatalı poligonu (kendini kesen, açık, saat yönünde) ve tekrar eden nokta `ref`'ini reddeder. İçerik değiştiyse `supabase\seeds\` altında yeni adlı tek bir `content-<id>.sql` yazar ve eskisini siler. Adın değişmesi şart: Supabase CLI aynı yoldaki seed'i barındırılan projede bir kez çalıştırır, içerik değişse de yalnızca hash'i günceller (`CLAUDE.md` → `pnpm seed`). Dosyayı elle düzenleme.

4. `supabase\seeds\` değişikliğiyle (eski dosya silindi, yenisi eklendi) PR aç, `ci` yeşil olunca birleştir. Sonra repo kökünde `git checkout main` ve `git pull`.

## 2. Üretim Supabase projesi (bir kez)

Panelde yeni proje (Frankfurt `eu-central-1`) ve **Pro plan** (Organization → Billing). Proje ref'ini not et.

Repo kökü:

```
pnpm supabase link --project-ref <üretim ref>
pnpm supabase migration list
```

`migration list` çıktısının üretim projesini gösterdiğini kontrol et.

**Vault anahtarı (yeni, dev'dekinden farklı):** yeni bir anahtar üret (`openssl rand -hex 32`; Windows'ta Git Bash'te ya da `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`), parola yöneticisine kaydet, panel → SQL Editor'da çalıştır:

```
select vault.create_secret('<anahtar>', 'phone_hash_key');
```

Panel ayarları (`CLAUDE.md` → "Üretim Supabase projesi" tablosu):

- Authentication → Sign In / Providers: Email **kapalı**, Phone **açık**, Twilio Verify (üretim servisi; Geo permissions yalnızca Türkiye, Fraud Guard açık).
- Phone → test numaraları: **yalnızca inceleme hesabı** (6. adım).
- Rate Limits: saatlik SMS 100; aynı numaraya 60 sn.
- Hooks → Before User Created → Postgres → `private.before_user_created`.
- Realtime → Settings → Allow public access **kapalı**.

## 3. Veritabanı ve fonksiyonlar (üretim)

Repo kökü (bağlı proje: üretim):

```
pnpm supabase migration list
pnpm supabase db push --include-seed --dry-run
pnpm supabase db push --include-seed
pnpm supabase functions deploy account chat checkin dm friends ping profile reveal rooms safety sms sohbet tabu venue-chat
pnpm supabase functions list
pnpm supabase migration list
```

- `--dry-run`: seed satırında `supabase/seeds/content-<id>.sql` görünmeli. `(hash update)` yazıyorsa seed çalışmaz: dosya elle değiştirilmiştir, `pnpm seed` ile yeniden üretip PR'la birleştir.
- `functions list`: 14 fonksiyonun hepsi `ACTIVE`.
- `migration list`: her satırda Local ve Remote aynı.

Fonksiyon sırları (hesap silmede PostHog kişi silme; üretim PostHog projesi):

```
pnpm supabase secrets set POSTHOG_PERSONAL_API_KEY=<anahtar> POSTHOG_PROJECT_ID=<id>
pnpm supabase secrets list
```

`MIN_APP_BUILD` henüz ayarlanmaz (5. adım).

**`CHECKIN_SKIP_LOCATION` üretimde tanımlı olmamalı.** `pnpm supabase secrets list` çıktısında bu ad görünmemeli. Bu sır dev projesinde check-in konum kontrolünü kapatır. Üretimde kod onu zaten yok sayar ve hata loglar (`_shared/pure/devProject.ts`), ama tanımlıysa yine de kaldır: `pnpm supabase secrets unset CHECKIN_SKIP_LOCATION`. Bu kontrolü her üretim yayınında, `secrets list` ile tekrarla.

## 4. Production build

`apps\mobile` (EAS `production` ortamı; değerler bir kez, değişince tekrar):

```
cd apps\mobile
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<üretim ref>.supabase.co --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <üretim publishable key> --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_POSTHOG_KEY --value <üretim PostHog key> --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN --value <DSN> --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_PRIVACY_URL --value https://wazzupdevs.github.io/Masa/gizlilik-politikasi.html --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_CONTACT_EMAIL --value <e-posta> --visibility plaintext
npx eas-cli env:list --environment production
npx eas-cli build --platform android --profile production
npx eas-cli build:version:get --platform android
cd ..\..
```

- Secret key **asla** eklenmez; publishable key gizli değildir.
- `build:version:get` bu build'in versionCode'unu verir. 5. adımda kullanılır.

## 5. Play iç test ve `MIN_APP_BUILD`

1. Play Console → uygulama → Test → **Dahili test**: AAB'yi yükle (ya da `apps\mobile`'da `npx eas-cli submit --platform android --profile production --latest`; hesap için Play hizmet hesabı anahtarı gerekir). Test kullanıcıları listesine pilot e-postalarını ekle, sürümü yayınla.
2. **İnceleme hesabı** (`CLAUDE.md` → "İnceleme hesabı (Play)"): yeni 6 haneli kod üret, panelde tek test numarası olarak gir, hemen ardından Play Console → Uygulama içeriği → Uygulama erişimi'nde aynı kodu kaydet. Kod hiçbir dosyaya ve sohbete yazılmaz.
3. İç test build'i telefonda açıldıktan sonra, repo kökü (bağlı proje: üretim):

   ```
   pnpm supabase secrets set MIN_APP_BUILD=<4. adımdaki versionCode>
   ```

   Bundan eski build'ler (preview APK'lar dahil) üretim fonksiyonlarında "Güncelleme gerekli" görür.

## 6. Kampüste kontrol

Telefonda (iç test build'i):

- Kayıt: ad ve doğum tarihi; 18 yaş altı reddedilir.
- Keşfet tek mekan kartı (kampüs) gösterir.
- Check-in yalnızca kampüs sınırının içinden (50 m toleransla); "Neredesin?" gerçek nokta adlarını listeler.
- Oda kur, öneri, Sesli Tabu (iki mod), mekan sohbeti, tanışma (`docs/FIELD_TEST.md` P0 sırası).

## 7. Dev projesine geri bağla

Repo kökü:

```
pnpm supabase link --project-ref <dev ref>
pnpm supabase migration list
```

## Sonraki güncellemeler

- **Yalnızca JS** (metin, stil, `@shared` kodu): `apps\mobile`'da

  ```
  npx eas-cli update --channel production --environment production --message "<açıklama>"
  ```

  Dev projesindeki test APK'ları için aynı komut `--channel preview --environment preview` ile.

- **Native değişiklik** (`app.json` → `version` artar): önce yeni production build (4. adım), Play iç teste yükle, sonra `MIN_APP_BUILD`'i yeni versionCode'a çek. Bu sürüme yazılan OTA yalnızca aynı `version`'daki build'lere gider.
- **Migration ya da fonksiyon:** 3. adımdaki `db push` ve `functions deploy`, istemciden **önce**.
