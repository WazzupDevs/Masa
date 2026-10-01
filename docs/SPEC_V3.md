# Kabuk v1 (kod içi v3) — Teknik tasarım

Durum: **onaylandı** (30.09.2026). Proje sahibinin S2–S14 cevapları ve ek düzeltmeleri (profilli mekan sohbeti mesajında masa adı yok, kampüs sınırına 50 m tolerans, tasarım dosyalarına dokunmama, FIELD_TEST) işlendi; kararlar §17'de. S1 (poligon ve nokta adları) proje sahibinden gelecek ve yalnızca adım 2'yi bekletir. Kararlar `MVP_SPEC.md`, `CLAUDE.md` ve `docs/DECISIONS.md`'ye de işlenir. Uygulama §14'teki sırayla yapılır; her adım kendi dalı, PR'ı ve güncel E2E akışıyla gelir. Bu belgede olmayan bir karar gerekirse uygulama durur ve proje sahibine sorulur.

Bu belge, Sakarya Üniversitesi pilotuna çıkacak **Kabuk v1**'in ürün kararlarını mevcut şemaya, RLS'e, Edge Function'lara ve Realtime'a oturtur. Kod içinde sürüm adı **v3**'tür (v1 = MVP, v2 = `docs/SPEC_V2.md`); kullanıcıya görünen sürüm Kabuk v1'dir.

**v1 kapsamı:**

1. Telefonla giriş, sağlayıcıdan bağımsız SMS (Send SMS Hook).
2. Kayıt = profil (görünen ad, doğum tarihi, 18 yaş sınırı).
3. Tek mekan pilotu: kampüs sınırı (poligon) ve kampüs noktaları.
4. Sohbetle başlayan oda, oyun önerisi, niyet etiketi, oda düzeyinde anonimlik, tek çıkış.
5. Tabu'da iş birliği ve hakemli mod.
6. Mekan sohbet odası.

**v1 dışı:** yeni oyunlar, Kabuk+ (ödeme), kafe paneli.

**Native değişiklik:** Bu belgedeki adımların hiçbiri yeni native bağımlılık getirmez (doğum tarihi girişi native tarih seçici değil, mevcut bileşenlerle kurulur; §3.2). Tek native değişiklik tasarım oturumunun yeni simgesidir (`app.json` → `version` artışı). Pilot build'i bu simgeyle ve v3'ün son adımından sonra alınır (§12).

---

## 1. İlkeler

**Korunanlar (değişmez):**

1. **İstemci yazmaz.** Her yazma bir Edge Function üzerinden gider (kural 1).
2. **Diğer kullanıcıların hesap kimliği istemciye gitmez.** Arkadaşlık öncesi hiçbir yanıt profil kimliği (`public_id`) taşımaz; karşı tarafa yönelik eylemler bağlam kaydıyla yapılır (v2'de `historyId`, v3'te ek olarak mekan sohbeti mesajı `messageId`; §7.5).
3. **Red sessizdir** (kural 5). Katılma isteği, tanışma ve arkadaşlık isteğindeki bütün sızıntı korumaları aynen kalır.
4. **Konum yalnızca check-in anında alınır, koordinat saklanmaz** (kural 6). Kampüs sınırı kontrolü de sunucuda, koordinat saklanmadan yapılır.
5. **Kişi ya da masa sayısı gösterilmez** (Keşfet kovası). Mekan sohbetinde de kaç kişinin okuduğu gösterilmez.
6. **Ban** telefon hash'iyle çalışır, değişmez (`banned_phones`, `before_user_created`).

**Değişenler (bu belgede):**

- Görünen ad ve doğum tarihi kayıtta zorunlu olur (§3). `display_name_required` akışları kalkar.
- Katılım biçimi (anonim/profilli) masadan odaya taşınır (§5.4). Mekan sohbetinde mesaj başına seçilir (§7.3).
- Lobide konsept yerine isteğe bağlı niyet etiketi görünür (§5.2).
- Kampüs gibi sınırı tanımlı mekanlarda check-in 300 m yerine sınır içinde olmayı ister (§4.2).
- Yüz yüze oyunlar ve tanışma yalnızca aynı noktadaki masalar arasında olur (§4.3).

---

## 2. Giriş ve SMS: Send SMS Hook

### 2.1 Doğrulanan

- Supabase belgelerinin kaynağında (`supabase/supabase` deposu, `apps/docs/content/guides/auth/auth-hooks.mdx`, 30.09.2026 tarihli içerik) hook tablosu: **"Send SMS — Available on Plan: Free, Pro"**. Team/Enterprise şartı yalnızca MFA ve parola doğrulama hook'larındadır.
  - Dev projesi (Free) ve üretim projesi (Pro) ikisi de kullanabilir.
- Hook, Supabase'in yerleşik SMS gönderimini **tümüyle değiştirir**: kod Supabase Auth tarafından üretilir ve doğrulanır, hook yalnızca iletir.
  - Twilio **Verify** kendi kodunu üretip doğrulayan bir üründür. Hook açıkken Verify devre dışı kalır, iki yol aynı anda çalışmaz.
  - Bu yüzden geçiş, "hook kapalı = Twilio Verify, hook açık = yerli sağlayıcı" anahtarıdır.
- **HTTP hook:** Supabase, `{ user, sms: { otp } }` gövdesini Standard Webhooks imzasıyla POST eder. Sır biçimi `v1,whsec_<base64>`.
  - Yanıt `200`/`202`/`204` ise başarılıdır. `429`/`503` ve `retry-after` ile yeniden denenebilir hata verilebilir.
  - Her yanıt `Content-Type: application/json` olmalıdır.
  - HTTP hook birkaç saniyelik süre sınırıyla çalışır (belgedeki `auth.hook_timeouts.http_hooks`).
- **Netgsm:** OTP servisi var (anlık gönderim, "3 dakika içinde iletilir"; kullanıcı kodu, parola ve onaylı başlık ile).
  - Adım 1'de resmi Netgsm OTP paketiyle (`github.com/netgsm1/otp`, `src/otp.php`) karşılaştırıldı: adres, XML alanları, `text/xml`, yanıt ve belgelenen kodlar (`docs/DECISIONS.md`). Gerçek gönderim denemesi hesap açılınca yapılacak.

### 2.2 Tasarım

- **Yeni fonksiyon `sms`** (HTTP hook hedefi; `verify_jwt = false`, `config.toml` bloğuyla):
  1. İmzayı `SEND_SMS_HOOK_SECRETS` ile Standard Webhooks kurallarına göre doğrular. İmzasız ya da süresi geçmiş istek `401` alır ve hiçbir şey göndermez.
  2. Numara `pure/phone.ts` ile yalnızca `+905…` kabul edilir. Diğerleri hata alır; hook tarafında da ikinci bir Türkiye kilidi olur.
  3. Metin `pure/sms.ts`'ten gelir: "Kabuk doğrulama kodun: 123456". Metin `APP_NAME`'den okunur, kod ve süre dışında içerik yoktur.
  4. Sağlayıcı `SMS_PROVIDER` sırrıyla seçilir. v1'de tek değer `netgsm`; yerel stack'te bir de `local`.
     - `local` hiçbir şey göndermez, `200` döner. Yalnızca `SUPABASE_URL` yerel olduğunda kabul edilir, barındırılan projede reddedilir.
  5. Sağlayıcının yanıtı eşlenir: başarı → `200`; geçici hata → `503` ve `retry-after`; kalıcı hata → `400` ve JSON hata.
- **Sağlayıcı bağdaştırıcısı:**
  - İstek gövdesini kuran ve yanıtı çözümleyen saf kısım `pure/smsProviders/netgsm.ts`'tedir ve birim testlidir.
  - Ağ çağrısı fonksiyondadır, `_shared/deps.ts` dışında bağımlılık yoktur.
  - Yeni sağlayıcı = yeni saf bağdaştırıcı + `SMS_PROVIDER` değeri.
- **Gizlilik:**
  - Telefon numarası ve kod hiçbir yere loglanmaz, saklanmaz ve Sentry'ye gitmez. `errorReporting.ts` zaten gövde göndermez; `sms` fonksiyonu 5xx'te yalnızca sağlayıcı adını ve durum kodunu etiketler.
  - Hook, `user` nesnesinden yalnızca `phone`'u okur.
- **Test numaraları:** Test numaralarında (`[auth.sms.test_otp]`, paneldeki test numaraları) Auth, SMS göndermeden kodu kabul eder. Hook açıkken de bunun sürdüğü yerel entegrasyon testiyle doğrulanır (§13). Doğrulanamazsa uygulama durur ve sorulur.
- **Ban:** Değişmez. `before_user_created` hook'u ayrı bir hook'tur; Send SMS ile birlikte çalışır.
- **Hız sınırları:** Supabase Auth'un SMS sınırları (saatlik 100, aynı numaraya 60 sn) hook açıkken de geçerlidir.
  - Kod uzunluğu (6) ve süresi artık Supabase panelinden gelir (Authentication → Providers → Phone): "SMS OTP Expiry" ve "SMS OTP Length".
- **Yerel stack:** `config.toml` → `[auth.hook.send_sms]` `enabled = false` olarak eklenir, yani CI'da hook kapalıdır.
  - Hook testi ayrı bir yapılandırmayla, `updateGate` testinin kalıbında elle çalışır: hook'u açan geçici `config.toml` değişikliği ya da ayrı bir komut. Adım 1'de CLAUDE.md "Komutlar"a yazılır.
  - `supabase config push` asla çalıştırılmaz. Panel ayarları panelden yapılır.

### 2.3 Panel adımları (proje sahibi, sırayla)

Netgsm hesabı açılana kadar hiçbir şey değişmez: yerleşik Twilio Verify çalışmaya devam eder, hook kapalıdır, `sms` fonksiyonu deploy edilmiş ama çağrılmıyordur.

Netgsm hazır olunca, önce dev projesinde, sonra üretimde:

1. **Netgsm:**
   - Hesap ve OTP servisi yetkisi alınır.
   - SMS başlığı (gönderici adı, ör. `KABUK`) onaylatılır.
   - Hesapta **OTP SMS paketi** tanımlı olmalıdır; yoksa Netgsm kod 60 döner ve kod gitmez.
   - API için bir alt kullanıcı açılır. Edge Function'ların sabit IP'si olmadığı için API alt kullanıcısında IP kısıtı **olmamalıdır**; varsa Netgsm kod 30 döner. Netgsm bunu zorunlu tutarsa uygulama durur ve sorulur.
   - Gönderim sınırı dakikada 100 sorgudur (aşımda kod 80; kanca Supabase'e yeniden dene yanıtı verir). Supabase'in saatlik 100 SMS sınırı bunun altında kalır.
2. **Sırlar:** Değerler kabukta verilir, hiçbir dosyaya yazılmaz:
   ```
   pnpm supabase secrets set SMS_PROVIDER=netgsm NETGSM_USERCODE=… NETGSM_PASSWORD=… NETGSM_HEADER=…
   ```
3. **Deploy:** `pnpm supabase functions deploy sms`. `sms`, "main'den dev projesine yayın" listesine adım 1'le eklenir.
4. **Panel → Authentication → Hooks → Send SMS:**
   - Tür **HTTP**, URL `https://<ref>.supabase.co/functions/v1/sms`.
   - **Generate secret**'la sır üretilir ve kopyalanır.
   - Sır kaydedilir: `pnpm supabase secrets set SEND_SMS_HOOK_SECRETS='v1,whsec_…'`. Sır kabukta verilir, dosyaya yazılmaz.
   - Hook **Enable** edilir, sonra kaydedilir.
5. **Panel → Authentication → Providers → Phone:** "SMS OTP Expiry" (öneri 300 sn) ve "SMS OTP Length" 6 kontrol edilir. Twilio alanları olduğu gibi kalır; geri dönüş için gerekir.
6. **Deneme:** Test numarası olmayan gerçek bir numarayla giriş yapılır.
   - SMS gelir ve kod çalışır.
   - Twilio Verify panelinde yeni doğrulama görünmez.
7. **Geri dönüş:** Panel → Hooks → Send SMS → **Disable**. Yerleşik Twilio Verify hemen devreye girer, başka adım gerekmez.
8. **Üretim:** Aynı sıra, üretimin kendi Netgsm alt kullanıcısı ve kendi hook sırrıyla. İnceleme hesabının test numarası değişmez.

---

## 3. Kayıt = profil

### 3.1 Akış

1. Telefon → OTP. Değişmez.
2. **Onaylar:** Kullanım Koşulları ve KVKK aydınlatma metni.
   - "18 yaşından büyüğüm" kutusu kalkar; yerini doğum tarihi alır.
3. **Profil:** zorunlu görünen ad (2–24, küfür filtresi) ve doğum tarihi.
   - Onaylar ile profil **tek çağrıda** kaydedilir: `account/complete-onboarding { termsVersion, kvkkVersion, displayName, birthDate }`.
4. **İsteğe bağlı** fotoğraf ve biyografi. Atlanabilir, sonra Profil'den eklenir. Fotoğraf yüklemek profil satırını (`public_id`) gerektirdiği için 3. adımdan sonradır.
5. Uygulamaya giriş.

**Kapı:** Profil satırı, geçerli onay sürümleri, `display_name` ve `birth_date` yoksa uygulama onboarding'e döner.

- Sunucuda bu kontrol bugünkü `onboarding_required` ile birleşir.
- Profil gerektiren her fonksiyon (`checkin`, `rooms`, `venue-chat`, `friends`…) aynı `requireProfile` yardımcısını kullanır.

### 3.2 Doğum tarihi ve 18 yaş

- **Giriş:**
  - Gün, ay ve yıl için üç sayısal `Input` kullanılır (mevcut bileşen). Native tarih seçici eklenmez.
  - Doğrulama `pure/age.ts`'tedir: geçerli takvim günü, gelecekte değil, 100 yaştan büyük değil.
- **Yaş hesabı:**
  - `pure/age.ts` → `ageOn(birthDate, today)` kullanılır. "Bugün" Europe/Istanbul takvim günüdür.
  - 29 Şubat doğumlular 28 Şubat'ı yaş günü sayar.
  - Sunucu ve istemci aynı fonksiyonu kullanır.
- **18 yaş altı:**
  - `complete-onboarding` hesabı **siler** (`auth.admin.deleteUser`) ve `under_age` döner. Profil satırı, onay ya da doğum tarihi yazılmaz, telefon hash'i tutulmaz.
  - İstemci çıkış yapar ve "Kabuk 18 yaş ve üzeri içindir." gösterir.
  - Silme, yaş kontrolünden önce hiçbir yazma olmamasıyla birlikte test edilir (§13).
  - Aynı numara yeniden kayıt olabilir. Bu kabul edilmiş risktir (S2).
- **Değişmezlik:**
  - Doğum tarihi kayıttan sonra uygulamadan değiştirilemez; yanlış girilen tarih iletişim e-postasıyla düzeltilir.
  - Yeni admin script'i `pnpm admin:set-birth-date <userId> <YYYY-MM-DD>`, `admin:ban` gibi geliştirici makinesinde çalışır.
  - Gerekçe: yaşı sonradan küçültüp büyütmek kötüye kullanıma açık. (S8, kabul.)
- **Görünürlük:**
  - Profilde **yaş** görünür, doğum tarihi görünmez.
  - `birth_date` kolonu istemciye kapalıdır (kolon yetkisi). Kendi doğum tarihi de tablo okumasıyla gelmez; Ayarlar → Hesap'ta kendi profil yanıtıyla (`profile/get`, `birthDate`) gösterilir. İstemci yalnızca `has_birth_date` üretilmiş kolonunu okur.
  - Başkalarına `profile/get` yalnızca `age` döner.
- **Mevcut kullanıcılar** (dev ve saha testi hesapları): `birth_date` ya da `display_name` yoksa açılışta profil ekranı gelir. 18 altı girilirse hesap silinir. `age_confirmed_at` kolonu korunur (geçmiş kayıt) ama artık okunmaz.

### 3.3 Yasal ve mağaza

Adım 1'in parçası, OTA'dan önce:

- **`docs/legal/kvkk-aydinlatma-metni.md` ve `gizlilik-politikasi.md`:**
  - Doğum tarihi (amaç: yaş sınırı ve profilde yaş), görünen adın zorunlu olması.
  - Mekan sohbeti mesajları (24 saat; şikayet kopyası 30 gün), kampüs noktası seçimi.
  - SMS sağlayıcısı: Twilio ve geçişten sonra Netgsm. Netgsm yurt içindedir; Twilio için yurt dışı aktarım notu kalır.
- **`kullanim-kosullari.md`:** "Kabuk 18 yaş ve üzeri içindir"; yaşı yanlış beyan etmenin sonucu hesap kapatmadır.
- **Sürümler:** `CURRENT_TERMS_VERSION` ve `CURRENT_KVKK_VERSION` artırılır; mevcut kullanıcılar yeniden onaylar.
- **`docs/store/listing-tr.md` → Veri güvenliği:**
  - "Kişisel bilgiler → Diğer" (doğum tarihi; zorunlu; uygulama işlevi ve güvenlik).
  - "Uygulama içi mesajlar" kapsamına mekan sohbeti eklenir.
- **`docs/store/PLAY_CHECKLIST.md` → Hedef kitle:**
  - Yalnızca 18+.
  - Uygulama içi yaş kapısı artık beyan kutusu değil doğum tarihidir.
  - 18 altına hesap açılmaz, veri tutulmaz.
- Veri güvenliği formu ve gizlilik politikası, OTA'dan **önce** güncellenir (PLAY_CHECKLIST'teki OTA sınırı).

---

## 4. Tek mekan pilotu: Sakarya Üniversitesi Esentepe Kampüsü

### 4.1 İçerik

- **Yeni `content/venues-campus.json`:**
  ```json
  {
    "venues": [
      {
        "ref": "sau-esentepe",
        "name": "Sakarya Üniversitesi Esentepe Kampüsü",
        "city": "Sakarya",
        "district": "Serdivan",
        "boundary": [[30.33, 40.74], "…"],
        "spots": [{ "ref": "kantin", "name": "Merkez Kantin" }, "…"]
      }
    ]
  }
  ```
  - `boundary` bir GeoJSON dış halkasıdır: `[lng, lat]` dizisi, kapalı, saat yönünün tersine.
  - `spots` sıralı listedir. Nokta koordinatı tutulmaz; nokta, kampüs içindeki masanın kendi beyanıdır.
  - Poligon ve nokta adları proje sahibinden gelir (S1). Koordinat tahmin edilmez.
- **Diğer mekanlar:**
  - `venues-pilot.json` (Beylikdüzü) içerikte kapatılır (`isActive: false`).
  - _Adım 2 notu (proje sahibi kararı):_ S1 gelene kadar `venues-campus.json`'da kampüs kaydı **yer tutucu** poligon ve örnek noktalarla `isActive: false` durur; dev projesinde cihaz testi için `venues-test.json`'daki test mekanı açık kalır. Gerçek poligon ve nokta adları gelince yalnızca JSON değişir (`isActive: true`); test mekanı o zaman kapatılır.
  - Seed yalnızca ekler ya da günceller; kapatma da seed'le yapılır.
- **Yeni mekan ya da nokta eklemek yalnızca içerik işidir:** JSON'a satır, sonra `pnpm seed` ve `db push --include-seed`. Kod değişmez.
  - `ref` kalıcı kimliktir. Kaldırılan nokta `isActive: false` olur, silinmez; aktif masaların noktası geçerli kalır.
  - Seed doğrulaması (`scripts/`, birim testli): poligon kapalı mı, kendini kesiyor mu, en az 4 nokta var mı, nokta `ref`'leri tekil mi.

### 4.2 Check-in: sınır ya da yarıçap

- `venues.boundary geography(Polygon, 4326) null` eklenir.
- **`venue_contains(venue_id, lat, lng, tolerance_m, radius_m)`** yalnızca service role'e açıktır ve aynı çağrıda koordinatı saklamadan karar verir (_adım 2 notu:_ `public` şemasında, `venue_distance_m` gibi: Edge Function'lar RPC'yi yalnızca açık şemadan çağırabilir; `authenticated`'a kapalıdır, testle korunur):
  - Sınırı olan mekanda sınıra **50 m tolerans**: `ST_DWithin(boundary, point, tolerance_m)`. Bina içinde GPS 30–50 m sapabildiği için (proje sahibi düzeltmesi).
  - Sınırı olmayan mekanda bugünkü 300 m (`radius_m`).
  - Tolerans tek sabittir: `pure/checkin.ts` → `BOUNDARY_TOLERANCE_M = 50`. Fonksiyon onu (ve `CHECKIN_RADIUS_M`'yi) parametre olarak alır; SQL'de sayı yazılmaz.
- `checkin` fonksiyonu bu kararı kullanır. Hata kodları aynıdır (`too_far`), mesaj koordinat ya da mesafe içermez.
- **İstemci uyarısı:** Sınırı olan mekanda "Kampüsün içinde görünmüyorsun" uyarısı verilir.
  - Uyarı `pure/geo.ts` → `withinBoundary(point, polygon, BOUNDARY_TOLERANCE_M)` ile hesaplanır (poligon içi ya da kenara en fazla 50 m); saf ve testlidir. Sunucu ile aynı toleransı kullanır.
  - Poligon `explore_venues()` yanıtında gelir. Kampüs sınırı herkese açık bir bilgidir, kişisel veri değildir.
  - Karar yine sunucudadır.
- **Kural 6'nın genişlemesi:** "Konum yalnızca check-in anında, mekanın sınırı içinde ya da sınırı yoksa 300 m yakınında olunduğunu doğrulamak için alınır; sınır toleransı 50 m."

### 4.3 Kampüs noktaları

- **Yeni tablo `venue_spots`:** `id`, `venue_id`, `ref`, `name`, `sort`, `is_active`; `unique (venue_id, ref)`. Kimliği doğrulanmış herkes okur; `venues` gibi açık bilgidir.
- **Check-in:**
  - Noktası olan mekanda check-in `spotId` ister: kişi sayısından önce "Neredesin?" listesi.
  - `table_sessions.spot_id` doludur ve sunucu noktanın o mekana ait ve aktif olduğunu doğrular.
  - Noktası olmayan mekanda `spot_id` boştur.
- **Nokta değiştirme:**
  - `checkin/change-spot { spotId }` yeni GPS istemez; kampüsten çıkılmadı varsayılır ve masa süresi değişmez.
  - Masa bir odadaysa ya da bekleyen bir katılma isteği varsa `in_room` döner. Süresi dolmamış reddedilmiş istek de bekleyen sayılır (kural 5: red, süresi dolana kadar beklemeyle aynı görünür).
  - `rooms.spot_id` oda kurulurken sahibin noktasından tetikleyiciyle kopyalanır; odadaki masa noktasını değiştiremediği için ikisi eşit kalır.
  - GPS'siz ve odada değilken serbesttir (S10, kabul).
- **Lobi:**
  - `venue_lobby()` her açık odanın noktasını (`spot_id`, `spot_name`) döner. Ekran odaları nokta başlıklarıyla gruplar, kendi noktası en üstte.
  - Başka noktadaki odalar görünür. Aynı noktadaki oda kartında "Katılmak istiyorum" vardır; başka noktadaki oda kartında onun yerine **"Bu noktadayım"** düğmesi vardır. Düğme `change-spot` çağırır; sonra kart "Katılmak istiyorum"a döner ve istek gönderilebilir. Kullanıcı çıkmaz bir ekranda kalmaz (proje sahibi düzeltmesi).
  - Başka noktadaki odaya istek `different_spot` döner. Bu, oda sahibinin masası hakkında lobide zaten görünen bilgiden fazlasını söylemez.
- **Yüz yüze kuralı:** Oyunlar ve tanışma yalnızca aynı noktadaki masalar arasında olur. Oda iki masalıyken masalardan biri noktasını değiştiremez; `change-spot` odadayken reddedilir.
- **Kişi sayısı gösterilmez:** Nokta başına masa sayısı hiçbir yerde dönmez. Lobi yalnızca açık odaları listeler, bugünkü gibi.

### 4.4 Keşfet

`pure/explore.ts` → `exploreLayout(activeVenueCount)` şunu döner:

- **Tek aktif mekan (`'single'`):** Liste/harita anahtarı gizlenir. Ekran, mevcut bileşenlerle kurulur:
  - Mekan kartı: ad, hareketlilik kovası, "Buraya giriş yap".
  - Mekanın süren ve 7 gün içindeki **bütün** etkinlikleri. Bugün en yakın tek etkinlik dönüyor; tek mekan görünümü için liste gerekir.
  - "Yeni mekanlar yakında" notu.
- **İki ya da daha fazla aktif mekan (`'list'`):** Bugünkü liste ve harita geri gelir. İçerik değişikliğiyle kendiliğinden olur, kod değişmez. Eşik 2 aktif mekan (S9).
- **`explore_venues()`:** Her mekan için etkinlik listesini ve sınırı döner. Kişi ya da masa sayısı yine dönmez. _Adım 2 notu:_ `events` (jsonb, `{ title, startsAt, endsAt }`, başlangıca göre) tek etkinlik kolonlarının (`event_title`, `event_starts_at`, `event_ends_at`) yerini alır; liste ve harita ilkini gösterir. `boundary` dış halkadır (`[lng, lat]` dizisi) ya da null.

---

## 5. Oda akışı

### 5.1 Oda önce sohbettir

- **Oda kurarken oyun seçilmez.** Oda kur ekranında yalnızca şunlar seçilir:
  - isteğe bağlı niyet etiketi;
  - katılım biçimi: Anonim / Profilimle (§5.4).
- **Görünürlük seçimi kalkar (S4):** "Oda kur" her zaman mekana açık oda kurar (`visibility = 'open'`).
- **"Masanla oyna"** mekan ekranında ayrı bir düğmedir. Arka planda tek masalı özel odayı kurar (`rooms/create-solo`; niyet ve katılım sorulmaz, anonim) ve doğrudan oyun seçimine geçer. Kampüste kimse yokken tek başına oynanabilsin diye bu yol kalır. Özel oda lobide görünmez ve katılma isteği alamaz (değişmez).
- **Oda ekranı:** Sohbet ve üstte "Oyun öner" alanı.
- **Oyunlar:** v1'de Sesli Tabu ve Sohbet kartları (mevcutlar; yeni oyun yok).
- **`rooms.concept`** "odadaki etkinlik" olur: `null` = sohbet, `'tabu'` ya da `'sohbet'` = süren oyun.
  - `game_state` yalnızca oyun sürerken doludur.
  - Oyun bitince (`finished`, ya da "Oyunu bitir") `concept = null` olur ve oda sohbete döner.
  - Oyunun sonucu `game_results`'a yazılır.

### 5.2 Niyet etiketi

- `rooms.intent text null check (intent in ('game','chat'))`: "Oyun" ya da "Sohbet". İsteğe bağlıdır ve oda kurulurken seçilir.
- Lobi, istek penceresi ve oyun geçmişi konsept yerine niyeti gösterir (yoksa etiket yok).
- Niyet bir beyandır: "Sohbet" niyetli odada da oyun önerilebilir.
- **Kural 4 metni:** "diğer masalara varsayılan olarak yalnızca masa takma adı, kişi sayısı ve varsa niyet etiketi gider" (§16).

### 5.3 Oyun önerisi

- **Yeni tablo `game_proposals`:** `room_id` (pk; oda başına tek bekleyen öneri), `proposer_session_id`, `concept`, `created_at`, `expires_at` (30 sn).
- **`rooms/propose-game { roomId, concept }`:**
  - Oda iki masalı, oyun yok ve bekleyen öneri yoksa yazılır.
  - Diğer masaya `room:` üzerinden Postgres Changes gider; satır üyelere okunabilir.
- **`rooms/answer-game { roomId, accept }`:**
  - Yalnızca öneriyi yapmayan masa cevaplar.
  - Kabulde oyun başlar: Tabu'da bugünkü `tabu/start` mantığı, Sohbet'te ilk kart.
  - Red ya da 30 sn zaman aşımı öneriyi siler. Önerene ikisi de aynı metinle görünür: "Öneri kabul edilmedi". Red **hemen** gösterilir, 30 sn bekletilmez (S7): iki masa zaten sohbet ediyor, bu bir gizlilik sinyali değildir. Kural 5'e eklenmez; test zamanlama eşitliği iddia etmez, yalnızca satırın silinmesini ve metnin aynı olmasını doğrular.
- **Tek masalı oda:**
  - Öneri yoktur. Masa oyunu doğrudan başlatır: tek masa Tabu (bugünkü yerel reducer) ya da Sohbet kartları.
  - Katılma isteği kabul edilince yerel oyun biter ve oda sohbete döner. Bugün iki masalı Tabu'ya geçiyordu; artık öneriyle başlar.
- **"Yeniden oyna"** yerine oyun bitince iki masa da yeni öneri yapabilir.
- **Kural 3:**
  - Öneri ve kabul yetkisi sunucudadır.
  - Oyun yalnızca kabulle başlar.
  - Aynı odada aynı anda tek oyun ve tek öneri olur.

### 5.4 Anonimlik oda düzeyinde

- **Oda kurarken** oda sahibi, **katılma isteğinde** istek sahibi "Anonim" ya da "Profilimle" seçer.
  - Varsayılan her zaman **anonim**dir. `profiles.default_participation` kalkar ve Ayarlar → Gizlilik'teki seçim kaldırılır.
- **Yeni kolonlar:** `rooms.owner_profiled boolean not null default false`, `rooms.guest_profiled boolean not null default false`.
  - Bunlar işarettir, profil kimliği değildir. `rooms`'a `public_id` kolonu yine eklenmez (kural 9).
  - `join_requests.requester_profiled` bugünkü gibi istekten gelir.
- **`room_member_profile(room_id)`** artık masa oturumuna değil odadaki bu işaretlere bakar. Üyelik ve oda bittikten sonra boş dönme kuralları aynıdır.
- **Kalkanlar:**
  - `table_sessions.participation` kalkar. Kolon bir sürüm boyunca durur, okunmaz; sonraki migration'da düşer.
  - Check-in'deki katılım seçimi de kalkar.
- **Lobi:** "profilli" işareti odanın sahibinin o odadaki seçiminden gelir.

### 5.5 Tek çıkış: "Odayı bitir"

- **İki masalı oda:** Menüde yalnızca "Odayı bitir", "Şikayet et" ve "Engelle" vardır. Ayrı bir "Odadan çık" yoktur.
  - "Odayı bitir" iki tarafa "Tanışalım mı?" penceresini açar (bugünkü `rooms/end` + `reveal`).
- **Tek masalı oda:** "Odayı bitir" odayı doğrudan kapatır (değişmez).
- **`rooms/leave` kalkar.** Masanın odadan başka türlü ayrılması şu yollarla olur:
  - **Engelleme** (S5, kabul): odayı "Odayı bitir" gibi bitirir ve engelleyen taraf için kararı "Hayır" sayar.
    - Karşı taraf pencereyi görür. "Evet" derse sonucu `reveal_ends_at`'te "Güzel oyundu" olur.
    - Bu, engellemeyi "Hayır"dan ayırt edilemez yapar (kural 5'in genişlemesi).
    - Bugün engelleme odadan ayrılma gibi çalışıyor ve karşı taraf odanın dağıldığını hemen görüyor.
  - **Mekandan ayrılma ya da masanın süresinin dolması:** Aynı yol; iki masalı oda pencereye geçer, ayrılan tarafın kararı "Hayır"dır. Tek masalı oda kapanır.
  - **10 dakika hareketsizlik:** İki masalı odada oda sessizce kapanmaz; "Tanışalım mı?" penceresi iki taraf için de aynı şekilde açılır (S5 eki). Hiçbir taraf için karar önceden yazılmaz; iki taraf da cevap verebilir. Tek masalı oda bugünkü gibi kapanır.
- **Oyun geçmişi:** Karşılaşma bitişleri pencere, engelleme, masa bitişi ve hareketsizliktir. 3 dakika kuralı değişmez. `play_history.concept` odada oynanan son oyundur; oyun yoksa `'chat'`. Check kısıtı buna göre genişler.

### 5.6 Masa adları

- **Yeni kelime listeleri:** `content/aliases-tr.json` yenilenir, en az 40 sıfat × 40 isim.
  - İçerik kuralları bugünküyle aynı: olumlu ya da nötr, hakaret ya da alay gibi okunmayan birleşimler.
  - Biçim sıfat + isim; isimler hayvanla sınırlı değildir: yiyecek, bitki, nesne, doğa (S13). Kampüse özel tema yoktur, başka mekanlar eklenecek.
  - Liste adım 3'ün PR'ında verilir, proje sahibi ayıklar. `alias_words.kind` `adjective`/`noun` olur.
- **Adı yeniden çekme:** `checkin/reroll-alias`.
  - Masa odadayken ya da bekleyen isteği varken `in_room` döner.
  - Check-in başına en fazla 3 kez; sonra `reroll_limit`.
  - Yeni ad mekanda benzersizdir (bugünkü `pickAlias`). Eski ad geçmiş kayıtlarda ve engellenenler listesinde olduğu gibi kalır.

### 5.7 Uygulamada netleşenler (adım 3 notu)

Spec'ten sapma değil, spec'in bıraktığı ayrıntılar; gerekçeler `docs/DECISIONS.md` → "Oda akışı (v3 adım 3)".

- **`rooms/end-game { roomId }`** eklendi: §5.1'deki "Oyunu bitir". İki masadan biri basar, oyun biter, `concept = null`; tekrar çağrı sessizdir (idempotent). Sonuç yazılmaz; yalnızca 6 turu biten Tabu `game_results`'a yazılır.
- **Oyunlar arası `game_state`:** §5.1 "yalnızca oyun sürerken dolu" diyor; oyun yokken `{ gameNo, lastGame: { concept, scores? } }` tutulur. Oyun numarası (tur satırları ve kartların anahtarı) sıfırlanmasın ve oda son oyunun sonucunu gösterebilsin diye. Kart ya da oyun durumu taşımaz.
- **`tabu/start`** yalnızca tek masalı odada yerel desteyi verir (`no_proposal` iki masalı odada). İki masalı Tabu yalnızca `answer-game` kabulüyle başlar; sunucudaki eski `tabu_start` kalktı.
- **Tanışma penceresi süresi** SQL'de `private.reveal_decision_seconds()`'dan okunur (30; bir test `REVEAL.decisionSeconds`'a eşitliğini denetler). Engelleme ve mekandan ayrılma bu yolu kullanır. Hareketsizlik işi `close_idle_rooms(10, 30)` çağrısıyla aynı iki sayıyı alır.
- **Pencere açıkken engelleme:** Engelleyen tarafın kararı "Hayır" olarak yazılır (önceden "Evet" dediyse "Hayır"a döner).
- **Tek masalı odada katılma isteği kabulü** yerel oyunu bitirir; oda sohbete döner, `lastGame` yazılmaz.
- **Analitik:** `room_created { intent, profiled }`, `game_proposed { concept }`, `game_accepted { concept }`, `alias_rerolled`. `analyticsProperties` artık boolean değerleri de geçirir (adım 1'deki `onboarding_completed` boolean özellikleri önceden sessizce düşüyordu).

---

## 6. Tabu: iş birliği ve hakemli mod

### 6.1 Modu sunucu belirler

- Oyun başlarken iki masanın `headcount`'ı (`rooms.owner_headcount`, `guest_headcount`) okunur.
- **Oyun düzeyinde (S3):** Masalardan biri tek kişiyse bütün oyun **iş birliği modu**nda, ikisi de 2+ ise **hakemli mod**da oynanır.
  - Gerekçe: tek kişilik masa kendi anlatanını tahmin edecek takım arkadaşından yoksundur. Tur tur mod değiştirmek skoru karşılaştırılamaz yapar.
- `pure/tabu.ts` → `tabuMode(ownerHeadcount, guestHeadcount)` tek kaynaktır ve testlidir. Mod `game_state.mode`'a yazılır ve oyun boyunca değişmez.
- `game_state`:
  ```
  { concept:'tabu', mode:'refereed'|'cooperative', phase, gameNo, turnNo, totalTurns,
    describingTable:'owner'|'guest', turnEndsAt, scores, passesUsed, maxPasses }
  ```
  - İş birliği modunda `scores` tek ortak skordur (`{ team }`).
  - Bugünkü `mode: 'voice'` değeri `refereed` olur. Bugünkü tek tür sesli moddur, yazılı mod yoktur.

### 6.2 Hakemli mod

Bugünkü iki masa sesli Tabu aynen kalır:

- Takım = masa.
- Anlatan masanın telefonu kartı gösterir, karşı masa kart ve Doğru/Tabu/Pas düğmeleriyle hakemdir.
- Tabu yalnızca hakem, Pas yalnızca anlatan, Doğru ikisi de basar.

### 6.3 İş birliği modu

- İki masa tek takımdır, ortak skor süreye karşıdır. Masalar sırayla anlatır; anlatan, **diğer masaya** anlatır.
- **Anlatanın telefonu** kartı ve **Doğru / Pas / Tabu** düğmelerini gösterir. Anlatan üçünü de kendisi basar.
- **Tahmin eden masanın telefonu kartı görmez:** `tabu/turn-cards` o masaya kart listesi dönmez (`not_describer`). Ekran geri sayımı, ortak skoru ve "Anlatanı dinle" bilgisini gösterir.
  - Kart kelimesi ancak kart kapandığında (eylemden sonra) iki masaya görünür. v1 MVP'nin "tahmin eden cihaz kartı ağ trafiğinde görmez" ölçütü geri gelir (§13).
- **Puan:** Doğru +1, Tabu −1, Pas 0; tur başına pas sınırı bugünkü gibi.
- **Eylem yetkisi:** Yalnızca anlatan masa `mark` gönderir. Her eylem `{ turnNo, cardIndex }` ile idempotenttir (kural 3).
- `game_results` iki hesaba aynı skoru `won = null` ile yazar (iş birliğinde kazanan yok). Rozetlerde "Sesli Tabu galibiyeti" yalnızca hakemli modu sayar.

### 6.4 Uygulamada netleşenler (adım 4 notu)

Gerekçeler `docs/DECISIONS.md` → "Tabu modları (v3 adım 4)".

- Kural SQL'de `private.tabu_mode(owner, guest)`; bir test 1–4 × 1–4 için `pure/tabu.ts` → `tabuMode` ile aynı sonucu verdiğini denetler. Mod oyun başlarken (`start_voice_tabu`) yazılır; oyun sürerken kişi sayısı değişse bile değişmez.
- `game_results.mode`: hakemli mod `'voice'` olarak kalır (rozet sayımı aynı), iş birliği `'cooperative'`. "Sesli Tabu galibiyeti" yalnızca `mode = 'voice' and won` sayar; iş birliğinde `won = null`.
- `lastGame.scores` modun skor nesnesidir: `{ owner, guest }` ya da `{ team }`.
- Tahmin eden masanın ekranında kapanan kartın kelimesi bu adımda gösterilmez (kelime `game_events` → `card_closed` ile o masaya okunabilir; yalnızca kapandıktan sonra). Ekran geri sayım, ortak skor ve "Anlatanı dinleyin" gösterir.
- Yayında süren `mode: 'voice'` oyunları migration'da `refereed` olur; istemci eski adı da `refereed` okur.

---

## 7. Mekan sohbet odası

### 7.1 Kapsam

- Her mekanın tek, sabit bir grup sohbeti vardır: "Sakarya Üniversitesi sohbet odası". Adı `tr.ts`'te şablondur: `${venueName} sohbet odası`.
- **Erişim:** Yalnızca o mekanda aktif masası olan hesaplar okur ve yazar (`table_sessions.status = 'active' and expires_at > now()`). Masa bitince (ayrılma, süre dolumu) erişim hemen biter; geçmiş mesajlar da okunamaz.
- Yalnızca metin: en fazla 200 karakter, oda sohbetiyle aynı sınır.
- Mekandaki odalardan bağımsızdır: odadayken de açılabilir.

### 7.2 Veri

- **`venue_chat_messages`:**
  - `id`, `venue_id`, `session_id` (masa oturumu → `table_sessions` on delete cascade), `sender_user_id` (→ `auth.users` on delete cascade; **istemciye kapalı**).
  - `sender_alias`, `profiled boolean`, `body` (1–200), `created_at`, `hidden_at timestamptz null`.
- **`venue_chat_reports`:** `message_id` → `venue_chat_messages` on delete cascade, `reporter_user_id` (istemciye kapalı), `created_at`; primary key `(message_id, reporter_user_id)`.
- **Silme:** Mesajlar 24 saatte silinir (saatlik cron). Şikayet kopyası `reports`'ta 30 gün kalır (bugünkü cron).
- **Okuma:** Tablo okumasıyla değil, `venue_chat_page(venue_id, before?)` RPC'siyle. Security definer, yalnızca okur, `set search_path = ''`. Her mesaj için döner:
  - `id`, `profiled`, `sender_alias` (**yalnızca anonim mesajda**), `display_name` (yalnızca profilli mesajda), `body`, `created_at`, `from_me`.
  - **Profilli mesajda masa adı gitmez** (proje sahibi düzeltmesi): ad, fotoğraf ve masa adı birlikte giderse lobideki nokta başlığıyla kişinin kampüsteki yeri ortaya çıkar. `sender_alias` kolonu tabloda durur (şikayet kopyası, yalnızca sunucu), RPC profilli mesajda `null` döner. Entegrasyon testi bunu `venue_chat_page`, `venue_chat:` yükleri ve `profile/get` yanıtları üzerinden doğrular.
  - Aktif masası o mekanda olmayana boş döner.
  - İki yönlü engel varsa mesaj dönmez.
  - `hidden_at` dolu mesaj dönmez; gönderenin kendisine döner (kendi mesajının gizlendiğini ayırt edemez).
  - `public_id`, hesap id'si ve fotoğraf dönmez. Profil `profile/get { venueChatMessageId }` ile açılır (§7.5).

### 7.3 Anonim ya da profilli

- Varsayılan anonimdir: mesaj masa takma adıyla görünür.
- Sohbet ekranında "Profilimle yaz" anahtarı vardır. Mesaj başına `venue-chat/send { profiled }` ile gider; anahtarın son hâli yalnızca cihazda hatırlanır.
- Profilli mesaj yalnızca görünen adı gösterir, masa adını göstermez (§7.2). Görünen ad kayıtta zorunlu olduğu için her zaman vardır.

### 7.4 Gönderme ve güvenlik

- **`venue-chat/send { venueId, body, profiled }`:**
  1. Aktif masayı doğrular.
  2. `profanity.ts` ile süzer; küfürlü mesaj reddedilir, maskelenmez (kural 7'ye mekan sohbeti eklenir).
  3. Hız sınırı: hesap başına 3 sn'de 1 ve 10 dakikada 20 mesaj. Değerler `pure/venueChat.ts`'te tek kaynaktır.
  4. Mesajı yazar ve `venue_chat:{venue_id}` kanalına veri içermeyen `venue_chat` yayını yapar.
- **Push yoktur.**
- **Şikayet:** `safety/report { target: 'venue_chat', messageId, reason }`.
  - `reports`'a şikayet edilen mesajla birlikte o mekanın son 50 görünür mesajının kopyası yazılır (`target_type = 'venue_chat'`; `messages_snapshot`). Kopya yalnızca sunucudadır (`reports` istemciye kapalı); gönderen masa adını, profilliyse görünen adı ve zamanı içerir.
  - `venue_chat_reports`'a satır eklenir; aynı hesabın aynı mesaja ikinci şikayeti sayılmaz.
- **Otomatik gizleme:** Bir mesaj **3 ayrı hesaptan** şikayet alınca `hidden_at` dolar ve mesaj hiç kimseye verilmez (gönderen hariç).
  - Aynı hesabın tekrar şikayeti ya da kendi mesajını şikayet etmesi sayılmaz.
  - Kontrol aynı transaction'da yapılır; eşik `pure/venueChat.ts`'te durur.
  - Gizlenen mesaj için yayın yapılır; istemciler yeniden okur.
- **Engelleme:** `safety/block { venueChatMessageId, report?: reason }` gönderenin hesabını engeller. Engellenenler listesinde anonim mesajdan gelen engel masa adıyla, profilli mesajdan gelen engel **görünen adla** durur (`blocked_alias` bu adı taşır; masa adı yazılmaz). Engel iki yönlüdür: iki taraf birbirinin mesajlarını görmez.

### 7.5 Profil ve arkadaşlık isteği

- **Profilli mesajın göndericisine dokununca** `profile/get { venueChatMessageId }` çağrılır. Döner:
  - görünen ad, yaş, fotoğraf (gizlenmemişse), biyografi, rozetler.
- **`public_id` dönmez.** Profil mesaja bağlı açılır.
- `profile/get` şu hallerin hepsinde var olmayan mesajla **birebir aynı** yanıtı döner (`not_found`):
  - çağıranın o mekanda aktif masası yok;
  - mesaj anonim;
  - mesaj gizlenmiş ya da silinmiş;
  - iki yönlü engel var.
- **Arkadaşlık isteği:** `friends/request { venueChatMessageId }`.
  - Yalnızca profilli mesajın göndericisine yapılır.
  - Kurallar bugünkü istekle aynıdır: kalıcı red hesap çiftine bağlıdır, engel iki yönde sessizce yutar, zaten arkadaşsa `already_friends` döner, diğer her durumda `{ ok: true }`.
  - Hız sınırı: hesap başına günde 10 istek (mekan sohbetinden). Aşılınca da `{ ok: true }` döner ve hiçbir şey yazılmaz; sınırın varlığı sızdırılmaz.
  - `friend_requests.encounter_id` null olabilir hâle gelir. Yeni kolonlar `source text check (in 'encounter','venue_chat')` ve `venue_chat_context jsonb` (mekan adı, tarih; mesaj metni yok).
- **Gönderme onayı:** İstek göndermeden önce onay penceresinde "İstek gönderirsen profilin ona görünür" yazar.
- **Alıcının görünümü:** "Sakarya Üniversitesi sohbet odasından **Ayşe (21)** arkadaşın olmak istiyor", yanında fotoğraf (gizlenmemişse).
  - İstek sahibinin görünen adı, yaşı ve fotoğrafı gösterilir (S6): kampüs ölçeğinde yalnızca ad kimseyi tanıtmaz. İstek sahibi onay penceresiyle bunu kabul etmiştir. `public_id`, biyografi ve rozetler gitmez.
  - Fotoğraf `my_incoming_requests` yerine `friends/list` gibi fonksiyonda imzalanır (1 saatlik imzalı URL; `friends/incoming` eylemi). İstek sahibinin masa adı gitmez.
  - Kabul, red, engel ve şikayet bu istek kaydıyla yapılır.
- **Gönderenin görünümü:** `my_sent_requests()` alıcının o mesajdaki görünen adını ve durumu (`pending`/`accepted`; red süresiz `pending`) döner.

---

## 8. Veri modeli ve migration planı

Eski migration'lara dokunulmaz. Her adım kendi migration'ını getirir. Tablo ve politikalar aynı migration'dadır (kural 2). Her migration'dan sonra `pnpm gen:types` çalışır.

| Migration                  | İçerik                                                                                                                                                                                                                                                                         | Adım                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `…_profile_signup.sql`     | `profiles.birth_date`, kolon yetkisi, `private.profile_complete()`                                                                                                                                                                                                             | 1                     |
| `…_campus.sql`             | `venues.boundary`, `venue_spots`, `table_sessions.spot_id`, `private.venue_contains`, `start_table_session` (nokta), `venue_lobby` (nokta), `explore_venues` (etkinlik listesi, sınır)                                                                                         | 2                     |
| `…_room_flow.sql`          | `rooms.concept` null olabilir, `rooms.intent`, `owner_profiled`/`guest_profiled`, `game_proposals`, `rooms_leave`'in kaldırılması, engelleme ve masa bitişinde pencere, `room_member_profile` (oda işaretleri), `play_history.concept` + `'chat'`, `alias_words.kind` + `noun` | 3                     |
| `…_tabu_modes.sql`         | `game_state.mode` (`refereed`/`cooperative`), iş birliği skorları, `tabu_mark` yetkisi                                                                                                                                                                                         | 4                     |
| `…_venue_chat.sql`         | `venue_chat_messages`, `venue_chat_reports`, `venue_chat_page`, gizleme, 24 saat cron'u, `friend_requests.source`, `reports.target_type` + `'venue_chat'`, Realtime politikası                                                                                                 | 5                     |
| `…_drop_participation.sql` | `table_sessions.participation`, `profiles.default_participation`                                                                                                                                                                                                               | 5'ten bir sürüm sonra |

Adım numaraları §14'teki uygulama adımlarıdır (1+2 birlikte "adım 1").

### 8.1 Değişen tablolar

```
profiles           + birth_date date null          (istemciye KAPALI; yeni kayıtta complete-onboarding yazar)
                   ~ display_name                  (kayıtta zorunlu; kolon null kalır, kapı private.profile_complete())
                   - default_participation         (sonraki migration'da düşer; okunmaz)
venues             + boundary geography(Polygon, 4326) null
table_sessions     + spot_id uuid null → venue_spots   (noktası olan mekanda zorunlu; start_table_session denetler)
                   + alias_rerolls smallint not null default 0
                   - participation                 (sonraki migration'da düşer; okunmaz)
rooms              ~ concept text null             (null = sohbet; 'tabu' | 'sohbet' = süren oyun)
                   + intent text null check (in 'game','chat')
                   + owner_profiled boolean not null default false
                   + guest_profiled boolean not null default false
                   + spot_id uuid null             (oda sahibinin noktası; lobi ve aynı nokta kuralı)
play_history       ~ concept check (in 'tabu','sohbet','chat'); + intent text null
alias_words        ~ kind check (in 'adjective','noun')    (eski 'animal' satırları seed'de 'noun' olur)
friend_requests    ~ encounter_id null olabilir
                   + source text not null default 'encounter' check (in 'encounter','venue_chat')
                   + venue_chat_context jsonb null
                   check ((source = 'encounter') = (encounter_id is not null))
reports            ~ target_type check + 'venue_chat'; + venue_chat_message_id uuid null
```

### 8.2 Yeni tablolar

```
venue_spots          id pk, venue_id → venues on delete cascade, ref text, name text (1–40),
                     sort smallint, is_active boolean, unique (venue_id, ref)
game_proposals       room_id pk → rooms on delete cascade, proposer_session_id → table_sessions,
                     concept text check (in 'tabu','sohbet'), created_at, expires_at
venue_chat_messages  id pk, venue_id → venues on delete cascade,
                     session_id → table_sessions on delete cascade,
                     sender_user_id → auth.users on delete cascade (istemciye KAPALI),
                     sender_alias text, profiled boolean, body text (1–200),
                     created_at, hidden_at timestamptz null
                     index (venue_id, created_at desc)
venue_chat_reports   message_id → venue_chat_messages on delete cascade,
                     reporter_user_id → auth.users on delete cascade (istemciye KAPALI),
                     created_at, primary key (message_id, reporter_user_id)
venue_chat_rate      user_id pk → auth.users on delete cascade, window_started_at, count, last_sent_at
                     (hız sınırı; istemci okumaz)
```

### 8.3 Kilit sırası (kural 10'un genişlemesi)

- **Masa ve oda zinciri:** `profiles` → `table_sessions` → `rooms` → `join_requests` → **`game_proposals`** → odanın satırları.
- **Mekan sohbeti:** `table_sessions` → **`venue_chat_messages`** → **`venue_chat_reports`**. Oda zincirine girmez.
- **İki hesap arasında:** mekan sohbetinden istek, `play_history` yerine doğrudan çift kilidinden başlar: `private.lock_pair` → `friend_requests`.
- Engelleme ve masa bitişinde pencere açan yeni yollar ile `change-spot` ve `reroll-alias` masa oturumu kilitler. Her biri `rooms.test.ts` → `locks` kalıbında testle gelir.

---

## 9. RLS ve kolon yetkileri

| Tablo                                                          | İstemci okuması                                                   | Not                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| `profiles`                                                     | Kendi satırı; `photo_path`, `photo_hidden_at`, `birth_date` hariç | Kendi doğum tarihi `profile/me` ile                       |
| `venues`                                                       | Kimliği doğrulanmış herkes (değişmez)                             | `boundary` dahil; kampüs sınırı açık bilgi                |
| `venue_spots`                                                  | Kimliği doğrulanmış herkes                                        | Nokta başına sayı hiçbir yerde yok                        |
| `table_sessions`                                               | Kendi satırı (değişmez)                                           | `spot_id`, `alias_rerolls` dahil                          |
| `rooms`                                                        | Üyeler (değişmez)                                                 | `intent`, `*_profiled`, `spot_id` işaret; `public_id` yok |
| `game_proposals`                                               | Odanın iki masası                                                 | Postgres Changes ile öneri bildirimi                      |
| `venue_chat_messages`, `venue_chat_reports`, `venue_chat_rate` | Yok                                                               | `venue_chat_page()`; gönderen hesap id'si hiç gitmez      |
| `friend_requests`                                              | Yok (değişmez)                                                    | RPC'ler `source`'a göre bağlam döner; `public_id` yok     |
| `realtime.messages`                                            | `private.realtime_topic_allowed`                                  | `venue_chat` türü eklenir (§10)                           |

İstemcinin çağırdığı yeni ya da değişen RPC'ler yalnızca okur ve `set search_path = ''` ile tanımlanır: `venue_lobby` (+ nokta, niyet; − konsept), `explore_venues` (+ etkinlik listesi, sınır), `venue_chat_page`, `room_member_profile`, `my_incoming_requests`, `my_sent_requests`.

Genel testler yeni RPC'lerin de hesap id'si ve arkadaşlık öncesi `public_id` döndürmediğini doğrular (§13).

---

## 10. Realtime kanalları

| Topic                                            | Kim abone olur                          | Kim yayın yapar           | Olaylar                                                              |
| ------------------------------------------------ | --------------------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `venue:{venue_id}`                               | Mekanda aktif masası olanlar (değişmez) | Sunucu                    | `lobby_changed`                                                      |
| `venue_chat:{venue_id}` (yeni)                   | Mekanda aktif masası olanlar            | Yalnızca sunucu           | `venue_chat` (veri içermez; istemci `venue_chat_page` okur)          |
| `session:{session_id}`                           | O masa (değişmez)                       | Sunucu                    | `join_request`, `join_accepted`                                      |
| `room:` `messages:` `game:` `presence:{room_id}` | Odanın iki masası (değişmez)            | Üyeler (presence), sunucu | `game_proposals` değişiklikleri `room:` Postgres Changes'ına eklenir |
| `inbox:{user_id}`, `dm:{thread_id}`              | Değişmez                                | Sunucu                    | Değişmez                                                             |

- `venue_chat:` politikası `private.realtime_topic_allowed`'a yeni `kind` olarak eklenir: abone olmak için o mekanda aktif masa gerekir, istemci yayını reddedilir.
- Masa bitince kanal politikası bir sonraki abonelik denemesinde reddeder. İstemci masa bitişinde kanalı kapatır; sunucu tarafı erişim `venue_chat_page`'in boş dönmesiyle zaten biter.
- Yük veri içermediği için (kural 9) mesaj metni, takma ad ya da profil Realtime'dan geçmez.

---

## 11. API (Edge Function'lar)

| Fonksiyon           | Eylemler                                                                                                                                                                                                                                                                                                                                   | Durum   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `sms` (yeni)        | Send SMS Hook hedefi: imza doğrulama, `+905` kilidi, sağlayıcı bağdaştırıcısı                                                                                                                                                                                                                                                              | Yeni    |
| `account`           | `complete-onboarding { termsVersion, kvkkVersion, displayName, birthDate }` (18 altında hesabı siler, `under_age`); `delete`, `register-push` değişmez                                                                                                                                                                                     | Değişir |
| `profile`           | `get { publicId }` kendi profilinde doğum tarihini de döner (_adım 1 notu: ayrı `me` eylemi gerekmedi, bkz. DECISIONS_); `get { publicId }` ya da `get { venueChatMessageId }` (`age` döner, doğum tarihi dönmez); `update` (`default_participation` kalkar)                                                                               | Değişir |
| `checkin`           | `check-in { …, spotId? }` (sınır ya da 300 m; `participation` kalkar); `change-spot { spotId }`; `reroll-alias`; `leave` (iki masalı odada pencere)                                                                                                                                                                                        | Değişir |
| `rooms`             | `create { intent?, profiled }` (konsept ve görünürlük yok, her zaman açık); `create-solo` ("Masanla oyna": tek masalı özel oda); `request-join { roomId, profiled }` (`different_spot`); `respond`; `propose-game { roomId, concept }`; `answer-game { roomId, accept }`; `end-game { roomId }` (adım 3 notu, §5.7); `end`; `leave` kalkar | Değişir |
| `tabu`              | `start` (öneri kabulünden ya da tek masadan; mod sunucuda); `turn-cards` (iş birliğinde yalnızca anlatan); `mark` (iş birliğinde yalnızca anlatan, üç eylem); `end-turn`                                                                                                                                                                   | Değişir |
| `sohbet`            | `next-card` (değişmez; oyun öneriyle başlar)                                                                                                                                                                                                                                                                                               | Değişir |
| `venue-chat` (yeni) | `send { venueId, body, profiled }`                                                                                                                                                                                                                                                                                                         | Yeni    |
| `safety`            | `report` + `target: 'venue_chat', messageId`; `block` + `venueChatMessageId`; odadaki engel pencereyi açar                                                                                                                                                                                                                                 | Değişir |
| `friends`           | `request { historyId }` ya da `request { venueChatMessageId }` (günlük sınır, sessiz)                                                                                                                                                                                                                                                      | Değişir |

**Kalıp:** Hepsi bugünkü kalıbı izler: tek endpoint, `action`, zod v4, `{ error: { code, message } }`. Yeni fonksiyonlar `config.toml`'a `verify_jwt = false` ile ve CLAUDE.md'deki deploy listesine birlikte eklenir. Liste 12'den 14'e çıkar: `sms`, `venue-chat`.

**Yeni hata kodları:** `under_age`, `profile_required`, `birth_date_invalid`, `spot_required`, `spot_invalid`, `different_spot`, `in_room`, `reroll_limit`, `proposal_pending`, `no_proposal`, `game_in_progress`, `not_describer`.

**`display_name_required`:** Kayıtta ad zorunlu olduğu için yeni kayıtlarda oluşmaz. Kod, `profile_required` ile aynı kapıya bağlanır.

**Yeniden gönderim (`apiRetry.ts` → `IDEMPOTENT_CALLS`):** Yeni girdi yok. `venue-chat/send`, `propose-game` ve `reroll-alias` idempotent değildir, tekrar gönderilmez.

**Admin script'leri:** `pnpm admin:set-birth-date <userId> <YYYY-MM-DD>` (§3.2). Mekan ve nokta eklemek script değil, içeriktir.

---

## 12. Geçiş

- **Sürüm ve build:**
  - v3 sunucusu, adım adım dev projesine yayımlanır ve aynı sürümdeki preview APK'lara OTA ile gider. Hiçbir adım native değişiklik getirmez.
  - Pilot build'i: tasarım oturumunun simgesiyle `version` artırılır. v3'ün son adımından sonra **tek** `eas build --profile production` alınır.
  - v3 sürecinde başka bir native değişiklik çıkarsa (öngörülmüyor) aynı `version` artışına ve aynı build'e eklenir, ayrı build alınmaz.
- **Eski istemciler:** Her adımda sunucu ve OTA aynı anda gider; dev projesinde kısa uyumsuzluk kabul edilir. v3 sunucusu v2 istemcilerini desteklemez, çünkü `rooms/leave` ve konseptli oda kurma kalkar.
  - Üretimde henüz kullanıcı yoktur. Pilot build'i dağıtılınca `MIN_APP_BUILD` o build'in numarasına ayarlanır.
- **Veri:**
  - Aktif `rooms` satırlarının `concept`'i korunur (süren oyun).
  - Aktif `table_sessions`'ın `spot_id`'si boş kalır. Pilot mekanının masaları süre dolumuyla biter; migration aktif masaları bitirmez.
  - Noktası olan mekanda boş `spot_id`'li masa lobiyi "noktasız" başlığıyla görür ve `change-spot` ile nokta seçer.
- **Mevcut hesaplar:** Açılışta profil ekranı (doğum tarihi, ad yoksa ad). Yeni onay sürümleri yeniden onay ister.
- **Kalkan kolonlar:** `table_sessions.participation` ve `profiles.default_participation` bir sürüm okunmadan durur, sonra düşer (`…_drop_participation.sql`).
- **İçerik:** Beylikdüzü mekanları `isActive: false`. Kampüs ve noktaları `venues-campus.json`'dan. Test mekanı S1 gelene kadar açık (§4.1 adım 2 notu).

---

## 13. Kabul kriterleri ve test planı

Her adımın sonunda: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` ve entegrasyon testleri temiz; E2E (`e2e/maestro/p0.yaml` ve `scripts/e2e/bot-table.ts`) yeni akışla güncel ve yeşil.

### Adım 1: Giriş ve kayıt = profil

- **Birim:**
  - `pure/age.ts`: 18. yaş günü, bir gün öncesi, 29 Şubat, İstanbul günü sınırı, gelecek tarih, 100+.
  - `pure/sms.ts`: metin, yalnızca `+905`.
  - `pure/smsProviders/netgsm.ts`: istek gövdesi, başarı, geçici ve kalıcı hata eşlemesi.
  - Standard Webhooks imza doğrulaması: geçerli, bozuk, eski zaman damgası.
- **Entegrasyon:**
  - `complete-onboarding` 18 altında hesabı siler, `under_age` döner. `profiles`'ta satır, `banned_phones`'ta hash yoktur; auth kullanıcısı yoktur.
  - 18+ kayıtta onaylar, ad ve doğum tarihi tek transaction'da yazılır. Adsız ya da doğum tarihsiz profil `checkin`'de `profile_required` alır.
  - `birth_date` istemci okumasında yoktur (kolon yetkisi). `profile/get` `age` döner, doğum tarihi hiçbir yanıtta yoktur.
  - `sms`: imzasız istek `401` alır ve göndermez. Yerel stack'te hook açıkken test numarasına SMS isteği hook'u çağırmadan başarılı olur (ayrı yapılandırmayla elle koşulan test, §2.2). Doğrulanamazsa uygulama durur ve sorulur.
- **E2E:** Yeni kayıt akışı (onay, ad, doğum tarihi, fotoğrafı atla). 18 altı tarih girilince "Kabuk 18 yaş ve üzeri içindir" görünür ve oturum kapanır.
- **Belge:** `docs/FIELD_TEST.md` v3 akışlarına ve Kabuk adına göre güncellenir; bildirim başlığı artık "Kabuk".
- **Kabul:**
  - Test numarasıyla yeni hesap profil kurmadan uygulamaya giremiyor.
  - 18 altı için hiçbir kayıt kalmıyor.
  - Dev projesinde hook kapalıyken Twilio ile giriş çalışıyor.
  - Hook açma ve kapatma §2.3'e göre belgelendi. Gerçek Netgsm denemesi hesap açılınca, proje sahibi tarafından yapılır.

### Adım 2: Kampüs pilotu

- **Birim:**
  - `pure/geo.ts` → `withinBoundary`: iç, kenar, köşe; dışarıda 40 m kabul, 60 m ret.
  - Seed poligon doğrulaması.
  - `exploreLayout`: tek ve çok mekan.
- **Entegrasyon (fixture poligonu; gerçek kampüs değil):**
  - Sınır içinden check-in kabul; sınırın **40 m dışı kabul, 60 m dışı `too_far`** (50 m tolerans).
  - Sınırı olmayan mekanda 300 m kuralı değişmez.
  - Noktasız check-in `spot_required`; başka mekanın noktası `spot_invalid`.
  - Başka noktadaki odaya istek `different_spot`; `change-spot` sonrası aynı istek kabul edilir ("Bu noktadayım" yolu). Odadayken `change-spot` `in_room`.
  - Lobi yanıtında nokta başına sayı yok.
  - Koordinat saklanmıyor: bugünkü tarama testi yeni tablolarla birlikte.
- **E2E:** Check-in'de nokta seçimi; lobi nokta başlıkları; başka noktadaki odada "Bu noktadayım"; Keşfet tek mekan kartı ve "Yeni mekanlar yakında".
- **Kabul:** Pilot içeriğiyle Keşfet yalnızca kampüsü gösteriyor. Kampüs dışından check-in reddediliyor. Yeni nokta yalnızca JSON ve seed ile ekleniyor (testte bir nokta eklenip seed yeniden uygulanır).

### Adım 3: Oda akışı

- **Entegrasyon:**
  - Konseptsiz oda kurulur, sohbetle başlar. Öneri yalnızca iki masalı odada yapılır; aynı anda tek öneri olur.
  - Red ve zaman aşımı öneri satırını siler ve önerenin gördüğü metin aynıdır ("Öneri kabul edilmedi"). Red hemen görünür; test zamanlama eşitliği iddia etmez (S7).
  - Kabulle oyun başlar; oyun bitince `concept = null`.
  - "Oda kur" her zaman açık oda kurar; `rooms/create` görünürlük almaz, "Masanla oyna" yolu (`create-solo`, `private`) ayrıdır ve lobide görünmez.
  - Tek masalı oda öneri istemeden yerel oyuna izin verir.
  - `rooms/leave` yok.
  - Engelleme iki masalı odada pencereyi açar. Karşı tarafın "Evet"i için satırlar, yayınlar ve zamanlama "Hayır" ile birebir aynıdır (bugünkü kural 5 testinin genişlemesi).
  - Mekandan ayrılma iki masalı odada aynı yolu izler.
  - İki masalı odada 10 dakika hareketsizlik pencereyi iki taraf için de açar; iki taraf da karar verebilir. Tek masalı hareketsiz oda kapanır.
  - Oda düzeyinde anonimlik: `room_member_profile` odanın işaretine bakar; masa oturumu profilli olsa bile oda anonimse boş döner.
  - Lobi niyet etiketini döner, konsept dönmez.
  - `reroll-alias` 3 kez çalışır, 4.'sü `reroll_limit` alır. Odadayken `in_room` döner. Yeni ad mekanda benzersizdir.
  - `locks`: yeni yollar kilit sırasını izler.
- **E2E:** Oda kur (niyet, profilli/anonim), sohbet, bot'un önerisini kabul (bot `BOT_ROLE=host` akışı güncellenir), oyun sonu sohbete dönüş, "Odayı bitir"; "Masanla oyna".
- **İçerik:** Yeni masa adı listeleri (sıfat + isim; hayvan, yiyecek, bitki, nesne, doğa) bu PR'da proje sahibinin ayıklamasına sunulur.
- **Kabul:** Oda kurarken oyun sorulmuyor. Oyun yalnızca iki tarafın onayıyla başlıyor. Tek çıkış "Odayı bitir". Engelleme "Hayır"dan ayırt edilemiyor.

### Adım 4: Tabu modları

- **Birim:** `tabuMode` (1+1, 1+3, 2+2, 4+1); iş birliği puan reducer'ı; eylem yetkisi (iş birliğinde yalnızca anlatan, üç eylem).
- **Entegrasyon:**
  - İş birliği modunda tahmin eden masa `turn-cards`'tan kart alamaz (`not_describer`).
  - Ağ yanıtlarının hiçbirinde (`turn-cards`, `game_state`, `room:` yükleri) kart kapanmadan kelime yoktur.
  - Hakemli mod bugünkü testleriyle aynen geçer. Mod oyun ortasında değişmez.
- **E2E:** Bot tek kişilik masa (`headcount 1`) ile iş birliği modunu oynar.
- **Kabul:** Mod sunucuda kişi sayısından belirleniyor. İş birliğinde tahmin eden telefon kartı ne ekranda ne ağ trafiğinde görüyor.

### Adım 5: Mekan sohbet odası

- **Birim:** hız sınırı penceresi, gizleme eşiği (3 ayrı hesap), mesaj doğrulama.
- **Entegrasyon:**
  - Aktif masası olmayan okuyamaz ve yazamaz, `venue_chat:`'e abone olamaz. Masa bitince `venue_chat_page` boş döner.
  - Küfür reddi; hız sınırı.
  - Şikayet son 50 mesajı kopyalar. 3 ayrı hesabın şikayeti gizler; aynı hesabın 3 şikayeti gizlemez. Gizlenen mesaj gönderene döner, başkasına dönmez.
  - Engel iki yönde mesajları gizler. Profilli mesajdan gelen engel, engellenenler listesinde görünen adla durur.
  - **Profilli mesajda masa adı yok:** `venue_chat_page`, `venue_chat:` yükleri, `profile/get` ve istek yanıtlarının hiçbirinde profilli mesajın göndereninin masa adı geçmez.
  - `profile/get { venueChatMessageId }`: anonim mesaj, gizli mesaj, engel, aktif masa yokluğu ve var olmayan mesaj birebir aynı yanıtı verir.
  - Alıcının gelen istek görünümü gönderenin görünen adını, yaşını ve (gizlenmemişse) fotoğrafını içerir; `public_id` ve masa adı içermez.
  - Arkadaşlık isteği: anonim mesaja yapılan istek sessizce yutulur. Günlük sınır aşımı `{ ok: true }` döner ve satır oluşmaz. Kalıcı red ve engel bugünkü gibi.
  - Hesap id'si ve arkadaşlık öncesi `public_id` taraması `venue_chat_page`, `profile/get` ve `venue_chat:` yüklerini kapsar.
  - 24 saat cron'u mesajları siler, şikayet kopyası kalır.
- **E2E:** Mekan sohbetine anonim ve profilli mesaj. Bot profilli mesaj yazar; kullanıcı profili açar ve istek gönderir, bot kabul eder.
- **Kabul:** Yalnızca mekandakiler okuyup yazabiliyor; çıkışta erişim bitiyor. 3 ayrı şikayet mesajı gizliyor. Profil ve istek profil kimliği sızdırmadan çalışıyor.

---

## 14. Uygulama sırası ve yayın türü

| Adım                      | Kapsam | Sunucu                                                                                       | İstemci                                                          | Yayın                                                        |
| ------------------------- | ------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Giriş + kayıt = profil | 1 + 2  | `…_profile_signup.sql`, `sms`, `account`, `profile`, kapı; yasal ve mağaza metinleri         | Onboarding profil ekranı, 18 altı ekranı, Ayarlar → Hesap        | Deploy → **OTA**; hook paneli Netgsm hazır olunca (§2.3)     |
| 2. Kampüs pilotu          | 3      | `…_campus.sql`, `checkin`, içerik (`venues-campus.json`, diğerleri kapalı), seed doğrulaması | Nokta seçimi, lobi gruplama, Keşfet tek mekan görünümü           | `db push --include-seed` + deploy → **OTA**                  |
| 3. Oda akışı              | 4      | `…_room_flow.sql`, `rooms`, `safety`, `checkin`, `tabu`/`sohbet` başlatma, yeni masa adları  | Oda kur, oda ekranı (sohbet + öneri), tek çıkış, adı yeniden çek | Seed + deploy → **OTA**                                      |
| 4. Tabu modları           | 5      | `…_tabu_modes.sql`, `tabu`                                                                   | İş birliği ekranları                                             | Deploy → **OTA**                                             |
| 5. Mekan sohbet odası     | 6      | `…_venue_chat.sql`, `venue-chat`, `safety`, `friends`, `profile`                             | Mekan sohbeti ekranı, profil kartı, istek                        | Deploy → **OTA**; sonra `…_drop_participation.sql`           |
| Pilot build'i             | —      | —                                                                                            | Tasarım oturumunun simgesi ve ekranları                          | `version` artışı → **tek** production build, `MIN_APP_BUILD` |

- Her adım ayrı PR'dır ve `e2e` etiketi taşır. Birleştirmeyi proje sahibi yapar.
- Her PR'da sunucu önce yayına girer (CLAUDE.md "Neyi ne zaman yayınlamalı").
- **Tasarım oturumu paralel çalışıyor:** Tema tokenlarına (`src/theme/*`) ve `src/components` içindeki mevcut bileşenlerin görünümüne dokunulmaz. Yeni ekranlar mevcut bileşenlerle sade kurulur, sabit renk yazılmaz. Yeni ortak bileşen gerekirse eklenir ve PR özetinde listelenir. Görünümü tasarım oturumu yeniden çizecek.
- Kullanıcıya görünen bütün metinler `tr.ts`'tedir. E2E akışındaki metin eşleşmeleri aynı PR'da güncellenir.

---

## 15. Analitik

Yeni olaylar `_shared/pure/analytics.ts` izin listesine eklenir. Hepsi yalnızca kullanıcı id'siyle gider; mekan, nokta, konum, içerik ve karşı taraf gitmez.

| Olay                             | Özellikler                                                        |
| -------------------------------- | ----------------------------------------------------------------- |
| `onboarding_completed` (mevcut)  | + `with_photo: boolean`, `with_bio: boolean` (yaş gitmez)         |
| `room_created` (mevcut)          | `concept` yerine `intent: 'game' \| 'chat' \| 'none'`, `profiled` |
| `game_proposed`, `game_accepted` | `concept`                                                         |
| `game_completed` (mevcut)        | + `tabu_mode: 'refereed' \| 'cooperative'`                        |
| `alias_rerolled`                 | —                                                                 |
| `spot_changed`                   | —                                                                 |
| `venue_chat_sent`                | `profiled`                                                        |
| `venue_chat_reported`            | —                                                                 |
| `friend_request_sent` (mevcut)   | `source` + `'venue_chat'`                                         |

18 yaş altı için hiçbir olay gönderilmez, anonim olarak da (S2): reşit olmayan birinin cihaz kimliği gitmez. PostHog yalnızca `complete-onboarding` başarılı olduktan sonra `identify` ile başlar.

---

## 16. CLAUDE.md değişmez kuralları: yeni metinler

Onaylandı; CLAUDE.md'ye işlendi. Kurallar, ilgili adım uygulanana kadar o adımın kapsamındaki kodu bağlar; önceki davranışı koruyan kod o adımda değişir.

**Kural 3 (sunucu otoriter).** Sesli Tabu cümlesinin yerine:

> "Tabu'nun modunu sunucu kişi sayısından belirler. Hakemli modda doğruluğa masalar karar verir (Tabu yalnızca hakem masa, Pas yalnızca anlatan masa, Doğru ikisi de). İş birliği modunda üç eylemi yalnızca anlatan masa basar ve tahmin eden masaya kart gitmez. Oyun yalnızca bir masanın önerisini diğerinin kabul etmesiyle başlar; odada aynı anda tek oyun ve tek öneri olur. (devamı aynı)"

**Kural 4 (anonimlik).**

> "Anonimlik: diğer masalara varsayılan olarak yalnızca masa takma adı, kişi sayısı ve varsa niyet etiketi gider. Anonim ya da profilli katılım oda başına seçilir (oda kurarken ve katılma isteğinde; varsayılan anonim) ve mekan sohbetinde mesaj başına seçilir. Profilli odada lobi ve katılma isteği yalnızca 'profilli' işaretini görür; profil (görünen ad, yaş, fotoğraf, biyografi, rozetler) ve profil kimliği yalnızca oda sürerken o odanın üyelerine gider. Mekan sohbetinde profilli mesajın profili, o an mekanda aktif masası olanlara mesaj üzerinden açılır; profil kimliği gitmez. Profilli mekan sohbeti mesajında masa adı gitmez. Mekan sohbetinden arkadaşlık isteği gönderen, alıcıya görünen adını, yaşını ve fotoğrafını açar. Doğum tarihi hiçbir kullanıcıya gitmez, yalnızca yaş gider. (devamı aynı: arkadaşlar, arkadaşlık öncesi public_id yok, koordinat/mekan/aktif masa yok, hesap kimliği yok, masa oturum id'si)"

**Kural 5 (red = zaman aşımı).** Sona:

> "İki masalı odada engelleme ve mekandan ayrılma, o masa için 'Hayır' sayılır ve pencereyi açar; karşı taraf bunları 'Hayır'dan ayırt edemez. İki masalı odada 10 dakika hareketsizlik odayı kapatmaz, pencereyi iki taraf için de aynı şekilde açar. Mekan sohbetinden gelen arkadaşlık isteğinde günlük sınır aşımı da sessizdir."

(Oyun önerisinin reddi kural 5'e girmez, S7.)

**Kural 6 (konum).**

> "Konum yalnızca check-in anında, uygulama açıkken, mekanın sınırı içinde (50 m toleransla; sınırı yoksa 300 m yakınında) olunduğunu doğrulamak için alınır. Koordinat saklanmaz; yalnızca seçilen `venue_id` ve masanın kendi beyan ettiği nokta (`spot_id`) saklanır. Nokta başına masa sayısı gösterilmez. (devamı aynı)"

**Kural 7 (metin).** Kapsama mekan sohbeti eklenir: "(oda sohbeti, mekan sohbeti, DM, biyografi, görünen ad)".

**Kural 9 (Realtime).** Ek:

> "`venue_chat:{venue_id}`: o mekanda aktif masası olanlar abone olur, yalnızca sunucu veri içermeyen yayın yapar."

**Kural 10 (kilit sırası).** §8.3'teki ekler.

**Yeni kural (18 yaş):**

> "Kabuk 18 yaş ve üzeri içindir. Doğum tarihi kayıtta zorunludur; 18 yaş altı beyanında hesap o çağrıda silinir ve hiçbir veri (profil, onay, doğum tarihi, telefon hash'i) tutulmaz. Doğum tarihi istemciye kapalı kolondur; uygulamadan değiştirilemez."

**MVP_SPEC'te değişecek eski kararlar:**

- §4.1 onboarding: 18+ kutusu → doğum tarihi; görünen ad kayıtta zorunlu.
- §4.2 check-in: sınır ya da 300 m; nokta seçimi; katılım seçimi kalkar.
- §4.3 oda kurma: konsept yerine niyet; katılım oda başına.
- §4.5 oda içi: "Odadan çık" kalkar.
- §5 konseptler: oyun öneriyle başlar; Tabu modları.
- §8 SMS: Send SMS Hook ile Netgsm.
- §11 içerik: `venues-campus.json`, noktalar, yeni masa adı listeleri.

---

## 17. Kararlar (açık soruların cevapları)

- **S1 — Kampüs sınırı ve noktalar:** Poligon ve nokta adları proje sahibinden ayrıca gelecek. Yalnızca adım 2'yi bekletir; koordinat tahmin edilmez.
- **S2 — 18 yaş altı:** Kabul: hiçbir kayıt tutulmaz, aynı numara yeniden kayıt olabilir. `onboarding_under_age` olayı **hiç gönderilmez**, anonim de olsa (§15).
- **S3 — Tabu modu:** Oyun düzeyinde. Masalardan biri tek kişiyse bütün oyun iş birliği modunda (§6.1).
- **S4 — Görünürlük:** Oda kur ekranından kalkar; "Oda kur" her zaman mekana açık, ekranda yalnızca niyet ve Anonim/Profilimle. "Masanla oyna" ayrı düğme, arka planda tek masalı özel odayı kurar (§5.1).
- **S5 — Odada engelleme ve mekandan ayrılma:** Kabul, o masa için "Hayır". Ek: iki masalı odada 10 dakika hareketsizlik pencereyi iki taraf için de aynı şekilde açar; tek masalı oda bugünkü gibi kapanır (§5.5).
- **S6 — Mekan sohbetinden istek:** Alan kişi gönderenin görünen adını, yaşını ve fotoğrafını (gizlenmemişse) görür; `public_id` gitmez. Onay penceresinde "İstek gönderirsen profilin ona görünür" (§7.5).
- **S7 — Öneri reddi:** Red ve zaman aşımı aynı metin ("Öneri kabul edilmedi"), red hemen gösterilir. Kural 5'e eklenmez; test yalnızca satırın silinmesini ve metnin aynılığını doğrular (§5.3).
- **S8 — Doğum tarihi değişikliği:** Kabul; uygulamadan değiştirilemez, `admin:set-birth-date` (§3.2).
- **S9 — Keşfet eşiği:** Kabul, 2 aktif mekandan itibaren liste ve harita (§4.4).
- **S10 — Nokta değiştirme:** Kabul, GPS'siz ve odada değilken serbest. Ek: başka noktadaki oda kartında "Bu noktadayım" düğmesi `change-spot` çağırır, sonra istek gönderilebilir (§4.3).
- **S11 — Hız sınırları:** Kabul (§7.4, §7.5).
- **S12 — Gizlenen mesaj:** Kabul, kalıcı gizli.
- **S13 — Masa adları:** Sıfat + isim; isimler hayvanla sınırlı değil (yiyecek, bitki, nesne, doğa); kampüse özel tema yok. Liste adım 3'ün PR'ında verilir (§5.6).
- **S14 — Netgsm:** Adım 1 Netgsm'i beklemez. Netgsm hazır olana kadar dev projesi Twilio Verify ile çalışır (§2.3).

**Proje sahibinin ek düzeltmeleri (onayla birlikte):**

1. Profilli mekan sohbeti mesajında masa adı gitmez; bu mesajdan gelen engel engellenenler listesinde görünen adla durur; kural 4'e eklendi; entegrasyon testiyle (§7.2, §7.4, §13).
2. Kampüs sınırına 50 m tolerans (`ST_DWithin`); tolerans `pure/` içinde tek sabit, istemci uyarısı da aynısını kullanır; test 40 m kabul, 60 m ret (§4.2, §13).
3. Tasarım oturumu paralel çalışıyor: tema tokenlarına ve mevcut bileşenlerin görünümüne dokunulmaz; yeni ortak bileşenler PR özetinde listelenir (§14).
4. `docs/FIELD_TEST.md` adım 1'in PR'ında v3 akışlarına ve Kabuk adına göre güncellenir; bildirim başlığı "Kabuk" (§13).
