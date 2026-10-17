# Saha testi: Faz 3 (önce buluş, sonra oyna), 3–4 telefonla uçtan uca

Faz 3'ün akışı (`docs/SPEC_V3.md` §23): masa lobiye açılır, başka bir masa katılmak ister, **kabul buluşmadır**. Katılan masa ev sahibi masanın yanına gider, iki masa tek masada birlikte oynar. Masa sonunda karşı taraftaki her kişi için ayrı, sessiz bir **"Arkadaş ekle"** vardır. Tanışma penceresi ("Tanışalım mı?") yoktur.

Bu test **3 ya da 4 telefonla** yapılır. Tek sıra:

- **Masa 1:** **A** lider (kayıtta **Kadın**), **C** aynı masada takım arkadaşı (kayıtta **Belirtmek istemiyorum**).
- **Masa 2:** **B** lider (kayıtta **Erkek**), **D** aynı masada takım arkadaşı (kayıtta **Kadın**).
- Dört telefon yoksa **D**'nin adımları atlanır; üç telefonla da her kural görülür.
- İki masa mekanda **birbirinden uzak** oturur (farklı salon ya da en az birkaç masa ötede). Masalar birbirini önceden tanımaz gibi davranır: bulma gözlemi (§23.P-2) buna bağlı.
- Sesli Tabu'daki gecikme ölçümü (T4) için kamera ya da boşta bir telefon gerekir.

Tamamı yaklaşık 2,5 saat; T5'ten sonra ve E2'den sonra mola verilebilir. Her adım **P0** ya da **P1** olarak işaretli: süre yetmezse önce aşağıdaki P0 sırası yapılır, P1'ler kalan sürede tam sıradaki yerlerinde.

Adım adları: **G** giriş ve kayıt, **V** Keşfet, check-in, profil, **L** lobi, kabul ve buluşma, **T** oyunlar, **E** masa sonu ve oyun geçmişi, **F** arkadaşlar, mesajlar ve bildirimler, **M** mekan sohbeti, **S** güvenlik ve kalan akışlar, **Y** oda yükü ölçümü. Hata satırında bu adları kullan.

## P0 sırası (kritik yol, yaklaşık 1,5 saat)

Her adım, atlanan P1'lere ihtiyaç duymadan yapılabilir.

1. **Test öncesi**: listenin tamamı (evde).
2. **G1.** Giriş ve kayıt, cinsiyet dahil, A–D (~8 dk).
3. **V4.** Check-in ve masa kartı, A–D (~6 dk).
4. **V5.** Profilde ad ve yaş; B ve C'ye fotoğraf (~4 dk).
5. **L1.** "Masanı lobiye aç" (A) ve "Bu masadayım" (C) (~5 dk).
6. **L2.** B'nin masası lobide, D "Bu masadayım" (~5 dk).
7. **L3.** B, A'nın masasına "Katıl"; istek kartında profil; kabul (~4 dk).
8. **L4.** Kabul buluşmadır: durum satırları ve **bulma gözlemi** (~5–10 dk).
9. **L5.** Birleşik masa: Masadakiler şeridi, iki sekme, okunmamış noktası (~4 dk).
10. **T1–T5.** Sesli Tabu takımlarla, T4'teki gecikme ölçümü dahil (~15 dk).
11. **E1.** Masa sonu: çift başına "Arkadaş ekle" (~5 dk).
12. **F3.** Mesajlaşma (~4 dk).
13. **F4.** Mesaj bildirimi; FCM'li build yoksa atlanır ve not edilir (~4 dk).
14. **E2.** Oyun geçmişinden "Arkadaş ekle" (~5 dk).
15. **V8.** Beyaz ekran: diğer masa bitirir, izlenen telefon masa sonuna geçer (~6 dk).
16. **L6.** Kabulden sonra vazgeçme (~5 dk).
17. **F7.** Geçmişten engelleme ve engeli kaldırma (~5 dk).
18. **T7.** İş birliği modu: tek kişilik taraf (~6 dk).
19. **M1.** Mekan sohbeti: ilk mesajda tek seçim, erkek ve belirtmeyen de anonim yazabilir (~8 dk).
20. **Bulma gözlemi özeti** (~5 dk).

## Otomatik testler (e2e)

P0'ın telefonsuz yapılabilen kısmı CI'da koşar (PR'da `e2e` etiketiyle, elle ve her gece main'de): `e2e/maestro/p0.yaml`, Android emülatöründe, yerel stack'e karşı, açık ve koyu temada. Karşı masayı bot oynar (`scripts/e2e/bot-table.ts`); takım akışında ikinci bir bot masası da vardır. Sahada telefon eksikse bot dev projesinde karşı masa olarak oynayabilir (CLAUDE.md → "Karşı masa"). Sıra tablosundaki **Otomatik** kolonu ve adımlardaki "Otomatik:" notu neyin kapsandığını söyler.

Otomatiklenmeyen ve sahada elle kalanlar:

- **Bulma:** kabulden sonra katılan masanın ev sahibi masayı gerçekten bulması (L4). Bu testin asıl sorusu budur.
- **Gerçek GPS:** emülatör konumu kesin; kapalı mekandaki sapma ve doğruluk yalnızca sahada görülür (V3, V4).
- **Aynı masada oynama hissi:** kartın saklanması, sesli anlatma, telefonların cepte durması (T1–T5).
- **Kilitli telefonda push:** FCM, bildirim metni, bildirime dokunma (F4, F6).
- **Gecikme hissi:** T4'teki ölçüm ve tur akışının doğallığı.

Otomatik bir adım yeşilse sahada yine yapılır, ama önce elle kalan kısmına bakılır.

## Sıra

| #   | Öncelik | Adım                                      | Otomatik | Telefonlar  | Not                                       |
| --- | ------- | ----------------------------------------- | -------- | ----------- | ----------------------------------------- |
| 1   | P0      | Test öncesi                               | —        | A–D         | Evde, bir kez                             |
| 2   | P0      | G1. Giriş ve kayıt, cinsiyet              | Evet     | A–D         | Cinsiyetler yukarıdaki dağılımla          |
| 2b  | P1      | G2. 18 yaş altı kayıt                     | Evet     | A           | Kullanılmamış bir test numarası           |
| 2c  | P1      | G3. Eski hesapta cinsiyet sorusu          | Hayır    | —           | Yalnızca 23.2'den önce açılmış hesap      |
| 3   | P1      | V1. Açılış ve sekmeler                    | Hayır    | A           |                                           |
| 4   | P1      | V2. Keşfet                                | Hayır    | A           |                                           |
| 5   | P1      | V3. Yarıçap dışından check-in             | Kısmen   | A           | Mekandan en az 400 m uzakta               |
| 6   | P0      | V4. Check-in ve masa kartı                | Evet     | A–D         | Mekanda                                   |
| 7   | P0      | V5. Profil                                | Kısmen   | A–D         | B ve C'ye fotoğraf                        |
| 8   | P1      | V6. Konum etiketli fotoğraf               | Hayır    | B           | V5'teki fotoğraf bu olabilir              |
| 9   | P0      | L1. "Masanı lobiye aç", "Bu masadayım"    | Kısmen   | A, C        |                                           |
| 10  | P0      | L2. İkinci masa lobide, "Bu masadayım"    | Kısmen   | B, D        |                                           |
| 11  | P0      | L3. "Katıl", istek kartında profil, kabul | Kısmen   | A–D         |                                           |
| 12  | P0      | L4. Kabul buluşmadır, bulma gözlemi       | Kısmen   | A–D         | §23.P-2                                   |
| 13  | P0      | L5. Birleşik masa                         | Kısmen   | A–D         | T bu masada sürer                         |
| 14  | P0      | T1–T5. Sesli Tabu takımlarla              | Kısmen   | A–D, kamera | ~15 dk; masa 3 dakikayı geçer             |
| 15  | P1      | T6. İbre ve Sahtekar takımlarla           | Hayır    | A–D         |                                           |
| 16  | P0      | E1. Masa sonu, çift başına "Arkadaş ekle" | Evet     | A–D         |                                           |
| 17  | P1      | F2. Arkadaşın profili                     | Hayır    | A, B        |                                           |
| 18  | P0      | F3. Mesajlaşma                            | Kısmen   | A, B        |                                           |
| 19  | P0      | F4. Mesaj bildirimi                       | Hayır    | A, B        | FCM'li build gerekir                      |
| 20  | P0      | E2. Oyun geçmişinden "Arkadaş ekle"       | Hayır    | C, D        | C ve D, E1'de basmadan çıkar              |
| 21  | P1      | S1. Masa sohbeti ve şikayet               | Hayır    | A, B        |                                           |
| 22  | P1      | S2. Liderlik devri                        | Kısmen   | A–D         |                                           |
| 23  | P0      | V8. Beyaz ekran                           | Evet     | A, B        |                                           |
| 24  | P1      | S3. İstekte red ve zaman aşımı            | Hayır    | A, B, D     |                                           |
| 25  | P0      | L6. Kabulden sonra vazgeçme               | Hayır    | A, B        |                                           |
| 26  | P1      | F5. Arkadaşlıktan çıkarma                 | Hayır    | A, B        |                                           |
| 27  | P1      | F6. Arkadaşlık isteği ve red              | Hayır    | A, B        | Eski kayıtta "İstek gönder" yoksa atlanır |
| 28  | P0      | F7. Geçmişten engelleme                   | Kısmen   | A, B        |                                           |
| 29  | P0      | T7. İş birliği modu                       | Kısmen   | A, B        | B tek kişilik masayla                     |
| 30  | P1      | S4. Masada engelleme                      | Hayır    | A–D         |                                           |
| 31  | P1      | S5. Masanla oyna                          | Evet     | A           |                                           |
| 32  | P1      | S6. Hareketsizlik                         | Hayır    | A, B        | 30 dk bekleme; başka adımlarla birlikte   |
| 33  | P0      | M1. Mekan sohbeti                         | Kısmen   | A, B, C     |                                           |
| 34  | P1      | M2. Mekan sohbetinde şikayet ve engel     | Hayır    | A, B        |                                           |
| 35  | P1      | M3. Mekandan çıkınca erişim biter         | Hayır    | A           |                                           |
| 36  | P0      | Bulma gözlemi özeti                       | —        | —           | §23.P-2 kararına girer                    |
| 37  | P1      | Y1. Oda yükü ölçümü                       | Hayır    | —           | `docs/ROOM_LOAD.md`                       |
| 38  | P1      | V11. Kapanış                              | Hayır    | A–D         |                                           |

## Uygulama önde kalmalı

Katılma isteği, kabul, sohbet ve oyun olayları **uygulama önde ve ekran açıkken** Realtime bağlantısıyla gelir. Push yalnızca APK `google-services.json` ile alındıysa çalışır ve yalnızca F4 ile F6'da bilerek denenir.

- Bütün telefonlarda ekran zaman aşımını uzun tut (ör. 10 dk), pil tasarrufunu kapat.
- Katılma isteği penceresi 60 saniyedir. İstek beklenirken ev sahibinin lideri uygulamayı arka plana almasın.
- Birleşik masada telefonların cepte durması beklenir: oyun aralarında masa hareketsizlikle **kapanmaz** (§23.G). Cebe koyup çıkarınca masa ekranı ve sohbet yerinde olmalı.
- Bir olay gelmediyse önce telefonların önde olup olmadığını not et, sonra uygulamayı kapatıp açarak tekrar dene.

## Test öncesi (evde, bir kez)

- [ ] Dev projesi main ile güncel. main'e birleşen her PR `deploy-dev` ile dev'e kendiliğinden gider (CLAUDE.md → "main'den dev projesine yayın" → "Otomatik yayın"); son `deploy-dev` koşusu yeşil.
- [ ] `pnpm supabase functions list`: **17 fonksiyon**, hepsi `ACTIVE`, listede `reveal` **yok** (23.4a'dan sonra elle silinir; CLAUDE.md → "main'den dev projesine yayın" adım 6).
- [ ] Panel → Realtime → Settings → **Allow public access kapalı**.
- [ ] Dört numara test numarası olarak tanımlı ve "Valid Until" test gününden sonra (CLAUDE.md → "Barındırılan projede SMS'siz giriş"). Kodlar repoda değil.
- [ ] `content/venues-test.json` içinde test mekanının koordinatı var, seed edildi (CLAUDE.md → "Saha testi mekanı"). Noktaları olan mekanda iki masa **aynı noktayı** seçmeli: yalnızca aynı noktadaki masalar birlikte oynar.
- [ ] Dört telefonda `preview` APK'sı kurulu ve son OTA gelmiş: uygulamayı iki kez aç-kapat; mekan ekranında masa kartında **"Lobide değil"** ve birleşik masada **"Oyun Seç" / "Masa Sohbeti"** sekmeleri görünüyorsa 23.3 gelmiştir. APK'nın `google-services.json` ile alınıp alınmadığını not et (F4, F6).
- [ ] Hesaplar yeni (G1'de kayıt olunacak). Eski bir hesap kullanılacaksa G3'e bak.
- [ ] Planlı etkinlik (geliştirici makinesinde, `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` ortamda; V2 için): `pnpm admin:event add test/<ref> "Masa gecesi" "<bugün, 1 saat sonra>"`, sonra `pnpm admin:event list`.
- [ ] Telefonlarda konum açık, **tarih/saat otomatik** (geri sayımlar sunucu saatine göre), mobil veri ya da Wi-Fi var.
- [ ] B'nin telefonunda kamera uygulamasında **konum etiketi açık** (V6).
- [ ] T4 için kamera ya da boşta bir telefon, mümkünse 60 fps video.
- [ ] Bulma gözlemi tablosu (aşağıda) kağıtta ya da not uygulamasında hazır; saati saniyesiyle gösteren bir saat.

## Hata olursa ne not edilir

Her hata için tek satır, sonra ekran görüntüsü:

```
[saat:dakika:saniye] [A/B/C/D] [adım no] Ekranda yazan: "…" | Beklenen: … | Diğer telefonlar o an ne gösteriyordu: … | Uygulama öndeydi mi: evet/hayır
```

- Saat saniyesiyle önemli: Supabase panelindeki loglarla (Edge Functions → Logs; Logs Explorer) bu saatle eşleştirilir.
- Hata mesajı Türkçe bir cümleyse aynen yaz (ör. "Masa şu an müsait değil."). Her mesaj sunucudaki tek bir hata koduna karşılık gelir.
- Adım takılırsa uygulamayı kapatıp açmayı dene ve açılınca ne gördüğünü de yaz.
- Takılan adımı atlayıp devam etmek mümkünse devam et; hangi adımların atlandığını not et.

Her adımın sonunda ✅ / ❌ işaretle.

## Bulma gözlemi (§23.P-2)

Açık karar: kabul anındaki iki satır ("Kabul edildi, X masasının yanına git" ve "Y geliyor, N kişi") kalabalık bir mekanda masaların birbirini bulmasına yetiyor mu? Yetmezse eski renk-emoji ekranına benzer bir **bulma yardımı** geri gelebilir. Karar bu testin notlarıyla verilir.

Testteki **her kabulde** (L4, V8, L6, T7, S4; mümkünse farklı salonlarda ve farklı kalabalıkta) bir satır doldur. Katılan masanın bir telefonu tutar:

| #   | Adım | Kabul saati | Masaya varış saati | Süre (dk) | Kaç kez birine sormak gerekti | Kalabalık (az / orta / çok) | Masalar arası mesafe | Ne işe yaradı / ne eksikti |
| --- | ---- | ----------- | ------------------ | --------- | ----------------------------- | --------------------------- | -------------------- | -------------------------- |
| 1   | L4   |             |                    |           |                               |                             |                      |                            |
| 2   |      |             |                    |           |                               |                             |                      |                            |
| 3   |      |             |                    |           |                               |                             |                      |                            |

- **Kabul saati:** katılan masanın kartında "Kabul edildi, … masasının yanına git" göründüğü an.
- **Masaya varış saati:** katılan masanın kişileri ev sahibi masanın yanına oturduğu ya da onunla konuştuğu an.
- **Sormak:** "… masası siz misiniz?" gibi, yanlış kişiye ya da garsona sorulan her soru bir sayılır. Ev sahibinin el sallaması ya da seslenmesi ayrıca yazılır.
- **Kalabalık:** az (masaların yarısından azı dolu), orta, çok (ayakta bekleyen var, gürültü yüksek).
- **Ne işe yaradı:** masa adını yüksek sesle söylemek, kişi sayısı, Masadakiler şeridindeki fotoğraflar (profilli kişiler), mekan ekranının açık tutulması, başka bir şey. **Ne eksikti:** katılanın aklına gelen yardım (ör. "ekranda bir renk olsaydı").

Testin sonunda **Bulma gözlemi özeti**'ni doldur.

---

## G1. Giriş ve kayıt (A–D) [P0]

> Otomatik: tamamı, 18 yaş altı denemesi dahil (`01-login.yaml`).

1. Uygulamayı aç, numarayı `5xx xxx xx xx` biçiminde gir, **Kod gönder**.
2. Test kodunu gir, **Doğrula**.
3. "Başlamadan önce" ekranında iki kutuyu (Kullanım Koşulları, KVKK) işaretle, **Onayla ve devam et**.
4. **"Seni tanıyalım"**: görünen ad (A: "Deniz", B: "Ece", C: "Can", D: "Duru"), doğum tarihi (18 yaş ve üzeri) ve **Cinsiyetin**: A **Kadın**, B **Erkek**, C **Belirtmek istemiyorum**, D **Kadın** → **Devam**.
5. **"Profilini tamamla"**: fotoğraf ve tanıtım isteğe bağlı. Hepsi **Şimdilik geç** (fotoğraflar V5'te).

**Bak:**

- SMS gelmemeli; kod ekranı hemen açılmalı. Yanlış kod "Kod hatalı ya da süresi dolmuş." demeli.
- Cinsiyet seçilmeden **Devam** soluk kalır. Altında "Kimseye gösterilmez ve sonradan değiştirilemez…" yazar.
- **B ve C**'nin "Profilini tamamla" ekranında not: "Fotoğrafın yoksa masalara katılamazsın, masanı da lobiye açamazsın…". **A ve D**'de bu not **yok**.
- Sonunda uygulama Keşfet sekmesinde açılır.

**Hata olursa:** hangi numara, hangi ekranda kaldı, hata metni. "Bu numarayla devam edilemiyor." görünürse numara ban listesinde olabilir; panelde test numarası tanımını kontrol et.

## G2. 18 yaş altı kayıt (yeni bir test numarasıyla) [P1]

> Otomatik: tamamı (`01-login.yaml`, ilk deneme).

1. Panelde tanımlı ama hiç kullanılmamış bir test numarasıyla giriş yap, iki kutuyu işaretle.
2. "Seni tanıyalım": bir ad, bir cinsiyet ve **17 yaşında** biri için doğum tarihi → **Devam**.

**Bak:**

- Telefon numarası ekranına dönülür; üstte **"skall 18 yaş ve üzeri içindir"** ve "Hesabın açılmadı ve bilgilerin saklanmadı." yazar.
- Panelde (Authentication → Users) bu numarayla kullanıcı **yok**; `profiles` tablosunda satır yok.

**Hata olursa:** kullanıcı panelde kaldıysa ❌; numarayı ve saati yaz.

## G3. Eski hesapta cinsiyet sorusu [P1]

Yalnızca 23.2'den önce açılmış, cinsiyeti boş bir hesap varsa.

1. O hesapla uygulamayı aç.

**Bak:** yeni KVKK onayından sonra bir kez **"Cinsiyetini seç"** ekranı açılır: "Masalara nasıl katılacağın buna bağlı. Bir kez sorulur." Seçim kaydedilince bir daha sorulmaz. Bu ekran atlanırsa lobide "Katıl" ve "Masanı lobiye aç" yanında **"Cinsiyetini seç"** görünür; check-in, Keşfet ve mekan sohbeti çalışır.

## V1. Açılış ve sekmeler (A) [P1]

1. Uygulamayı aç; alttaki sekmelere sırayla dokun.

**Bak:**

- Uygulama Keşfet'te açılıyor.
- Aktif masa yokken **Mekan sekmesi Keşfet'e götürür** (Mekan ekranı açılmaz).
- Profil'de sağ üstte dişli var; Ayarlar'ı açar, geri tuşu Profil'e döner.
- Sekme değişimlerinde beyaz ekran ya da titreme yok.

## V2. Keşfet: liste, harita, etkinlik etiketi (A) [P1]

1. Keşfet'te **Liste**: mekanlar kovaya göre sıralı (Çok canlı, Hareketli, Sakin; sonra ad).
2. Test mekanının satırında etkinlik etiketi: **"Bugün 21.00 · Masa gecesi"** (etkinlik başladıysa **"Şimdi · Masa gecesi"**).
3. **Harita**'ya geç; kaydır, yakınlaştır. OpenStreetMap atfı var.

**Bak:**

- Kova etiketi yalnızca "Sakin / Hareketli / Çok canlı"; **hiçbir yerde masa ya da kişi sayısı yok**.
- Haritada **kendi konumunu gösteren nokta yok** (bilerek).

## V3. Yarıçap dışından check-in (A, mekandan en az 400 m uzakta) [P1]

> Otomatik: sınırı olan E2E mekanında sınırın dışından ret, emülatör konumuyla (`02-checkin.yaml`). Elle: gerçek GPS ile 400 m.

1. Test mekanında **Buraya giriş yap** → rıza kutusu → **Konumumu kullan** → izin ver.

**Bak:** "Mekanın içinde görünmüyorsun. Mekana girince tekrar dene." (sınırı olmayan mekanda uzaklık mesajı); kişi sayısı ekranına geçilmez, masa açılmaz.

**Hata olursa:** uzaktayken kişi sayısı ekranına geçildiyse konum doğruluğunu ve mekana uzaklığı yaz. Bu ❌'dır.

## V4. Check-in ve masa kartı (A–D, mekanda) [P0]

> Otomatik: tamamı, emülatör konumuyla (`02-checkin.yaml`).

1. Dört telefon da test mekanında check-in yapar: **Buraya giriş yap** → rıza → **Konumumu kullan**. Noktası olan mekanda **"Neredesin?"**: dördü de **aynı noktayı** seçer → **Devam**.
2. **"Masada kaç kişisiniz?"**: A **2**, C **1**, B **2**, D **1** → **Masayı aç**. "Masan hazır" ekranında takma adı not et. Aşağıda masa adları **⟨A⟩**, **⟨B⟩**, **⟨C⟩**, **⟨D⟩** diye geçer; ekranda o telefonun takma adı yazar (görünen ad değil).
3. Mekan sekmesine dokun.
4. A: **Adı değiştir** bir kez: yeni ad, altında "2 hakkın kaldı". Yeni adı not et.

**Bak:**

- Mekan ekranının üstünde **kendi masa kartı**: takma ad, kişi sayısı, kalan süre ve durum **"Lobide değil"**. Altında **Masanı lobiye aç** ve **Masanla oyna**.
- Masa açıldıktan sonra Mekan sekmesi Mekan ekranını açar.
- Lobide ("Açık masalar") henüz masa yok: "Şu an lobide masa yok…".

**Hata olursa:** masa açılmadıysa ekrandaki mesajı yaz.

## V5. Profil (A–D) [P0]

> Otomatik: ad (`03-name.yaml`). Elle: fotoğraf ve şartı.

1. Dört telefonda Profil: ad yaşla birlikte, ör. **"Deniz, 24"**. Doğum tarihi ve cinsiyet Profil'de **görünmez**.
2. **B ve C**: Profil → **Fotoğraf ekle** → **Galeriden seç** (ya da V6'daki gibi **Fotoğraf çek**). Profil dairesinde fotoğraf görünür.
3. A ve D şimdilik fotoğrafsız kalır.
4. (P1) A: **Profili düzenle** → Tanıtım'a bir cümle → **Kaydet**. Küfürlü bir ad dene: "Ad 2–24 karakter olmalı ve uygun olmayan ifade içermemeli."

**Bak:** Profil ekranında cinsiyet hiçbir yerde yok. Ayarlar → Hesap'ta yalnızca kendi doğum tarihin görünür.

## V6. Konum etiketli kamera fotoğrafı (B) [P1]

Amaç: kamerada konum etiketi açıkken çekilen fotoğrafın konum bilgisi olmadan yüklenmesi. V5'teki fotoğraf bu yolla da çekilebilir.

1. B: Profil → **Fotoğraf değiştir** → **Fotoğraf çek** → kamera izni → bir fotoğraf → onayla.

**Bak:** pencerede "Fotoğrafın konum ve cihaz bilgisi gibi bütün ek bilgilerden arındırılarak yüklenir." yazar; birkaç saniyede profil fotoğrafı görünür. "Bu fotoğraf kullanılamadı." çıkarsa ❌ (saati yaz).

**Sonra (panelde, geliştirici):** Storage → `profile-photos` → `p/` klasöründeki son `.jpg`'yi indir, `exiftool dosya.jpg`: **GPS, cihaz modeli, tarih alanı olmamalı**; boyut 512×512.

## L1. "Masanı lobiye aç" ve "Bu masadayım" (A, C) [P0]

> Otomatik: lobiye açma, niyet ve oyun etiketi, masa kartı "Lobide açık" (`04-room-tabu.yaml`, `open-lobby-accept.yaml`); "Bu masadayım" (`13-teams.yaml`). Elle: kadının anonim seçimi, belirtmeyenin önizlemesi.

1. A: Mekan ekranında **Masanı lobiye aç**. Alt sayfada niyet (**Etiket yok** / Oyun / Sohbet), oyun etiketi (**Fark etmez** / altı oyun) ve **"Bu masada nasıl görüneceksin?"**: **Anonim** seçili, **Profilimle** fotoğrafsız olduğu için kesik çizgili ve seçilemez, altında "Profilinle görünmek için profil fotoğrafı gerekiyor." Niyet **Oyun**, oyun etiketi **Sesli Tabu** → **Lobiye aç**.
2. C: lobide (**Açık masalar**) A'nın kartı. **Bu masadayım** → alt sayfa: C için seçim **yok**, **"Masada böyle görüneceksin"** önizlemesi (C'nin adı, yaşı, fotoğrafı) ve "Masadakiler, masa sürerken profilini görür." → **İsteği gönder**.
3. C'nin ekranında **"Liderine bu adı söyle"** ve kendi takma adı büyük harflerle; C adı A'ya söyler.
4. A'nın mekan ekranında **"Masana katılmak istiyor"** kartı, aynı ad → **Kabul**.

**Bak:**

- A'nın masa kartında durum **"Lobide açık"**, altında "Bir masa katılmak isterse sana sorulur…", **Lobiden çek** ve **Masaya git**.
- C'nin kartında **"⟨A⟩'nın tarafındasın. Lobiden yalnızca o çekebilir."** (ek takma ada uyar) ve **Masaya git**, **Masadan çık**.
- Lobide A'nın kartında takma ad, "2 kişi", **Oyun** ve **Sesli Tabu** etiketleri. **"profilli" işareti, görünen ad, yaş ya da fotoğraf lobide yok** (kural 4, adım 23.1).
- Hiçbir telefon kendiliğinden masa ekranına gitmez; masaya yalnızca **Masaya git** ile girilir.

**Hata olursa:** C'de seçim (Anonim / Profilimle) göründüyse ❌: belirtmeyen her zaman profillidir (§23.D).

## L2. İkinci masa lobide, "Bu masadayım" (B, D) [P0]

> Otomatik: kısmen (`13-teams.yaml`). Elle: erkeğin önizlemesi ve fotoğraf şartı, kadının anonim seçimi.

1. B: **Masanı lobiye aç**. B için seçim **yok**: **"Masada böyle görüneceksin"** önizlemesi, "Profilinle" etiketi, B'nin adı, yaşı, fotoğrafı ve "Lobide yalnızca masa adın görünür. Masadakiler, masa sürerken profilini görür." Niyet **Etiket yok** → **Lobiye aç**.
2. (P1, ayrı denemede) B'nin fotoğrafı yokken aynı alt sayfa: önizlemede fotoğraf yerinde kamera, "Masanı lobiye açmak için profil fotoğrafı gerekiyor." ve **Fotoğraf ekle**; **Lobiye aç** basılamaz.
3. D: lobide B'nin kartında **Bu masadayım** → D'de **Anonim** / **Profilimle** seçimi var (kadın); **Anonim** seçili kalsın → **İsteği gönder**. B **Kabul**.

**Bak:**

- A ve C'nin lobisinde B'nin masası görünür; B ve D'nin lobisinde A'nın masası. İkisinde de "profilli" işareti yok.
- D anonim seçtiği hâlde fotoğrafsız gönderebildi (anonim katılım fotoğraf istemez).

## L3. "Katıl": istek kartında profil, kabul (B → A) [P0]

> Otomatik: botun isteği ve kabul (`open-lobby-accept.yaml`). Elle: profilli istek kartı, bekleyen masanın kapanması ve üyenin taşınması.

B'nin masası lobide bekliyor (L2); masası lobide bekleyen lider de başka bir masaya **Katıl** isteği gönderebilir (§23.C).

1. B: lobide A'nın kartında **Katıl** → **"İsteğinle birlikte gider"** önizlemesi: B'nin adı, yaşı ve fotoğrafı; "Masanın lideri isteğinde adını, yaşını ve fotoğrafını görür…" → **İsteği gönder**. B'de "İsteğin gönderildi. Yanıt bekleniyor (… sn)."
2. A: **"Katılma isteği"** kartı: B'nin masa adı, "2 kişi" ve **B'nin görünen adı, yaşı, fotoğrafı**. 60 sn sayaç. **Kabul**.

**Bak:**

- A'nın kartında B'nin **profil kimliği, masa üyeleri ya da cinsiyeti yok**; yalnızca ad, yaş, fotoğraf.
- **C'de istek kartı görünmez** (isteği yalnızca lider onaylar).
- B'nin istek gönderirken gördüğü ekranda A'nın masasındakilerin profili **yok**: istekçi kabulden önce yalnızca takma adı görür (§23.E).
- Kabulden sonra B'nin lobide bekleyen masası lobiden kalkar; A ve C'nin lobisinde artık görünmez.

## L4. Kabul buluşmadır: durum satırları ve bulma gözlemi (A–D) [P0]

> Otomatik: "… geliyor" satırı ve **Masaya git** (`open-lobby-accept.yaml`). Elle: masaların birbirini bulması.

1. Kabulden hemen sonra dört telefonun **mekan ekranındaki masa kartına** bak.
2. B ve D masalarından kalkıp A'nın masasını bulur. **Bulma gözlemi tablosuna** 1. satırı yaz.
3. Masaya varınca dördü de **Masaya git**.

**Bak:**

- **B ve D**'nin kartında: **"Kabul edildi, ⟨A⟩ masasının yanına git"**. D de bu satırı görür: lobide bekleyen masanın üyesi kabulde misafir tarafa taşınır (§23.C).
- **A ve C**'nin kartında: **"⟨B⟩ geliyor, 2 kişi"** (B'nin masasının kişi sayısı).
- Tören, tam ekran görsel ya da renk yok; hiçbir telefon kendiliğinden masa ekranına gitmez.
- Bir telefon **Masaya git** ile birleşik masayı bir kez açınca o telefonun kartı **"Birleşti"** olur; diğer telefonlarınki o telefon açana kadar değişmez.

**Hata olursa:** D'nin kartı "Lobide değil" ya da boş kaldıysa ❌ (üye taşınmamış); saati yaz.

## L5. Birleşik masa (A–D) [P0]

> Otomatik: şerit ve sekmeler, okunmamış noktası (`04-room-tabu.yaml`, `13-teams.yaml`).

1. Dört telefon birleşik masada.
2. Üstte **"Masadakiler · 4"** şeridi; **Tümü** → Masadakiler sayfası.
3. A: **Oyun Seç** sekmesinde kalsın. B: **Masa Sohbeti**'nde bir mesaj yazsın.
4. A: **Masa Sohbeti**'ni aç.

**Bak:**

- Şeritte önce kendi tarafın (sen başta), sonra karşı taraf. **B ve C** ad ve fotoğrafla; **A ve D** (anonim kadınlar) yalnızca takma adla.
- Masadakiler sayfasında iki taraf, "Senin tarafın · 2 telefon" / "Karşı taraf · 2 telefon", liderlerde **Lider**, kendi satırında **Sen**.
- 3'te A'nın **Masa Sohbeti** sekmesinde okunmamış noktası; 4'te sekme açılınca kalkar ve sohbet en son mesajdan açılır.
- Üst çubukta karşı tarafın liderinin takma adı: A'da "⟨B⟩ ile", B'de "⟨A⟩ ile".
- Liderlerde (A, B) **Masayı bitir**; üyelerde (C, D) **Masadan çık**.

## T1. Oyun önerisi ve başlatma (takımlarla) [P0]

> Otomatik: botun önerisini kabul, kapalı kart, Pas, tur geçişi ve hakemlik (`04-room-tabu.yaml`, `13-teams.yaml`). Elle: sesli oyun, aynı anda basma, T4 gecikmesi, 6 tur.

L5'teki masada devam.

1. C (üye): **Oyun Seç** → **Sohbet kartları öner**. D: **Şimdi değil**. C'de **hemen** "Öneri kabul edilmedi."
2. C: **Sesli Tabu öner**; D (karşı tarafın üyesi) **Oynayalım**. İki tarafın kişi sayısı 2 olduğu için hakemli mod.

**Bak:** öneri ve kabul tarafın her telefonundan yapılabilir. Dört ekranda "Tur 1/6", aynı sayaç (en fazla 1 sn fark), iki taraf kutusu ve 0–0 skor.

## T2. Anlatanın kartı kapalı başlar [P0]

1. 1. tur A'nın tarafında: **C** turu başlatır, böylece anlatıcı C olur.
2. C'nin ekranında kart yerine siyah alan: **"Kartı görmek için dokun"** ve **"Önce telefonu takım arkadaşlarından sakla."** C telefonu saklayıp dokunur.

**Bak:**

- Kart **yalnızca C'de**. A'da (C'nin takım arkadaşı, aynı masada) "⟨C⟩ anlatıyor." ve kart yerine **Kart anlatanda**; kart yok, ama **Doğru** var.
- B ve D (hakem taraf) kartı baştan görür; **Doğru** ve **Tabu** var. **Pas** yalnızca C'de.
- Herkes aynı masada oturduğu için ekranı saklamak oyuncunun işidir; uygulama kartı yalnızca doğru telefonlara gönderir.

**Hata olursa:** A'da kart ya da yasaklı kelime gördüysen ekran görüntüsü al ve turu yaz; bu ❌'dır.

## T3. Kim neye basabilir [P0]

1. A ve C'nin tarafı kelimeyi bilince **A** ya da **B** Doğru'ya basar: dört ekranda skor 1, yeni kart.
2. C yasaklı kelime söylerse **B** ya da **D** Tabu'ya basar: skor bir düşer.
3. **C** Pas'a basar: "Pas · 2", skor değişmez.
4. Bir kartta **A ile B aynı anda** Doğru'ya bassın: skor yalnızca **1** artmalı, dört ekran aynı karta geçmeli.

**Hata olursa:** skorun iki kez arttığını ya da ekranların farklı kartlarda kaldığını gördüysen saati ve kartları yaz.

## T4. Gecikmeyi ölç [P0]

Basışla **karşı telefonda** kartın değişmesi arasındaki süre.

1. B'nin ve C'nin telefonunu yan yana koy; kamera ikisini birden çeksin.
2. Videoyu başlat. **B** (hakem) 10 kez, 3–4 saniye arayla Doğru'ya bassın.
3. Videoyu kare kare izle (60 fps'de bir kare ≈ 17 ms): parmağın B'nin ekranına değdiği kare ve **C**'nin ekranında yeni kartın belirdiği kare.
4. 10 basışın ortalamasını ve en kötüsünü yaz. Aynı ölçümü **C**'nin Pas'ıyla (B'de değişme) 5 kez tekrarla.

```
Gecikme (B basar → C değişir): ortalama … ms, en kötü … ms (10 basış). Ağ: Wi-Fi/mobil
Gecikme (C basar → B değişir): ortalama … ms, en kötü … ms (5 basış)
Basan telefon: anında / gecikmeli
```

**Bak:** basan telefon beklemeden sonraki karta geçer. Karşı telefonun gecikmesi 1,5 sn'nin üstündeyse ya da basan telefon da bekliyorsa ❌.

## T5. Tur geçişi ve oyun sonu [P0]

1. Süre bitince "Tur bitiyor…", ardından "Tur 2/6": B'nin tarafı anlatır. **D** turu başlatır: kart D'de; B'de "⟨D⟩ anlatıyor." ve kart yok; A ve C hakem: kart, Doğru ve Tabu.
2. 6 tur sonunda skorlar ve **"… kazandı!"** ya da **"Berabere!"**
3. Masa sohbete döner: son oyunun skoru, yeniden Oyun Seç.
4. (P1) Bir oyun sürerken **Oyunu bitir**: dört ekranda masa sohbete döner.

**Bak:** Profil → Rozetler: dört hesapta da **İlk oyun**. Oyun boyunca telefonlar cebe konup çıkarılınca masa yerinde (§23.G: iki taraflı masa hareketsizlikle kapanmaz).

## T6. İbre ve Sahtekar takımlarla (A–D) [P1]

1. **İbre**: bir taraf önerir, diğeri kabul eder. A'nın tarafında C turu başlatır: hedefi **yalnızca C** görür; A'da hedef yok, ibre ve **İbreyi onayla**. B ve D Solunda/Sağında'yı seçer.
2. **Sahtekar**: koltuklar ve kartlar yalnızca liderlerin (A, B) telefonunda dolaşır; C ve D izler, kart ve koltuk düğmesi yok. Koltuk sayısı tarafın kişi sayısı.

## E1. Masa sonu: çift başına "Arkadaş ekle" (A–D) [P0]

> Otomatik: masa sonunda "Arkadaş ekle", "Sen bastın", iki taraf basınca "Arkadaş oldunuz · Mesajlaş" (`05-table-end-friend-dm.yaml`); karşı tarafın iki telefonu listede (`13-teams.yaml`). Elle: bir taraf basınca diğerinde hiçbir şeyin değişmemesi.

Masa T1–T5 boyunca 3 dakikayı geçti.

1. A: **Masayı bitir** → onay penceresi: "Masayı bitirirsen masa herkes için kapanır…" → onay.
2. Dört telefonda **"Masa bitti"**: "… masasıyla oynadınız." ve **Karşı taraf** listesi.
3. Yalnızca **A**, B'nin satırında **Arkadaş ekle**'ye basar. A'da **"Sen bastın"** ve "O da basarsa arkadaş olursunuz."
4. **B basmadan 10 saniye beklesin** ve ekranına baksın.
5. Sonra **B**, A'nın satırında **Arkadaş ekle**'ye basar.
6. **C ve D hiçbir şeye basmadan** **Kapat** (E2'de oyun geçmişinden eklenecek).

**Bak:**

- **"Tanışalım mı?" hiçbir telefonda çıkmaz.** Masa bitince dört telefon da masa sonuna geçer; beyaz ekran yok.
- Listede yalnızca **karşı taraf**: A'da B ve D, B'de A ve C. Aynı taraftakiler (A–C, B–D) listede yok.
- Profilli kişiler ad ve fotoğrafla, anonimler takma adla.
- 4'te B'nin ekranında **hiçbir şey değişmez**: A'nın bastığına dair yazı, işaret ya da bildirim yok (kural 5).
- 5'ten sonra iki ekranda da o satırda **"Arkadaş oldunuz"** ve **Mesajlaş**. C ve D'nin satırları değişmez.
- **Kapat** mekan ekranına döner; masa kartı **"Lobide değil"**.

**Hata olursa:** B'de A'nın bastığını belli eden bir şey gördüysen ekran görüntüsü al; bu ❌'dır. "Arkadaş ekle" hiç görünmediyse oyunun kaç dakika sürdüğünü yaz.

## F2. Arkadaşın profili (A ve B) [P1]

1. A: E1'deki **Mesajlaş** → konuşma; **Diğer** → **Profili gör**.

**Bak:** profilde B'nin adı, fotoğrafı, tanıtımı ve rozetleri; masa bittiği hâlde görünür, çünkü arkadaşsınız. A anonim katılmıştı: B de A'nın profilini artık görür (anonim katılanın profili yalnızca arkadaşlıkla açılır, §23.G). Mekan, konum ya da aktif masa bilgisi **hiçbir yerde yok**.

## F3. Mesajlaşma (A ve B) [P0]

> Otomatik: mesaj gönderme ve alma, iletildi ve okundu işaretleri, "yazıyor" (`05-table-end-friend-dm.yaml`, `05b-dm-ticks-typing.yaml`). Elle: "Yeni mesaj", küfür reddi, konuşma şikayeti.

1. A: "Merhaba" → **Gönder**. B konuşma ekranındaysa mesaj 1–2 sn içinde düşer.
2. B konuşmadan çıksın. A bir mesaj daha göndersin: B'nin listesinde **Yeni mesaj**; konuşmayı açınca kaybolur.
3. Küfürlü bir mesaj dene: "Mesajın uygun olmayan bir ifade içeriyor."; gitmez. "sık sık", "sıkıldım" gider.
4. B: **Diğer** → **Konuşmayı şikayet et** → bir sebep → "Şikayetin alındı. Teşekkürler."

**Bak (sonra, panelde):** `reports` tablosunda `target_type = 'dm'` satırı.

## F4. Mesaj bildirimi (push) [P0]

Gerekli: APK `google-services.json` ile alınmış olmalı (CLAUDE.md → "Push"). Değilse atla ve "F4 atlandı: FCM yok" diye not et; F6'daki bildirim kontrolü de atlanır.

1. B uygulamayı arka plana alsın ve ekranı kilitlesin. A, B'ye bir mesaj göndersin.
2. B bildirime dokunsun.
3. B: Ayarlar → Bildirimler → **Mesajlar** kapalı; uygulamayı arka plana al; A bir mesaj daha göndersin. Sonra anahtarı yeniden aç.

**Bak:** 1'de bildirim: başlık **"skall"**, metin **"Yeni bir mesajın var"**; gönderenin adı ve içerik **yok**. Dokununca uygulama açılır. 3'te bildirim **gelmez**.

## E2. Oyun geçmişinden "Arkadaş ekle" (C, D) [P0]

Masa telefon cepteyken kapanırsa masa sonu ekranı hiç görülmeyebilir; aynı sessiz düğme oyun geçmişinde de vardır (§23.G). C ve D, E1'de basmadan çıkmıştı.

1. C: Arkadaşlar → zil → **Bildirimler** → **Oyun geçmişi**: E1'deki masanın satırları, karşı taraftaki her kişi için ayrı (B ve D).
2. C: D'nin satırında **Arkadaş ekle**. D'nin ekranında 10 saniye boyunca hiçbir şey değişmez.
3. D: Bildirimler → Oyun geçmişi → C'nin satırında **Arkadaş ekle**.
4. (P1) C, B'nin satırında **Arkadaş ekle**'ye basar; B basmaz.

**Bak:**

- Oyun geçmişinde E1'de A ile B'nin bastığı satır "yapıldı" görünür; arkadaş olunan satırda **Mesajlaş**.
- 3'ten sonra C ile D arkadaş olur (Arkadaşlar listesinde ad ve "… beri arkadaşsınız"); bildirim ya da yazı karşı tarafa ilk basışta gitmez.
- 4'te B'de **hiçbir şey** görünmez; "İstek gönder" yalnızca 23.3'ten önceki eski kayıtlarda görünür.
- Aynı taraftakiler (A–C, B–D) birbirinin oyun geçmişinde **yok**.

## S1. Masa sohbeti ve şikayet (A, B) [P1]

1. A masasını yeniden lobiye açar, B katılır (L1 ve L3'ün kısa hâli; bulma gözlemi tablosuna satır yaz). Masa Sohbeti'nde karşılıklı mesajlar.
2. Küfürlü mesaj: "Mesajın uygun olmayan bir ifade içeriyor." Aynı saniyede iki mesaj: ikincisi "Çok fazla istek gönderdin…".
3. B: Masadakiler → A'nın satırı → **Şikayet et** → bir sebep → "Şikayetin alındı. Teşekkürler." Masa sürer.

**Bak:** şikayet nedenlerinde **"Yanlış cinsiyet beyanı"** var (masa içi kişi şikayeti; §23.D). Panelde `reports` → yeni satır, `messages_snapshot` içinde son mesajlar.

## S2. Liderlik devri (A–D) [P1]

> Otomatik: lider çıkar, cihaz lider olur ve masayı bitirir (`13-teams.yaml`).

1. A, C, B, D birleşik masada (L1–L5'in kısa hâli; bulma gözlemine satır).
2. A: **Diğer** → "Çıkarsan liderlik ⟨C⟩'ye geçer, masa sürer." (ek takma ada uyar) → **Masadan çık** → onay.
3. A (aynı masada): lobide bu masanın **Süren masalar** kartında A'nın eski tarafına **Bu masadayım**.

**Bak:**

- C'de sohbetin başında **"Artık lider sensin. ⟨A⟩ masadan çıktı; katılma istekleri sana gelir, masayı sen bitirebilirsin."** ve **Masayı bitir**. B ve D'de üst çubuk "⟨C⟩ ile" olur. Oyun sürüyorsa sürer.
- Süren masa kartında yalnızca iki liderin takma adı, taraf başına telefon ve kişi sayısı; üye adı, profil ve oyun yok (kural 4).
- 3'te istek C'ye gelir; C kabul edince A üye olarak döner.

## V8. Beyaz ekran: diğer masa bitirir (A, B) [P0]

> Otomatik: bot masa bitirir, cihaz masa sonuna geçer, hata ekranı yok (`06-white-screen.yaml`).

İki kez oynanır; her turda **masayı bitirmeyen telefon** izlenir.

**V8a (A bitirir, B izlenir):** A masasını lobiye açar, B katılır (bulma gözlemine satır), Sesli Tabu 1–2 tur. A **Masayı bitir**. **B'yi izle.**

**V8b (B bitirir, A izlenir):** B lobiye açar, A katılır, 1–2 tur. B **Masayı bitir**. **A'yı izle.**

**Bak:** izlenen telefon birkaç saniye içinde **"Masa bitti"** ekranına geçer; **beyaz ekran, boş ekran ya da "Bir şeyler ters gitti" yok**. Masa 3 dakikadan kısa sürdüyse satırda düğme yerine **"Birlikte 3 dakikadan az kaldınız."**

**Hata olursa:** beyaz ekran görülürse hangi telefon, hangi turda, hangi düğmeden sonra ve kaç saniye sürdüğünü yaz. "Bir şeyler ters gitti" çıktıysa **Tekrar dene**'ye bas ve sonucu yaz.

## S3. İstekte red ve zaman aşımı aynı görünmeli (A, B, D) [P1]

1. A lobiye açar. B **Katıl**. A **Geç**.
   **Bak:** B'de sayaç 60 sn boyunca "Yanıt bekleniyor" der, **ancak 60 sn dolunca** "Masa şu an müsait değil." Hemen görünürse ❌.
2. A lobiden çeker, yeniden açar. B **Katıl**. A hiçbir şey yapmaz.
   **Bak:** B'de 1'dekiyle aynı ekran, aynı zamanlama.
3. "Bu masadayım": D, A'nın tarafına ister; A **Geç**. Sonra D yeniden ister, A 60 sn cevap vermez.
   **Bak:** iki durum D'de birebir aynı: "Masa şu an müsait değil."

**Hata olursa:** mesajın göründüğü saniyeyi her deneme için ayrı yaz.

## L6. Kabulden sonra vazgeçme (A, B) [P0]

Katılan, kabulden sonra Masadakiler'de ev sahibi masanın profilli kişilerini görüp gitmemeyi seçebilir (§23.E). Bu bir güvenlik kapısıdır.

1. A lobiye açar, B **Katıl**, A **Kabul**.
2. B, A'nın masasına gitmeden: **Masaya git** → Masadakiler'e bak → **Masadan çık** → onay.

**Bak:**

- B tarafın tek telefonu olduğu için masa **kapanır** (§23.G). A'nın ekranı masa sonuna geçer; 3 dakika dolmadığı için **"Arkadaş ekle" yok**, oyun geçmişinde kayıt yok.
- A bunu masadan bir çıkış olarak görür (red gibi gizlenmez); fiziksel dünyada gelmemekle aynıdır.
- B'nin kartı **"Lobide değil"**; B başka bir masaya istek gönderebilir.

## F5. Arkadaşlıktan çıkarma (A çıkarır) [P1]

1. A: B ile konuşma → **Diğer** → **Arkadaşlıktan çıkar** → "Konuşmanız silinir. Karşı tarafa bildirilmez." → **Çıkar**.
2. B: Bildirimler → Oyun geçmişi → A'nın satırı.

**Bak:** iki listede de arkadaş yok, konuşma iki tarafta silinmiş; B'ye bildirim **gitmez**. B'nin satırında **Arkadaş ekle** yeniden görünse bile basınca A'da hiçbir şey olmaz (çıkarılanın isteği sessizce yutulur, kural 5).

**Hata olursa:** A'da B'den istek ya da yeni arkadaşlık göründüyse ❌; saati yaz.

## F6. Arkadaşlık isteği ve red [P1]

Görünür istek yalnızca 23.3'ten önceki eski kayıtlarda ("İstek gönder") ve mekan sohbetinden (M1) gider. Eski kaydı olan iki hesap yoksa yalnızca M1'deki istek denenir.

1. Eski kayıtta: zil → Bildirimler → satır → **İstek gönder**.
2. Alan taraf: zil → Bildirimler → **Gelen istekler** → **Reddet**.

**Bak:** (FCM'li build) alan tarafta bildirim: **"skall"**, **"Yeni bir arkadaşlık isteğin var"**; ad yok. Red gönderene hiçbir yerde görünmez: satır "… masasına istek gönderildi" olarak kalır.

## F7. Geçmişten engelleme ve engeli kaldırma (B → A) [P0]

> Otomatik: geçmişten engelleme ve arkadaşlığın düşmesi (`07-history-block.yaml`). Elle: lobide görünmezlik, engeli kaldırma.

1. B: Bildirimler → Oyun geçmişi → A'nın satırı → **Diğer** → **Engelle**. Pencerede "Birbirinizi lobide, isteklerde ve arkadaş listesinde bir daha görmezsiniz. Karşı tarafa bildirilmez." **Şikayet de et**'i işaretle → **Engelle**.
2. A masasını lobiye açsın; B lobisine baksın. Sonra B lobiye açsın; A lobisine baksın.
3. B: Ayarlar → Engellenenler → A → **Engeli kaldır**. 2'yi tekrarla.

**Bak:** 2'de iki taraf da diğerinin masasını lobide **görmez**; A'ya hiçbir bildirim gitmez. 3'ten sonra masalar yeniden görünür. Panelde `reports` → `target_type = 'history'`. Şikayet nedenlerinde "Yanlış cinsiyet beyanı" var.

## T7. İş birliği modu: tek kişilik taraf (A, B) [P0]

> Otomatik: bot tek kişilik masayla katılır; cihaz 1. turda anlatır, 2. turda kartı görmez (`06b-tabu-coop.yaml`).

1. B: **Mekandan ayrıl**, yeniden check-in, kişi sayısı **1** → **Masayı aç**.
2. A lobiye açar, B katılır (bulma gözlemine satır); **Sesli Tabu öner** → **Oynayalım**.
3. A anlatır: kart kapalı başlar; **Doğru**, **Pas** ve **Tabu**'nun üçü de A'da. Üstte tek **"Ortak skor"**.
4. B (tahmin eden): kart **yok**; geri sayım, ortak skor ve "… size anlatıyor…". Düğme yok.
5. 2. tur: B anlatır; kart ve üç düğme B'de.

**Bak:** tahmin eden telefonda kart hiçbir an görünmüyor. Oyun sonunda "Sesli Tabu bitti. Ortak skor: …".

**Hata olursa:** tahmin eden telefonda kart gördüysen ekran görüntüsü al; bu ❌'dır.

## S4. Masada engelleme (A–D) [P1]

1. Birleşik masada: lider A, kendi tarafındaki C'yi engeller (Masadakiler → C → **Engelle**).
2. Ayrı bir masada: üye D, karşı taraftaki A'yı engeller.

**Bak:**

- 1'de C masadan çıkarılır, A kalır, masa sürer.
- 2'de karşı tarafı engelleyen D kendisi çıkar.
- Engelleme hiçbir zaman "Tanışalım mı?" açmaz. Bir taraftaki son telefon engelleyerek çıkarsa masa hemen kapanır.

## S5. Masanla oyna (A) [P1]

> Otomatik: özel masa, tek masa Tabu ve "Masayı bitir" (`06-white-screen.yaml`).

1. A: **Masanla oyna**. Masa ekranı şeritsiz ve sekmesiz; oyunlar sohbetin üstünde. Niyet ya da katılım sorulmaz; cinsiyet ve fotoğraf şartı yok (§23.D).
2. B'nin lobisinde bu masa **görünmez**.
3. A: Sesli Tabu → 1 tur → **Oyunu bitir** → **Masayı bitir**: mekan ekranına döner, "Arkadaş ekle" yok.

## S6. Hareketsizlik (A, B) [P1]

30 dakika bekleme ister; başka adımlar sürerken yapılır.

1. A masasını lobiye açar ve **30 dakikadan fazla** hiçbir şey yapmaz (uygulama kapalı olabilir).
2. Aynı sürede başka bir birleşik masa (ör. B ve D'nin bir sonraki masası) 30 dakikadan uzun hiçbir oyun ya da mesaj olmadan dursun.

**Bak:**

- 1'de A'nın masası sessizce kapanır: masa kartı **"Lobide değil"**, lobide görünmez. O sırada A'ya bekleyen bir istek varsa istekçi "Masa şu an müsait değil." görür.
- 2'de birleşik masa **kapanmaz** (§23.G): 30 dakika sonra da masa ekranı ve sohbet yerinde.

## M1. Mekan sohbeti: anonim ve profilli (A, B, C) [P0]

> Otomatik: ilk mesajda seçim, botun profilli mesajı, profil, istek ve kabul (`08-venue-chat.yaml`).

Mekan sohbetinde anonim ya da profilli seçim her girişte bir kez, ilk mesajda yapılır ve o giriş boyunca değişmez. **Cinsiyet kuralı burada uygulanmaz:** erkek ve belirtmeyen de anonim yazabilir (§23.D).

1. B (erkek): Mekan ekranında **Sohbet odası** → bir mesaj → **Gönder** → "Bu mekanda kaldığın sürece mekan sohbetinde nasıl görüneceksin?" alt sayfası, **Anonim** seçili → **Gönder**: mesaj B'nin **masa adıyla** gider; "Anonim yazıyorsun".
2. C (belirtmeyen): aynı şekilde **Anonim** ile yazabilir.
3. A: bir mesaj → **Gönder** → **Profilimle** (A'nın fotoğrafı yoksa önce **Fotoğraf ekle**) → **Gönder**: mesajda **görünen ad** ve "profilli"; masa adı yok. Bir mesaj daha: alt sayfa açılmaz.
4. B: A'nın profilli mesajındaki ada dokun → A'nın profili (ad, yaş, fotoğraf); profil kimliği ve masa adı yok. **Arkadaşlık isteği gönder** → **İsteği gönder**.
5. A: Arkadaşlar → Geçmiş ve istekler → "<mekan> sohbet odasından **B'nin adı (yaş)** arkadaşın olmak istiyor" → **Kabul et**.
6. A: **Mekandan ayrıl** → yeniden giriş → **Sohbet odası** → bir mesaj → **Gönder**: alt sayfa yeniden açılır.

**Bak:**

- Anonim mesajda ad yok, profilli mesajda masa adı yok. Mekan sohbetinin şikayet nedenlerinde "Yanlış cinsiyet beyanı" **yok**.
- Anonim mesaja dokununca profil açılmaz; yalnızca **Şikayet et** ve **Engelle**.

**Hata olursa:** ilk **Gönder**'de alt sayfa açılmadan mesaj gittiyse ya da aynı girişte iki biçimle yazılabildiyse ekran görüntüsü al; bu ❌'dır. B ya da C'de "anonim yazamazsın" anlamında bir şey göründüyse ❌.

## M2. Mekan sohbetinde şikayet ve engel [P1]

1. B: A'nın bir mesajına dokun → **Şikayet et** → bir sebep → "Şikayetin alındı."
2. B: A'nın mesajına dokun → **Engelle** → onay. İki taraf birbirinin mesajlarını görmez.
3. B: Ayarlar → Engellenenler: profilli mesajdan engellendiyse A'nın **görünen adı**, anonim mesajdan engellendiyse **masa adı**. Engeli kaldır.

**Sonra (panelde):** `reports` → `target_type = 'venue_chat'`.

## M3. Mekandan çıkınca erişim biter [P1]

1. A: **Mekandan ayrıl**. Mekan sekmesi Keşfet'e döner; sohbet odası açılmaz.
2. A yeniden check-in yapınca son 24 saatteki mesajları yeniden görür.

## Bulma gözlemi özeti (§23.P-2) [P0]

Tablodaki satırlardan:

```
Kabul sayısı: …   Ortalama bulma süresi: … dk   En uzun: … dk
Birine sormak gereken kabul: … / …   Toplam soru: …
Kalabalık: az … / orta … / çok …
Masalar birbirini iki satırla (Kabul edildi… / … geliyor) buldu mu: her zaman / çoğu zaman / bazen / hiç
En çok işe yarayan: …
En çok eksik olan: …
Kalabalıkta bulma yardımı (renk, emoji ya da başka bir işaret) gerekli mi: evet / hayır / emin değilim — neden: …
```

Bu özet §23.P-2 kararına girer. "Evet" çıkarsa bulma yardımı ayrı bir iştir; geri gelecekse 23.4b'nin temizliği neyin silindiğini PR açıklamasında tek tek yazar.

## Y1. Oda yükü ölçümü [P1]

`docs/ROOM_LOAD.md`: 1. bölüm (`pnpm latency`, `STEPS=room`) dev projesinde istediğin zaman; 2. bölüm testten sonra, panelde (Realtime → Reports, `scripts/latency/room-load.sql`). Testten hemen önce panel → Database → Query Performance → **Reset** ve saati not et.

## V11. Kapanış [P1]

1. Dört telefonda **Mekandan ayrıl**; Mekan sekmesi yine Keşfet'e götürür.
2. Etkinlikleri kaldır: `pnpm admin:event list`, sonra her biri için `pnpm admin:event remove <id>`.
3. (İsteğe bağlı) Ayarlar → **Hesabımı sil**; aynı test numarasıyla yeniden kayıt olunabilmeli.
4. Test bitince panelde test numaralarını sil ve test mekanını pasif yap.

## Test sonrası

Notları, ekran görüntülerini ve bulma gözlemi tablosunu tek bir yerde topla; ❌ olan adımları hata satırlarıyla birlikte bildir. Adım numaraları bu belgedeki numaralardır.
