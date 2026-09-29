# Paket kimliği geçişi: `app.masa.mobile` → `app.kabuk.mobile` (UYGULANDI)

> Karar proje sahibinde verildi: paket kimliği `app.kabuk.mobile`. Kod ve belge adımları bu PR'da uygulandı; panel adımları aşağıda, proje sahibinin yapacağı sırayla. Uygulama adı ("Kabuk", `APP_NAME`) paket kimliğinden bağımsızdır.

## Neden şimdi ucuz

- Play'e henüz AAB yüklenmedi: Play Console'da eski kimlikle bir uygulama yok, taşınacak mağaza girişi, kurulum ya da yorum yok. Kimlik ilk AAB yüklemesiyle sabitlenir ve sonra değiştirilemez.
- `version` 0.3.0'da kaldı: bu sürümle henüz build alınmadı. `runtimeVersion` = `version` olduğu için 0.3.0'a giden OTA güncellemeleri yalnızca yeni kimlikle alınacak build'lere gider; eski APK'lar (0.1.0, 0.2.0) kendi sürümlerinde kalır.
- Eski ve yeni uygulama telefonda yan yana kurulabilir (farklı paket). Hesaplar sunucuda telefon numarasıyla durur: yeni uygulamada aynı numarayla giriş yapan kullanıcı verisini görür.

## Kod ve yapılandırma (uygulandı)

| Yer                                                  | Değişiklik                                                                                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/app.json` → `android.package`           | `app.kabuk.mobile`                                                                                                                                                                           |
| `apps/mobile/app.json` → `ios.bundleIdentifier`      | `app.kabuk.mobile`                                                                                                                                                                           |
| `apps/mobile/app.json` → `version`                   | **0.3.0'da kaldı** (yukarıda gerekçe). Bundan sonraki native değişiklik yine artırır                                                                                                         |
| `scheme` (`masa`), `slug` (`masa`)                   | **Değişmedi.** `slug` EAS projesinin adıdır (`@wazzupdevs/masa`); proje kimliği `app.config.ts`'te sabit                                                                                     |
| `e2e/maestro/p0.yaml` ve `flows/*.yaml` → `appId`    | `app.kabuk.mobile`                                                                                                                                                                           |
| `apps/mobile/src/lib/appBuild.ts`                    | "Güncelle" bağlantısının yedek paket adı (`Application.applicationId` yoksa): `app.kabuk.mobile`                                                                                             |
| `scripts/e2e/run-on-emulator.sh`, `patch-android.sh` | Paket adı geçmiyor; değişiklik yok                                                                                                                                                           |
| Belgeler                                             | CLAUDE.md, `MVP_SPEC.md`, `docs/DECISIONS.md`, `docs/store/PLAY_CHECKLIST.md`, `supabase/functions/_shared/pure/brand.ts` yorumu. `listing-tr.md` ve `FIELD_TEST.md`'de paket adı geçmiyordu |
| Bildirim kanalları, `expo-notifications` ayarları    | Paket adına bağlı değil; yeni kurulumda kanallar yeniden oluşur                                                                                                                              |

## Panel adımları (proje sahibi, bu sırayla)

PR'ı birleştirmeden **önce** 1 ve 2; birleştirdikten sonra 3'ten itibaren.

1. **EAS build sayacının şimdiki değerini not et.** Sayaç uygulama kimliğine bağlıdır; yeni kimlikte sıfırdan başlar. main hâlâ eski kimlikteyken:
   `cd apps/mobile && pnpm dlx eas-cli build:version:get --platform android` → çıkan sayı `N`.
2. **Firebase:** Firebase projesine `app.kabuk.mobile` paket adıyla yeni bir Android uygulaması ekle, yeni `google-services.json`'ı indir ve EAS'taki `GOOGLE_SERVICES_JSON` dosya değişkenini (preview ve production ortamları) yenisiyle değiştir. Eski dosya kalırsa yeni kimlikle build Gradle'da "No matching client found for package name" hatasıyla düşer. Yerelde de `apps/mobile/google-services.json`'ı değiştir (git'e girmez).
3. **PR'ı birleştir.**
4. **Sayacı eski değerin üstünden başlat:** `cd apps/mobile && pnpm dlx eas-cli build:version:set --platform android` → `N`. Sonraki build `autoIncrement` ile `N+1` alır; yeni build'ler eski APK'lardan her zaman büyük numara taşır.
5. **İlk build:** `pnpm dlx eas-cli build --platform android --profile preview`. EAS yeni kimlik için yeni bir Android keystore üretmeyi sorar: kabul et. Eski keystore eski kimliğin altında saklı kalır (silme).
6. **Expo push kimlik bilgisi:** Expo paneli → proje → Credentials → Android → `app.kabuk.mobile` → FCM V1 servis hesabı anahtarını yükle (2. adımdaki Firebase projesinin anahtarı). Kimlik girişi 5. adımdaki build'den sonra görünür.
7. **Kurulum:** yeni APK'yı kur, test kullanıcılarına eski uygulamayı ("Kabuk" adıyla iki simge görünür) kaldırmalarını söyle. Push token'ı yeni uygulama açılışta yeniden kaydeder; sunucuda iş yok.
8. **`MIN_APP_BUILD` (isteğe bağlı, dev projesi):** eski kimlikli APK'ları kapatmak istersen yeni APK dağıtıldıktan sonra `pnpm supabase secrets set MIN_APP_BUILD=<N+1>`. Eski APK'lar "Güncelleme gerekli" ekranını gösterir; Play bağlantısı eski paket adını açar (Play'de yok), test kullanıcılarına yeni APK bağlantısını ayrıca gönder. Ayarsız bırakılırsa eski APK'lar çalışmaya devam eder.
9. **Sentry:** sürüm adları artık `app.kabuk.mobile@0.3.0+N` biçiminde; paneldeki filtre ve uyarıları yeni adla güncelle.
10. **Play Console:** uygulamayı `app.kabuk.mobile` ile oluştur (`PLAY_CHECKLIST.md`). Eski kimlikle oluşturulmuş bir giriş varsa ve AAB yüklenmediyse silinebilir.

## Etkilenmeyenler

| Hizmet            | Durum                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Supabase          | Paket adına bağlı ayar yok (telefonla giriş). `scheme` değişmediği için `masa://` yönlendirmeleri aynı       |
| PostHog           | Paket adına bağlı değil; kişi kimliği hesap kimliğidir                                                       |
| Yasal sayfalar    | Paket adı geçmiyor                                                                                           |
| E2E CI            | APK her koşuda kaynaktan derlenir, `google-services.json` kullanılmaz; akışlar `appId: app.kabuk.mobile` ile |
| App Store Connect | Henüz kayıt yok; ileride `app.kabuk.mobile` bundle id'siyle açılır (APNs anahtarı o kimliğe)                 |
