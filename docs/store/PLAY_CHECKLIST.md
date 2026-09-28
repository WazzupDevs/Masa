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

Herkese açık sayfalar GitHub Pages'te (CLAUDE.md → "Yasal sayfalar"): `https://wazzupdevs.github.io/Masa/`. Sayfalar taslaktır ve üstlerinde "Taslak, hukuki kontrol bekliyor" notu vardır; hukuki kontrol bitmeden Console'a girilmez.

### 3.1 Gizlilik politikası

- [ ] URL: `https://wazzupdevs.github.io/Masa/gizlilik-politikasi.html`. Aynı URL EAS `production` ortamında `EXPO_PUBLIC_PRIVACY_URL` olur (uygulama içi bağlantı).

### 3.2 Hesap silme (Play şartı)

Kullanıcı hesabı olan her uygulama için iki şey gerekir: uygulama içinden silme ve **uygulamayı kurmadan kullanılabilen bir web bağlantısı**. Web sayfası uygulamanın adını anmalı, silme adımlarını anlatmalı, hangi verinin silinip hangisinin ne kadar saklandığını söylemelidir.

- [ ] Uygulama içi yol: Profil → Ayarlar (dişli) → Hesabımı sil → Sil. Hemen siler (`account/delete`: fotoğraflar, hesap ve bağlı bütün satırlar, PostHog kişi kaydı).
- [ ] Web bağlantısı: `https://wazzupdevs.github.io/Masa/hesap-silme.html`. Uygulama içi adımlar, e-postayla talep ([e-posta], en geç 30 gün), silinen veriler, saklananlar (şikayet kaydı 30 gün, banlanan numaranın özeti, hata kayıtları, yedekler).
- [ ] Console → Veri güvenliği → "Hesap silme" alanına bu URL girilir.
- **Açık iş:** e-postayla gelen talebi işlemek için ban'sız bir yönetici komutu yok (`admin:ban` banlar). Şimdilik talep, kullanıcı panelde (Authentication → Users) numarayla bulunup silinerek karşılanır; bu yol profil fotoğrafını ve PostHog kaydını silmez. `pnpm admin:delete <userId>` önerisi PR'da.

### 3.3 Uygulama erişimi (inceleme ekibi için giriş)

- [ ] "Tüm işlevler ya da bazıları özel erişim gerektiriyor" seçilir. Talimat alanına (Türkçe ve İngilizce):
  1. Telefon numarası: [inceleme numarası], doğrulama kodu: [kod]. SMS gönderilmez; kod sabittir.
  2. "Başlamadan önce" ekranında üç onayı işaretleyip "Onayla ve devam et".
  3. Keşfet → [inceleme mekanı] → "Buraya giriş yap" → konum izni → kişi sayısı → "Masayı aç".
  4. Oda kurmak için "Oda kur"; ikinci masa için [karar: ikinci test hesabı ya da karşı masa botu].
- **Karar gerekli (1): inceleme numarası.** Üretim projesinde kalıcı test numarası yoktur. İnceleme için panelde yalnızca inceleme süresince geçerli, tahmin edilemez kodlu tek bir numara (Test OTPs Valid Until ile) eklenmesi öneriliyor; inceleme bitince silinir.
- **Karar gerekli (2): konum.** Check-in, mekanın 300 m içinde olmayı ister; inceleyen kişi İstanbul'da değildir. Seçenekler: inceleme hesabına özel bir mekan (koordinatı inceleme ekibinin konumu bilinmediği için işe yaramaz), check-in'i gösteren bir video bağlantısı, ya da incelemeye özel bir istisna (kod değişikliği ister, kapsam dışı).

### 3.4 Reklamlar

- [ ] Uygulama reklam içermiyor: **Hayır**.

### 3.5 İçerik derecelendirmesi (IARC anketi)

- [ ] E-posta: [iletişim e-postası]. Kategori: **Sosyal ağ, forum ya da kullanıcı içeriği paylaşımı** (Social).
- [ ] Yanıtlar:

| Soru                                                                 | Yanıt    | Not                                                                         |
| -------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| Şiddet, kan, korku                                                   | Hayır    |                                                                             |
| Cinsel içerik, çıplaklık                                             | Hayır    | Kullanıcı içeriği filtrelenir ve şikayet edilebilir                         |
| Küfür, kaba dil (uygulamanın kendi içeriği)                          | Hayır    | Kartlar ve metinler temiz; kullanıcı mesajları küfür filtresinden geçer     |
| Uyuşturucu, alkol, tütün                                             | Hayır    | Doğrula: mekan listesinde nargile kafeleri adıyla yer alır, ürün tanıtılmaz |
| Kumar, şans oyunu, gerçek para                                       | Hayır    |                                                                             |
| Kullanıcılar birbiriyle iletişim kurabilir ya da içerik paylaşabilir | **Evet** | Oda sohbeti, DM, profil (ad, fotoğraf, biyografi)                           |
| Kullanıcının konumu diğer kullanıcılarla paylaşılır                  | Hayır    | Konum saklanmaz, kimseye gösterilmez                                        |
| Dijital ürün satın alma                                              | Hayır    |                                                                             |
| Kişisel bilgilerin üçüncü kişilerle paylaşımı                        | Hayır    | Hizmet sağlayıcılar paylaşım sayılmaz                                       |

- Beklenen sonuç: kullanıcı etkileşimi etiketiyle düşük yaş derecesi. Uygulamanın kendi 18+ şartı ayrıca hedef kitleyle ve uygulama içi beyanla uygulanır.

### 3.6 Hedef kitle ve içerik

- [ ] Hedef yaş grupları: yalnızca **18 ve üzeri**. Uygulama ilk açılışta 18 yaş beyanı ister.
- [ ] Uygulama çocukların ilgisini çekebilir mi: **Hayır**. Aileler programı: yok.

### 3.7 Veri güvenliği formu (v2 veri türleri)

Tanım: cihazdan çıkan her veri "toplanan" sayılır; hizmet sağlayıcıya (Supabase, Twilio, Expo/FCM, PostHog, Sentry) aktarım "paylaşım" sayılmaz. Tablonun kaynağı `docs/store/listing-tr.md` → "Veri güvenliği".

- [ ] Genel sorular:
  - Uygulama kullanıcı verisi topluyor ya da paylaşıyor mu: **Evet**.
  - Veriler aktarımda şifreleniyor mu: **Evet** (HTTPS/TLS).
  - Kullanıcı verilerinin silinmesini isteyebilir mi: **Evet** (uygulama içi ve §3.2'deki web bağlantısı).
- [ ] Veri türleri (hepsinde "Paylaşılıyor: Hayır"):

| Play kategorisi → tür                                             | Neyimiz                                               | Zorunlu mu            | Anlık işlenip atılıyor mu | Amaç                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------- | --------------------- | ------------------------- | ------------------------------------------------------------ |
| Konum → Kesin konum                                               | Check-in anındaki koordinat                           | Evet (check-in)       | **Evet**, saklanmaz       | Uygulama işlevi                                              |
| Kişisel bilgiler → Telefon numarası                               | Giriş numarası                                        | Evet                  | Hayır                     | Hesap yönetimi, uygulama işlevi, dolandırıcılık önleme (ban) |
| Kişisel bilgiler → Ad                                             | Görünen ad                                            | Hayır (isteğe bağlı)  | Hayır                     | Uygulama işlevi                                              |
| Kişisel bilgiler → Kullanıcı kimlikleri                           | Hesap kimliği (analitik ve hata kayıtları)            | Evet                  | Hayır                     | Uygulama işlevi, analitik                                    |
| Fotoğraflar ve videolar → Fotoğraflar                             | Profil fotoğrafı (metadata silinir)                   | Hayır                 | Hayır                     | Uygulama işlevi                                              |
| Mesajlar → Diğer uygulama içi mesajlar                            | Oda sohbeti, arkadaşlar arası DM                      | Hayır                 | Hayır                     | Uygulama işlevi, güvenlik (şikayet kopyası)                  |
| Uygulama etkinliği → Uygulama etkileşimleri                       | Analitik olayları (PostHog)                           | Evet                  | Hayır                     | Analitik                                                     |
| Uygulama etkinliği → Diğer kullanıcı içeriği                      | Biyografi                                             | Hayır                 | Hayır                     | Uygulama işlevi                                              |
| Uygulama etkinliği → Diğer işlemler                               | Oyun geçmişi, arkadaşlık, tanışma cevabı              | Evet                  | Hayır                     | Uygulama işlevi                                              |
| Uygulama bilgileri ve performansı → Kilitlenme günlükleri, Teşhis | Sentry hata raporları (telefon, konum, metin silinir) | Evet                  | Hayır                     | Analitik (hata giderme)                                      |
| Cihaz ya da diğer kimlikler                                       | Push token                                            | Hayır (bildirim izni) | Hayır                     | Uygulama işlevi                                              |

- **Düzeltme:** önceki taslakta konum "toplanmıyor" yazıyordu. Play tanımında cihazdan sunucuya giden koordinat toplanmış sayılır; doğru yanıt "Toplanıyor, anlık işleniyor (ephemeral), saklanmıyor"dur. `listing-tr.md` de düzeltildi.
- Takip (tracking) ve reklam: yok.

### 3.8 Diğer beyanlar

- [ ] Haber uygulaması, COVID-19, devlet, finans, sağlık: **Hayır**.

## 4. Mağaza girişi (Console → Büyüme → Mağaza varlığı)

- [ ] Kısa ve uzun açıklama: `docs/store/listing-tr.md`. v2 özellikleri (Keşfet, profil, arkadaşlar, sesli Tabu) eklenince güncellenir.
- [ ] Uygulama simgesi 512×512, öne çıkan grafik 1024×500.
- [ ] Telefon ekran görüntüleri: `pnpm store:screenshots <E2E ekran görüntüsü klasörü>` → `dist/store-screenshots/phone-01.png` … (1080×1920, 9:16; seçim ve başlıklar `docs/store/screenshots.json`). Play en az 2, öne çıkarılmak için en az 4 ister; 6 üretilir. Tasarım yönü ve uygulama adı seçilince yeniden üretilir. E2E emülatörü 320×640 çektiği için görüntüler büyütülmüş ve yumuşak; mağaza için yüksek çözünürlüklü bir emülatörle çekilmeli.
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
  - `runtimeVersion` `app.json`'daki `version`'dır: native değişiklik içeren her sürümde `version` artırılır (CLAUDE.md, PR şablonu), bu yüzden o değişikliğe dayanan bir güncelleme eski build'lere gitmez; yeni native kod her zaman Play'e yüklenen yeni bir AAB ile gelir.
  - **Sınır:** OTA, incelemeden geçmiş uygulamanın amacını ya da Veri güvenliği formunda beyan edilmemiş veri toplamayı değiştirmek için kullanılmaz. v2 adımları yeni veri türleri getiriyor (profil fotoğrafı, DM). Bu adımlar OTA ile gitse bile **önce** Veri güvenliği formu ve gizlilik politikası güncellenir.
- Kapalı test kanalı `production` kanalını dinleyen production build'i kullanır: `eas update --channel production`. Test APK'ları `preview` kanalını dinler.

## 7. Durum

| Adım                                     | Durum                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| AAB profili                              | Hazır (`eas.json`)                                                         |
| Gizlilik politikası ve web silme sayfası | Taslak sayfalar hazır (GitHub Pages); hukuki kontrol ve [e-posta] bekliyor |
| E-postayla silme talebini işleme         | Açık (§3.2, `admin:delete` önerisi)                                        |
| İnceleme erişimi                         | Karar gerekli: inceleme numarası ve konum (§3.3)                           |
| Veri güvenliği, IARC, hedef kitle        | Yanıtlar hazır (§3.5–3.7); Console'da doldurulacak                         |
| Telefon ekran görüntüleri                | Script hazır; tasarım ve ad sonrası yüksek çözünürlükle yeniden            |
| Test kullanıcıları (12+)                 | Proje sahibi                                                               |
