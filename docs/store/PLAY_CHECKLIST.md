# Google Play kapalı test kontrol listesi

Masa'yı Google Play'de **kapalı test** kanalına çıkarmak için Play Console'da yapılacaklar. Hesap ve panel adımlarını proje sahibi yapar. Metinler `docs/store/listing-tr.md`'de, yasal taslaklar `docs/legal/`'da.

## 0. Build

- `apps/mobile/eas.json` → `production` profili **AAB** üretir: `"android": { "buildType": "app-bundle" }`.
  - Alan eklenmeden önce de varsayılan AAB'ydi. eas-cli 24.8.0, `buildType` verilmemişse yalnızca `distribution: "internal"` profillerini APK yapıyor (`build/android/prepareJob.js`). `production`'da bu alan yok. Belirsizlik kalmasın diye açıkça yazıldı.
- Build: `cd apps/mobile && pnpm dlx eas-cli build --platform android --profile production`.
  - EAS ortamında `production` için de `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` tanımlı olmalı (CLAUDE.md → "Test APK'sı", ortam adı `production`).
  - Push için `GOOGLE_SERVICES_JSON` dosya değişkeni gerekir.
- `versionCode`'u EAS yönetir (`appVersionSource: remote`, `autoIncrement`). İmzalama anahtarını (upload key) EAS üretir ve saklar.

## 1. Geliştirici hesabı

- [ ] Google Play Console geliştirici hesabı (tek seferlik ücret). Kimlik doğrulaması tamamlanmış olmalı.
- [ ] **Kişisel hesap kuralı:** Kasım 2023'ten sonra açılan kişisel geliştirici hesaplarında üretime çıkmadan önce kapalı testin **en az 12 test kullanıcısıyla, 14 gün kesintisiz** sürmesi gerekir. Kuruluş hesabında bu şart yoktur. Güncel koşul hesap açılırken Console'da gösterilir; bu oturumdan Google'ın yardım sayfalarına erişilemediği için doğrulanamadı.

## 2. Uygulamayı oluştur

- [ ] Console → **Uygulama oluştur**:
  - Ad: çalışma adı "Masa"; kesin ad MVP_SPEC §14'teki açık karar.
  - Varsayılan dil: Türkçe.
  - Tür: Uygulama. Ücretsiz.
- [ ] Beyanlar: geliştirici program politikaları ve ABD ihracat yasaları.
- [ ] Paket adı ilk AAB yüklemesiyle sabitlenir: `app.masa.mobile`. Sonradan değiştirilemez.

## 3. Uygulama içeriği (Console → Politika → Uygulama içeriği)

- [ ] **Gizlilik politikası URL'i.** `docs/legal/gizlilik-politikasi.md` hukuki kontrolden sonra herkese açık bir URL'de yayımlanır. Aynı URL `EXPO_PUBLIC_PRIVACY_URL` olur.
- [ ] **Uygulama erişimi.** Giriş gerekiyor → "Tüm işlevler özel erişim gerektiriyor". İnceleme için verilecekler:
  - Test telefon numarası ve sabit doğrulama kodu. Barındırılan projede Authentication → Phone → Test Phone Numbers'a eklenir (CLAUDE.md → "SMS'siz giriş").
  - Talimat: onayları geç, "Mekana giriş yap".
  - **Açık konu:** Uygulama mekanda 300 m içinde olmayı gerektiriyor. İnceleyen kişi Beylikdüzü'nde olmayacak. Kapalı test incelemesi bu yüzden takılabilir. Nasıl çözüleceği (ör. inceleme hesabına özel bir test mekanı, bir tanıtım videosu) proje sahibinin kararı; kod değişikliği gerektirebilir.
- [ ] **Reklamlar:** Uygulama reklam içermiyor.
- [ ] **İçerik derecelendirmesi (IARC anketi):**
  - Kategori: Sosyal ya da iletişim.
  - Kullanıcılar birbiriyle etkileşiyor ve içerik paylaşıyor: **evet** (sohbet, DM, profil).
  - Kullanıcının konumu diğer kullanıcılarla paylaşılıyor mu: **hayır**. Konum saklanmaz ve kimseye gösterilmez.
  - Dijital satın alma: yok. Kumar, şiddet, cinsel içerik: yok.
- [ ] **Hedef kitle:** 18 ve üzeri. Uygulama 18+ beyanı istiyor. Çocuklara yönelik değil.
- [ ] **Veri güvenliği formu:** `docs/store/listing-tr.md` → "Veri güvenliği" tablosuna göre doldurulur (v2 taslağı). Ayrıca:
  - Veriler aktarımda şifreleniyor: evet.
  - Kullanıcı silme isteğinde bulunabilir: evet. Uygulama içinde "Hesabımı sil" var.
  - **Web'de silme talebi URL'i zorunlu:** Uygulamayı kurmadan da hesap silme talebi yapılabilen bir sayfa gerekir. Açık iş (Issue #2).
- [ ] **Hesap silme:** Uygulama içi silme ve yukarıdaki web URL'i.
- [ ] Haber uygulaması: hayır. Sağlık, finans, devlet: hayır.

## 4. Mağaza girişi (Console → Büyüme → Mağaza varlığı)

- [ ] Kısa ve uzun açıklama: `docs/store/listing-tr.md`. v2 özellikleri (Keşfet, profil, arkadaşlar, sesli Tabu) eklenince güncellenir.
- [ ] Uygulama simgesi 512×512, öne çıkan grafik 1024×500, en az 2 telefon ekran görüntüsü.
- [ ] Kategori: Sosyal. İletişim e-postası.

## 5. Kapalı test kanalı (Console → Test → Kapalı test)

- [ ] Kanal oluştur (ör. "Alfa"). Ülke: Türkiye.
- [ ] **Test kullanıcıları:** e-posta listesi ya da bir Google Grubu. Kişisel hesap kuralı için en az 12 kişi (§1).
- [ ] **İlk sürüm:**
  - Production AAB'yi Console'dan **elle** yükle. Google Play API ile ilk yükleme yapılamaz; `eas submit` ancak uygulama bir kez elle yüklendikten sonra çalışır.
  - Sürüm notu yaz, incelemeye gönder.
- [ ] İnceleme geçince test katılım bağlantısını test kullanıcılarına gönder. Kullanıcı bağlantıdan katılır ve uygulamayı Play'den kurar.
- [ ] Sonraki sürümler için (isteğe bağlı): Google Cloud'da servis hesabı aç, anahtarını EAS'a yükle (repoya değil), Console → Kullanıcılar ve izinler'den yetki ver. Sonra `pnpm dlx eas-cli submit --platform android --profile production` kullanılabilir (`eas.json` → `submit.production.android.track`; kapalı test için `alpha` ya da kanal adı).

## 6. Kapalı test sürerken OTA (expo-updates)

- **Politika:** Google Play Geliştirici Programı Politikaları → "Cihaz ve Ağ Kötüye Kullanımı" (Device and Network Abuse): https://support.google.com/googleplay/android-developer/answer/9888379
  - Play'den dağıtılan bir uygulama kendini Play'in güncelleme mekanizması dışında değiştiremez, güncelleyemez; Play dışından çalıştırılabilir kod (dex, JAR, .so) indiremez.
  - Kural, bir sanal makinede ya da yorumlayıcıda çalışan ve Android API'lerine dolaylı erişen koda (ör. JavaScript) uygulanmaz.
  - Çalışma anında yüklenen yorumlanan kodun Play politikalarını ihlal etmemesi gerekir.
  - Bu metin bu oturumda yeniden okunamadı (`support.google.com` ağ politikasınca engelli). Yukarıdaki özet politikanın bilinen hâlinden. Yayından önce proje sahibi güncel metni kontrol etmeli.
- **Uygulamaya etkisi:**
  - `eas update` yalnızca JS paketi ve varlık (asset) gönderir; native kod göndermez. Bu yüzden istisna kapsamındadır. Expo da EAS Update'in mağaza kurallarıyla uyumlu kullanımını bu çerçevede anlatır: https://docs.expo.dev/eas-update/introduction/ (bu oturumda erişilemedi).
  - `runtimeVersion` native parmak izi olduğu için native değişiklik içeren bir güncelleme zaten eski build'lere gitmez; yeni native kod her zaman Play'e yüklenen yeni bir AAB ile gelir.
  - **Sınır:** OTA, incelemeden geçmiş uygulamanın amacını ya da Veri güvenliği formunda beyan edilmemiş veri toplamayı değiştirmek için kullanılmaz. v2 adımları yeni veri türleri getiriyor (profil fotoğrafı, DM). Bu adımlar OTA ile gitse bile **önce** Veri güvenliği formu ve gizlilik politikası güncellenir.
- Kapalı test kanalı `production` kanalını dinleyen production build'i kullanır: `eas update --channel production`. Test APK'ları `preview` kanalını dinler.

## 7. Durum

| Adım                                       | Durum                                 |
| ------------------------------------------ | ------------------------------------- |
| AAB profili                                | Hazır (`eas.json`)                    |
| Gizlilik politikası URL'i, web silme URL'i | Açık (Issue #2)                       |
| İnceleme erişimi (mekan şartı)             | Karar gerekli (§3)                    |
| Veri güvenliği, IARC, hedef kitle          | Taslak hazır; Console'da doldurulacak |
| Test kullanıcıları (12+)                   | Proje sahibi                          |
