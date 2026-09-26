# Saha testi: main (v2 adım 1–5), iki telefonla uçtan uca

Tek bir sıra. **A** ve **B** iki telefon, iki hesap, aynı mekan; **A** oda sahibi (sen), **B** misafir masa (arkadaşın). Sesli Tabu'daki gecikme ölçümü (T4) için **üçüncü bir telefon** ya da kamera gerekir. Tamamı yaklaşık 3 saat; T4'ten sonra ve S3'ten sonra mola verilebilir. Her adım **P0** ya da **P1** olarak işaretli: süre yetmezse önce aşağıdaki P0 sırası yapılır, P1'ler kalan sürede tam sıradaki yerlerinde.

Adım adları: **G** giriş, **V** v2 adım 1–3 (iskelet, Keşfet, profil), **T** sesli Tabu (adım 5), **F** arkadaşlar, mesajlar ve bildirimler (adım 4), **S** v1'den kalan ve hâlâ geçerli akışlar. Hata satırında bu adları kullan.

## P0 sırası (kritik yol, yaklaşık 1 saat)

Beyaz ekran, check-in, sesli Tabu ve gecikme ölçümü, tanışma sızıntısı, arkadaşlık, mesaj ve bildirim, geçmişten engelleme. Her adım, atlanan P1'lere ihtiyaç duymadan yapılabilir.

1. **Test öncesi**: listenin tamamı (evde).
2. **G1.** Giriş, A ve B (~5 dk).
3. **V4.** Check-in, kişi sayısı ve katılım biçimi, A (~5 dk).
4. **V5.** Yalnızca 1. adım: iki telefonda görünen ad (~3 dk). Arkadaşlık isteği ad ister.
5. **V7.** Lobide "profilli" etiketi, katılma isteği; Tabu odası (~5 dk).
6. **T1–T5.** Sesli Tabu, T4'teki gecikme ölçümü dahil (~15 dk).
7. **T6 → F1.** Karşılıklı Evet, sonuç ekranında "Arkadaş ekle" (~3 dk).
8. **F3.** Mesajlaşma (~5 dk).
9. **F4.** Mesaj bildirimi; FCM'li build yoksa atlanır ve not edilir (~5 dk).
10. **S3.** Tanışma sızıntısı: Hayır ve cevapsız (~6 dk).
11. **V8.** Beyaz ekran senaryosu, V8a ve V8b (~8 dk).
12. **F7.** Geçmişten engelleme ve engeli kaldırma (~5 dk).

## Sıra

| #   | Öncelik | Adım                                     | Telefonlar           | Not                                    |
| --- | ------- | ---------------------------------------- | -------------------- | -------------------------------------- |
| 1   | P0      | Test öncesi                              | A, B                 | Evde, bir kez                          |
| 2   | P0      | G1. Giriş                                | A, B                 | Görünen ad girme (V4 ve V5 bunu ister) |
| 3   | P1      | V1. Açılış ve sekmeler                   | A, B                 |                                        |
| 4   | P1      | V2. Keşfet                               | A                    |                                        |
| 5   | P1      | V3. Yarıçap dışından check-in            | A                    | Mekandan en az 400 m uzakta            |
| 6   | P0      | V4. Kişi sayısı ve katılım biçimi        | A                    | Mekanda                                |
| 7   | P0      | V5. Profil kurulumu                      | A, B                 | P0'da yalnızca 1. adım (ad)            |
| 8   | P1      | V6. Konum etiketli fotoğraf              | B                    |                                        |
| 9   | P0      | V7. Lobide "profilli", katılma isteği    | A, B                 | Tabu odası; T bu odada sürer           |
| 10  | P0      | T1–T5. Sesli Tabu                        | A, B, üçüncü telefon | ~15 dk; oda 3 dakikayı geçer           |
| 11  | P0      | T6. Oda sonu, karşılıklı Evet            | A, B                 |                                        |
| 12  | P0      | F1. "Arkadaş ekle"                       | A, B                 | T6'nın sonuç ekranında                 |
| 13  | P1      | F2. Arkadaşın profili                    | A, B                 |                                        |
| 14  | P0      | F3. Mesajlaşma                           | A, B                 |                                        |
| 15  | P0      | F4. Mesaj bildirimi                      | A, B                 | FCM'li build gerekir                   |
| 16  | P1      | S1–S2. Sohbet odası, oda şikayeti        | A, B                 |                                        |
| 17  | P0      | S3. Tanışma sızıntısı (Hayır / cevapsız) | A, B                 | S1 yapıldıysa onun odasıyla başlar     |
| 18  | P0      | V8. Beyaz ekran senaryosu                | A, B                 |                                        |
| 19  | P1      | V9–V10. Odada profil, oda sonrası        | A, B                 |                                        |
| 20  | P1      | S4. Katılma isteğinde red ve zaman aşımı | A, B                 |                                        |
| 21  | P1      | F5. Arkadaşlıktan çıkarma                | A, B                 |                                        |
| 22  | P1      | F6. Arkadaşlık isteği ve red             | A, B                 |                                        |
| 23  | P0      | F7. Geçmişten engelleme                  | A, B                 |                                        |
| 24  | P1      | S5. Odada engelleme                      | A, B                 |                                        |
| 25  | P1      | V11. Kapanış                             | A, B                 |                                        |

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

## G1. Giriş (A ve B) [P0]

1. Uygulamayı aç, numarayı `5xx xxx xx xx` biçiminde gir, **Kod gönder**.
2. Test kodunu gir, **Doğrula**.
3. "Başlamadan önce" ekranında üç kutuyu işaretle, **Onayla ve devam et**.

**Bak:** SMS gelmemeli; kod ekranı hemen açılmalı. Yanlış kod "Kod hatalı ya da süresi dolmuş." demeli. Sonunda uygulama Keşfet sekmesinde açılmalı.
**Hata olursa:** hangi numara, hangi ekranda kaldı, hata metni. "Bu numarayla devam edilemiyor." görünürse numara ban listesinde olabilir; panelde test numarası tanımını kontrol et.

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

1. Keşfet'te test mekanına dokun → mekan detayı → **Buraya giriş yap**.
2. Rıza kutusunu işaretle → **Konumumu kullan** → izin ver.

**Bak:** konum alındıktan sonra kırmızı yazı: **"Bu mekana çok uzaktasın. Mekandayken tekrar dene."**; kişi sayısı ekranına geçilmez. Masa açılmaz (Mekan sekmesi hâlâ Keşfet'e götürür).
**Hata olursa:** uzaktayken kişi sayısı ekranına geçildiyse, telefonun gösterdiği konum doğruluğunu (varsa) ve mekana uzaklığı yaz. Bu ❌'dır.

## V4. Kişi sayısı ve katılım biçimi; adsız hesapta "Profille" kapalı (A, mekanda) [P0]

1. Mekanda: Keşfet'te test mekanına dokun → mekan detayı → **Buraya giriş yap** → rıza kutusu → **Konumumu kullan** → izin ver. **"Masada kaç kişisiniz?"** ekranı açılır.
2. Seçenekler: **1 / 2 / 3 / 4+** (5 ve 6 yok).
3. Altta "Nasıl katılıyorsunuz?": **Anonim** seçili. **Profille** soluk ve dokunulamaz; altında **"Profille katılmak için önce Profil sekmesinden bir ad seç."** yazar.
4. **2**'yi seç, Anonim kalsın, **Masayı aç**. "Masan hazır" ekranında takma adı not et.
5. Mekan sekmesine dokun.

**Bak:**

- "Profille"ye dokunmak hiçbir şey yapmaz.
- Masa açıldıktan sonra **Mekan sekmesi Mekan ekranını açar** (artık Keşfet'e götürmez); ekranda "2 kişi" yazar.

**Hata olursa:** "Profille" seçilebildiyse ve masa açıldıysa ❌; ekrandaki mesajı yaz.

## V5. Profil kurulumu (A ve B) [P0]

P0'da yalnızca 1. adım (görünen ad); 2–5. adımlar P1.

1. Profil → **Ad ekle** → görünen ad yaz (ör. A: "Deniz", B: "Ece") → **Kaydet**.
2. A: **Profili düzenle** → Tanıtım'a bir cümle yaz → **Kaydet**. Sayaç `n/160` doğru sayıyor.
3. Küfürlü bir ad dene (ör. içinde "amk" geçen): **"Ad 2–24 karakter olmalı ve uygun olmayan ifade içermemeli."**; kaydedilmez.
4. Tek harfli ad dene: **Kaydet** soluk kalır.
5. Profil → dişli → Ayarlar → **Gizlilik**: "Masaya varsayılan katılım" artık iki seçenek de dokunulabilir. Anonim kalsın. **Bildirimler**'de iki anahtar açık.

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

1. A: Mekan ekranından **Mekandan ayrıl**, sonra yeniden check-in; bu kez **2** ve **Profille** seç, **Masayı aç**.
2. A: **Oda kur** → **Tabu** → **Mekana açık** → **Odayı kur**.
3. B: Keşfet → test mekanı → check-in → **3** ve **Profille** → **Masayı aç**. Mekan ekranındaki "Açık odalar"a bak.
4. B: A'nın odasında **Katılmak istiyorum**.
5. A: "Katılma isteği" penceresi → **Kabul**.

**Bak:**

- B'nin lobisinde A'nın takma adının yanında küçük **"profilli"** etiketi. A'nın görünen adı, fotoğrafı ya da tanıtımı **lobide yok**.
- A'nın istek penceresinde B'nin takma adı, "(3 kişi)" ve **"profilli"** etiketi; ad ya da fotoğraf yok.

## T1. Oyunu başlat [P0]

V7'deki odada devam. V7'de şunlar da görülmüş olmalı:

1. A'nın "Oda kur" ekranında Tabu seçeneğinin altında **"Bu oyun yüz yüze oynanır…"** notu.
2. B'nin lobisinde oda **"Tabu · yüz yüze"**; A'nın istek penceresinde aynı not.
3. B'de "Oda sahibinin oyunu başlatması bekleniyor." A: **Oyunu başlat**.

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
3. A'da **Yeniden oyna**; B'de bekleme metni.

**Bak:** Profil → Rozetler: iki hesapta da **İlk oyun** görünür.

## T6. Oda sonu ve karşılıklı Evet [P0]

A **Odayı bitir**: "Tanışalım mı?" ekranında skor satırı yok (sesli oyunda ortak skor yok); akış önceki adımlardaki gibi.

İki taraf da **Evet** desin. **Bak:** ikinci Evet'ten hemen sonra iki ekranda **aynı renk ve aynı emoji**, "Ekranını kaldır, birbirinizi bulun." Bu ekranda kal: F1 burada yapılır. Bu pencerenin 30 saniyesi dolmadan kurulan yeni açık oda lobide görünmez; beklenen davranış.

## F1. "Arkadaş ekle": iki masa da basarsa arkadaş olunur (T6'nın sonuç ekranında) [P0]

Oda en az 3 dakika iki masalı kaldığı için (T1–T5) sonuç ekranında **Arkadaş ekle** düğmesi var.

1. Yalnızca **A** basar. A'da "Eklendi. İkiniz de basarsanız arkadaş olursunuz." yazar.
2. **B basmadan 10 saniye beklesin** ve ekranına baksın.
3. Sonra **B** de basar.

**Bak:**

- 2. adımda B'nin ekranında **hiçbir şey değişmez**: A'nın bastığına dair yazı, işaret ya da bildirim yok (kural 5).
- İkisi de bastıktan sonra **Mekana dön** → Arkadaşlar sekmesi: iki telefonda da karşı tarafın **görünen adı** (V5'te girilen; masa takma adı değil) ve "… beri arkadaşsınız".

**Hata olursa:** B'de A'nın bastığını belli eden bir şey gördüysen ekran görüntüsü al; bu ❌'dır. Düğme hiç görünmediyse oyunun kaç dakika sürdüğünü yaz.

## F2. Arkadaşın profili (A ve B) [P1]

1. Arkadaşlar'da karşı tarafın satırına dokun: konuşma ekranı, "Henüz mesaj yok. İlk mesajı sen yaz."
2. **Diğer** → **Profili gör**.

**Bak:**

- Profilde ad, fotoğraf (B'ninki V6'dan), tanıtım ve rozetler var; oda bittiği hâlde görünür, çünkü artık arkadaşsınız.
- Mekan, konum ya da aktif masa bilgisi **hiçbir yerde yok**. Arkadaş ya da takipçi sayısı yok.

## F3. Mesajlaşma (A ve B) [P0]

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

- 2. adımda B'de bildirim: başlık **"Masa"**, metin **"Yeni bir mesajın var"**. Gönderenin adı ve mesajın içeriği **yok**.
- Bildirime dokununca uygulama açılır.
- 4. adımda bildirim **gelmez**; mesaj uygulama açılınca konuşmada görünür.

**Hata olursa:** bildirim hiç gelmediyse bildirim izninin durumunu ve (panelde) B'nin `profiles.push_token` alanının dolu olup olmadığını yaz. Bildirimde içerik ya da ad göründüyse bu ❌'dır.

## S1. Sohbet (A ve B) [P1]

1. A: **Oda kur** → **Sohbet** → **Mekana açık** → **Odayı kur**; B katılır (V7'nin 4–5. adımları). İki telefonda karşılıklı birkaç mesaj yaz.
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

Bu senaryo iki kez oynanır. Her turda **odayı bitirmeyen telefon** izlenir: ekranın beyaza dönmemesi, takılmaması ve doğru ekrana geçmesi gerekir.

**V8a (A bitirir, B izlenir):**

1. A yeni açık **Tabu** odası kurar, B katılır (V7'nin 2 ve 4–5. adımları). A **Oyunu başlat**. 1–2 tur oyna (Doğru ya da Pas).
2. A: **Odayı bitir**.
3. **B'yi izle.**

**Bak (B):** birkaç saniye içinde "Tanışalım mı?" ekranı ve 30 sn sayaç; **beyaz ekran, boş ekran ya da "Bir şeyler ters gitti" yok**. İki taraf da **Hayır** desin → "Güzel oyundu 👋" → **Mekana dön** → Mekan ekranı.

**V8b (B bitirir, A izlenir):**

1. A yeniden açık oda kurar (Tabu), B katılır (V7'nin 4–5. adımları), A oyunu başlatır, 1–2 tur.
2. B: **Odayı bitir**.
3. **A'yı izle.**

**Bak (A):** V8a'daki B ile aynı: tanışma ekranı düzgün açılıyor, beyaz ekran yok. Bu kez ikisi de **Evet** desin: aynı renk ve emoji iki ekranda.

**Hata olursa:** beyaz ekran görülürse **hangi telefon, hangi turda, hangi düğmeden sonra** ve kaç saniye sürdüğünü yaz; uygulamayı kapatıp açınca ne gördüğünü ekle. "Bir şeyler ters gitti" ekranı çıktıysa **Tekrar dene**'ye bas ve sonucu yaz (bu ekran beyaz ekranın yerini alan hata sınırıdır; çıkması da ❌ ama beyaz ekrandan iyidir).

## V9. Odada profil görme ve profil şikayeti (A ve B) [P1]

1. A yeniden açık oda kurar, B katılır (ikisi de V7'deki gibi **Profille** masadalar).
2. B: oda ekranında **"Diğer masanın profilini gör"** → A'nın adı, tanıtımı ve (varsa) fotoğrafı.
3. A: aynı düğmeyle B'nin profilini açar: V6'daki fotoğraf görünür.
4. B: A'nın profilinde **Profili şikayet et** → bir sebep → **"Şikayetin alındı. Teşekkürler."**
5. **Geri dön** ile odaya dön.

**Bak:**

- Profil ekranında mekan, konum ya da masa bilgisi yok; yalnızca ad, fotoğraf, tanıtım, rozetler.
- Anonim bir masa katılırsa (istersen dene: B Anonim masayla katılsın) düğme **hiç görünmez**.

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
2. B: Arkadaşlar → **Geçmiş ve istekler** → "Oyun geçmişi"nde A'nın masasının satırı (T1–T5'teki oyun) → **İstek gönder**.

**Bak:**

- 1'den sonra iki listede de arkadaş yok, konuşma iki tarafta da silinmiş. B'ye bildirim, yazı ya da push **gitmez**.
- 2'de B'de "… masasına istek gönderildi" yazar ve **öyle kalır** (çıkarılan tarafın isteği sessizce yutulur). A'da gelen istek yok, bildirim yok.

**Hata olursa:** A'da B'den istek göründüyse ❌; saati yaz.

## F6. Arkadaşlık isteği ve red (A → B) [P1]

Çıkaran taraf isterse yeniden istek gönderebilir.

1. B uygulamayı arka plana alsın. A: Geçmiş ve istekler → B'nin masasının satırı → **İstek gönder**.
2. B: uygulamayı aç → Arkadaşlar → **Geçmiş ve istekler** → "Gelen istekler".
3. B: **Reddet**.

**Bak:**

- 1'de (FCM'li build) B'de bildirim: **"Masa"**, **"Yeni bir arkadaşlık isteğin var"**; ad ya da içerik yok. Arkadaşlar sekmesinde "1 yeni arkadaşlık isteği".
- 2'de istek oyun bağlamıyla görünür: "… Tabu oynadığınız … masası arkadaşın olmak istiyor". A'nın görünen adı ya da fotoğrafı **yok**.
- 3'ten sonra A'da satır "… masasına istek gönderildi" olarak **kalır**; red A'ya hiçbir yerde görünmez ve bildirim gitmez.

**Hata olursa:** A'da "reddedildi" anlamına gelen herhangi bir değişiklik gördüysen ekran görüntüsü al; bu ❌'dır.

## F7. Geçmişten engelleme ve engeli kaldırma (B → A) [P0]

1. B: Geçmiş ve istekler → A'nın masasının satırı → **Diğer** → **Engelle**. Pencerede "Birbirinizi lobide, isteklerde ve arkadaş listesinde bir daha görmezsiniz. Karşı tarafa bildirilmez." yazar. **Şikayet de et**'i işaretle → **Engelle**.
2. A mekanda açık bir oda kursun; B lobisine baksın. Sonra B açık oda kursun; A lobisine baksın.
3. B: Profil → dişli → Ayarlar → Engellenenler: A'nın masa takma adı ve tarih → **Engeli kaldır**. 2. adımı tekrarla.

**Bak:**

- 2'de iki taraf da diğerinin odasını lobide **görmez**. A'ya hiçbir bildirim gitmez; F6 yapıldıysa A'nın "Gönderilen istekler"i F6'dakiyle aynı görünür.
- 3'ten sonra odalar yeniden görünür.

**Bak (sonra, panelde):** `reports` tablosunda `target_type = 'history'` satırı (F7'nin "Şikayet de et"i).

## S5. Odada engelleme ve engeli kaldırma [P1]

Engelleyen odadan çıktığı için bu adım en sona yakın yapılır. F5'ten beri A ile B arkadaş değil; engelleme bir arkadaşlığı da düşürürdü.

1. A yeni açık oda kurar, B katılır.
2. B: **Engelle** → onay. B odadan çıkar.
3. B ana ekranda: A'nın odası lobide görünmez. B açık oda kurar: A'nın lobisinde de görünmez.
4. B: Profil → dişli → Ayarlar → Engellenenler: A'nın o andaki takma adı ve tarih. **Engeli kaldır**.
5. Lobiler yeniden birbirini gösterir.

**Bak:** Engellenenler listesinde yalnızca takma ad ve tarih var.
**Hata olursa:** engelden sonra hâlâ görünen odayı ve kimin lobisinde göründüğünü yaz.

## V11. Kapanış [P1]

1. İki telefonda **Mekandan ayrıl**; Mekan sekmesi yine Keşfet'e götürür.
2. (İsteğe bağlı) B: Profil → **Fotoğraf değiştir** → **Fotoğrafı kaldır**; profil dairesi boşalır.
3. Etkinlikleri kaldır: `pnpm admin:event list`, sonra her biri için `pnpm admin:event remove <id>`.
4. (İsteğe bağlı) Ayarlar → **Hesabımı sil**; aynı test numarasıyla yeniden kayıt olunabilmeli. Arkadaşlıklar, konuşmalar ve fotoğraflar hesapla gider.
5. Test bitince panelde test numaralarını sil ve test mekanını pasif yap.

## Test sonrası

Notları ve ekran görüntülerini tek bir yerde topla; ❌ olan adımları hata satırlarıyla birlikte bildir. Adım numaraları bu belgedeki numaralardır.
