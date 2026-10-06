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
        "location": { "lat": 40.741282, "lng": 30.331469 },
        "boundary": [[30.33, 40.74], "…"],
        "spots": [{ "ref": "kantin", "name": "Merkez Kantin" }, "…"]
      }
    ]
  }
  ```
  - `boundary` bir GeoJSON dış halkasıdır: `[lng, lat]` dizisi, kapalı, saat yönünün tersine.
  - `spots` sıralı listedir. Nokta koordinatı tutulmaz; nokta, kampüs içindeki masanın kendi beyanıdır. Liste boş olabilir (ya da hiç olmayabilir): aktif noktası olmayan mekanda check-in nokta sormaz. Kaldırılan nokta silinmez, listede `isActive: false` kalır.
  - `location` isteğe bağlıdır (`venues.location`, Keşfet'teki iğne); sınırın içinde olmalıdır, değilse `pnpm seed` durur. Verilmezse poligonun üzerindeki bir nokta (`st_pointonsurface`) kullanılır.
  - Poligon ve nokta adları proje sahibinden gelir (S1). Koordinat tahmin edilmez.
- **Diğer mekanlar:**
  - `venues-pilot.json` (Beylikdüzü) içerikte kapatılır (`isActive: false`).
  - _Adım 2 notu (proje sahibi kararı):_ S1 gelene kadar `venues-campus.json`'da kampüs kaydı **yer tutucu** poligon ve örnek noktalarla `isActive: false` durur; dev projesinde cihaz testi için `venues-test.json`'daki test mekanı açık kalır. Gerçek poligon ve nokta adları gelince yalnızca JSON değişir (`isActive: true`); test mekanı o zaman kapatılır.
  - _S1 notu (proje sahibi kararı):_ sınır ve konum geldi, kampüs **noktasız** açılır (örnek noktalar `isActive: false`); nokta adları sonra yalnızca JSON + seed ile eklenir. Test mekanı dev projesinde açık kalır; üretimde pilot yayın adımlarındaki gibi (`PILOT_RELEASE.md`, henüz açık PR'da) kapanır.
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

### 7.6 Uygulamada netleşenler (adım 5 notu)

Gerekçeler `docs/DECISIONS.md` → "Mekan sohbet odası (v3 adım 5)".

- **Gönderilenler:** `my_sent_requests()` yerine ayrı `my_sent_venue_chat_requests()`. Satırlar istek kayıtlarından değil, sunucuda tutulan basışlardan (`venue_chat_friend_presses`) gelir: engel, önceki red, günlük sınır ya da tekrar yüzünden yutulan istek de "bekliyor" görünür (kural 5). Oyun geçmişindeki `friend_action_at` ile aynı ilke.
- **Gelen istekler:** `friends/incoming` yalnızca mekan sohbetinden gelen istekleri döner (adı, yaşı, imzalı fotoğrafı); karşılaşmadan gelenler `my_incoming_requests()`'te kalır. Uygulama ikisini aynı listede gösterir.
- **İstekten engel ve şikayet:** `safety/block { friendRequestId, report? }` ve `safety/report { target: 'friend_request', requestId }`. Engellenenler listesinde görünen ad durur.
- **Hız sınırı tablosu** (`venue_chat_rate`) kilit sırasında masa oturumundan sonra, mesajlardan önce gelir: `table_sessions` → `venue_chat_rate` → `venue_chat_messages` → `venue_chat_reports`.
- **Aktif masa** `status = 'active' and expires_at > now()`; süresi dolmuş ama henüz bitirilmemiş masa da okuyamaz ve yazamaz. Hata kodu yeni değil: `no_active_table`.
- **Şikayet kopyası** son 50 görünür mesaj; şikayet edilen mesaj `reported: true` ile işaretli. Kopya mesaj silindikten sonra da kalır (`venue_chat_message_id` null olur).

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
| `inbox:{user_id}`, `dm:{thread_id}`              | Değişmez                                | Sunucu                    | Değişmez; adım 6'dan itibaren `dm:` üzerinde `dm_status` da (§18.2)  |
| `dm_typing:{thread_id}` (adım 6)                 | Konuşmanın iki üyesi                    | Konuşmanın iki üyesi      | `typing` (yük boş, alıcı okumaz, saklanmaz; §18.2)                   |

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

| Adım                      | Kapsam | Sunucu                                                                                       | İstemci                                                                                                      | Yayın                                                        |
| ------------------------- | ------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1. Giriş + kayıt = profil | 1 + 2  | `…_profile_signup.sql`, `sms`, `account`, `profile`, kapı; yasal ve mağaza metinleri         | Onboarding profil ekranı, 18 altı ekranı, Ayarlar → Hesap                                                    | Deploy → **OTA**; hook paneli Netgsm hazır olunca (§2.3)     |
| 2. Kampüs pilotu          | 3      | `…_campus.sql`, `checkin`, içerik (`venues-campus.json`, diğerleri kapalı), seed doğrulaması | Nokta seçimi, lobi gruplama, Keşfet tek mekan görünümü                                                       | `db push --include-seed` + deploy → **OTA**                  |
| 3. Oda akışı              | 4      | `…_room_flow.sql`, `rooms`, `safety`, `checkin`, `tabu`/`sohbet` başlatma, yeni masa adları  | Oda kur, oda ekranı (sohbet + öneri), tek çıkış, adı yeniden çek                                             | Seed + deploy → **OTA**                                      |
| 4. Tabu modları           | 5      | `…_tabu_modes.sql`, `tabu`                                                                   | İş birliği ekranları                                                                                         | Deploy → **OTA**                                             |
| 5. Mekan sohbet odası     | 6      | `…_venue_chat.sql`, `venue-chat`, `safety`, `friends`, `profile`                             | Mekan sohbeti ekranı, profil kartı, istek                                                                    | Deploy → **OTA**; sonra `…_drop_participation.sql`           |
| 6. Test geri bildirimi    | §18    | `…_venue_kind.sql`; `…_dm_status.sql`, `dm` (`inbox`, `delivered`), `dm_typing` politikası   | Sekmeler, bildirim düğmesi, Mesajlar, Aktiviteler, DM tik ve yazıyor                                         | `db push --include-seed` + deploy → **OTA** (native yok)     |
| 7. Oyunlar (A)            | §19    | `…_tabu_ready.sql`, `tabu` (`begin-turn`)                                                    | Hazır ekranı, onay, rövanş, tam ekran, tanıtım (Aşama 6'dan sonra)                                           | Sunucu + **OTA birlikte** (§19.1; native yok)                |
| Pilot build'i             | —      | —                                                                                            | Tasarım oturumunun simgesi ve ekranları; ses ve dokunsal geri bildirim (`expo-audio`, `expo-haptics`, §19.2) | `version` artışı → **tek** production build, `MIN_APP_BUILD` |

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
- **S14 — Netgsm:** Adım 1 Netgsm'i beklemez. Netgsm hazır olana kadar dev projesi Twilio Verify ile çalışır (§2.3). _Adım 6 düzeltmesi:_ dev projesinde Twilio yok, giriş yalnızca test numaralarıyla; gerçek SMS yalnızca pilot projesinde Netgsm kancasıyla (§18.3a).

**Proje sahibinin ek düzeltmeleri (onayla birlikte):**

1. Profilli mekan sohbeti mesajında masa adı gitmez; bu mesajdan gelen engel engellenenler listesinde görünen adla durur; kural 4'e eklendi; entegrasyon testiyle (§7.2, §7.4, §13).
2. Kampüs sınırına 50 m tolerans (`ST_DWithin`); tolerans `pure/` içinde tek sabit, istemci uyarısı da aynısını kullanır; test 40 m kabul, 60 m ret (§4.2, §13).
3. Tasarım oturumu paralel çalışıyor: tema tokenlarına ve mevcut bileşenlerin görünümüne dokunulmaz; yeni ortak bileşenler PR özetinde listelenir (§14).
4. `docs/FIELD_TEST.md` adım 1'in PR'ında v3 akışlarına ve Kabuk adına göre güncellenir; bildirim başlığı "Kabuk" (§13).

---

## 18. Adım 6: Test kullanıcısı geri bildirimi

Proje sahibi kararı (pilot öncesi test kullanıcılarının geri bildirimi). Görsel işler (ikonlar, harita işaretçileri, rozetler, profil düzeni, DM fotoğrafı, DM'de sekme çubuğunun gizlenmesi) tasarım oturumunun "Aşama 5" PR'ında gelir. Bu adımın ekranları tasarım tuvalindeki "Aşama 5 · Geri bildirim" sayfasına göre kurulur. **Yeni native modül yok:** telefondaki build 0.3.0, her şey OTA ile gider. Üç PR, sırayla:

### 18.1 PR 1: Mekan türü

- `venues.kind text not null`, `check (kind in ('cafe', 'campus'))`. Tasarımın harita işaretçileri buna bağlıdır; bu yüzden ilk PR budur.
- İçerikte zorunlu alan, dosya başına tek değer: `venues-pilot.json` ve `venues-test.json` → `cafe`, `venues-campus.json` → `campus`. Değer `_shared/pure/venueKind.ts`'te tanımlıdır. Seed doğrulaması eksik ya da yanlış türü reddeder; `pnpm fetch:venues` `cafe` yazar.
- Migration sütunu `'cafe'` varsayılanıyla ekler ve `source = 'campus'` satırlarını `'campus'` yapar. Seed her mekanın türünü açıkça yazar. Barındırılan projede `db push --include-seed` önce migration'ı, sonra yeni adlı seed dosyasını çalıştırır (#46); iki adım da kampüsü `campus` bırakır.
- `explore_venues` `kind` döndürür; Keşfet onu `ExploreVenue.kind` olarak taşır.

### 18.2 PR 2: Sunucu (mesaj listesi, tikler, yazıyor kanalı)

**Mesaj listesi.** Mesajlar sekmesi için okuma RPC'si `dm_inbox(viewer)`. Security definer'dır, yalnızca okur, `set search_path = ''` ile tanımlıdır ve yalnızca service role çağırır. İstemci onu `dm` fonksiyonunun `inbox` eylemiyle alır; fotoğraf URL'si bugünkü `friends/list` gibi fonksiyonda imzalanır. Her arkadaşlık için bir satır döner:

- thread id, `publicId`, görünen ad, fotoğraf;
- son mesajın ilk 80 karakteri (sunucuda kesilir);
- son mesaj benim mi, son mesaj zamanı;
- okunmamış sayısı;
- son mesaj benimse durumu.

Sıralama son mesaj zamanına göredir; mesajı olmayan arkadaşlık, arkadaşlığın başladığı zamanla sıralanır.

**Tikler.** Kendi her mesajım için durum `sent`, `delivered` ya da `read`. Karşı tarafın zaman damgası istemciye gitmez, yalnızca durum gider.

- `read`: `dm_reads.last_read_at` (sohbet açılınca `dm/read`).
- `delivered`: `dm_reads.last_delivered_at`. `dm/delivered` eylemi gövdesizdir; çağıranın bütün konuşmalarında teslim zamanını şimdiye çeker. İstemci bunu uygulama öne geldiğinde ve `inbox:{user_id}` kanalına yayın geldiğinde çağırır (debounce). Uygulama kapalıyken teslim olmaz: karşı taraf uygulamayı açana kadar tek tik görünür. Okundu bilgisini kapatma ayarı pilotta yok.
- Durum gerçekten ilerlediğinde sunucu `dm:{thread_id}` kanalına verisiz bir `dm_status` yayını yapar; gönderen sayfayı yeniden okur.
- `dm_messages_page` ve `dm_inbox` durumu döndürür.
- _Uygulamada netleşen:_ `dm/delivered` teslim işaretini `now()`'a değil, çağıranın gördüğü en yeni gelen mesajın zamanına çeker. Böylece çağrıyla aynı anda yazılan bir mesaj teslim edilmiş sayılmaz. Yeni `dm_reads` satırı `last_read_at = -infinity` ile açılır: teslim okuma değildir. `dm/read` okunan bir mesaj yoksa yayın yapmaz. `dm/inbox` ve `dm/delivered` iki kez gönderilince aynı yanıtı verir (`IDEMPOTENT_CALLS`).
- v2'deki "okundu bilgisi karşı tarafa gitmez" kuralının yerini bu alır (`docs/SPEC_V2.md` §7): karşı tarafa okunma zamanı değil, yalnızca durum gider.

**Yazıyor kanalı.** Yeni kanal türü `dm_typing:{thread_id}`.

- Konuşmanın iki üyesi abone olur ve yayın yapar; başka kimse yapamaz. Arkadaşlıktan çıkarılan ya da engellenen de yapamaz.
- `private.realtime_topic_allowed`'a eklenir.
- Olay adı `typing`, yük boştur; alıcı yükü hiç okumaz. Hiçbir şey saklanmaz.
- `dm:` ve `inbox:` kanallarında hâlâ yalnızca sunucu yayın yapar (kural 9).

### 18.3 PR 3: İstemci

Tasarımın "Aşama 5" PR'ı main'e girmeden başlamaz: `TabBar.tsx`, `profile/index.tsx` ve `friends/[threadId].tsx` o PR'da değişir.

1. **Sekmeler** soldan sağa: Keşfet, Aktiviteler, Mekan (ortada salyangoz), Mesajlar, Profil. İkonlar tasarımın Aşama 5 bileşenlerindendir. Mesajlar sekmesinde toplam okunmamış sayısı görünür.
2. **Bildirim düğmesi:**
   - Sekmelerin kök ekranlarında sağ üstte sabittir; haritada harita üstünde yüzer.
   - Rozeti bekleyen gelen isteklerdir (arkadaşlık ve mekan sohbeti; bugünkü `requestCount`).
   - DM, oda, mekan sohbeti ve check-in akışında görünmez.
   - Açtığı Bildirimler ekranı bugünkü "Geçmiş ve istekler" ekranıdır (`friends/requests.tsx`): içerik ve eylemler aynıdır, yeni bildirim tablosu yoktur.
3. **Mesajlar:** `dm/inbox` ile tuvaldeki liste. Mesajı olmayan arkadaş "Henüz mesaj yok" ile görünür. Satır DM'i açar. DM'de sekme çubuğu ve bildirim düğmesi görünmez.
4. **Arkadaşlar:** Profil'deki "Arkadaşlar" düğmesi, profil sekmesi içinde arkadaş listesini açar; satır kişinin profiline ya da DM'e gider. Arkadaşlıktan çıkarma ve engelleme bugünkü yerlerinde kalır.
5. **Aktiviteler** (oyun merkezi):
   - Sesli Tabu ve Sohbet kartları için birer kart: kısa açıklama ve nasıl oynanır. Metinler `tr.ts`'tedir ve oyun kurallarıyla tutarlıdır.
   - Mekandaysan iki düğme görünür: "Masanla oyna" (bugünkü yerel oyun) ve "Bu oyunla oda kur" (oda kurma ekranı bu niyet seçili açılır).
   - Mekanda değilsen "Oynamak için mekana gir" görünür ve check-in'e gider.
   - Altta "Son oyunların": kendi `game_results` kayıtların (RLS ya da salt okunur RPC ile). Kayıt yoksa bu bölüm görünmez.
   - Mekan sekmesi işlev olarak değişmez. Yeni oyun ya da yeni içerik yok.
6. **DM:**
   - Tikler PR 2'deki durumla gösterilir; gönderilirken tuvaldeki bekleme hâli görünür.
   - Yazıyor bilgisi: composer'daki metin değiştikçe en fazla 3 saniyede bir `typing` gönderilir.
   - Karşı tarafta üç nokta görünür; son olaydan 5 saniye sonra ya da mesaj gelince kaybolur.
7. **Rotalar:** `friends` yolları yeni yapıya taşınır. Push bildirimlerinin açtığı yollar (DM, arkadaşlık isteği, mekan sohbeti isteği) yeni yerlere gider; eski yolla gelen bildirim uygulamayı çökertmez.
8. **Analitik:** yeni ekranlar olay gerektiriyorsa `analytics.ts` kataloğuna yalnızca izinli özelliklerle eklenir.
9. **E2E:**
   - Sekme `testID`'leri ve `05-reveal-friend-dm` dahil etkilenen akışlar güncellenir.
   - Yeni akış: DM'de karşı taraf (bot) yazar; yazıyor görünür, mesaj gelir, kendi mesajımın tiki okunduya döner.

### 18.3a Uygulamada netleşenler (PR 3 notu)

- **Bildirim düğmesi** her sekmenin kök ekranında, Profil dahil (tuvalin Profil çiziminde yok; proje sahibinin kuralı "sekmelerin kök ekranları"). Keşfet'te başlık haritanın üstünde durduğu için düğme iki görünümde de sağ üstte.
- **Son oyunların:** kayıt yoksa bölüm hiç görünmez (tuvalin "mekanda değil" çiziminde boş metin var; proje sahibinin kuralı geçerli). Satırda karşı masanın adı kendi oyun geçmişinden, puan kendi puanın; kazanılan oyun vurgulu. Karşı masanın puanı okunabilir değil (`game_results` yalnızca kendi satırı), gösterilmez.
- **"Bu oyunla oda kur":** Sesli Tabu kartı "Oyun", Sohbet kartları kartı "Sohbet" niyetiyle açar.
- **Arkadaşlar listesi:** satır kişinin profilini, satırdaki mesaj düğmesi DM'i açar.
- **DM gönderme** oda sohbeti gibi iyimser: mesaj hemen bekleme hâliyle görünür, sunucunun kopyası gelince yerini alır; başarısızsa "Tekrar dene" ve "Sil".
- **Push:** `PushMessage.target` (`messages` ya da `notifications`) push verisine yalnızca hedef olarak girer; kimlik, gönderen, içerik yok. Uygulama dokunulan push'u `pure/navigation.ts` → `pushRoute` ile açar; adım 6'dan önceki push'lar (veri yok) ve eski `/friends…` yolları hiçbir şeyi bozmaz. Hedefin gitmesi `dm` ve `friends` fonksiyonlarının yeniden deploy'unu ister.
- **Rotalar:** `/friends` kalktı. Mesajlar `/messages` (DM `/messages/[threadId]`), arkadaş listesi `/profile/friends`, Bildirimler `/notifications` (sekmelerin dışında, sekme çubuğu yok).
- **Analitik:** yeni olay yok; Aktiviteler'den başlayan oda ve oyunlar mevcut olaylarla (`room_created`, oyun olayları) sayılır.
- **Dev projesinde SMS yok** (proje sahibi düzeltmesi): giriş yalnızca panele girilen test numaralarıyla; Twilio kutularında sahte değerler. Gerçek SMS yalnızca pilot projesinde Netgsm kancasıyla (§2.3). S14'teki "dev projesi Twilio Verify ile çalışır" bununla değişir.

### 18.4 Kabul

- **PR 1:** Seed sonrası kampüs `campus`, diğer mekanlar `cafe`. Eksik ya da yanlış tür `pnpm seed`'i durdurur. `explore_venues` türü döndürür.
- **PR 2:** Entegrasyon testleri:
  - `sent` → `delivered` → `read` geçişleri; yanıtta karşı tarafın zamanı yok.
  - `dm_inbox` sıralaması, 80 karakter ve okunmamış sayısı.
  - `dm_typing`: üye abone olur ve yayın yapar; üye olmayan, arkadaşlıktan çıkarılan ve engellenen yapamaz.
- **PR 3:** E2E açık ve koyu yeşil; yeni DM akışı dahil.
- Her PR'da typecheck, lint, birim ve entegrasyon testleri temizdir. CI, entegrasyon ve iki E2E yeşilse PR birleştirilir. Deploy proje sahibindedir.

---

## 19. Adım 7: Oyunlar

Proje sahibi kararı. İki iş:

- **A:** Mevcut oyunların kullanılabilirliği. Hemen yapılır.
- **B:** Dört yeni oyunun spec'i. Ayrı PR'dır ve yalnızca belgedir; onay gelmeden yeni oyun kodu yazılmaz.

Görsel bileşenler tasarım oturumunun başlığında "Aşama 6" geçen PR'ında gelir; ekranlar tuvaldeki "Aşama 6 · Oyunlar" sayfasına göre kurulur. Önceki adımdaki gibi:

- Sunucu işi hemen yapılır.
- `VoiceTabu.tsx`, `LocalTabu.tsx`, `GameArea.tsx`, `SohbetCard.tsx` ve `room/[id].tsx` dosyalarına Aşama 6 PR'ı main'e girmeden dokunulmaz.

**Yeni native modül yok:** her şey OTA ile gider.

### 19.1 PR A1: Sunucu

**Tur hazır durumu (Sesli Tabu, iki mod da).** Bugün `tabu_end_turn` sonraki turu hemen açıyor ve 60 sn hemen başlıyor; öneri kabul edilince ilk tur da öyle. Yeni akış:

- Tur hazır durumunda açılır. `game_state` şunları taşır:
  - `turnPhase: 'ready'`;
  - `readyEndsAt`: şimdi + 15 sn (`TABU.readySeconds` = `private.tabu_ready_seconds()`);
  - ikinci turdan itibaren `lastTurn`: bir önceki turun numarası, anlatan masası, o turdaki puanı ve Doğru, Tabu, Pas sayıları (`pure/tabu.ts` → `summarizeTurn`).
- Hazır turda `turnEndsAt` yoktur.
- Yeni `tabu/begin-turn` eylemi süreyi başlatır:
  - Anlatan masa her an çağırabilir.
  - `readyEndsAt` geçtiyse herhangi bir masa çağırabilir; süreyi sunucu denetler (`end-turn` gibi).
  - Başka her durumda oda olduğu gibi kalır, hata yoktur: tur zaten başlamışsa, diğer masa `readyEndsAt`'ten önce çağırırsa ya da oyun yoksa.
- Başlayınca `turnPhase: 'running'` ve `turnEndsAt` yazılır, `readyEndsAt` silinir.
- `begin-turn` idempotenttir ve `IDEMPOTENT_CALLS`'ta yer alır. İki kez gönderilince aynı yanıtı ve aynı saati verir; iki telefon aynı anda basınca tur bir kez başlar (`games.test`, `rooms.test` → `locks`).
- Hazır turda hiçbir kart sunucudan çıkmaz: `tabu/turn-cards` ve `tabu/mark` yeni hata kodu `turn_not_started` (409) döner. `end-turn` hazır turu bitirmez.

**Kart israfı.** Bugün tura dağıtılan 40 kartın hepsi `room_used_cards`'a giriyor, oysa turda 10-15 kart oynanıyor; bir oyun 547 kartın 240'ını harcıyordu. Yeni kural:

- Tur listesi odada kullanılmamış kartlardan çekilir ve dağıtım hiçbir kartı kullanılmış saymaz.
- Kart gösterildiğinde kullanılmış sayılır: ilk kart tur başlayınca, sonraki her biri bir işaretle.
- Tur bitince listenin gösterilmeyen kartları serbest kalır.
- Kullanılmamış kart listeye yetmezse önce kalanlar alınır, sonra odanın Tabu kartları baştan başlar. Listede tekrar olmaz.
- Tek masalı oyunun destesi `room_used_cards` kullanmadığı için değişmez.

**`game_abandoned`.** Olay iki durumda gönderilir: iki masalı Sesli Tabu "Oyunu bitir" ile yarıda kalırsa ya da oyun sürerken masa ayrılırsa. Özellikler `concept`, `turn_no`, `total_turns`; katalog `analytics.ts`'tedir. Özellik adları katalogdaki diğerleri gibi snake_case'tir.

- **"Oyunu bitir":** `lastGame` artık `abandoned: true`, `turnNo` ve `totalTurns` taşır (`parseBetweenGames` → `abandoned`); iki telefon da olayı buradan gönderir.
- **Masa ayrılınca:** oda `ending`'e geçerken `game_state` oyunun hâlini taşır; telefonlar bundan gönderir.
- Olayı gönderen kod A2'dedir, çünkü olay `GameArea.tsx`'ten gider.
- Sohbet kartlarının bitişi yoktur; olay göndermez.
- Tek masalı Tabu telefonda oynar; olayı A2'de kendi turundan gönderir.

**Yayın ve uyumluluk.** Hazır durum, telefondaki 0.3.0'ın bugünkü JS'iyle oynanamaz: o istemcide Başla düğmesi yoktur ve `turnEndsAt` olmayan durumu çizmez. Bu yüzden:

- A1'in sunucu yayını (`db push` + `tabu` deploy'u) A2'nin OTA'sıyla birlikte yapılır: önce sunucu, hemen ardından OTA.
- A1 main'e girerken E2E yeşildir: hazır turu E2E botu başlatır (`begin-turn`, cihazın turunda `force` ile `readyEndsAt` geçmiş sayılır). A2'de bunu cihazdaki Başla düğmesi yapar.

### 19.2 PR A2: İstemci (tasarımın Aşama 6 PR'ı main'e girdikten sonra)

Tasarımın bileşenleriyle:

1. **Hazır ekranı:** tur özeti. Anlatan masada "Başla", diğer masada "X hazırlanıyor" ve geri sayım. Geri sayım biterse telefon `begin-turn` çağırır.
2. **"Oyunu bitir" onay penceresi:** iki masanın da oyununun biteceğini söyler.
3. **Rövanş:** oyun bitince aynı oyunla öneri (mevcut öneri akışı).
4. **Tam ekran oyun:** tur sürerken sohbet küçük bir düğmeye iner (tasarımın düzeni).
5. **Son 10 sn, süre bitti kaplaması ve skor hareketi** (tasarımın bileşenleri).
6. **İlk oyunda kısa tanıtım:** cihazdaki ilk oyunda gösterilir, gösterildiği cihazda hatırlanır.
7. **Ekran açık tutma:** `expo-keep-awake`'in native modülü 0.3.0 build'inde (expo'nun bağımlılığı olarak) varsa doğrudan bağımlılık olarak eklenir; gerekçe, oyun sırasında ekranın kararmaması. Oyun ve Sohbet kartları ekranında kullanılır; native modül yoksa sessizce hiçbir şey yapmaz. Build'de yoksa pilot build'e kalır.
8. **Titreşim:** React Native'in `Vibration` API'siyle son 5 sn'de ve süre bitince kısa titreşim. `VIBRATE` izni 0.3.0'ın manifestinde yoksa pilot build'e kalır.
9. **Ses ve dokunsal geri bildirim** (`expo-audio`, `expo-haptics`) yeni native modüldür; şimdi eklenmez. **Pilot build maddesi.**
10. **E2E:** Tabu akışları hazır durumuna göre güncellenir. Cihazın turunda cihaz Başla'ya basar (botun `force`'u kalkar); bot anlatan masayken kendi turunu başlatır.
11. **`game_abandoned`** gönderimi (§19.1).

### 19.2a Uygulamada netleşenler (A2)

- **Tasarımın Aşama 6 PR'ı** (#57) tam ekran oyunu (`GameStage`: sohbet düğmesi ve paneli), "Oyunu bitir" onayını, son 10 sn saatini ve skor hareketini zaten getirdi. A2 bunların üstüne hazır ekranını, süre bitti kaplamasını, titreşimi, rövanşı, ilk oyun tanıtımını, ekranı açık tutmayı ve `game_abandoned`'ı bağlar.
- **Hazır ekranı:** `TurnReady` her iki modda da. Geri sayım biterse iki telefon da `begin-turn` çağırır (sunucu süreyi denetler, ikinci çağrı bir şey değiştirmez). Özetteki puan, anlatan masanın (iş birliğinde takımın) o turdaki puanıdır.
- **Süre bitti:** tur saati telefonda sıfıra inince `TimeUpOverlay` 1,5 sn görünür. Altında "X bu turda +n": n, anlatan tarafın bu telefonun turu ilk gördüğü andan beri kazandığı puandır. Tek masalı Tabu'da da aynı.
- **Titreşim:** son 5 sn'nin her saniyesinde kısa (40 ms), sıfırda uzun (400 ms). React Native `Vibration`; `VIBRATE` 0.3.0 manifest'inde var (Expo'nun varsayılan izni). Kurallar `pure/tabu.ts` → `turnCue`.
- **Ekranı açık tutma:** `expo-keep-awake` 57.0.2 doğrudan bağımlılık oldu. Bu, 0.3.0 build'ine Expo'nun bağımlılığı olarak giren sürümün aynısı; native kod değişmez, OTA ile gider. Oyun sürdüğü sürece (Sohbet kartları dahil) açık; native modül yoksa hiçbir şey yapmaz.
- **İlk oyun tanıtımı:** tasarımın tanıtımı iki masalı Sesli Tabu'yu anlatır. Bu yüzden cihazdaki ilk iki masalı Sesli Tabu oyununda görünür, cihazın kendi deposunda hatırlanır. Tek masalı Tabu'da görünmez.
- **Rövanş:** yalnızca bitmiş (yarıda kalmamış) iki masalı Sesli Tabu'nun sonucunun altında. Aynı oyunu önerir (`rooms/propose-game`); diğer masa kabul edince başlar.
- **`game_abandoned`:**
  - "Oyunu bitir" ile yarıda kalan iki masalı oyun `lastGame`'den sayılır, iki telefon da kendi kullanıcısı için bir kez gönderir.
  - Masa ayrılınca oda `ending`'e geçer; oyun hâlâ sürüyorsa telefon olayı `game_state`'ten gönderir.
  - Tek masalı Tabu, "Oyunu bitir" anındaki kendi turundan gönderir (6 turdan kaçıncısı).
  - Aynı oyun iki kez sayılmaz (`trackOnce`, oda ve oyun numarasıyla).
- **E2E:** 04'te tanıtım bir kez çıkar ve kapatılır. Cihaz kendi turunu "Başla" (`turn-start`) ile başlatır. Botun turunda cihaz geri sayımı (`turn-countdown`) görür, bot kendi turunu başlatır. Botun `force` seçeneği kaldı ama akışlar artık onu kullanmıyor.

### 19.3 Kabul (A)

- **A1:** Entegrasyon testleri şunları gösterir:
  - Her tur hazır açılır.
  - `begin-turn` kurallara uyar ve idempotenttir (iki mod).
  - `lastTurn`, `summarizeTurn` ile aynıdır.
  - Yalnızca gösterilen kartlar kullanılmış sayılır ve deste azalınca baştan başlar.
  - "Oyunu bitir" nerede kalındığını tutar.
  - Kilit testi geçer.
- **A1:** E2E açık ve koyu yeşil (bot hazır turu başlatır).
- **A2:** E2E açık ve koyu yeşil, cihaz Başla'ya basar.

---

## 20. Adım 7 B: Yeni oyunlar

**Onaylandı.** Proje sahibinin kararları; §20.8'deki cevaplar ve üç değişiklik (oyuncu sayısı, itiraz hakkı, hazır durumu) metne işlendi.

- Sıra: Sahtekar, Harf Kapmaca, Şarkıda Geçsin, İbre. Her oyun kendi adımı, PR'ı ve E2E akışıyla gelir.
- Bir oyunun içerik taslağı (`content/*.json`) o oyunun PR'ında gelir. PR açıklamasında her kategoriden ilk 10 kelime örneklenir; proje sahibi örnekler ve onaylar. Onaylanmamış içerik birleşmez.
- Sunucu, içerik ve tek masalı reducer hemen yapılır. Ekranlar tasarımın ilgili bileşen PR'ı main'e girince yapılır (Sahtekar için başlığında "Aşama 7 Sahtekar" geçen PR).

### 20.1 Ortak kurallar

**Başlatma (kural 3).**

- İki masalı odada oyun yalnızca öneriyle başlar: bir masa önerir, diğeri kabul eder (§5.3). Odada aynı anda tek oyun ve tek öneri olur. Tek masalı odada oyun doğrudan başlar.
- `game_proposals.concept`, `rooms.concept`, `play_history.concept` ve `game_results.concept` kısıtları her oyunun kendi migration'ında genişler. Kavram adları: `sahtekar`, `harf`, `sarki`, `ibre`.
- Aktiviteler'e ve oda içindeki öneri alanına her oyun bir kartla eklenir.

**Oyuncu sayısı ayrı bir aşama değildir.**

- Harf Kapmaca, Şarkıda Geçsin ve İbre'de her masa bir takımdır; kişi sayısı kullanılmaz. Bu oyunlarda oyuncu sayısı aşaması ya da eylemi yoktur.
- Sahtekar'da sayı öneri ve kabulle gelir:
  - Öneren masa önerirken (`rooms/propose-game { concept: 'sahtekar', players }`), kabul eden masa kabul ederken (`rooms/answer-game { accept: true, players }`) kendi sayısını verir (1-4).
  - İki alan da arayüzde masanın check-in sayısıyla dolu gelir; masa değiştirebilir.
  - Önerenin sayısı `game_proposals.proposer_players`'ta durur. Kabul edilince iki sayı `game_state.players`'a yazılır (ör. `{ owner: 3, guest: 2 }`).
  - Sayı yalnızca o oyun içindir; `table_sessions.headcount` değişmez.
  - Toplam 3'ten azsa kabul `not_enough_players` (409) döner, öneri silinir ve oyun başlamaz.
- **Rövanş** (A2'deki "Rövanş", aynı oyunla öneri) son oyunun sayılarını kullanır: arayüz iki alanı `lastGame.players`'tan doldurur.

**Hazır durumu** (§19.1'in kalıbı, süreli her yeni oyunda).

- Süre başlamadan önce `game_state` `turnPhase: 'ready'` ve `readyEndsAt` (şimdi + 10 sn) taşır. Önceki bölümün özeti varsa o da durur.
- Süre, başlayan masa "Başla"ya basınca (`<oyun>/begin`) ya da 10 sn sonra kendiliğinden başlar.
- "Kendiliğinden" şöyle çalışır: zamanlanmış iş yoktur. `readyEndsAt` geçince telefonlar `<oyun>/advance` çağırır. Sunucu süreyi çağrı anından değil `readyEndsAt`'ten başlatır; geç gelen çağrı süreyi uzatmaz.
- `begin` başka masadan gelirse, tur zaten başlamışsa ya da oyun yoksa oda değişmez (`{ ok: true }`). İdempotenttir.
- Hazır durumunda istem (kategori, kelime, ölçek) `game_state`'te görünür; yalnızca süre işlemez. Gizli bilgi (İbre'nin hedefi) hazır durumunda verilmez.
- Nerede:
  - **Harf Kapmaca:** her kategorinin başında; başlayan masa o kategoriyi açan masadır.
  - **Şarkıda Geçsin:** oyunun başında; başlayan masa ilk kelimeyi söyleyecek masadır. Sonraki kelimeler hazır durumu olmadan açılır.
  - **İbre:** her turun başında; başlayan masa anlatan masadır.
  - **Sahtekar:** hazır durumu yoktur. Kelimeyi görme aşaması oyunun doğal başlangıcıdır ve kendi süresi vardır.

**Her oyunun tek masalı sürümü** telefonda oynanır (LocalTabu gibi):

- Deste sunucudan gelir: `<oyun>/start`, tek masalı odada. Yanıt yalnızca o oyunda gerekenleri taşır.
- Kurallar `pure/` altında testli bir reducer'dadır; telefon sırayı, süreyi ve puanı onunla tutar.
- Tek masalı oyun sunucuya sonuç yazmaz (bugünkü yerel Tabu gibi); yalnızca analitik olayı gider.
- Alt sınır: Sahtekar'da masada en az 3 kişi; Harf Kapmaca, Şarkıda Geçsin ve İbre'de en az 2 kişi (iki takım). Tek masalı sürümde sayıyı oyun başında telefon sorar, check-in sayısıyla dolu gelir.

**Sunucu otoriter (kural 3).**

- Süreyi (`endsAt`), içeriği, sırayı, puanı ve eylem yetkisini sunucu hesaplar.
- Her eylem bir tur ve adım indeksine bağlıdır (`roundNo`, `step`). Aynı adıma ikinci eylem yok sayılır; yanıt `{ ok: true }`, oda değişmez (Tabu'daki `mark` gibi).
- Süre dolunca herhangi bir masa `<oyun>/advance` çağırır; sunucu süreyi denetler ve idempotenttir (`tabu/end-turn` gibi). `begin` ve `advance` `IDEMPOTENT_CALLS`'a iki kez gönderen testle girer.
- Hakemlik "itiraz" ile karşı masadadır (Sesli Tabu'daki Tabu düğmesi gibi): oyun sözü dinlemez, masalar karar verir.

**Gizli bilgi.**

- Gizli bilgi (sahtekarın kim olduğu, kelime, oylar, hedef değer) `rooms.game_state`'te, `game_events`'te ve hiçbir Realtime yükünde bulunmaz.
- Yeni sunucu tablosu `game_secrets`:
  - Bir satır, bir odanın bir oyunudur: `room_id`, `game_no`, `concept`, `secret jsonb`.
  - RLS açık, politika yok, yalnızca service role okur (`tabu_turns` gibi).
- Gizli bilgi yalnızca ilgili telefona ilgili anda bir eylemin yanıtıyla gider (Tabu'nun `turn-cards`'ı gibi). Açılışta `game_state`'e yazılır ve iki masaya birden gider.

**Ses ve metin.**

- Serbest metin yok: her şey sesli söylenir. Telefon sırayı, süreyi, puanı ve hakemliği tutar.
- Uygulama ses çalmaz ve dinlemez; mikrofon izni yok.

**Sonuç ve rozetler.**

- Dört oyun da iki masalı oyunun sonunda `game_results`'a iki hesap için birer satır yazar. Satırlar oyun sayısı rozetlerine (`first_game`, `ten_games`) girer, Sahtekar dahil.
- Kazanma rozeti yalnızca Sesli Tabu'da kalır; yeni kazanma rozeti yok.
- `game_results.mode` oyunun adıdır (`sahtekar`, `harf`, `sarki`, `ibre`).

**İçerik.**

- İçerik `content/` altında JSON'dur ve `pnpm seed` ile tek seed dosyasına girer (#46). Seed doğrular: zorunlu alanlar, en az miktar, tekrar yok ve küfür listesi (`pure/profanity.ts`).
- İçerikte gerçek kişi adı, siyaset, din, cinsellik ve alkol yoktur. Konular kampüs ve Türk gündelik kültürüdür.
- `cards.deck` kısıtı oyun başına genişler (`sahtekar`, `harf`, `sarki`, `ibre`). Her destenin satır kısıtı kendi alanlarını zorunlu tutar (Tabu ve Sohbet'teki gibi).
- Kullanılan içerik odada tekrar etmez (`room_used_cards`). Adım 7 A1'deki kural geçerlidir: içerik gösterilince kullanılmış sayılır.

**Ticari adlar** (Wavelength, Tapple, Imposter, Heads Up) ve onların kart metinleri ya da görselleri hiçbir yerde kullanılmaz: kodda, içerikte, mağaza metninde, ekranda. Mekanik uyarlanır, içerik özgündür.

**Değişmez kurallarla uyum (her oyunda aynı).**

- **Kural 3:** yukarıda.
- **Kural 4:** oyunlar diğer masaya yeni bir kimlik göndermez.
  - Koltuklar (`A1`, `B2`) yalnızca oyun içi etikettir; hesaba ya da profile bağlanmaz.
  - Odanın anonimlik seçimi (oda başına) aynen geçerlidir.
- **Kural 9:** yeni kanal yok. İki masa oyunu odanın mevcut kanalından (`rooms` ve `game_events` Postgres Changes) izler; yükte gizli bilgi yoktur.
- **Kural 10:** `game_secrets` odanın satırları arasında `tabu_turns`'ten sonra yer alır. Sıra `rooms` → `game_proposals` → `game_secrets` → `room_used_cards`, `game_events`.
  - Odayı kilitleyen her yeni eylem `rooms.test` → `locks` kalıbında bir testle gelir: diğer masanın oturumu tutulurken eylem geçer; iki telefon aynı anda basınca tek sonuç.
  - Zamanlanmış iş yok; süreyi `advance` ilerletir.

**Analitik.**

- Mevcut olaylar yeni kavramlarla kullanılır: `game_proposed`, `game_accepted` (`concept`), `game_completed` (`concept`, `score`, `mode`), `game_abandoned` (`concept`, `turn_no`, `total_turns`).
- Oyuna özel yeni özellikler §20.2-20.5'te. İçerik (kelime, kategori, şarkı sözü) ve karşı taraf hiçbir olaya girmez.

**E2E.** Her oyun kendi akışıyla gelir (`e2e/maestro/flows/09-sahtekar.yaml` ve sırası).

- Bot karşı masa olur: botun `serve` eylemleri her oyuna eklenir ve dev projesinde rakip modunda oynar.
- Gizli bilginin cihaza gitmediği akışta değil, entegrasyon testinde denetlenir: yanıtlar, `rooms` satırı, `game_events` ve Realtime yükü taranır (bugünkü `readableBy` ve `watchRoomChannel` kalıbı).

### 20.2 Sahtekar

**Kurallar.**

- İki masanın bütün oyuncuları aynı gizli kelimeyi görür, biri hariç: sahtekar yalnızca kategoriyi görür. En az 3 oyuncu gerekir.
- İki ipucu turu oynanır: herkes sırayla sesli tek kelime söyler.
- Sonra herkes gizlice bir koltuğa oy verir; kendine oy veremez.
  - En çok oyu alan tek koltuk sahtekarsa sahtekar yakalanmıştır. Sahtekar aynı kategoriden 6 seçenek arasından kelimeyi tahmin eder; bilirse yine sahtekar kazanır.
  - Eşitlikte ya da en çok oyu başka bir koltuk alırsa sahtekar kaçar.
- Puan yok. Sonuç "Sahtekar kazandı" ya da "Masalar kazandı".

**İki masalı akış.**

1. **Oyuncular:** sayılar öneri ve kabulle gelir (§20.1). Koltuklar `A1…An` (sahip masa) ve `B1…Bm` (misafir masa).
2. **Kelimeyi görme** (en fazla 2 dk):
   - Sunucu sahtekarı bütün koltuklar arasından rastgele seçer.
   - Her masa telefonu elden ele geçirir. Arayüz koltukları sırayla verir: "A1 gördü, telefonu A2'ye ver".
   - Her koltuk kendi kartını basılı tutarak görür. Telefon bir koltuğun kartını yalnızca o koltuk istediğinde alır: `sahtekar/view { seat }`. Yanıt `{ category, word }` ya da sahtekara `{ category, imposter: true }`; parmak kalkınca telefon kartı bırakır.
   - Bir masa yalnızca kendi koltuklarını isteyebilir. Bir koltuk ipucu turu başlayana kadar kartını yeniden görebilir.
   - `game_state.viewed` hangi koltukların gördüğünü sayar (yalnızca evet/hayır).
   - Bütün koltuklar görünce ipucu turu açılır. 2 dk dolunca kartına bakmayan koltuklar oyundan çıkar ve masalarının sayısı düşer (`players`, `seats`):
     - Sahtekar kalanlardaysa ipucu turu kalan koltuklarla açılır.
     - Çıkanlardan biri sahtekarsa kalan koltuklara yeni sahtekar ve yeni kelimeyle yeniden dağıtılır (`dealNo` artar, `viewed` boşalır, 2 dk yeniden başlar); herkes yeniden bakar. Yeni turda da bakmayan çıkar, aynı kural işler.
     - Kalan koltuk 3'ten azsa oyun sonuçsuz biter: oda sohbete döner, `lastGame.endedBy = 'not_enough_players'`, `game_results` yazılmaz.
3. **İpucu:** iki tur; sıra masalar arasında dönüşümlüdür: A1, B1, A2, B2… Koltuk sayıları eşit değilse fazla koltuklar sırayla sona eklenir (A1, B1, A2, B2, A3).
   - Her konuşmacının 15 sn'si vardır. `game_state` sırayı, konuşan koltuğu ve `endsAt`'i taşır.
   - Konuşanın masası "Söyledi"ye basar (`sahtekar/said { step }`). Süre dolunca herhangi bir masa `advance` ile geçirir.
4. **Oylama** (en fazla 90 sn; telefon 4 kişi arasında dolaşır):
   - Arayüz koltukları yine sırayla verir. Her koltuk gizlice bir koltuğa oy verir: `sahtekar/vote { voter, target }`. Kendine oy `bad_request`.
   - Oylar `game_secrets`'tadır. `game_state` yalnızca kaç oy verildiğini taşır.
   - Bütün oylar gelince ya da 90 sn dolunca sayılır. Oy vermeyen koltuk atlanır.
5. **Tahmin** (yakalandıysa):
   - Sahtekarın masasına aynı kategoriden 6 seçenek gider (`sahtekar/options`, yalnızca o masaya).
   - Tahmin `sahtekar/guess { option }` ile; süre 30 sn, dolarsa yanlış sayılır.
6. **Açılış:** `game_state` artık sahtekarın koltuğunu, kelimeyi, kategoriyi, bütün oyları (kim kime) ve sonucu taşır. İki telefonda büyük açılış ekranı görünür.

**Tek masalı sürüm:** masada en az 3 kişi; aynı akış tek telefonda yürür (elden ele görme, sıra, oylama, tahmin).

- `sahtekar/start` yanıtı bir tur için kategoriyi, kelimeyi ve 5 çeldiriciyi taşır.
- Sahtekarı telefon seçer. Kelime telefondadır; oyuncular telefonu elden ele geçirir, kimse başkasının kartına bakmaz.
- Görmeyen koltuk kuralı aynıdır. Sahtekar çıktıysa reducer `phase: 'redeal'`e geçer; ekran `sahtekar/start`'tan yeni deste ister ve `redealLocal` ile kalan koltuklara yeni sahtekar seçer. 3'ten az kalırsa `phase: 'done'`, `endedBy: 'not_enough_players'`.
- Kurallar `pure/sahtekar.ts` reducer'ındadır.

**Sunucu durumu ve eylemler.**

| Eylem                                                  | Kim                                     | Ne zaman                                                |
| ------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------- |
| `rooms/propose-game` / `rooms/answer-game` + `players` | Öneren ve kabul eden masa, kendi sayısı | Öneri ve kabul                                          |
| `sahtekar/view { seat }`                               | O koltuğun masası                       | `phase: 'viewing'`; ipucu turuna kadar yeniden          |
| `sahtekar/said { step }`                               | Konuşan koltuğun masası                 | `phase: 'clues'`                                        |
| `sahtekar/vote { voter, target }`                      | Oy verenin masası                       | `phase: 'voting'`, koltuk başına bir kez, kendine değil |
| `sahtekar/options` / `sahtekar/guess { option }`       | Sahtekarın masası                       | `phase: 'guess'`                                        |
| `sahtekar/advance`                                     | Herhangi bir masa                       | Süre dolunca; idempotent                                |

- `game_state`: `phase` (`viewing`, `clues`, `voting`, `guess`), `gameNo`, `dealNo` (yeniden dağıtımda artar), `players` ve `seats` (görmeyenler çıkınca küçülür), `category` (açık bilgi; herkes, sahtekar dahil, kategoriyi görür), `viewed`, `order`, `step`, `voters` (kartını gören koltuklar), `votesCast`, `endsAt`; tahminde `accused`.
- Oyun bitince oda sohbete döner (Sesli Tabu gibi): açılış `lastGame.reveal`'dadır (`imposter`, `word`, `category`, `votes`, `accused`, `guess`, `winner`). Boş alanlar (kimse yakalanmadıysa `accused`, tahmin yoksa `guess`) yazılmaz; istemci yok alanı boş sayar. `lastGame.players` rövanş içindir; "Oyunu bitir" de onu yazar.
- Sahtekar oyun başında bütün koltuklar arasından seçilir. Görmeyen koltuk oyundan çıkar; sahtekar çıktıysa kalanlara yeniden dağıtılır, 3'ten az kalırsa oyun biter (yukarıda, adım 2). Kural `pure/sahtekar.ts` → `afterViewing`'dedir.
- Süreler `pure/sahtekar.ts` → `SAHTEKAR`: görme 120 sn, ipucu 15 sn, oylama 90 sn, tahmin 30 sn, 2 ipucu turu, 6 seçenek.
- `game_results`: iki hesaba `won = null`, `score = null`, `mode = 'sahtekar'`. Oyun sayısı rozetlerine girer.

**İçerik:** `content/sahtekar-words.json` → `{ categories: [{ key, name, words: [...] }] }`.

- En az 500 kelime.
- Her kategoride en az 12 kelime: 6 seçenek ve tekrar etmeyen turlar için.
- Seed kategori ve kelime tekrarını reddeder.

**Kurallarla uyum.**

- **Kural 3:** sahtekarı, sırayı, süreyi ve oyları sunucu tutar.
- **Kural 4:** koltuk etiketi kimlik değildir.
  - Sahtekarın koltuğu ve kelime açılıştan önce `game_state`'te, olaylarda ve Realtime'da yoktur.
  - `view` yanıtı yalnızca istenen koltuğun masasına gider.
  - Açılışta oylar koltuk etiketiyle görünür, hesapla değil.
- **Kural 9:** yeni kanal yok.
- **Kural 10:** `rooms` → `game_proposals` → `game_secrets`.

**Analitik:** `game_completed` + `outcome: 'imposter' | 'tables'`, `players: number` (toplam). Sahtekarın koltuğu ve kelime gitmez.

**E2E (`09-sahtekar.yaml`):** cihaz 2 koltuklu masa (check-in sayısı), bot 1 koltuk (kabulde `players: 1`); toplam 3.

- Bot (yalnızca yerelde) kendi koltuğunu sahtekar yapar; cihaz iki koltuğunun kartını sırayla basılı tutar.
- Bot kendi ipucu sırasında "Söyledi"ye basar ve oy verir; cihaz kendi sıralarında basar.
- Cihazın iki koltuğu bota oy verir; bot yakalanır, yanlış tahmin eder; açılış ekranında "Masalar kazandı!" görünür.
- Entegrasyon testi: sahtekar olmayan masaya sahtekar bilgisi, sahtekara kelime gitmez.

### 20.2a Uygulamada netleşenler (7.1 sunucu)

- **İstemci henüz görmüyor.** `rooms/propose-game` `sahtekar`'ı kabul eder (`pure/rooms.ts` → `PROPOSABLE_CONCEPTS`), ama uygulamanın öneri düğmeleri `CONCEPTS`'ten gelir ve orada yalnızca Sesli Tabu ile Sohbet kartları vardır. Sahtekar, ekranlarıyla birlikte `CONCEPTS`'e girer (tasarımın "Aşama 7 Sahtekar" PR'ından sonra).
- **Sayı alanları:** `rooms/propose-game { players }` ve `rooms/answer-game { players }` (1-4) yalnızca Sahtekar'da okunur. Verilmezse masanın check-in sayısı (en çok 4).
- **3'ten az:** kabul `not_enough_players` (409) döner. Sunucu öneriyi siler (fonksiyon reddi geri aldığı için kabul edenin adına ayrıca reddeder); iki masa da öneriyi kaybolmuş görür.
- **Hata kodları:** `not_your_seat` (403): başka masanın koltuğu, konuşma sırası ya da tahmini. `bad_request` (400): kendine oy, seçeneklerde olmayan tahmin. Görme ya da oylama süresi geçmişse `turn_over` (409).
- **Deste:** `cards` satırı kelime başınadır. `theme` kategori anahtarı, `prompt` kategorinin adıdır. Uygulama desteyi okuyamaz (kart politikası yalnızca Sohbet destesini açar). Seçenekler kelimenin kendi kategorisindendir. Kelime oyun başlarken gösterilmiş sayılır (`room_used_cards`).
- **Tek masalı oyun:** `sahtekar/start` odanın etkinliğini Sahtekar yapar (yerel Tabu gibi). Yanıt `{ category, word, options }`'tur. Oyunu telefon `pure/sahtekar.ts` → `reduceLocal` ile yürütür.
- **İdempotentlik:** `sahtekar/advance` `IDEMPOTENT_CALLS`'tadır. Tekrar görme aynı yanıtı verir; ikinci oy ve eski adıma "Söyledi" yok sayılır.
- **Analitik:** `game_completed`'e `outcome` (`imposter` | `tables`) ve `players` (toplam) eklendi; `score` yalnızca Tabu'da. İki masalı oyunu sahip masanın telefonu `lastGame.reveal`'dan bir kez, tek masalı oyunu telefon oyun bitince gönderir.

### 20.2b Uygulamada netleşenler (7.1 ekranlar)

- **Öneri:** Sahtekar `CONCEPTS`'te; "Oyun öner" kutucukları tasarımın oyun ikonlarını (`GameIcon`, `GAME_TONES`) kullanır. Tasarımda kişi sayısı seçici yok: öneri ve kabul `players` göndermez, sunucu masaların check-in sayısını alır (en çok 4). Rövanş son oyunun sayısını gönderir. Seçici tasarıma girince eklenir.
- **İki masalı ekran:** her masa kendi koltuklarını sırayla dolaştırır: "Telefonu A2'ye ver" → basılı tutulan kart → "Gördüm". Oylama da koltuk koltuk; hangi koltuğun oy verdiğini yalnızca o telefon bilir (sunucu ikinci oyu yok sayar). Süresi dolan aşamayı iki telefon da bir kez `advance` ile ilerletir.
- **Son koltuğun kartı:** son koltuğun bakması ipucu turunu başlatır ve `view` artık `turn_over` döner. Bu yüzden kartı tutan koltuk "Gördüm"e basana kadar telefon son yanıtı bellekte tutar; kart yine yalnızca parmak ekrandayken görünür. Yeni dağıtım (`dealNo`) bunu bırakır.
- **Yeniden dağıtım ve erken bitiş:** `dealNo > 1` iken görme ekranında "yeni kelime dağıtıldı" notu çıkar. `lastGame.endedBy = 'not_enough_players'` sohbet ekranında not olarak görünür; rövanş yoktur.
- **Açılış:** oyun bitince oda sohbete döner; `ImposterReveal` son oyun kartının üstünde durur, iki masalı oyunda altında "Rövanş".
- **Tek masalı oyun:** "Masanla oyna" kartında "Sahtekar başlat"; check-in sayısı 3'ten azsa düğme kapalı ve not görünür. Koltuk sayısı check-in sayısıdır.
- **Aktiviteler:** Sahtekar kartı (anlatım ve "Nasıl oynanır" adımları) Sesli Tabu ile Sohbet kartları arasında. "Son oyunların"da Sahtekar puansız görünür.

### 20.3 Harf Kapmaca

**Kurallar.**

- Telefon bir kategori ve harf tahtası gösterir. Tahta 23 harftir: A B C Ç D E F G H İ K L M N O P R S Ş T U Y Z (Ğ, I, J, Ö, Ü, V çıkarıldı; bunlarla başlayan kelime az).
- Sıradaki masa 10 sn içinde kategoriye uyan ve açık bir harfle başlayan bir kelime söyler, o harfe dokunur. Harf kapanır, sıra karşı masaya geçer.
- Karşı masa 3 sn içinde "İtiraz" ederse harf yeniden açılır ve oynayan masa turu kaybeder (Sesli Tabu'daki hakemlik gibi).
- **İtiraz hakkı:** her masanın oyun boyunca 3 itiraz hakkı vardır. İtiraz rakibe doğrudan puan kaybettirdiği için sınırsız olursa kötüye kullanılır. Kalan hak `game_state`'te ve ekranda görünür; hakkı biten masa itiraz edemez (`no_objections_left`).
- Süresi dolan masa da turu kaybeder; turu kaybeden masanın rakibi 1 puan alır.
- Bütün harfler kapanırsa tur, son harfi kapatan masanın olur (1 puan).
- 5 kategori oynanır. En çok puanı alan kazanır; eşitlik berabere.

**İki masalı akış.**

1. **Hazır:** sunucu kategoriyi seçer; kategori ve tahta görünür, süre işlemez (§20.1). Başlayan masa (1. kategori sahip masa, sonra dönüşümlü) "Başla"ya basar ya da 10 sn sonra süre kendiliğinden başlar.
2. **Harf:** sıradaki masa harfe dokunur: `harf/claim { round, step, letter }`.
   - Harf kapanır, sıra geçer, karşı masanın 10 sn'si başlar.
   - Aynı anda 3 sn'lik itiraz penceresi açılır (`objectionEndsAt`). İki süre birlikte işler.
3. **İtiraz:** karşı masa pencere içinde `harf/object { round, step }` gönderir. Hakkı biter, harf açılır, oynayan masa turu kaybeder, karşı masa 1 puan alır, sonraki kategori hazır açılır.
4. **Süre:** süre dolunca herhangi bir masa `harf/advance` çağırır. Süresi dolan masa turu kaybeder.

**Tek masalı sürüm:** Takım A ve B, tek telefon, aynı kurallar (itiraz hakkı dahil). İtirazı diğer takım aynı telefonda basar. Masada en az 2 kişi.

**Ortak motor:** Harf Kapmaca ve Şarkıda Geçsin aynı motoru paylaşır: istem, süre, söyle, itiraz.

- `pure/sayChallenge.ts`: istem, sıra, süre, itiraz penceresi, itiraz hakkı, tur kaybı ve puan. Saf reducer, vitest'li.
- Sunucu aynı kuralları SQL'de uygular; entegrasyon testi ikisinin aynı olduğunu denetler (Tabu'daki `applyMark` kalıbı).

**Sunucu durumu ve eylemler.**

- `game_state`: `phase`, `turnPhase`, `readyEndsAt`, `roundNo`, `totalRounds` (5), `category` (açık bilgi, iki masa da görür), `letters` (açık ve kapalı), `turnTable`, `step`, `endsAt`, `objectionEndsAt`, `lastClaim`, `objectionsLeft` (`{ owner, guest }`, 3'ten başlar), `scores`.
- Kategori gizli değildir; `game_secrets` gerekmez.
- Eylemler `harf/begin`, `harf/claim`, `harf/object`, `harf/advance`. `begin` ve `advance` idempotenttir.
- `game_results`: masa başına skor, `won` çok puanla (Tabu hakemli mod gibi), `mode = 'harf'`.

**İçerik:** `content/harf-categories.json` → `{ categories: [{ key, name }] }`; en az 150 kategori. Her kategori tahtadaki harflerin çoğuyla oynanabilir olmalı; seed bunu denetleyemez, proje sahibi örneklerken bakar.

**Kurallarla uyum.**

- **Kural 3:** sıra, süre, itiraz penceresi, itiraz hakkı ve puan sunucuda. Aynı adıma ikinci `claim` ya da `object` yok sayılır.
- **Kural 4:** yeni bilgi yok.
- **Kural 9:** yeni kanal yok.
- **Kural 10:** `rooms` → `room_used_cards`.

**Analitik:** `game_completed` (`score` sahip masanın), `rounds_lost_by_timeout: number`, `objections: number`. Kategori gitmez.

**E2E:**

- Cihaz "Başla"ya basar ve bir harfe dokunur.
- Bot itiraz eder; harf açılır, puan bota geçer, cihazda botun kalan itiraz hakkı 2 görünür.
- Bot bir harfe dokunur, cihaz itiraz etmez.
- Süre dolar (bot `advance`); son tur ve sonuç görünür.

### 20.4 Şarkıda Geçsin

**Kurallar.**

- Telefon bir kelime gösterir. Bir kelimede masalar sırayla, her biri 10 sn içinde bu kelimenin geçtiği bir şarkıdan bir dize söyler ve "Söyledik"e basar.
- Karşı masa 3 sn içinde itiraz edebilir. Söyleyemeyen ya da itiraz alan masanın rakibi 1 puan alır ve kelime biter (ilk başarısızlık).
- Bir kelimede en fazla 8 dize söylenir; 8. dize de geçerse kelime puansız biter.
- **İtiraz hakkı:** her masanın oyun boyunca 3 itiraz hakkı vardır (Harf Kapmaca'daki gibi); kalan hak `game_state`'te ve ekranda görünür.
- Oyun 8 kelime sürer; son iki kelimede süre 5 sn'ye iner. Kelimeyi açan masa dönüşümlüdür.
- Uygulama müzik çalmaz, şarkı sözü ya da şarkı adı göstermez.

**İki masalı akış:** Harf Kapmaca'nın motoru (§20.3). Farkları:

- İstem harf tahtası değil tek kelimedir.
- Hazır durumu yalnızca oyunun başındadır (§20.1); sonraki kelimeler doğrudan açılır.
- Eylemler `sarki/begin`, `sarki/said { round, step }`, `sarki/object { round, step }`, `sarki/advance`.

**Tek masalı sürüm:** Takım A ve B, tek telefon. Masada en az 2 kişi.

**Sunucu durumu:** `game_state`: `phase`, `turnPhase`, `readyEndsAt`, `roundNo`, `totalRounds` (8), `word` (açık), `turnTable`, `step` (kelimedeki dize, en fazla 8), `endsAt`, `objectionEndsAt`, `objectionsLeft`, `scores`.

- Son iki kelimede `endsAt` 5 sn ile kurulur (`SARKI.shortRounds`, `SARKI.shortSeconds`).
- `game_results` masa başına skor, `mode = 'sarki'`.

**İçerik:** `content/sarki-words.json` → `{ words: [{ key, word }] }`.

- Türkçe şarkılarda sık geçen en az 400 kelime.
- Şarkı adı, sanatçı ya da söz yazılmaz; yalnızca kelime.

**Kurallarla uyum:** Harf Kapmaca ile aynı.

**Analitik:** `game_completed` (`score` sahip masanın), `objections: number`.

**E2E:**

- Cihaz "Başla"ya basar, "Söyledik"e basar; bot itiraz etmez.
- Bot "Söyledik"e basar, cihaz itiraz eder; cihazın kalan itiraz hakkı 2 görünür.
- Son iki kelimede süre 5 sn görünür. Sonuç görünür.

### 20.4a Uygulamada netleşenler (7.2 sunucu)

- **Ortak motor:** `pure/sayChallenge.ts` (`SAY_CONFIG`, `sayBegin`, `sayClaim`, `sayObject`, `sayAdvance`) ve SQL'de `public.say_*` (oyun türü parametreyle). İki Edge Function (`harf`, `sarki`) aynı işleyiciyi (`_shared/say.ts`) kullanır; Harf `claim { round, step, letter }`, Şarkı `said { round, step }` alır, diğerininkini 400 ile reddeder.
- **Hazır durumu:** Harf'te her kategori hazır açılır, Şarkı'da yalnızca ilk kelime (10 sn, `SAY_CONFIG.readySeconds`). Başla: başlayan masa her an, iki masa da `readyEndsAt`'ten sonra.
- **Son adım:** bütün harfler kapandığında ya da 8. dize söylendiğinde sıra kimseye geçmez; `endsAt` itiraz penceresinin sonuna çekilir. Pencere itirazsız biterse `advance` turu kapatır: Harf'te tahta son harfi kapatana, Şarkı'da puansız.
- **Yok sayılanlar:** eski tur ya da adım, sırası olmayan masanın `claim`'i, kapalı harf, kendi iddiasına itiraz, pencere dışı itiraz: oda değişmeden `{ ok: true }`. Hakkı biten masanın itirazı `no_objections_left` (409).
- **Bitiş:** iki hesaba `game_results` (`mode` = oyun türü, masa skoru, çok puan alan `won`), `game_completed` olayı, oda sohbete döner; `lastGame` skorları, son turu ve kalan itiraz haklarını taşır. "Oyunu bitir" `abandoned`, tur ve skorları yazar.
- **Tek masalı oyun:** `harf/start`, `sarki/start` tur başına bir istem döner (`{ prompts }`: 5 kategori ya da 8 kelime) ve odanın etkinliğini o oyun yapar. Oyunu telefon `sayChallenge.ts` ile Takım A ve B için yürütür.
- **Öneri:** `rooms/propose-game` `harf` ve `sarki`yı kabul eder (`PROPOSABLE_CONCEPTS`); uygulamanın düğmeleri ekranlarla gelir.
- **İdempotentlik:** `harf/begin`, `harf/advance`, `sarki/begin`, `sarki/advance` `IDEMPOTENT_CALLS`'ta.
- **İçerik:** `content/harf-categories.json` (173 kategori) ve `content/sarki-words.json` (498 kelime) proje sahibinin incelemesine taslaktır.

### 20.4b Uygulamada netleşenler (7.2 ekranlar)

- **Öneri ve Aktiviteler:** Harf Kapmaca ve Şarkıda Geçsin `CONCEPTS`'te; öneri kutucukları tasarımın ikonlarıyla (harfler, şarkı) ve beş oyun olduğu için iki satıra sarılır. Aktiviteler'de iki kart ("Nasıl oynanır" adımları), "Son oyunların"da skorlarıyla.
- **İki masalı ekran** (`SayGame`): hazır durumda istem ve `TurnReady` (önceki turun sonucu özet olarak: "İtiraz! … +1"); oyunda tur, saat, iki masanın skoru ve kalan itiraz hakkı (skor çubuğunun altında "siz · 3 hak", karşı masada "2 hak"), istem, Harf'te harf tahtası (sıra sizdeyken dokunulur), Şarkı'da "Söyledik". Karşı masanın iddiasından sonra itiraz penceresi ve "İtiraz". Biten turun sonucu bir an görünür. Süre dolunca iki telefon da bir kez `advance` ya da `begin` çağırır.
- **Tek masalı oyun** (`LocalSay`): "Masanla oyna"da iki düğme (en az 2 kişi), Takım A ve B tek telefonda; itirazı diğer takım aynı telefonda basar. İstemler `start`'tan bir kerede gelir.
- **Bitiş:** oda sohbete döner; son oyun kartı iki masanın skorunu gösterir, altında "Rövanş".
- **Analitik:** iki masalı oyunu sahip masanın telefonu `lastGame`'den bir kez gönderir (`score` sahip masanın, `objections` kullanılan itiraz, `rounds_lost_by_timeout`); bunun için sunucu `timeouts` sayar. "Oyunu bitir" `game_abandoned` (tur ve toplam tur) gönderir.
- **Bot ve E2E:** `say-begin`, `say-claim`, `say-object`, `say-expire` (yerelde `toRound` ve `lastRound`); karşı masa modu kendi turunda bir harf ya da dize söyler, itiraz etmez. Akışlar `10-harf.yaml` ve `11-sarki.yaml` (09'dan sonra).

### 20.5 İbre

**Kurallar.**

- Telefon iki uçlu bir ölçek gösterir (ör. Ucuz ile Pahalı).
- Sıradaki masanın anlatıcısı gizli hedefi (0 ile 100 arası) görür, telefonu kapatır, sesli tek ipucu verir.
- Kendi masası ibreyi telefonda sürükleyip onaylar.
- Karşı masa 15 sn içinde "Daha sol" ya da "Daha sağ" der; doğruysa 1 puan alır.
- Puan, hedefe uzaklığa göre 4, 3, 2 ya da 0'dır; bantları sunucu hesaplar.
- 4 tur oynanır, masalar dönüşümlü.

**İki masalı akış.**

1. **Hazır:** ölçek görünür, süre işlemez (§20.1). Anlatan masa "Başla"ya basar ya da 10 sn sonra süre kendiliğinden başlar.
2. **Hedef:** hedef `game_secrets`'tadır.
   - Anlatan masa hedefi `ibre/target { round }` ile yalnızca süre işlerken alır; diğer masa `not_describer`, hazır durumunda `turn_not_started` alır.
   - Telefon hedefi basılı tutunca gösterir (Tabu'daki kapalı kart gibi).
3. **İbre:** anlatan masa ibreyi sürükler ve onaylar: `ibre/lock { round, value }` (0-100 tamsayı).
4. **Taraf:** karşı masa 15 sn içinde `ibre/side { round, side: 'left' | 'right' }` gönderir; süre dolarsa taraf puanı yok.
5. **Açılış:** `game_state` hedefi, ibreyi, bandı, puanı ve taraf sonucunu taşır; sonraki tur hazır açılır.

**Bantlar** (`pure/ibre.ts` → `ibreBand(distance)`; SQL aynısını uygular, test denetler):

| Uzaklık    | Puan |
| ---------- | ---- |
| 0-4        | 4    |
| 5-11       | 3    |
| 12-19      | 2    |
| 20 ve üstü | 0    |

İbre hedefin tam üstündeyse taraf tahmini puan almaz.

**Tek masalı sürüm:** Takım A ve B, tek telefon. Hedef telefonda üretilir. Masada en az 2 kişi; anlatıcı telefonu takımından saklar.

**Sunucu durumu ve eylemler.**

- `game_state`: `phase`, `turnPhase`, `readyEndsAt`, `roundNo`, `totalRounds` (4), `scale` ({ left, right }, açık), `turnTable`, `endsAt`, `needle` (kilitlenince), `scores`. Açılışta `reveal: { target, band, sidePoint }`.
- Eylemler: `ibre/begin`, `ibre/target`, `ibre/lock`, `ibre/side`, `ibre/advance`.
- `game_results` masa başına skor, `mode = 'ibre'`.

**Sürükleme:** yalnızca JS. `react-native-reanimated` (kurulu) ya da `PanResponder`; yeni native modül yok. Erişilebilirlik için ibre ± düğmeleriyle de oynatılır.

**İçerik:** `content/ibre-scales.json` → `{ scales: [{ key, left, right }] }`; en az 200 zıt kavram çifti. Seed çift tekrarını ve boş ucu reddeder.

**Kurallarla uyum.**

- **Kural 3:** hedef, bant ve puan sunucuda.
- **Kural 4:** hedef açılıştan önce yalnızca anlatan masaya ve yalnızca `target` yanıtıyla gider; `game_state`, olaylar ve Realtime'da yoktur.
- **Kural 9:** yeni kanal yok.
- **Kural 10:** `rooms` → `game_secrets` → `room_used_cards`.

**Analitik:** `game_completed` (`score` sahip masanın), `bullseyes: number`. Ölçek ve hedef gitmez.

**E2E:**

- Cihaz anlatan masadır: "Başla"ya basar, hedefi basılı tutar, ibreyi sürükler, onaylar.
- Bot "Daha sağ" der. Açılış görünür.
- Bot anlatan masa olur, cihaz taraf seçer.
- Entegrasyon testi: hedef, karşı masaya ve odanın satırına açılıştan önce gitmez.

### 20.6 Uygulama sırası ve yayın

| Adım               | Sunucu                                                                                          | İstemci                                           | Yayın                                   |
| ------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| 7.1 Sahtekar       | `…_sahtekar.sql` (`game_secrets`, kısıtlar, deste, öneride sayı), `sahtekar` fonksiyonu, içerik | Oyun, açılış, tek masalı sürüm, Aktiviteler kartı | `db push --include-seed` + deploy → OTA |
| 7.2 Harf Kapmaca   | `…_harf.sql`, `harf`, `pure/sayChallenge.ts`, içerik                                            | Tahta, itiraz                                     | Aynı                                    |
| 7.3 Şarkıda Geçsin | `…_sarki.sql`, `sarki` (aynı motor), içerik                                                     | İstem ekranı                                      | Aynı                                    |
| 7.4 İbre           | `…_ibre.sql`, `ibre`, `pure/ibre.ts`, içerik                                                    | İbre (JS), açılış                                 | Aynı                                    |

- Her oyun ayrı PR'dır, `e2e` etiketi taşır, kendi E2E akışıyla gelir.
- Sunucu, içerik ve tek masalı reducer hemen yapılır. Görsel bileşenler tasarım oturumunun ilgili "Aşama" PR'ından gelir; ekranlar o PR main'e girince yapılır.
- Yeni Edge Function'lar "main'den dev projesine yayın" listesine ve `config.toml`'a birlikte eklenir (`verify_jwt = false`).

### 20.7 Kabul (her oyun)

- Entegrasyon testleri şunları gösterir:
  - Öneri olmadan başlamaz.
  - Süre ve sıra sunucudadır; aynı adıma ikinci eylem yok sayılır; `begin` ve `advance` idempotenttir.
  - Gizli bilgi yalnızca ilgili masaya gider (yanıt, satır, olay, Realtime).
  - `locks` testi geçer.
- Tek masalı reducer'ın birim testleri vardır.
- E2E açık ve koyu yeşildir.
- İçerik seed doğrulamasından geçer ve proje sahibince onaylanmıştır.

### 20.8 Cevaplar (proje sahibi)

1. **Sahtekar, yeniden görme:** evet, ipucu turu başlayana kadar. Arayüz koltukları sırayla verir.
2. **Sahtekar, süreler:** görme 2 dk, oylama 90 sn (telefon 4 kişi arasında dolaşıyor). Dolunca oy vermeyen koltuk atlanır. Görmeyen koltuk için #63 incelemesinde değişti: oyundan çıkar, sahtekar çıktıysa yeniden dağıtılır, 3'ten az kalırsa oyun biter (§20.2 adım 2).
3. **Sahtekar, çoğunluk:** en çok oyu alan tek koltuk. Eşitlikte sahtekar kaçar.
4. **Sahtekar, kendine oy:** yasak.
5. **Rozetler:** dört yeni oyun da `game_results`'a yazılır ve oyun sayısı rozetlerine girer, Sahtekar dahil. Kazanma rozeti yalnızca Sesli Tabu'da kalır; yeni kazanma rozeti yok.
6. (5 ile birlikte cevaplandı.)
7. **Harf tahtası:** 23 harf (§20.3).
8. **Harf Kapmaca, tahta dolarsa:** tur, son harfi kapatan masanın.
9. **Şarkıda Geçsin, tur yapısı:** bir kelimede masalar sırayla söyler, ilk başarısızlıkta kelime biter. Bir kelimede en fazla 8 dize; dolarsa kelime puansız biter.
10. **İbre:** 4/11/19 bantları ve taraf için 15 sn.
11. **Oyuncu sayısı onayı:** soru kalktı; oyuncu sayısı ayrı bir aşama değil (§20.1).
12. **Tek masalı sürümler:** Harf Kapmaca, Şarkıda Geçsin ve İbre'de en az 2 kişi.

Ek kararlar: oyuncu sayısı yalnızca Sahtekar'da ve öneri/kabulle (§20.1); itiraz hakkı masa başına 3 (§20.3, §20.4); süreli her yeni oyunda 10 sn'lik hazır durumu (§20.1).
