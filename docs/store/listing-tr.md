# Mağaza metinleri (TASLAK)

Uygulama adı: **Kabuk** (`APP_NAME`, `supabase/functions/_shared/pure/brand.ts`).

## Başlık (Play, en fazla 30 karakter)

Kabuk: Masadan Masaya Oyun

## Kısa açıklama (Play, en fazla 80 karakter)

Mekandaki masalarla Tabu ve sohbet kartları oyna, istersen tanış.

## Alt başlık (App Store, en fazla 30 karakter)

Mekanda masalarla oyna

## Uzun açıklama

Kafede, nargile kafede ya da barda misin? Kabuk ile aynı mekandaki diğer masalarla oyun oynayabilir ve sohbet edebilirsin.

- **Mekana giriş yap:** Konumun yalnızca o an, bir kez kullanılır ve saklanmaz. Masan "Mor Baykuş" gibi bir takma ad alır.
- **Oda kur:** Tabu ya da Sohbet kartları. İster yalnızca kendi masanla oyna, ister odanı mekana aç.
- **Katıl:** Mekandaki açık odaları gör, katılmak iste. Masalar birbirini yalnızca takma ad ve kişi sayısıyla görür.
- **Birlikte oyna:** İki masalı Tabu'da bir masa anlatır, diğeri tahmin eder; ortak skor, rekabet yok.
- **İstersen tanış:** Oyun sonunda iki masa da "Evet" derse ekranlarınızda aynı renk ve işaret belirir. Kimin ne dediği hiçbir zaman gösterilmez.

Güvenlik: küfür filtresi, şikayet ve engelleme, uygulama içinden hesap silme. 18 yaş ve üzeri içindir.

## Anahtar kelimeler (App Store, virgülle, en fazla 100 karakter)

tabu,oyun,kafe,sohbet,mekan,arkadaş,masa oyunu,parti,tanışma

## Kategori

Birincil: Sosyal ağ (iOS) / Sosyal (Android). İkincil: Oyunlar → Kelime.

## Yaş derecelendirmesi

18+ (kullanıcılar arası iletişim, gerçek hayatta tanışma). IARC anketinde: kullanıcı etkileşimi var, konum paylaşımı yok (konum saklanmaz, başkalarına gösterilmez), dijital satın alma yok.

## İnceleme notları (App Review / Play)

- Giriş: üretim projesindeki kalıcı inceleme hesabı. Numara ve kod yalnızca Play Console → Uygulama erişimi'nde (App Store için App Review Information'da) durur; repoya yazılmaz. Talimat metni: `docs/store/PLAY_CHECKLIST.md` §3.3.
- Mekan içi akış bir mekanın 300 m içinde çalışır; inceleme için check-in'den sonraki akışı gösteren video verilir (senaryo PLAY_CHECKLIST §3.3). Ret gelirse incelemeye özel istisna ayrı PR'da.
- Kullanıcı içeriği: sohbet ve ipuçları küfür filtresinden geçer; oda menüsünde "Şikayet et" ve "Engelle" var; Ayarlar'da Engellenenler, iletişim ve "Hesabımı sil".

## Veri güvenliği (Play) / Uygulama gizliliği (Apple) özeti

> **v2 taslağı.** Profil, arkadaşlık, DM ve hata raporları eklendi (`docs/SPEC_V2.md`). Play Console'daki form bu tabloya göre doldurulur (adımlar `docs/store/PLAY_CHECKLIST.md`). v2 yayınından önce hukuki kontrolden geçmeli. Başka kullanıcılara kullanıcının kendi isteğiyle gösterilen veriler (profil, DM) Play tanımında "paylaşım" sayılmaz; yine de formda "Toplanıyor" olarak işaretlenir.
>
> **v3 (Kabuk v1):** Görünen ad ve doğum tarihi kayıtta zorunlu; mekan sohbet odası mesajları (24 saat). Form OTA'dan önce güncellenir (`docs/SPEC_V3.md` §3.3).

| Veri                                                                  | Toplanıyor                     | Paylaşılıyor | Amaç                                      | Kimliğe bağlı            |
| --------------------------------------------------------------------- | ------------------------------ | ------------ | ----------------------------------------- | ------------------------ |
| Telefon numarası                                                      | Evet                           | Hayır        | Hesap yönetimi                            | Evet                     |
| Kesin konum (check-in anında)                                         | Evet, anlık işlenir, saklanmaz | Hayır        | Uygulama işlevi                           | Hayır                    |
| Mesajlar (uygulama içi: oda sohbeti, mekan sohbet odası)              | Evet                           | Hayır        | Uygulama işlevi, güvenlik                 | Evet                     |
| Uygulama etkileşimi (analitik)                                        | Evet                           | Hayır        | Analitik                                  | Evet (kullanıcı kimliği) |
| Cihaz kimliği (push token)                                            | Evet                           | Hayır        | Uygulama işlevi                           | Evet                     |
| Ad (görünen ad; zorunlu)                                              | Evet                           | Hayır        | Uygulama işlevi                           | Evet                     |
| Kişisel bilgiler → Diğer (doğum tarihi; zorunlu, kimseye gösterilmez) | Evet                           | Hayır        | Uygulama işlevi, güvenlik (18 yaş sınırı) | Evet                     |
| Fotoğraflar (profil fotoğrafı; isteğe bağlı, konum ve EXIF silinir)   | Evet                           | Hayır        | Uygulama işlevi                           | Evet                     |
| Diğer kullanıcı içeriği (biyografi)                                   | Evet                           | Hayır        | Uygulama işlevi                           | Evet                     |
| Uygulama içi mesajlar (arkadaşlar arası DM)                           | Evet                           | Hayır        | Uygulama işlevi, güvenlik                 | Evet                     |
| Diğer uygulama etkinlikleri (oyun geçmişi, arkadaşlık)                | Evet                           | Hayır        | Uygulama işlevi                           | Evet                     |
| Kilitlenme günlükleri ve teşhis (Sentry)                              | Evet                           | Hayır        | Analitik (hata giderme)                   | Evet (kullanıcı kimliği) |

- Zorunlu veriler: telefon numarası, görünen ad ve doğum tarihi. Fotoğraf, biyografi ve arkadaşlık isteğe bağlıdır.
- 18 yaş altı beyanda hesap o anda silinir, hiçbir veri saklanmaz.
- Veriler aktarımda şifrelenir. Kullanıcı verilerinin silinmesini isteyebilir (uygulama içi ve `https://wazzupdevs.github.io/Masa/hesap-silme.html`).
- İzleme (tracking) yok; reklam yok.

## Ekran görüntüleri (hazırlanacak)

1. Yakındaki mekanlar 2. Mekan ekranı ve lobi 3. Katılma isteği 4. İki masalı Tabu 5. Sohbet kartı 6. "Tanışalım mı?" sinyali
