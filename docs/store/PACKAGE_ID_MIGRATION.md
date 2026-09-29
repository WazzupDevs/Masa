# Paket kimliği geçişi: `app.masa.mobile` → `app.kabuk.mobile` (UYGULANMADI)

> Karar marka kontrolünden sonra proje sahibinde. Bu belge yalnızca tam listedir; hiçbir adım uygulanmadı. Uygulama adı ("Kabuk", `APP_NAME`) paket kimliğinden bağımsızdır ve zaten değişti.

## En önemli sonuç

- **Play'de paket adı değiştirilemez.** Yeni kimlik Play Console'da **yeni bir uygulama** demektir: ayrı mağaza girişi, ayrı inceleme, sıfırdan kurulum sayısı ve yorum. Kişisel geliştirici hesabı kuralı (12 test kullanıcısı, 14 gün kapalı test; `PLAY_CHECKLIST.md` §1) yeni uygulama için **baştan** işler.
- Eski ve yeni uygulama telefonda yan yana kurulabilir (farklı paket). Test kullanıcılarına eskisini kaldırmaları söylenir. Hesaplar sunucuda telefon numarasıyla durur; yeni uygulamada aynı numarayla giriş yapan kullanıcı verisini görür.
- En ucuz an: Play'e ilk AAB yüklenmeden önce. İlk yüklemeden sonra yukarıdaki maliyet başlar.

## Kod ve yapılandırma

| Yer                                               | Değişiklik                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/app.json` → `android.package`        | `app.kabuk.mobile`                                                                                                                                                  |
| `apps/mobile/app.json` → `ios.bundleIdentifier`   | `app.kabuk.mobile`                                                                                                                                                  |
| `apps/mobile/app.json` → `version`                | Artır (native alan; CLAUDE.md → "Neyi ne zaman yayınlamalı"). Eski build'ler yeni build'e giden OTA'yı almaz                                                        |
| `scheme` (`masa`), `slug` (`masa`)                | Ayrı karar. Paket kimliğiyle değişmek zorunda değil. `slug` EAS projesinin adıdır; değişirse EAS projesi de taşınır                                                 |
| `e2e/maestro/p0.yaml` ve `flows/*.yaml` → `appId` | `app.kabuk.mobile`                                                                                                                                                  |
| `apps/mobile/src/lib/appBuild.ts`                 | "Güncelle" bağlantısının yedek paket adı (`Application.applicationId` yoksa): `app.kabuk.mobile`                                                                    |
| `scripts/e2e/run-on-emulator.sh`                  | Paket adı geçmiyor; değişiklik yok                                                                                                                                  |
| `MVP_SPEC.md`                                     | Paket adının geçtiği satır                                                                                                                                          |
| Bildirim kanalları, `expo-notifications` ayarları | Paket adına bağlı değil; yeni kurulumda kanallar yeniden oluşur                                                                                                     |
| Sentry                                            | Sürüm adları `app.masa.mobile@0.x+N` biçiminde; yeni adla yeni sürümler başlar. Paneldeki filtre ve uyarılar yeni adla güncellenir                                  |
| Belgeler                                          | CLAUDE.md, `docs/store/PLAY_CHECKLIST.md`, `docs/store/listing-tr.md`, `docs/DECISIONS.md`, `docs/FIELD_TEST.md`, `supabase/functions/_shared/pure/brand.ts` yorumu |

## Hesaplar ve paneller

| Hizmet                         | Yapılacak                                                                                                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EAS kimlik bilgileri**       | Android keystore (upload key) uygulama kimliğine bağlıdır: yeni kimlikle ilk build'de EAS yeni keystore üretir. Eski keystore eski uygulama için saklanır. iOS: yeni App ID, provisioning profile, sertifika                                         |
| **EAS build numarası**         | `appVersionSource: remote` sayacı uygulama kimliğine bağlıdır; yeni kimlikte sayaç yeniden başlar. `pnpm dlx eas-cli build:version:set --platform android` ile eski sayacın üstünden başlat; aksi halde `MIN_APP_BUILD` yeni build'leri kapıda tutar |
| **`MIN_APP_BUILD`**            | Yukarıdaki sayaç kararına göre yeniden ayarlanır (üretim ve dev projeleri)                                                                                                                                                                           |
| **Firebase (FCM)**             | Firebase projesine `app.kabuk.mobile` paket adıyla yeni Android uygulaması ekle, yeni `google-services.json` indir, EAS'taki `GOOGLE_SERVICES_JSON` dosya değişkenini değiştir                                                                       |
| **Expo push kimlik bilgileri** | FCM V1 servis hesabı anahtarı Expo panelinde uygulama kimliğine bağlanır: yeni kimlik için yeniden yüklenir. iOS: APNs anahtarı yeni bundle id için                                                                                                  |
| **Push token'ları**            | Eski uygulamanın token'ları yeni uygulamaya geçmez. Yeni uygulama açılışta token'ı yeniden kaydeder (`register-push`); eski kurulumlar kaldırılınca token'lar geçersizleşir. Sunucuda iş yok                                                         |
| **Play Console**               | Yeni uygulama oluştur; mağaza girişi, Veri güvenliği, IARC, hedef kitle, uygulama erişimi (inceleme hesabı), kapalı test kanalı ve test kullanıcıları baştan (`PLAY_CHECKLIST.md`)                                                                   |
| **App Store Connect**          | Yeni uygulama kaydı (bundle id değişemez)                                                                                                                                                                                                            |
| **Supabase**                   | Paket adına bağlı ayar yok (telefonla giriş, özel şema yok). Auth → URL Configuration'da `masa://` gibi bir yönlendirme tanımlıysa şema kararına göre güncellenir                                                                                    |
| **PostHog**                    | Paket adına bağlı değil; kişi kimliği hesap kimliğidir                                                                                                                                                                                               |
| **Yasal sayfalar**             | Paket adı geçmiyor; değişiklik yok                                                                                                                                                                                                                   |

## Sıra (karar verilirse)

1. Firebase'e yeni Android uygulaması, yeni `google-services.json`, EAS dosya değişkeni.
2. Kod: `android.package`, `ios.bundleIdentifier`, `version`, E2E `appId`, belgeler. PR.
3. `eas build:version:set` ile sayaç; `eas build --profile preview`, EAS yeni keystore'u üretir.
4. Expo paneline FCM V1 anahtarı (yeni kimlik).
5. Play Console'da yeni uygulama ve kapalı test; test kullanıcılarına eski uygulamayı kaldırmalarını söyle.
6. `MIN_APP_BUILD`'i yeni sayaca göre ayarla.
