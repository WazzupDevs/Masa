# Saha testi: iki telefonla uçtan uca

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
