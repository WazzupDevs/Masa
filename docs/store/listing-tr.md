# Mağaza metinleri (TASLAK)

Uygulama adı: **skall** (`APP_NAME`, `supabase/functions/_shared/pure/brand.ts`).

## Başlık (Play, en fazla 30 karakter)

skall: Masadan Masaya Oyun

## Kısa açıklama (Play, en fazla 80 karakter)

Mekandaki masalarla tek masada oyna, istersen arkadaş ol.

## Alt başlık (App Store, en fazla 30 karakter)

Mekanda masalarla oyna

## Uzun açıklama

Kafede, nargile kafede ya da barda misin? skall ile aynı mekandaki diğer masalarla oyun oynayabilir ve sohbet edebilirsin.

- **Mekana giriş yap:** Konumun yalnızca o an, bir kez kullanılır ve saklanmaz. Masan "Mor Baykuş" gibi bir takma ad alır.
- **Masanı lobiye aç:** Mekandaki masalar seni lobide takma adın ve kişi sayınla görür. İstersen yalnızca kendi masanla da oynarsın.
- **Katıl:** Lobideki bir masaya katılmak iste. Kabul edilirsen o masanın yanına gidersin.
- **Tek masada oyna:** Sesli Tabu, Sahtekar, İbre, Harf Kapmaca, Şarkıda Geçsin ve sohbet kartları; masadaki herkes kendi telefonuyla.
- **İstersen arkadaş ol:** Masa bitince karşı masadan biriyle ikiniz de "Arkadaş ekle"ye basarsanız arkadaş olursunuz. Yalnızca sen basarsan hiçbir şey olmaz ve o bunu görmez.

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
- Kullanıcı içeriği: sohbet ve ipuçları küfür filtresinden geçer; masada Masadakiler'den "Şikayet et" ve "Engelle" var; Ayarlar'da Engellenenler, iletişim ve "Hesabımı sil".

## Veri güvenliği (Play) / Uygulama gizliliği (Apple) özeti

> **v2 taslağı.** Profil, arkadaşlık, DM ve hata raporları eklendi (`docs/SPEC_V2.md`). Play Console'daki form bu tabloya göre doldurulur (adımlar `docs/store/PLAY_CHECKLIST.md`). v2 yayınından önce hukuki kontrolden geçmeli. Başka kullanıcılara kullanıcının kendi isteğiyle gösterilen veriler (profil, DM) Play tanımında "paylaşım" sayılmaz; yine de formda "Toplanıyor" olarak işaretlenir.
>
> **v3 (Kabuk v1):** Görünen ad ve doğum tarihi kayıtta zorunlu; mekan sohbet odası mesajları (24 saat). Form OTA'dan önce güncellenir (`docs/SPEC_V3.md` §3.3).
>
> **Faz 3 (`docs/SPEC_V3.md` §23.L):** Cinsiyet kayıtta zorunlu (adım 23.2). Form, uygulamanın cinsiyeti sormaya başladığı OTA'dan (23.2'nin istemci PR'ı) önce güncellenir.

| Veri                                                                                | Toplanıyor                     | Paylaşılıyor | Amaç                                               | Kimliğe bağlı            |
| ----------------------------------------------------------------------------------- | ------------------------------ | ------------ | -------------------------------------------------- | ------------------------ |
| Telefon numarası                                                                    | Evet                           | Hayır        | Hesap yönetimi                                     | Evet                     |
| Kesin konum (check-in anında)                                                       | Evet, anlık işlenir, saklanmaz | Hayır        | Uygulama işlevi                                    | Hayır                    |
| Mesajlar (uygulama içi: masa sohbeti, mekan sohbet odası)                           | Evet                           | Hayır        | Uygulama işlevi, güvenlik                          | Evet                     |
| Uygulama etkileşimi (analitik)                                                      | Evet                           | Hayır        | Analitik                                           | Evet (kullanıcı kimliği) |
| Cihaz kimliği (push token)                                                          | Evet                           | Hayır        | Uygulama işlevi                                    | Evet                     |
| Ad (görünen ad; zorunlu)                                                            | Evet                           | Hayır        | Uygulama işlevi                                    | Evet                     |
| Kişisel bilgiler → Diğer (doğum tarihi; zorunlu, kimseye gösterilmez)               | Evet                           | Hayır        | Uygulama işlevi, güvenlik (18 yaş sınırı)          | Evet                     |
| Kişisel bilgiler → Diğer (cinsiyet; zorunlu, kimseye gösterilmez, analitiğe gitmez) | Evet                           | Hayır        | Uygulama işlevi (oyun akışındaki anonimlik kuralı) | Evet                     |
| Fotoğraflar (profil fotoğrafı; isteğe bağlı, konum ve EXIF silinir)                 | Evet                           | Hayır        | Uygulama işlevi                                    | Evet                     |
| Diğer kullanıcı içeriği (biyografi)                                                 | Evet                           | Hayır        | Uygulama işlevi                                    | Evet                     |
| Uygulama içi mesajlar (arkadaşlar arası DM)                                         | Evet                           | Hayır        | Uygulama işlevi, güvenlik                          | Evet                     |
| Diğer uygulama etkinlikleri (oyun geçmişi, arkadaşlık)                              | Evet                           | Hayır        | Uygulama işlevi                                    | Evet                     |
| Kilitlenme günlükleri ve teşhis (Sentry)                                            | Evet                           | Hayır        | Analitik (hata giderme)                            | Evet (kullanıcı kimliği) |

- Zorunlu veriler: telefon numarası, görünen ad, doğum tarihi ve cinsiyet (adım 23.2'nin istemci PR'ından sonra). Fotoğraf, biyografi ve arkadaşlık isteğe bağlıdır.
- 18 yaş altı beyanda hesap o anda silinir, hiçbir veri saklanmaz.
- Veriler aktarımda şifrelenir. Kullanıcı verilerinin silinmesini isteyebilir (uygulama içi ve `https://wazzupdevs.github.io/Kabuk/hesap-silme.html`).
- İzleme (tracking) yok; reklam yok.

## Ekran görüntüleri (hazırlanacak)

1. Mekanları keşfet 2. Mekan ekranı ve lobi 3. Katılma isteği 4. Tek masada Tabu 5. Masa sonunda "Arkadaş oldunuz" 6. Mesajlaşma (seçim ve başlıklar `docs/store/screenshots.json`)
