# Saha testi: Kabuk v1 (Sakarya Üniversitesi pilotu), iki telefonla uçtan uca

Tek bir sıra. **A** ve **B** iki telefon, iki hesap, aynı mekan; **A** oda sahibi (sen), **B** misafir masa (arkadaşın). Sesli Tabu'daki gecikme ölçümü (T4) için **üçüncü bir telefon** ya da kamera gerekir. Tamamı yaklaşık 3 saat; T4'ten sonra ve S3'ten sonra mola verilebilir. Her adım **P0** ya da **P1** olarak işaretli: süre yetmezse önce aşağıdaki P0 sırası yapılır, P1'ler kalan sürede tam sıradaki yerlerinde.

Kabuk v1'in (`docs/SPEC_V3.md`) bütün adımları işlendi: kayıt = profil ve 18 yaş (adım 1), kampüs ve nokta seçimi (adım 2), oda akışı ve oyun önerisi (adım 3), Tabu modları (adım 4), mekan sohbet odası (adım 5). Kampüs açılana kadar test, noktaları olan test mekanında (Hush Coffee: İç salon, Bahçe) yapılır.

Adım adları: **G** giriş ve kayıt, **V** iskelet, Keşfet, check-in ve nokta, oda kurma, profil, **T** öneri ve Sesli Tabu (T7: iş birliği modu), **F** arkadaşlar, mesajlar ve bildirimler, **M** mekan sohbet odası, **S** v1'den kalan ve hâlâ geçerli akışlar. Hata satırında bu adları kullan.

## P0 sırası (kritik yol, yaklaşık 1,5 saat)

Kayıt, check-in ve nokta, oda kurma ve oyun önerisi, Sesli Tabu'nun iki modu ve gecikme ölçümü, tanışma sızıntısı, arkadaşlık, mesaj ve bildirim, geçmişten engelleme, beyaz ekran, mekan sohbet odası. Her adım, atlanan P1'lere ihtiyaç duymadan yapılabilir.

1. **Test öncesi**: listenin tamamı (evde).
2. **G1.** Giriş ve kayıt (ad, doğum tarihi), A ve B (~5 dk).
3. **V4.** Check-in, nokta seçimi ("Neredesin?"), kişi sayısı ve masa adı, A (~5 dk).
4. **V5.** Yalnızca 1. adım: iki telefonda Profil'de ad ve yaş (~2 dk).
5. **V7.** Oda kur (niyet, katılım), lobide "profilli" etiketi, katılma isteği (~5 dk).
6. **T1–T5.** Oyun önerisi ve Sesli Tabu (hakemli mod), T4'teki gecikme ölçümü dahil (~15 dk).
7. **T6 → F1.** Karşılıklı Evet, sonuç ekranında "Arkadaş ekle" (~3 dk).
8. **F3.** Mesajlaşma (~5 dk).
9. **F4.** Mesaj bildirimi; FCM'li build yoksa atlanır ve not edilir (~5 dk).
10. **S3.** Tanışma sızıntısı: Hayır ve cevapsız (~6 dk).
11. **V8.** Beyaz ekran senaryosu, V8a ve V8b (~8 dk).
12. **F7.** Geçmişten engelleme ve engeli kaldırma (~5 dk).
13. **T7.** İş birliği modu: B tek kişilik masayla yeniden check-in yapar, Sesli Tabu (~6 dk).
14. **M1.** Mekan sohbet odası: anonim ve profilli mesaj, mesajdan profil ve arkadaşlık isteği (~6 dk).

## Otomatik testler (e2e)

P0'ın telefonsuz yapılabilen kısmı CI'da koşar (PR'da `e2e` etiketiyle, elle ve her gece main'de): `e2e/maestro/p0.yaml`, Android emülatöründe, yerel stack'e karşı. İkinci masayı bot oynar (`scripts/e2e/bot-table.ts`). Her ekranın görüntüsü alınır; koyu görünüm tasarım dalı (#13) merge edilince eklenir. Sahada ikinci telefon yoksa bot dev projesinde karşı masa olarak oynayabilir (CLAUDE.md → "Karşı masa"). Sıra tablosundaki **Otomatik** kolonu ve adımlardaki "Otomatik:" notu neyin kapsandığını söyler.

Otomatiklenmeyen ve sahada elle kalanlar:

- **Gerçek GPS:** emülatör konumu kesin; kapalı mekandaki sapma ve doğruluk yalnızca sahada görülür (V3, V4).
- **Sesli oyun hissi:** masaların bir araya gelmesi, kartın saklanması, sesli anlatma (T1–T5).
- **Kilitli telefonda push:** FCM, bildirim metni, bildirime dokunma (F4, F6).
- **Gecikme hissi:** T4'teki ölçüm ve tur akışının doğallığı.

Otomatik bir adım yeşilse sahada yine yapılır, ama önce elle kalan kısmına bakılır.

## Sıra

| #   | Öncelik | Adım                                     | Otomatik | Telefonlar           | Not                                |
| --- | ------- | ---------------------------------------- | -------- | -------------------- | ---------------------------------- |
| 1   | P0      | Test öncesi                              | —        | A, B                 | Evde, bir kez                      |
| 2   | P0      | G1. Giriş ve kayıt                       | Evet     | A, B                 | Ad ve doğum tarihi kayıtta         |
| 2b  | P1      | G2. 18 yaş altı kayıt                    | Evet     | A                    | Kullanılmamış bir test numarası    |
| 3   | P1      | V1. Açılış ve sekmeler                   | Hayır    | A, B                 |                                    |
| 4   | P1      | V2. Keşfet                               | Hayır    | A                    |                                    |
| 5   | P1      | V3. Yarıçap dışından check-in            | Kısmen   | A                    | Mekandan en az 400 m uzakta        |
| 6   | P0      | V4. Kişi sayısı ve masa adı              | Evet     | A                    | Mekanda                            |
| 7   | P0      | V5. Profil kurulumu                      | Kısmen   | A, B                 | P0'da yalnızca 1. adım (ad ve yaş) |
| 8   | P1      | V6. Konum etiketli fotoğraf              | Hayır    | B                    |                                    |
| 9   | P0      | V7. Oda kur, "profilli", katılma isteği  | Kısmen   | A, B                 | T bu odada sürer                   |
| 10  | P0      | T1–T5. Sesli Tabu                        | Kısmen   | A, B, üçüncü telefon | ~15 dk; oda 3 dakikayı geçer       |
| 11  | P0      | T6. Oda sonu, karşılıklı Evet            | Evet     | A, B                 |                                    |
| 12  | P0      | F1. "Arkadaş ekle"                       | Kısmen   | A, B                 | T6'nın sonuç ekranında             |
| 13  | P1      | F2. Arkadaşın profili                    | Hayır    | A, B                 |                                    |
| 14  | P0      | F3. Mesajlaşma                           | Kısmen   | A, B                 |                                    |
| 15  | P0      | F4. Mesaj bildirimi                      | Hayır    | A, B                 | FCM'li build gerekir               |
| 16  | P1      | S1–S2. Sohbet odası, oda şikayeti        | Hayır    | A, B                 |                                    |
| 17  | P0      | S3. Tanışma sızıntısı (Hayır / cevapsız) | Hayır    | A, B                 | S1 yapıldıysa onun odasıyla başlar |
| 18  | P0      | V8. Beyaz ekran senaryosu                | Evet     | A, B                 |                                    |
| 19  | P1      | V9–V10. Odada profil, oda sonrası        | Hayır    | A, B                 |                                    |
| 20  | P1      | S4. Katılma isteğinde red ve zaman aşımı | Hayır    | A, B                 |                                    |
| 21  | P1      | F5. Arkadaşlıktan çıkarma                | Hayır    | A, B                 |                                    |
| 22  | P1      | F6. Arkadaşlık isteği ve red             | Hayır    | A, B                 |                                    |
| 23  | P0      | F7. Geçmişten engelleme                  | Kısmen   | A, B                 |                                    |
| 23b | P0      | T7. İş birliği modu                      | Kısmen   | A, B                 | B tek kişilik masayla              |
| 24  | P1      | S5. Odada engelleme                      | Hayır    | A, B                 |                                    |
| 24b | P1      | S6. Masanla oyna                         | Evet     | A, B                 |                                    |
| 24c | P0      | M1. Mekan sohbet odası                   | Kısmen   | A, B                 |                                    |
| 24d | P1      | M2. Mekan sohbetinde şikayet ve engel    | Hayır    | A, B                 |                                    |
| 24e | P1      | M3. Mekandan çıkınca erişim biter        | Hayır    | A                    |                                    |
| 25  | P1      | V11. Kapanış                             | Hayır    | A, B                 |                                    |

## Uygulama önde kalmalı

Katılma isteği, kabul, sohbet, oyun ve tanışma olayları **uygulama önde ve ekran açıkken** Realtime bağlantısıyla gelir. Push yalnızca APK `google-services.json` ile alındıysa çalışır ve yalnızca F4 ile F6'da bilerek denenir.

- İki telefonda da ekran zaman aşımını uzun tut (ör. 10 dk), pil tasarrufunu kapat.
- F4 ve F6 dışında uygulamayı arka plana alma. Ekran kilitlenirse bağlantı düşebilir: katılma isteği penceresi (60 sn) kaçar, tanışma sayacı atlanabilir.
- Bir olay gelmediyse önce iki telefonda da uygulamanın önde olup olmadığını not et, sonra uygulamayı kapatıp açarak tekrar dene.
- "Diğer masanın bağlantısı koptu" uyarısı, diğer telefon uygulamayı arka plana aldığında beklenen davranıştır (S1'de bilerek denenir).

## Test öncesi (evde, bir kez)

- [ ] Barındırılan proje main ile güncel: CLAUDE.md → **"main'den dev projesine yayın"** komutlarının hepsi çalıştırıldı (migration'lar, seed, 12 fonksiyonun hepsi).
- [ ] Panel → Realtime → Settings → **Allow public access kapalı**.
- [ ] İki numara test numarası olarak tanımlı ve "Valid Until" test gününden sonra (CLAUDE.md → "Barındırılan projede SMS'siz giriş").
- [ ] `content/venues-test.json` içinde test mekanının koordinatı var, seed edildi (CLAUDE.md → "Saha testi mekanı").
- [ ] İki telefonda main'den alınan `preview` APK'sı kurulu (CLAUDE.md → "Test APK'sı"). Profil sekmesinde dişli ve "Ad ekle" düğmesi görünüyorsa güncel. APK'nın `google-services.json` ile alınıp alınmadığını not et (F4 ve F6).
- [ ] İki hesapta da görünen ad **yok** (yeni hesap ya da hiç ad girilmemiş). Adları V5'te gireceğiz.
- [ ] Planlı etkinlikler (geliştirici makinesinde, `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` ortamda):
  - `pnpm admin:event add test/<ref> "Masa gecesi" "<bugün, 1 saat sonra, ör. 2026-09-26 21:00>"` (test mekanı)
  - `pnpm admin:event add <pilot mekanlardan birinin source_ref'i> "Tabu turnuvası" "<3 gün sonra 20:00>"`
  - `pnpm admin:event list` ile iki kaydın göründüğünü kontrol et.
- [ ] İki telefonda konum açık, **tarih/saat otomatik** (geri sayımlar sunucu saatine göre hesaplanır; saat kaymışsa sayaçlar tutmaz), mobil veri ya da Wi-Fi var.
- [ ] B'nin telefonunda kamera uygulamasında **konum etiketi açık** (V6).
- [ ] Üçüncü telefonda mümkünse 60 fps video (T4).
- [ ] Not için bir dosya ya da kağıt; ekran görüntüsü almayı bil.

## Hata olursa ne not edilir

Her hata için tek satır, sonra ekran görüntüsü:

```
[saat:dakika:saniye] [A/B] [adım no] Ekranda yazan: "…" | Beklenen: … | Diğer telefon o an ne gösteriyordu: … | Uygulama öndeydi mi: evet/hayır
```

- Saat saniyesiyle önemli: Supabase panelindeki loglarla (Edge Functions → Logs; Logs Explorer) bu saatle eşleştirilir.
- Hata mesajı Türkçe bir cümleyse aynen yaz (ör. "Masa şu an müsait değil."). Her mesaj sunucudaki tek bir hata koduna karşılık gelir.
- Adım takılırsa uygulamayı kapatıp açmayı dene ve açılınca ne gördüğünü de yaz.
- Takılan adımı atlayıp devam etmek mümkünse devam et; hangi adımların atlandığını not et.

Her adımın sonunda ✅ / ❌ işaretle.

---

## G1. Giriş ve kayıt (A ve B) [P0]

> Otomatik: tamamı, 18 yaş altı denemesi dahil (`01-login.yaml`).

1. Uygulamayı aç, numarayı `5xx xxx xx xx` biçiminde gir, **Kod gönder**.
2. Test kodunu gir, **Doğrula**.
3. "Başlamadan önce" ekranında iki kutuyu (Kullanım Koşulları, KVKK) işaretle, **Onayla ve devam et**. 18 yaş kutusu artık yok.
4. **"Seni tanıyalım"**: görünen ad (A: "Deniz", B: "Ece") ve doğum tarihi (gün, ay, yıl; 18 yaş ve üzeri) → **Devam**.
5. **"Profilini tamamla"**: fotoğraf ve tanıtım isteğe bağlı → **Şimdilik geç** (ya da ekleyip **Bitir**).

**Bak:**

- SMS gelmemeli; kod ekranı hemen açılmalı. Yanlış kod "Kod hatalı ya da süresi dolmuş." demeli.
- "Seni tanıyalım" ekranında "Kabuk 18 yaş ve üzeri içindir." yazar; ad ve tam bir tarih girilmeden **Devam** soluk kalır. Olmayan bir tarih (ör. 31.04) "Geçerli bir tarih gir." der.
- Sonunda uygulama Keşfet sekmesinde açılmalı.
  **Hata olursa:** hangi numara, hangi ekranda kaldı, hata metni. "Bu numarayla devam edilemiyor." görünürse numara ban listesinde olabilir; panelde test numarası tanımını kontrol et.

## G2. 18 yaş altı kayıt (yeni bir test numarasıyla) [P1]

> Otomatik: tamamı (`01-login.yaml`, ilk deneme).

1. Panelde tanımlı ama hiç kullanılmamış bir test numarasıyla giriş yap, iki kutuyu işaretle.
2. "Seni tanıyalım": bir ad ve **17 yaşında** biri için doğum tarihi (ör. bu yıldan 17 çıkar, 01.01) → **Devam**.

**Bak:**

- Telefon numarası ekranına dönülür; üstte **"Kabuk 18 yaş ve üzeri içindir"** ve "Hesabın açılmadı ve bilgilerin saklanmadı." yazar.
- Panelde (Authentication → Users) bu numarayla kullanıcı **yok**; `profiles` tablosunda satır yok.
- Aynı numarayla hemen yeniden kayıt olunabilir (kabul edilmiş risk, `docs/SPEC_V3.md` §17-S2).

**Hata olursa:** kullanıcı panelde kaldıysa ❌; numarayı ve saati yaz.

## V1. Açılış ve sekmeler (A ve B) [P1]

1. Uygulamayı aç.
2. Alttaki dört sekmeye sırayla dokun: **Keşfet**, **Mekan** (ortada, siyah daire, kahve simgesi), **Arkadaşlar**, **Profil**.

**Bak:**

- Uygulama Keşfet'te açılıyor.
- Mekan düğmesi diğerlerinden büyük ve yükseltilmiş.
- Aktif masa yokken **Mekan'a dokunmak Keşfet'e götürür** (Mekan ekranı açılmaz).
- Arkadaşlar'da "Birlikte oynadığın masalarla burada arkadaş olabileceksin." yazar.
- Profil'de sağ üstte dişli var; dişli Ayarlar'ı açar, geri tuşu Profil'e döner.
- Sekme değişimlerinde beyaz ekran ya da titreme yok.

**Hata olursa:** hangi sekmeden hangisine geçerken, ne gördün.

## V2. Keşfet: liste, harita, etkinlik etiketi (A) [P1]

1. Keşfet'te **Liste** görünümü: mekanlar kovaya göre sıralı (Çok canlı, Hareketli, Sakin; sonra ad).
2. Test mekanının satırında etkinlik etiketi: **"Bugün 21.00 · Masa gecesi"** (etkinlik başladıysa **"Şimdi · Masa gecesi"**).
3. Pilot mekandaki etkinlik: gün adıyla, ör. **"Pazartesi 20.00 · Tabu turnuvası"**.
4. **Harita**'ya geç. Mekan işaretçileri görünür. Kaydır, yakınlaştır.
5. Listenin altında ve haritanın atıf düğmesinde OpenStreetMap atfı var.

**Bak:**

- Kova etiketi yalnızca "Sakin / Hareketli / Çok canlı"; **hiçbir yerde masa ya da kişi sayısı yok**.
- Tek masa açıkken bile mekan "Sakin" görünür (V5'ten sonra geri dönüp bak; kovalar 5 dakikada bir tazelenir).
- Haritada **kendi konumunu gösteren mavi nokta yok** (bilerek).
- Etiketteki saat İstanbul saatiyle, `admin:event`'e yazdığın saatle aynı.

**Hata olursa:** etiket görünmüyorsa `admin:event list` çıktısını ve mekanın adını yaz. Harita boş ya da gri kaldıysa internet bağlantısını ve ekran görüntüsünü ekle.

## V3. Yarıçap dışından check-in (A, mekandan en az 400 m uzakta) [P1]

> Otomatik: sınırı olan E2E mekanında sınırın 210 m dışından ret ("Kampüsün içinde görünmüyorsun…"), emülatör konumuyla (`02-checkin.yaml`). Elle: gerçek GPS ile 400 m.

1. Keşfet'te test mekanının kartında **Buraya giriş yap** (tek aktif mekan varken Keşfet liste değil tek mekan kartıdır; iki ya da daha fazla mekan varken mekana dokun → mekan detayı → **Buraya giriş yap**).
2. Rıza kutusunu işaretle → **Konumumu kullan** → izin ver.

**Bak:** konum alındıktan sonra kırmızı yazı: **"Bu mekana çok uzaktasın. Mekandayken tekrar dene."**; kişi sayısı ekranına geçilmez. Masa açılmaz (Mekan sekmesi hâlâ Keşfet'e götürür).
**Hata olursa:** uzaktayken kişi sayısı ekranına geçildiyse, telefonun gösterdiği konum doğruluğunu (varsa) ve mekana uzaklığı yaz. Bu ❌'dır.

## V4. Kişi sayısı ve masa adı (A, mekanda) [P0]

> Otomatik: tamamı, emülatör konumuyla (`02-checkin.yaml`; E2E mekanının noktaları olduğu için önce "Neredesin?"). Elle: gerçek GPS.

1. Mekanda: Keşfet'te test mekanının kartında **Buraya giriş yap** → rıza kutusu → **Konumumu kullan** → izin ver. **"Masada kaç kişisiniz?"** ekranı açılır. (Noktası olan mekanda, ör. kampüs açılınca, önce **"Neredesin?"** listesi gelir: bir nokta seç → **Devam**.)
2. Seçenekler: **1 / 2 / 3 / 4+** (5 ve 6 yok).
3. Katılım biçimi burada sorulmaz; oda kurarken ve katılma isteğinde seçilir (V7).
4. **2**'yi seç, **Masayı aç**. "Masan hazır" ekranında takma adı not et: sıfat + isim (isim hayvan, yiyecek, bitki, nesne ya da doğa olabilir).
5. Mekan sekmesine dokun.
6. Mekan ekranında **Adı değiştir**: yeni ad, altında "2 hakkın kaldı". İki kez daha bas: "Bu masada adı değiştirme hakkın bitti", düğme soluk.

**Bak:**

- Masa açıldıktan sonra **Mekan sekmesi Mekan ekranını açar** (artık Keşfet'e götürmez); ekranda "2 kişi" yazar.

**Hata olursa:** masa açılmadıysa ekrandaki mesajı yaz.

## V5. Profil kurulumu (A ve B) [P0]

> Otomatik: 1. adım (`03-name.yaml`). Elle: 2–5.

P0'da yalnızca 1. adım; 2–5. adımlar P1.

1. Profil: kayıtta girilen ad yaşla birlikte görünür, ör. **"Deniz, 24"**. Doğum tarihi Profil'de **görünmez**; yalnızca Ayarlar → Hesap'ta sana görünür.
2. A: **Profili düzenle** → Tanıtım'a bir cümle yaz → **Kaydet**. Sayaç `n/160` doğru sayıyor.
3. Küfürlü bir ad dene (ör. içinde "amk" geçen): **"Ad 2–24 karakter olmalı ve uygun olmayan ifade içermemeli."**; kaydedilmez.
4. Tek harfli ad dene: **Kaydet** soluk kalır.
5. Profil → dişli → Ayarlar: "Masaya varsayılan katılım" seçimi **yok** (katılım oda başına seçilir). **Bildirimler**'de iki anahtar açık.

**Bak:** Profil ekranında ad ve tanıtım görünüyor; "Rozetler" altında "Oynadıkça rozet kazanırsın." (rozetler bu adımda boş, beklenen).
**Hata olursa:** kaydedilmeyen alanı ve mesajı yaz.

## V6. Konum etiketli kamera fotoğrafı (B) [P1]

Amaç: telefonda konum servisi ve kamerada konum etiketi açıkken çekilen fotoğrafın konum bilgisi olmadan yüklenmesi.

1. B: Profil → **Fotoğraf ekle** → **Fotoğraf çek** → kamera izni → bir fotoğraf çek → kareyi onayla.
2. İstersen ayrıca **Galeriden seç** ile telefonun kamerasıyla daha önce çekilmiş (konum etiketli) bir fotoğraf seç.

**Bak:**

- Pencerede "Fotoğrafın konum ve cihaz bilgisi gibi bütün ek bilgilerden arındırılarak yüklenir." yazar.
- Birkaç saniyede pencere kapanır, profil fotoğrafı daire içinde görünür.
- Hata mesajı çıkmaz. "Bu fotoğraf kullanılamadı." çıkarsa ❌ (metadata silinemedi ya da sunucu reddetti): saati yaz.

**Sonra (panelde, geliştirici):** Storage → `profile-photos` → B'nin klasöründeki `.jpg` dosyasını indir, bir EXIF görüntüleyicide aç (ör. `exiftool dosya.jpg`): **GPS, cihaz modeli, tarih alanı olmamalı**; boyut 512×512, birkaç on KB.

## V7. Lobide "profilli" etiketi, katılma isteği (A ve B) [P0]

> Otomatik: oda kurma (niyet "Oyun", anonim), botun profilli isteği, kabul, sohbetle başlayan oda (`04-room-tabu.yaml`). Elle: lobideki "profilli" etiketi.

1. A: **Oda kur**. Ekranda oyun seçimi **yok**: yalnızca niyet (Etiket yok / Oyun / Sohbet) ve katılım (**Anonim** seçili / Profilimle). **Oyun** ve **Profilimle** seç → **Odayı kur**.
2. B: Keşfet → test mekanı → check-in → **3** → **Masayı aç**. Mekan ekranındaki "Açık odalar"a bak.
3. B: A'nın odasında **Katılmak istiyorum** → açılan pencerede **Profilimle** → **İsteği gönder**.
4. A: "Katılma isteği" penceresi → **Kabul**.

**Bak:**

- B'nin lobisinde A'nın odasında **"Oyun"** etiketi ve takma adın yanında küçük **"profilli"** etiketi. Oyun adı, A'nın görünen adı, fotoğrafı ya da tanıtımı **lobide yok**.
- A'nın istek penceresinde B'nin takma adı, "(3 kişi)" ve **"profilli"** etiketi; ad ya da fotoğraf yok.
- Kabulden sonra oda **sohbetle** başlar: üstte "Oyun öner" (Sesli Tabu öner / Sohbet kartları öner), altta sohbet. Oyun kendiliğinden başlamaz.

## T1. Oyun önerisi ve başlatma [P0]

> Otomatik: botun önerisini kabul, kapalı kart, Pas, tur geçişi ve hakemlik; tur, bot tarafından bitirilir; "Oyunu bitir" ile sohbete dönüş ve botun kabul etmediği öneri (`04-room-tabu.yaml`). Elle: sesli oyun, aynı anda basma (T3.4), T4 gecikmesi, 6 tur ve oyun sonu.

V7'deki odada devam.

1. B: **Sohbet kartları öner**. B'de "Sohbet kartları önerdin. Yanıt bekleniyor (… sn)."; A'da "Diğer masa Sohbet kartları öneriyor." ve **Oynayalım** / **Şimdi değil**.
2. A: **Şimdi değil**. B'de **hemen** "Öneri kabul edilmedi." Bir kez daha önerip bu kez 30 sn cevapsız bırak: B'de aynı metin.
3. B: **Sesli Tabu öner** → A: **Oynayalım**.

**Bak:** İki ekranda "Tur 1/6", aynı sayaç (en fazla 1 sn fark), iki masa kutusu ve 0–0 skor. A'nın kutusunda "anlatıyor", B'nin ekranında "A … anlatıyor. Hakem sizsiniz."

## T2. Anlatanın kartı kapalı başlar (A) [P0]

1. A'nın ekranında kart yerine siyah alan: **"Kartı görmek için dokun"** ve **"Önce telefonu takım arkadaşlarından sakla."**
2. A telefonu kendi masasından saklayıp dokunur: kart ve yasaklı kelimeler görünür; tur boyunca açık kalır.

**Bak:** Kart kapalıyken A'nın düğmeleri pasif. B (hakem) kartı baştan görüyor.

## T3. Kim neye basabilir [P0]

Anlatan A'da düğmeler: **Doğru +1** ve **Pas · 3**. Hakem B'de: **Doğru +1** ve **Tabu −1**.

1. A masası kelimeyi bilince **B** Doğru'ya basar: iki ekranda A'nın skoru 1, yeni kart.
2. A anlatırken yasaklı kelime söylerse **B** Tabu'ya basar: A'nın skoru bir düşer.
3. **A** Pas'a basar: "Pas · 2", skor değişmez, yeni kart. 3 pastan sonra Pas düğmesi pasif.
4. Bir kartta **ikisi aynı anda** Doğru'ya bassın: skor yalnızca **1** artmalı, iki ekran aynı karta geçmeli.

**Hata olursa:** skorun iki kez arttığını ya da iki ekranın farklı kartlarda kaldığını gördüysen saati ve kartları yaz.

## T4. Gecikmeyi ölç [P0]

Basışla **karşı telefonda** kartın değişmesi arasındaki süre. Basan telefon anında değişir; ölçülen, diğer telefonun ne kadar geç yetiştiği.

1. İki telefonu yan yana koy, ekranlar aynı yöne baksın. Üçüncü telefon ikisini birden çeksin.
2. Videoyu başlat. **B** (hakem) 10 kez, 3–4 saniye arayla Doğru'ya bassın. Parmak ekrana değdiği an görünsün.
3. Videoyu kare kare izle (60 fps'de bir kare ≈ 17 ms). Her basış için:
   - parmağın B'nin ekranına değdiği kare,
   - **A**'nın ekranında yeni kartın belirdiği kare.
4. İki kare arasındaki farkı milisaniyeye çevir, 10 basışın ortalamasını ve en kötüsünü yaz. Ayrıca B'nin kendi kartının değişme süresine bak (neredeyse sıfır olmalı).
5. Aynı ölçümü **A**'nın Pas'ıyla (B'de değişme) 5 kez tekrarla.

Not biçimi:

```
Gecikme (B basar → A değişir): ortalama … ms, en kötü … ms (10 basış). Ağ: Wi-Fi/mobil
Gecikme (A basar → B değişir): ortalama … ms, en kötü … ms (5 basış)
Basan telefon: anında / gecikmeli
```

**Bak:** Basan telefon beklemeden sonraki karta geçer. Karşı telefonun gecikmesi turu bozmayacak düzeyde (önceki ölçüm: ~1,5 sn, her kartta bekleme). 1,5 sn'nin üstündeyse ya da basan telefon da bekliyorsa ❌.

## T5. Tur geçişi ve oyun sonu [P0]

1. Süre bitince iki ekranda "Tur bitiyor…", ardından "Tur 2/6": anlatan B, hakem A. B'nin kartı kapalı başlar.
2. 6 tur sonunda iki ekranda skorlar ve **"… kazandı!"** ya da **"Berabere!"**
3. İki ekranda oda sohbete döner: son oyunun skoru ve yeniden "Oyun öner". İki masa da yeni bir öneri yapabilir.
4. (P1) Bir oyun sürerken **Oyunu bitir**: iki ekranda oda sohbete döner.

**Bak:** Profil → Rozetler: iki hesapta da **İlk oyun** görünür.

## T6. Oda sonu ve karşılıklı Evet [P0]

> Otomatik: karşılıklı Evet ve işaret ekranı (`05-reveal-friend-dm.yaml`).

A **Odayı bitir**: "Tanışalım mı?" ekranında skor satırı yok (sesli oyunda ortak skor yok); akış önceki adımlardaki gibi.

İki taraf da **Evet** desin. **Bak:** ikinci Evet'ten hemen sonra iki ekranda **aynı renk ve aynı emoji**, "Ekranını kaldır, birbirinizi bulun." Bu ekranda kal: F1 burada yapılır. Bu pencerenin 30 saniyesi dolmadan kurulan yeni açık oda lobide görünmez; beklenen davranış.

## F1. "Arkadaş ekle": iki masa da basarsa arkadaş olunur (T6'nın sonuç ekranında) [P0]

> Otomatik: iki masa da basınca arkadaşlık (`05-reveal-friend-dm.yaml`). Elle: bir taraf basınca diğer telefonda hiçbir şeyin değişmemesi (botun ekranı yok).

Oda en az 3 dakika iki masalı kaldığı için (T1–T5) sonuç ekranında **Arkadaş ekle** düğmesi var.

1. Yalnızca **A** basar. A'da "Eklendi. İkiniz de basarsanız arkadaş olursunuz." yazar.
2. **B basmadan 10 saniye beklesin** ve ekranına baksın.
3. Sonra **B** de basar.

**Bak:**

- 2. adımda B'nin ekranında **hiçbir şey değişmez**: A'nın bastığına dair yazı, işaret ya da bildirim yok (kural 5).
- İkisi de bastıktan sonra **Mekana dön** → Mesajlar sekmesi: iki telefonda da karşı tarafın **görünen adı** (V5'te girilen; masa takma adı değil) ve "… beri arkadaşsınız".

**Hata olursa:** B'de A'nın bastığını belli eden bir şey gördüysen ekran görüntüsü al; bu ❌'dır. Düğme hiç görünmediyse oyunun kaç dakika sürdüğünü yaz.

## F2. Arkadaşın profili (A ve B) [P1]

1. Arkadaşlar'da karşı tarafın satırına dokun: konuşma ekranı, "Henüz mesaj yok. İlk mesajı sen yaz."
2. **Diğer** → **Profili gör**.

**Bak:**

- Profilde ad, fotoğraf (B'ninki V6'dan), tanıtım ve rozetler var; oda bittiği hâlde görünür, çünkü artık arkadaşsınız.
- Mekan, konum ya da aktif masa bilgisi **hiçbir yerde yok**. Arkadaş ya da takipçi sayısı yok.

## F3. Mesajlaşma (A ve B) [P0]

> Otomatik: mesaj gönderme ve alma (`05-reveal-friend-dm.yaml`). Elle: "Yeni mesaj", küfür reddi, konuşma şikayeti.

1. A ve B: Arkadaşlar'da karşı tarafın satırına dokun, konuşma ekranı açılır. A: "Merhaba" yaz → **Gönder**. B konuşma ekranındaysa mesaj 1–2 sn içinde düşer.
2. B konuşmadan çıkıp Arkadaşlar listesine dönsün. A bir mesaj daha göndersin: B'nin listesinde A'nın satırında **Yeni mesaj**; konuşmayı açınca kaybolur.
3. Küfürlü bir mesaj dene: "Mesajın uygun olmayan bir ifade içeriyor."; gitmez. Gündelik kelimeler ("sık sık", "sıkıldım") gider.
4. B: **Diğer** → **Konuşmayı şikayet et** → bir sebep → "Şikayetin alındı. Teşekkürler." Konuşma sürer.

**Bak (sonra, panelde):** `reports` tablosunda `target_type = 'dm'` satırı; `messages_snapshot` içinde konuşmanın son mesajları.
**Hata olursa:** gelmeyen mesajın saatini ve metnini yaz.

## F4. Mesaj bildirimi (push) [P0]

Gerekli: APK `google-services.json` ile alınmış olmalı (CLAUDE.md → "Push"). Değilse bu adımı atla ve "F4 atlandı: FCM yok" diye not et; F6'daki bildirim kontrolü de atlanır.

1. B: bildirim izni verilmiş olmalı (ilk açılışta sorulur; reddedildiyse telefonun ayarlarından ver). B uygulamayı arka plana alsın ve ekranı kilitlesin.
2. A: B'ye bir mesaj gönder.
3. B: bildirime dokun.
4. B: Profil → dişli → Ayarlar → Bildirimler → **Mesajlar** kapalı. Uygulamayı yine arka plana al. A bir mesaj daha göndersin. Sonra anahtarı yeniden aç.

**Bak:**

- 2. adımda B'de bildirim: başlık **"Kabuk"**, metin **"Yeni bir mesajın var"**. Gönderenin adı ve mesajın içeriği **yok**.
- Bildirime dokununca uygulama açılır.
- 4. adımda bildirim **gelmez**; mesaj uygulama açılınca konuşmada görünür.

**Hata olursa:** bildirim hiç gelmediyse bildirim izninin durumunu ve (panelde) B'nin `profiles.push_token` alanının dolu olup olmadığını yaz. Bildirimde içerik ya da ad göründüyse bu ❌'dır.

## S1. Sohbet (A ve B) [P1]

1. A: **Oda kur** → niyet **Sohbet** → **Odayı kur**; B katılır (V7'nin 3–4. adımları). İki telefonda karşılıklı birkaç mesaj yaz.
2. Küfürlü bir mesaj dene: "Mesajın uygun olmayan bir ifade içeriyor." Mesaj gitmez.
3. Aynı saniyede iki mesaj göndermeyi dene: ikincisi "Çok fazla istek gönderdin…" ile reddedilir.
4. Gündelik kelimeler reddedilmemeli: "çok şık olmuşsun", "sık sık geliriz", "sıkıldım".
5. B uygulamayı birkaç saniye arka plana alsın: A'da "Diğer masanın bağlantısı koptu." görünür; B geri gelince kaybolur.

**Bak:** mesajlar karşı tarafa 1–2 sn içinde düşüyor, gönderen takma adıyla görünüyor.
**Hata olursa:** gelmeyen mesajın saatini ve metnini yaz; yanlışlıkla reddedilen masum cümleyi aynen yaz (küfür listesine geri bildirim).

## S2. Oda şikayeti (B → A, S1'in odasında) [P1]

1. B: **Şikayet et** → bir sebep → "Şikayetin alındı. Teşekkürler.".
2. Oda devam eder.

**Bak (sonra, panelde):** Table Editor → `reports`: yeni satır, `messages_snapshot` içinde odadaki son mesajlar.
**Hata olursa:** hata metni ve saat.

## S3. Tanışma: "Evet" diyen taraf "Hayır"ı ve cevapsızlığı ayırt edemez [P0]

Pencere 30 saniyedir. Karşılıklı Evet T6'da görüldü; burada kalan iki durum oynanır. İlki S1'in odasını bitirir (S1 atlandıysa A yeni bir açık oda kurar, B katılır); ikincisi için A yeni bir açık oda kurar, B katılır (V7'nin 2 ve 4–5. adımları, oyun oynamadan). Bu odalar 3 dakikadan kısa sürerse oyun geçmişine yazılmaz; beklenen davranış.

**S3a. A Evet, B Hayır.** S1'in odasında (ya da yeni odada) A **Odayı bitir**. A **Evet**, B **Hayır**.
**Bak:** B hemen "Güzel oyundu 👋" ve **Mekana dön** görür. A'da "Cevabın alındı. Sonuç birazdan." yazar ve sayaç **0'a inene kadar** hiçbir şey değişmez; sayaç bitince A da "Güzel oyundu 👋" görür. A'nın sonucu gördüğü saniyeyi not et.

**S3b. A Evet, B cevap vermez.** Yeni odada A **Odayı bitir**. A **Evet**, B hiçbir şeye basmaz (ekran açık kalsın).
**Bak:** A için S3a ile **birebir aynı**: aynı ekran, sonuç yine sayaç 0'da. S3a ile S3b arasında A'nın gözünden bir fark gördüysen (daha erken sonuç, farklı yazı) mutlaka yaz: bu, "Hayır"ın sızması demektir.

**Hata olursa:** sayaç 0 olduğu hâlde sonuç gelmediyse kaç saniye beklendiğini yaz (en geç 1 dk içinde sunucu kapatır). İki ekranda farklı renk ya da emoji görüldüyse ekran görüntüsü al.

## V8. Beyaz ekran senaryosu: iki masalı Tabu, önce A bitirir, sonra B [P0]

> Otomatik: diğer masa (bot) bitirir, bu telefon izlenir; tanışma ekranı gelir, hata ekranı yok (`06-white-screen.yaml`). Elle: iki telefonla V8a ve V8b.

Bu senaryo iki kez oynanır. Her turda **odayı bitirmeyen telefon** izlenir: ekranın beyaza dönmemesi, takılmaması ve doğru ekrana geçmesi gerekir.

**V8a (A bitirir, B izlenir):**

1. A yeni oda kurar, B katılır (V7'nin 1 ve 3–4. adımları). A **Sesli Tabu öner**, B **Oynayalım**. 1–2 tur oyna (Doğru ya da Pas).
2. A: **Odayı bitir**.
3. **B'yi izle.**

**Bak (B):** birkaç saniye içinde "Tanışalım mı?" ekranı ve 30 sn sayaç; **beyaz ekran, boş ekran ya da "Bir şeyler ters gitti" yok**. İki taraf da **Hayır** desin → "Güzel oyundu 👋" → **Mekana dön** → Mekan ekranı.

**V8b (B bitirir, A izlenir):**

1. A yeniden oda kurar, B katılır (V7'nin 3–4. adımları), Sesli Tabu önerilip kabul edilir, 1–2 tur.
2. B: **Odayı bitir**.
3. **A'yı izle.**

**Bak (A):** V8a'daki B ile aynı: tanışma ekranı düzgün açılıyor, beyaz ekran yok. Bu kez ikisi de **Evet** desin: aynı renk ve emoji iki ekranda.

**Hata olursa:** beyaz ekran görülürse **hangi telefon, hangi turda, hangi düğmeden sonra** ve kaç saniye sürdüğünü yaz; uygulamayı kapatıp açınca ne gördüğünü ekle. "Bir şeyler ters gitti" ekranı çıktıysa **Tekrar dene**'ye bas ve sonucu yaz (bu ekran beyaz ekranın yerini alan hata sınırıdır; çıkması da ❌ ama beyaz ekrandan iyidir).

## V9. Odada profil görme ve profil şikayeti (A ve B) [P1]

1. A yeniden oda kurar, B katılır (ikisi de V7'deki gibi **Profilimle**: A oda kurarken, B katılma isteğinde).
2. B: oda ekranında **"Diğer masanın profilini gör"** → A'nın adı, tanıtımı ve (varsa) fotoğrafı.
3. A: aynı düğmeyle B'nin profilini açar: V6'daki fotoğraf görünür.
4. B: A'nın profilinde **Profili şikayet et** → bir sebep → **"Şikayetin alındı. Teşekkürler."**
5. **Geri dön** ile odaya dön.

**Bak:**

- Profil ekranında mekan, konum ya da masa bilgisi yok; yalnızca ad, fotoğraf, tanıtım, rozetler.
- Anonim katılan masanın profili açılmaz (istersen dene: B istekte **Anonim** seçsin): düğme **hiç görünmez**.

**Sonra (panelde):** `reports` tablosunda `target_type = 'profile'` satırı; `profile_snapshot` içinde A'nın adı ve tanıtımı.

## V10. Oda bittikten sonra profil görünmez [P1]

1. V9'daki odada B, A'nın profilini açık tutsun (profil ekranında kalsın).
2. A: **Odayı bitir**, iki taraf **Hayır** (ya da pencereyi beklesin).
3. Pencere kapandıktan ve iki taraf Mekan ekranına döndükten sonra B, **geri tuşuyla** profil ekranına dönmeyi denesin (mümkün değilse sorun değil).

**Bak:**

- Oda ekranında "Diğer masanın profilini gör" düğmesi artık yok.
- Profil ekranı yeniden açılırsa **"Bu profil artık görüntülenemiyor."** yazar; ad ve fotoğraf görünmez.
- Keşfet, lobi ve Mekan ekranında A'nın profili hiçbir yerde yok.

**Hata olursa:** oda bittikten sonra hâlâ ad ya da fotoğraf görünen ekranı ve saati yaz; bu ❌'dır.

## S4. Katılma isteğinde red ve zaman aşımı aynı görünmeli [P1]

Reddedilen masa o odayı lobide bir daha görmez; bu yüzden iki deneme için A iki ayrı oda kurar.

1. A açık oda kurar. B istek gönderir. A **Geç**.
   **Bak:** B'de sayaç 60 sn boyunca "Yanıt bekleniyor" der, **ancak 60 sn dolunca** "Masa şu an müsait değil." görünür. Hemen görünürse ❌.
2. A odayı bitirir (tek masalı oda doğrudan kapanır) ve yeni açık oda kurar. B istek gönderir. A hiçbir şey yapmaz.
   **Bak:** B'de 1. denemedekiyle aynı ekran, aynı zamanlama.

**Hata olursa:** B'de mesajın göründüğü saniyeyi iki deneme için ayrı ayrı yaz.

## F5. Arkadaşlıktan çıkarma (A çıkarır) [P1]

1. A: B ile konuşma → **Diğer** → **Arkadaşlıktan çıkar** → "Konuşmanız silinir. Karşı tarafa bildirilmez." → **Çıkar**.
2. B: sağ üstteki zil → **Bildirimler** → "Oyun geçmişi"nde A'nın masasının satırı (T1–T5'teki oyun) → **İstek gönder**.

**Bak:**

- 1'den sonra iki listede de arkadaş yok, konuşma iki tarafta da silinmiş. B'ye bildirim, yazı ya da push **gitmez**.
- 2'de B'de "… masasına istek gönderildi" yazar ve **öyle kalır** (çıkarılan tarafın isteği sessizce yutulur). A'da gelen istek yok, bildirim yok.

**Hata olursa:** A'da B'den istek göründüyse ❌; saati yaz.

## F6. Arkadaşlık isteği ve red (A → B) [P1]

Çıkaran taraf isterse yeniden istek gönderebilir.

1. B uygulamayı arka plana alsın. A: zil → Bildirimler → B'nin masasının satırı → **İstek gönder**.
2. B: uygulamayı aç → sağ üstteki zil → **Bildirimler** → "Gelen istekler".
3. B: **Reddet**.

**Bak:**

- 1'de (FCM'li build) B'de bildirim: **"Kabuk"**, **"Yeni bir arkadaşlık isteğin var"**; ad ya da içerik yok. Zilde "1" rozeti.
- 2'de istek oyun bağlamıyla görünür: "… Sesli Tabu oynadığınız … masası arkadaşın olmak istiyor". A'nın görünen adı ya da fotoğrafı **yok**.
- 3'ten sonra A'da satır "… masasına istek gönderildi" olarak **kalır**; red A'ya hiçbir yerde görünmez ve bildirim gitmez.

**Hata olursa:** A'da "reddedildi" anlamına gelen herhangi bir değişiklik gördüysen ekran görüntüsü al; bu ❌'dır.

## F7. Geçmişten engelleme ve engeli kaldırma (B → A) [P0]

> Otomatik: geçmişten engelleme ve arkadaşlığın düşmesi (`07-history-block.yaml`). Elle: lobide görünmezlik, engeli kaldırma.

1. B: zil → Bildirimler → A'nın masasının satırı → **Diğer** → **Engelle**. Pencerede "Birbirinizi lobide, isteklerde ve arkadaş listesinde bir daha görmezsiniz. Karşı tarafa bildirilmez." yazar. **Şikayet de et**'i işaretle → **Engelle**.
2. A mekanda açık bir oda kursun; B lobisine baksın. Sonra B açık oda kursun; A lobisine baksın.
3. B: Profil → dişli → Ayarlar → Engellenenler: A'nın masa takma adı ve tarih → **Engeli kaldır**. 2. adımı tekrarla.

**Bak:**

- 2'de iki taraf da diğerinin odasını lobide **görmez**. A'ya hiçbir bildirim gitmez; F6 yapıldıysa A'nın "Gönderilen istekler"i F6'dakiyle aynı görünür.
- 3'ten sonra odalar yeniden görünür.

**Bak (sonra, panelde):** `reports` tablosunda `target_type = 'history'` satırı (F7'nin "Şikayet de et"i).

## T7. İş birliği modu: tek kişilik masa (A ve B) [P0]

> Otomatik: bot tek kişilik masayla katılır; cihaz 1. turda anlatır, 2. turda kartı görmez (`06b-tabu-coop.yaml`). Elle: sesli oyun ve tahmin eden telefonun ekranı.

1. B: **Mekandan ayrıl**, yeniden check-in, kişi sayısı **1** → **Masayı aç**.
2. A yeni oda kurar, B katılır; **Sesli Tabu öner** → **Oynayalım**.
3. A anlatır (1. tur): kart kapalı başlar; açınca **Doğru**, **Pas** ve **Tabu**'nun üçü de A'da. Üstte tek bir **"Ortak skor"** kutusu.
4. B (tahmin eden): kart **yok**. Ekranda geri sayım, ortak skor ve "… size anlatıyor. Anlatanı dinleyin ve tahmin edin." Düğme yok.
5. 2. tur: B anlatır; bu kez kartı ve üç düğmeyi B görür, A görmez.

**Bak:** Tahmin eden telefonda kart hiçbir an görünmüyor (kart değişirken de). Skor iki masada aynı ve tek. Oyun sonunda "Sesli Tabu bitti. Ortak skor: …"; kazanan yok.

**Hata olursa:** tahmin eden telefonda kart ya da yasaklı kelime gördüysen ekran görüntüsü al ve turu yaz; bu ❌'dır.

## S5. Odada engelleme ve engeli kaldırma [P1]

Engelleme odayı bitirdiği için bu adım en sona yakın yapılır. F5'ten beri A ile B arkadaş değil; engelleme bir arkadaşlığı da düşürürdü.

1. A yeni oda kurar, B katılır.
2. B: **Engelle** → onay. İki ekranda "Tanışalım mı?" açılır; B'de "Cevabın alındı. Sonuç birazdan." (engelleme B için "Hayır" sayılır).
3. A: **Evet**. 30 sn dolunca A'da **"Güzel oyundu"**: A bunu B'nin "Hayır"ından ayırt edemez. İki taraf **Mekana dön**.
4. B ana ekranda: A'nın odası lobide görünmez. B açık oda kurar: A'nın lobisinde de görünmez.
5. B: Profil → dişli → Ayarlar → Engellenenler: A'nın o andaki takma adı ve tarih. **Engeli kaldır**.
6. Lobiler yeniden birbirini gösterir.

**Bak:** A'nın ekranı engellemeden sonra da "Tanışalım mı?" penceresine geçer, oda "dağılmaz"; oda ekranında "Odadan çık" yok, tek çıkış **Odayı bitir**. Engellenenler listesinde yalnızca takma ad ve tarih var.
**Hata olursa:** engelden sonra hâlâ görünen odayı ve kimin lobisinde göründüğünü yaz.

## S6. Masanla oyna [P1]

> Otomatik: özel oda, tek masa Tabu ve "Odayı bitir" (`06-white-screen.yaml`).

1. A: Mekan ekranında **Masanla oyna**. Oda ekranı açılır; niyet ya da katılım sorulmaz. Oyun seçenekleri doğrudan: **Sesli Tabu başlat** / **Sohbet kartları başlat**.
2. B'nin lobisinde bu oda **görünmez**.
3. A: Sesli Tabu → 1 tur oyna → **Oyunu bitir** → **Odayı bitir**: "Tanışalım mı?" sorulmadan Mekan ekranına döner.

## M1. Mekan sohbet odası: anonim ve profilli (A ve B) [P0]

> Otomatik: anonim ve profilli mesaj, botun profilli mesajı, profil, istek ve kabul (`08-venue-chat.yaml`). Elle: iki telefonla gerçek zamanlı akış.

1. A: Mekan ekranında **Sohbet odası** → "<mekan> sohbet odası". Bir mesaj yaz (anonim): adının yerinde **masa adın**.
2. A: **Profilimle yaz**'ı işaretle, bir mesaj daha yaz: bu kez **görünen adın** ve "profilli" etiketi; masa adın **görünmez**.
3. B: aynı ekranda iki mesajı birkaç saniye içinde görür.
4. B: A'nın profilli mesajındaki ada dokun → A'nın profili (ad, yaş, varsa fotoğraf). Profil kimliği ya da masa adı yok.
5. B: **Arkadaşlık isteği gönder** → pencerede "İstek gönderirsen profilin ona görünür…" → **İsteği gönder**.
6. A: Arkadaşlar → Geçmiş ve istekler → "<mekan> sohbet odasından **B'nin adı (yaş)** arkadaşın olmak istiyor", fotoğrafıyla. **Kabul et**.

**Bak:**

- Anonim mesajda ad yok, profilli mesajda masa adı yok.
- A'nın anonim mesajına dokununca profil açılmaz; yalnızca **Şikayet et** ve **Engelle** menüsü.
- B'nin "Gönderilen istekler"inde "A'nın adı kişisine istek gönderildi", kabulden sonra "… isteğini kabul etti".

## M2. Mekan sohbetinde şikayet ve engel [P1]

1. B: A'nın bir mesajına dokun → **Şikayet et** → bir sebep → "Şikayetin alındı."
2. B: A'nın mesajına dokun → **Engelle** → onay. B artık A'nın mesajlarını görmez; A da B'ninkileri görmez.
3. B: Ayarlar → Engellenenler: profilli mesajdan engellendiyse A'nın **görünen adı**, anonim mesajdan engellendiyse **masa adı**.
4. Engeli kaldır; mesajlar yeniden iki yönde görünür.

**Sonra (panelde):** `reports` → `target_type = 'venue_chat'`, `messages_snapshot` içinde son mesajlar.

## M3. Mekandan çıkınca erişim biter [P1]

1. A: **Mekandan ayrıl**. Mekan sekmesi Keşfet'e döner; sohbet odası açılmaz.
2. A yeniden check-in yapınca odanın son 24 saatteki mesajlarını yeniden görür.

## V11. Kapanış [P1]

1. İki telefonda **Mekandan ayrıl**; Mekan sekmesi yine Keşfet'e götürür.
2. (İsteğe bağlı) B: Profil → **Fotoğraf değiştir** → **Fotoğrafı kaldır**; profil dairesi boşalır.
3. Etkinlikleri kaldır: `pnpm admin:event list`, sonra her biri için `pnpm admin:event remove <id>`.
4. (İsteğe bağlı) Ayarlar → **Hesabımı sil**; aynı test numarasıyla yeniden kayıt olunabilmeli. Arkadaşlıklar, konuşmalar ve fotoğraflar hesapla gider.
5. Test bitince panelde test numaralarını sil ve test mekanını pasif yap.

## Test sonrası

Notları ve ekran görüntülerini tek bir yerde topla; ❌ olan adımları hata satırlarıyla birlikte bildir. Adım numaraları bu belgedeki numaralardır.
