# Saha testi: iki telefonla uçtan uca

> **v2 build'i (adım 1–3) ile:** 2. bölümdeki "Yakındaki mekanlar" akışı yerine mekan Keşfet'ten seçilir. Önce en alttaki **"v2 adım 1–3"** senaryosunu çalıştır; 3–11. bölümler v2'de de aynen geçerlidir (kişi sayısı artık 1 / 2 / 3 / 4+).

İki telefon, iki hesap, aynı mekan. **Telefon A** oda sahibidir (sen), **Telefon B** misafir masadır (arkadaşın). Senaryo yaklaşık 45 dakika sürer; en uzun adım iki masalı Tabu'dur (6 tur × 60 sn).

## Önemli: push yok, uygulama açık kalmalı

Bu APK'da push bildirimi çalışmaz (Firebase kurulu değil). Katılma isteği, kabul, sohbet ve oyun olayları yalnızca **uygulama önde ve ekran açıkken** Realtime bağlantısıyla gelir.

- İki telefonda da ekran zaman aşımını uzun tut (ör. 10 dk), pil tasarrufunu kapat.
- Uygulamayı arka plana alma. Ekran kilitlenirse bağlantı düşebilir: katılma isteği penceresi (60 sn) kaçar, tanışma sayacı atlanabilir.
- Bir olay gelmediyse önce iki telefonda da uygulamanın önde olup olmadığını not et, sonra uygulamayı kapatıp açarak tekrar dene.
- "Diğer masanın bağlantısı koptu" uyarısı, diğer telefon uygulamayı arka plana aldığında beklenen davranıştır (6. adımda bilerek denenir).

## Test öncesi (evde, bir kez)

- [ ] Barındırılan proje güncel: `pnpm supabase db push --include-seed` ve `pnpm supabase functions deploy` (tüm migration'lar ve fonksiyonlar).
- [ ] Panel → Realtime → Settings → **Allow public access kapalı**.
- [ ] İki numara test numarası olarak tanımlı ve "Valid Until" test gününden sonra (CLAUDE.md → "Barındırılan projede SMS'siz giriş").
- [ ] `content/venues-test.json` içinde test mekanının koordinatı var, seed edildi (CLAUDE.md → "Saha testi mekanı").
- [ ] `preview` APK iki telefona kurulu (CLAUDE.md → "Test APK'sı").
- [ ] İki telefonda konum açık, **tarih/saat otomatik** (geri sayımlar sunucu saatine göre hesaplanır; saat kaymışsa sayaçlar tutmaz), mobil veri ya da Wi-Fi var.
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

## 1. Giriş (A ve B)

1. Uygulamayı aç, numarayı `5xx xxx xx xx` biçiminde gir, **Kod gönder**.
2. Test kodunu gir, **Doğrula**.
3. "Başlamadan önce" ekranında üç kutuyu işaretle, **Onayla ve devam et**.

**Bak:** SMS gelmemeli; kod ekranı hemen açılmalı. Yanlış kod "Kod hatalı ya da süresi dolmuş." demeli. Sonunda "Hoş geldin" ana ekranı gelmeli.
**Hata olursa:** hangi numara, hangi ekranda kaldı, hata metni. "Bu numarayla devam edilemiyor." görünürse numara ban listesinde olabilir; panelde test numarası tanımını kontrol et.

## 2. Check-in (A ve B, mekanda)

1. **Mekana giriş yap** → konum açıklaması → rıza kutusu → **Konumumu kullan** → sistem izni.
2. "Yakındaki mekanlar" listesinde test mekanını seç.
3. Kişi sayısını seç, **Masayı aç**.
4. "Masan hazır" ekranında masa takma adını not et (ör. "Mor Baykuş").

**Bak:** test mekanı listede, mesafe gerçekçi (birkaç on metre). İki telefonun takma adı farklı. OSM atfı görünüyor.
**Hata olursa:** "Yakınında kayıtlı bir mekan yok." ya da "Bu mekana çok uzaktasın." görünürse bulunduğun yeri, açık alanda olup olmadığını ve listede görünen mesafeyi yaz. Kapalı alanda GPS sapabilir; panelde `table_sessions.gps_accuracy_m` değerini not et.

## 3. Oda kur (A), lobide gör (B)

1. A: **Oda kur** → Konsept **Tabu** → **Mekana açık** → **Odayı kur**.
2. B: ana ekrandaki "Açık odalar" listesine bak, yenileme yapmadan.

**Bak:** B'de birkaç saniye içinde A'nın takma adı, kişi sayısı, "Tabu" ve "yeni açıldı" görünüyor. B'de A'ya ait başka bilgi yok (isim, numara, konum).
**Hata olursa:** B odayı hiç görmüyorsa ya da yalnızca uygulamayı kapatıp açınca görüyorsa bunu ayrı ayrı yaz (ikincisi Realtime yayını sorunu demektir).

## 4. Katılma isteği ve kabul (B → A)

1. B: A'nın odasında **Katılmak istiyorum**. B'de "İsteğin gönderildi. Yanıt bekleniyor (… sn)." görünür.
2. A: "Katılma isteği" penceresi açılır: "<B'nin adı> (n kişi) Tabu odana katılmak istiyor.", 60 sn geri sayım. **Kabul**.

**Bak:** A'daki pencere birkaç saniyede geliyor. Kabulden sonra B kendiliğinden odaya geçiyor. İki ekranın başlığında "A ve B" takma adları var.
**Hata olursa:** A'da pencere gelmediyse A'nın uygulaması öndeydi mi? B'nin odaya geçmesi kaç saniye sürdü?

## 5. İki masalı Tabu (6 tur)

1. B'de "Oda sahibinin oyunu başlatması bekleniyor." yazar. A: **Oyunu başlat**.
2. Tur 1'de A anlatır: kart kelimesi ve yasaklı kelimeler **yalnızca A'da** görünür. B'de "Tahmin ediyorsunuz" yazar, kart görünmez.
3. A ipucu yazar; B tahmin yazar. Şunları dene:
   - Yasaklı kelimeyi ya da kökünü içeren bir ipucu: A'da gönderimden önce "Bu ipucu yasaklı bir kelime ya da kökünü içeriyor." uyarısı çıkar, ipucu gitmez.
   - Küfürlü bir ipucu: reddedilir.
   - Normal ipucu B'de anında görünür.
   - Yanlış tahmin: hiçbir şey olmaz. Doğru tahmin: ortak skor +1, yeni kart gelir, B'de "Kart: … (bilindi)" görünür.
   - **Pas**: tur başına en fazla 3.
4. Süre bitince "Tur bitiyor…" ve roller değişir: tur 2'de B anlatır.
5. 6 tur sonunda iki ekranda "Oyun bitti! Ortak skorunuz: N".
6. Oda açık kalır. A'da **Yeniden oyna** var (denemek istersen yeni oyun skor 0'dan başlar), B'de "Oda sahibinin oyunu başlatması bekleniyor.".

**Bak:** iki telefondaki geri sayım en fazla 1–2 sn farklı; skor ve tur numarası iki ekranda aynı; tahmin eden tarafta kart kelimesi kart kapanmadan hiç görünmüyor.
**Hata olursa:** sayaçlar farklıysa iki telefonun saatini yaz. Tur geçmediyse hangi turda kaldığını ve iki ekranın ne gösterdiğini yaz.

## 6. Sohbet (A ve B)

1. İki telefonda **Sohbeti aç**, karşılıklı birkaç mesaj yaz.
2. Küfürlü bir mesaj dene: "Mesajın uygun olmayan bir ifade içeriyor." Mesaj gitmez.
3. Aynı saniyede iki mesaj göndermeyi dene: ikincisi "Çok fazla istek gönderdin…" ile reddedilir.
4. Gündelik kelimeler reddedilmemeli: "çok şık olmuşsun", "sık sık geliriz", "sıkıldım".
5. B uygulamayı birkaç saniye arka plana alsın: A'da "Diğer masanın bağlantısı koptu." görünür; B geri gelince kaybolur.

**Bak:** mesajlar karşı tarafa 1–2 sn içinde düşüyor, gönderen takma adıyla görünüyor.
**Hata olursa:** gelmeyen mesajın saatini ve metnini yaz; yanlışlıkla reddedilen masum cümleyi aynen yaz (küfür listesine geri bildirim).

## 7. Şikayet (B → A)

1. B: **Şikayet et** → bir sebep → "Şikayetin alındı. Teşekkürler.".
2. Oda devam eder.

**Bak (sonra, panelde):** Table Editor → `reports`: yeni satır, `messages_snapshot` içinde odadaki son mesajlar.
**Hata olursa:** hata metni ve saat.

## 8. Odayı bitir ve tanışma

Pencere 30 saniyedir. Bu adım üç kez oynanır; her seferinde A yeni bir açık oda kurar, B katılır (3–4. adımlar, oyun oynamadan).

**8a. Karşılıklı Evet.** A: **Odayı bitir**. İki ekranda "Tanışalım mı?" ve 30 sn sayaç. İkisi de **Evet**.
**Bak:** ikinci "Evet"ten hemen sonra iki ekranda **aynı renk ve aynı emoji** tam ekran, "Ekranını kaldır, birbirinizi bulun." 60 sn sonra (ya da **Mekana dön** ile) ana ekrana dönülür.
Not: bu pencerenin 30 saniyesi dolmadan kurulan yeni açık oda lobide görünmez. Beklenen davranış; sonraki odayı pencere bittikten sonra kur ya da biraz bekle.

**8b. A Evet, B Hayır.** A **Evet**, B **Hayır**.
**Bak:** B hemen "Güzel oyundu 👋" ve **Mekana dön** görür. A'da "Cevabın alındı. Sonuç birazdan." yazar ve sayaç **0'a inene kadar** hiçbir şey değişmez; sayaç bitince A da "Güzel oyundu 👋" görür. A'nın sonucu gördüğü saniyeyi not et.

**8c. A Evet, B cevap vermez.** A **Evet**, B hiçbir şeye basmaz (ekran açık kalsın).
**Bak:** A için 8b ile **birebir aynı**: aynı ekran, sonuç yine sayaç 0'da. 8b ile 8c arasında A'nın gözünden bir fark gördüysen (daha erken sonuç, farklı yazı) mutlaka yaz: bu, "Hayır"ın sızması demektir.

**Hata olursa:** sayaç 0 olduğu hâlde sonuç gelmediyse kaç saniye beklendiğini yaz (en geç 1 dk içinde sunucu kapatır). İki ekranda farklı renk ya da emoji görüldüyse ekran görüntüsü al.

## 9. Engelleme ve engeli kaldırma

Engelleyen odadan çıktığı için bu adım tanışmadan sonra yapılır.

1. A yeni açık oda kurar, B katılır.
2. B: **Engelle** → onay. B odadan çıkar.
3. B ana ekranda: A'nın odası lobide görünmez. B açık oda kurar: A'nın lobisinde de görünmez.
4. B: Ayarlar → Engellenenler: A'nın o andaki takma adı ve tarih. **Engeli kaldır**.
5. Lobiler yeniden birbirini gösterir.

**Bak:** Engellenenler listesinde yalnızca takma ad ve tarih var.
**Hata olursa:** engelden sonra hâlâ görünen odayı ve kimin lobisinde göründüğünü yaz.

## 10. Red ve zaman aşımı aynı görünmeli

Reddedilen masa o odayı lobide bir daha görmez; bu yüzden iki deneme için A iki ayrı oda kurar.

1. A açık oda kurar. B istek gönderir. A **Geç**.
   **Bak:** B'de sayaç 60 sn boyunca "Yanıt bekleniyor" der, **ancak 60 sn dolunca** "Masa şu an müsait değil." görünür. Hemen görünürse ❌.
2. A odayı bitirir (tek masalı oda doğrudan kapanır) ve yeni açık oda kurar. B istek gönderir. A hiçbir şey yapmaz.
   **Bak:** B'de 1. denemedekiyle aynı ekran, aynı zamanlama.

**Hata olursa:** B'de mesajın göründüğü saniyeyi iki deneme için ayrı ayrı yaz.

## 11. Kapanış

1. İki telefonda **Mekandan ayrıl**. Ana ekrana dönülür.
2. (İsteğe bağlı) Ayarlar → **Hesabımı sil**; aynı test numarasıyla yeniden kayıt olunabilmeli.
3. Test bitince panelde test numaralarını sil ve test mekanını pasif yap.

## Test sonrası

Notları ve ekran görüntülerini tek bir yerde topla; ❌ olan adımları hata satırlarıyla birlikte bildir. Adım numaraları bu belgedeki numaralardır.

---

# v2 adım 1–3: iki telefonlu cihaz testi

Yaklaşık 60 dakika. **A** ve **B** iki telefon, iki hesap. Adım numaraları `V1`, `V2`… diye yazılır; hata satırı biçimi yukarıdakiyle aynı.

## Test öncesi (v2)

- [ ] Barındırılan proje güncel: adım 1–3'ün migration'ları ve fonksiyonları yayında (`pnpm supabase db push`, `pnpm supabase functions deploy profile checkin safety account`).
- [ ] Telefonlardaki APK, MapLibre ve image picker içeren Faz 8A (ya da sonraki) `preview` build'i; adım 1–3'ün JS'i OTA ile gelmiş (Profil sekmesinde dişli ve "Ad ekle" düğmesi görünüyorsa güncel).
- [ ] Planlı etkinlik (geliştirici makinesinde, `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` ortamda):
  - `pnpm admin:event add test/<ref> "Masa gecesi" "<bugün, 1 saat sonra, ör. 2026-09-26 21:00>"` (test mekanı)
  - `pnpm admin:event add <pilot mekanlardan birinin source_ref'i> "Tabu turnuvası" "<3 gün sonra 20:00>"`
  - `pnpm admin:event list` ile iki kaydın göründüğünü kontrol et.
- [ ] B'nin telefonunda **konum servisi açık** ve kamera uygulamasında **konum etiketi açık** (V9'da gerekli).
- [ ] A'nın hesabında görünen ad **yok** (yeni hesap ya da hiç ad girilmemiş); B'ninkinde de yok. Adları test sırasında gireceğiz.

## V1. Açılış ve sekmeler (A ve B)

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

## V2. Keşfet: liste, harita, etkinlik etiketi (A)

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

## V3. Yarıçap dışından check-in (A, mekandan en az 400 m uzakta)

1. Keşfet'te test mekanına dokun → mekan detayı → **Buraya giriş yap**.
2. Rıza kutusunu işaretle → **Konumumu kullan** → izin ver.

**Bak:** konum alındıktan sonra kırmızı yazı: **"Bu mekana çok uzaktasın. Mekandayken tekrar dene."**; kişi sayısı ekranına geçilmez. Masa açılmaz (Mekan sekmesi hâlâ Keşfet'e götürür).
**Hata olursa:** uzaktayken kişi sayısı ekranına geçildiyse, telefonun gösterdiği konum doğruluğunu (varsa) ve mekana uzaklığı yaz. Bu ❌'dır.

## V4. Kişi sayısı ve katılım biçimi; adsız hesapta "Profille" kapalı (A, mekanda)

1. Mekana gel, V3'ü tekrarla: bu kez **"Masada kaç kişisiniz?"** ekranı açılır.
2. Seçenekler: **1 / 2 / 3 / 4+** (5 ve 6 yok).
3. Altta "Nasıl katılıyorsunuz?": **Anonim** seçili. **Profille** soluk ve dokunulamaz; altında **"Profille katılmak için önce Profil sekmesinden bir ad seç."** yazar.
4. **2**'yi seç, Anonim kalsın, **Masayı aç**. "Masan hazır" ekranında takma adı not et.
5. Mekan sekmesine dokun.

**Bak:**

- "Profille"ye dokunmak hiçbir şey yapmaz.
- Masa açıldıktan sonra **Mekan sekmesi Mekan ekranını açar** (artık Keşfet'e götürmez); ekranda "2 kişi" yazar.

**Hata olursa:** "Profille" seçilebildiyse ve masa açıldıysa ❌; ekrandaki mesajı yaz.

## V5. Profil kurulumu (A ve B)

1. Profil → **Ad ekle** → görünen ad yaz (ör. A: "Deniz", B: "Ece") → **Kaydet**.
2. A: **Profili düzenle** → Tanıtım'a bir cümle yaz → **Kaydet**. Sayaç `n/160` doğru sayıyor.
3. Küfürlü bir ad dene (ör. içinde "amk" geçen): **"Ad 2–24 karakter olmalı ve uygun olmayan ifade içermemeli."**; kaydedilmez.
4. Tek harfli ad dene: **Kaydet** soluk kalır.
5. Profil → dişli → Ayarlar → **Gizlilik**: "Masaya varsayılan katılım" artık iki seçenek de dokunulabilir. Anonim kalsın. **Bildirimler**'de iki anahtar açık.

**Bak:** Profil ekranında ad ve tanıtım görünüyor; "Rozetler" altında "Oynadıkça rozet kazanırsın." (rozetler bu adımda boş, beklenen).
**Hata olursa:** kaydedilmeyen alanı ve mesajı yaz.

## V6. Konum etiketli kamera fotoğrafı (B)

Amaç: telefonda konum servisi ve kamerada konum etiketi açıkken çekilen fotoğrafın konum bilgisi olmadan yüklenmesi.

1. B: Profil → **Fotoğraf ekle** → **Fotoğraf çek** → kamera izni → bir fotoğraf çek → kareyi onayla.
2. İstersen ayrıca **Galeriden seç** ile telefonun kamerasıyla daha önce çekilmiş (konum etiketli) bir fotoğraf seç.

**Bak:**

- Pencerede "Fotoğrafın konum ve cihaz bilgisi gibi bütün ek bilgilerden arındırılarak yüklenir." yazar.
- Birkaç saniyede pencere kapanır, profil fotoğrafı daire içinde görünür.
- Hata mesajı çıkmaz. "Bu fotoğraf kullanılamadı." çıkarsa ❌ (metadata silinemedi ya da sunucu reddetti): saati yaz.

**Sonra (panelde, geliştirici):** Storage → `profile-photos` → B'nin klasöründeki `.jpg` dosyasını indir, bir EXIF görüntüleyicide aç (ör. `exiftool dosya.jpg`): **GPS, cihaz modeli, tarih alanı olmamalı**; boyut 512×512, birkaç on KB.

## V7. Lobide "profilli" etiketi, katılma isteği (A ve B)

1. A: Mekan ekranından **Mekandan ayrıl**, sonra yeniden check-in; bu kez **2** ve **Profille** seç, **Masayı aç**.
2. A: **Oda kur** → **Tabu** → **Mekana açık** → **Odayı kur**.
3. B: Keşfet → test mekanı → check-in → **3** ve **Profille** → **Masayı aç**. Mekan ekranındaki "Açık odalar"a bak.
4. B: A'nın odasında **Katılmak istiyorum**.
5. A: "Katılma isteği" penceresi → **Kabul**.

**Bak:**

- B'nin lobisinde A'nın takma adının yanında küçük **"profilli"** etiketi. A'nın görünen adı, fotoğrafı ya da tanıtımı **lobide yok**.
- A'nın istek penceresinde B'nin takma adı, "(3 kişi)" ve **"profilli"** etiketi; ad ya da fotoğraf yok.

## V8. Beyaz ekran senaryosu: iki masalı Tabu, önce A bitirir, sonra B

Bu senaryo iki kez oynanır. Her turda **odayı bitirmeyen telefon** izlenir: ekranın beyaza dönmemesi, takılmaması ve doğru ekrana geçmesi gerekir.

**8a (A bitirir, B izlenir):**

1. V7'deki odada A **Oyunu başlat**. 1–2 tur oyna (kartı bil ya da pas geç).
2. A: **Odayı bitir**.
3. **B'yi izle.**

**Bak (B):** birkaç saniye içinde "Tanışalım mı?" ekranı ve 30 sn sayaç; **beyaz ekran, boş ekran ya da "Bir şeyler ters gitti" yok**. İki taraf da **Hayır** desin → "Güzel oyundu 👋" → **Mekana dön** → Mekan ekranı.

**8b (B bitirir, A izlenir):**

1. A yeniden açık oda kurar (Tabu), B katılır (V7'nin 4–5. adımları), A oyunu başlatır, 1–2 tur.
2. B: **Odayı bitir**.
3. **A'yı izle.**

**Bak (A):** 8a'daki B ile aynı: tanışma ekranı düzgün açılıyor, beyaz ekran yok. Bu kez ikisi de **Evet** desin: aynı renk ve emoji iki ekranda.

**Hata olursa:** beyaz ekran görülürse **hangi telefon, hangi turda, hangi düğmeden sonra** ve kaç saniye sürdüğünü yaz; uygulamayı kapatıp açınca ne gördüğünü ekle. "Bir şeyler ters gitti" ekranı çıktıysa **Tekrar dene**'ye bas ve sonucu yaz (bu ekran beyaz ekranın yerini alan hata sınırıdır; çıkması da ❌ ama beyaz ekrandan iyidir).

## V9. Odada profil görme ve profil şikayeti (A ve B)

1. A yeniden açık oda kurar, B katılır (ikisi de V7'deki gibi **Profille** masadalar).
2. B: oda ekranında **"Diğer masanın profilini gör"** → A'nın adı, tanıtımı ve (varsa) fotoğrafı.
3. A: aynı düğmeyle B'nin profilini açar: V6'daki fotoğraf görünür.
4. B: A'nın profilinde **Profili şikayet et** → bir sebep → **"Şikayetin alındı. Teşekkürler."**
5. **Geri dön** ile odaya dön.

**Bak:**

- Profil ekranında mekan, konum ya da masa bilgisi yok; yalnızca ad, fotoğraf, tanıtım, rozetler.
- Anonim bir masa katılırsa (istersen dene: B Anonim masayla katılsın) düğme **hiç görünmez**.

**Sonra (panelde):** `reports` tablosunda `target_type = 'profile'` satırı; `profile_snapshot` içinde A'nın adı ve tanıtımı.

## V10. Oda bittikten sonra profil görünmez

1. V9'daki odada B, A'nın profilini açık tutsun (profil ekranında kalsın).
2. A: **Odayı bitir**, iki taraf **Hayır** (ya da pencereyi beklesin).
3. Pencere kapandıktan ve iki taraf Mekan ekranına döndükten sonra B, **geri tuşuyla** profil ekranına dönmeyi denesin (mümkün değilse sorun değil).

**Bak:**

- Oda ekranında "Diğer masanın profilini gör" düğmesi artık yok.
- Profil ekranı yeniden açılırsa **"Bu profil artık görüntülenemiyor."** yazar; ad ve fotoğraf görünmez.
- Keşfet, lobi ve Mekan ekranında A'nın profili hiçbir yerde yok.

**Hata olursa:** oda bittikten sonra hâlâ ad ya da fotoğraf görünen ekranı ve saati yaz; bu ❌'dır.

## V11. Kapanış

1. İki telefonda **Mekandan ayrıl**; Mekan sekmesi yine Keşfet'e götürür.
2. (İsteğe bağlı) B: Profil → **Fotoğraf değiştir** → **Fotoğrafı kaldır**; profil dairesi boşalır.
3. Etkinlikleri kaldır: `pnpm admin:event list`, sonra her biri için `pnpm admin:event remove <id>`.

---

# v2 adım 5: sesli Tabu (iki telefon)

Yaklaşık 20 dakika. **A** oda sahibi masa, **B** misafir masa; iki telefon aynı yerde. Bir **üçüncü telefon** (ya da kamera) gecikme ölçümü için video çeker.

## Test öncesi

- [ ] Adım 5'in migration'ı ve `tabu` fonksiyonu yayında (`pnpm supabase db push`, `pnpm supabase functions deploy tabu`); uygulama OTA ile güncel.
- [ ] İki telefonda tarih/saat otomatik.
- [ ] Ölçüm telefonunda mümkünse 60 fps video (Ayarlar → Kamera → video biçimi).

## T1. Oyunu başlat

1. A bir **Tabu** odası kurar. "Oda kur" ekranında Tabu seçeneğinin altında **"Bu oyun yüz yüze oynanır…"** notu görünür.
2. B lobide odayı **"Tabu · yüz yüze"** olarak görür, katılır. A'nın istek penceresinde de aynı not var.
3. B'de "Oda sahibinin oyunu başlatması bekleniyor." A: **Oyunu başlat**.

**Bak:** İki ekranda "Tur 1/6", aynı sayaç (en fazla 1 sn fark), iki masa kutusu ve 0–0 skor. A'nın kutusunda "anlatıyor", B'nin ekranında "A … anlatıyor. Hakem sizsiniz."

## T2. Anlatanın kartı kapalı başlar (A)

1. A'nın ekranında kart yerine siyah alan: **"Kartı görmek için dokun"** ve **"Önce telefonu takım arkadaşlarından sakla."**
2. A telefonu kendi masasından saklayıp dokunur: kart ve yasaklı kelimeler görünür; tur boyunca açık kalır.

**Bak:** Kart kapalıyken A'nın düğmeleri pasif. B (hakem) kartı baştan görüyor.

## T3. Kim neye basabilir

Anlatan A'da düğmeler: **Doğru +1** ve **Pas · 3**. Hakem B'de: **Doğru +1** ve **Tabu −1**.

1. A masası kelimeyi bilince **B** Doğru'ya basar: iki ekranda A'nın skoru 1, yeni kart.
2. A anlatırken yasaklı kelime söylerse **B** Tabu'ya basar: A'nın skoru bir düşer.
3. **A** Pas'a basar: "Pas · 2", skor değişmez, yeni kart. 3 pastan sonra Pas düğmesi pasif.
4. Bir kartta **ikisi aynı anda** Doğru'ya bassın: skor yalnızca **1** artmalı, iki ekran aynı karta geçmeli.

**Hata olursa:** skorun iki kez arttığını ya da iki ekranın farklı kartlarda kaldığını gördüysen saati ve kartları yaz.

## T4. Gecikmeyi ölç

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

## T5. Tur geçişi ve oyun sonu

1. Süre bitince iki ekranda "Tur bitiyor…", ardından "Tur 2/6": anlatan B, hakem A. B'nin kartı kapalı başlar.
2. 6 tur sonunda iki ekranda skorlar ve **"… kazandı!"** ya da **"Berabere!"**
3. A'da **Yeniden oyna**; B'de bekleme metni.

**Bak:** Profil → Rozetler: iki hesapta da **İlk oyun** görünür.

## T6. Oda sonu

A **Odayı bitir**: "Tanışalım mı?" ekranında skor satırı yok (sesli oyunda ortak skor yok); akış önceki adımlardaki gibi.
