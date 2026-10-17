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
   - SMS başlığı (gönderici adı, ör. `SKALL`) onaylatılır. Başlık onayında Netgsm marka ya da şirket belgesi isteyebilir; pilottan önce Netgsm'e sorulur.
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

- Her mekanın tek, sabit bir grup sohbeti vardır: "Sakarya Üniversitesi sohbeti". Adı `tr.ts`'te şablondur: `${venueName} sohbeti`; mekan ekranındaki satırın adı "Mekan sohbeti". (Faz 3, adım 23.1: "oda" kelimesi kullanıcıya görünmez, §23.C; önceki ad "… sohbet odası".)
- **Erişim:** Yalnızca o mekanda aktif masası olan hesaplar okur ve yazar (`table_sessions.status = 'active' and expires_at > now()`). Masa bitince (ayrılma, süre dolumu) erişim hemen biter; geçmiş mesajlar da okunamaz.
- Yalnızca metin: en fazla 200 karakter, oda sohbetiyle aynı sınır.
- Mekandaki odalardan bağımsızdır: odadayken de açılabilir.

### 7.2 Veri

- **`venue_chat_messages`:**
  - `id`, `venue_id`, `session_id` (masa oturumu → `table_sessions` on delete cascade), `sender_user_id` (→ `auth.users` on delete cascade; **istemciye kapalı**).
  - `sender_alias`, `profiled boolean`, `body` (1–200), `created_at`, `hidden_at timestamptz null`.
- **`venue_chat_reports`:** `message_id` → `venue_chat_messages` on delete cascade, `reporter_user_id` (istemciye kapalı), `created_at`; primary key `(message_id, reporter_user_id)`.
- **Silme:** Mesajlar 24 saatte silinir (saatlik cron). Şikayet kopyası `reports`'ta 30 gün kalır (bugünkü cron).
- **Okuma:** Tablo okumasıyla değil, `venue-chat/page { venueId, before? }` ile (adım 9, saha testi: profilli mesajda fotoğraf görünmüyordu). Fonksiyon service role'e kapalı `venue_chat_page_for(user, venue_id, before?)` RPC'sini çağırır, profilli mesajların fotoğraflarını imzalar (1 saat, `dm/inbox` gibi) ve yolu değil imzalı URL'i döner. Eski build'ler için `venue_chat_page(venue_id, before?)` (security definer, yalnızca okur, `set search_path = ''`, fotoğrafsız) durur. Her mesaj için döner:
  - `id`, `profiled`, `senderAlias` (**yalnızca anonim mesajda**), `displayName` ve `photoUrl` (yalnızca profilli mesajda; fotoğraf yoksa ya da gizlenmişse `null`), `body`, `createdAt`, `fromMe`.
  - **Fotoğraf:** profilli mesajın görünen adını gören kitleye, yani o an mekanda aktif masası olanlara gider (kural 4: profil mesaj üzerinden aynı kitleye açılır). **Anonim mesajda fotoğraf asla gitmez:** RPC anonim mesajda `photo_path` döndürmez; entegrasyon testi hem RPC'yi hem fonksiyon yanıtını denetler.
  - **Profilli mesajda masa adı gitmez** (proje sahibi düzeltmesi): ad, fotoğraf ve masa adı birlikte giderse lobideki nokta başlığıyla kişinin kampüsteki yeri ortaya çıkar. `sender_alias` kolonu tabloda durur (şikayet kopyası, yalnızca sunucu), RPC profilli mesajda `null` döner. Entegrasyon testi bunu `venue_chat_page`, `venue-chat/page`, `venue_chat:` yükleri ve `profile/get` yanıtları üzerinden doğrular.
  - Aktif masası o mekanda olmayana boş döner.
  - İki yönlü engel varsa mesaj dönmez.
  - `hidden_at` dolu mesaj dönmez; gönderenin kendisine döner (kendi mesajının gizlendiğini ayırt edemez).
  - `public_id` ve hesap id'si dönmez. Profil `profile/get { venueChatMessageId }` ile açılır (§7.5).

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
- **Alıcının görünümü:** "Sakarya Üniversitesi sohbetinden **Ayşe (21)** arkadaşın olmak istiyor", yanında fotoğraf (gizlenmemişse).
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
| `venue_chat:{venue_id}` (yeni)                   | Mekanda aktif masası olanlar            | Yalnızca sunucu           | `venue_chat` (veri içermez; istemci `venue-chat/page` okur)          |
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

### 18.3b Gecikme (adım 9, saha testi)

Ölçüm: `pnpm latency` (`scripts/latency/measure.ts`; iki test hesabı, adım adım: istemci çağrısı, yayın, alıcının okuması). Bulgu: her DM yayını bütün `friends/*` sorgularını yeniden çağırıyordu (konuşma açıkken sayfayla birlikte 5 çağrı, ikisi fotoğraf imzalayan fonksiyon); gönderende tik sayfa yeniden okunana kadar bekliyordu.

- **`dm/send` yanıtı mesajı taşır:** `{ ok, messageId, createdAt }` (`dm_send_message`). Uygulama mesajı önbellekteki sayfaya `sent` tikiyle koyar; saat yanıtla tike döner, sayfa yeniden okunmaz. Hata "Tekrar dene" ile kalır.
- **Alıcı:** açık konuşma yalnızca kendi sayfasını okur (`dm:{thread_id}`). `inbox:` üzerindeki DM yayını `dm/inbox` ve `friends/list`'i en fazla saniyede bir çağırır (konuşmanın `dm/read`'i de aynı zamanlayıcıyı kullanır); diğer konuşmaların sayfaları yalnızca bayat işaretlenir, açılınca okunur. İstek ve arkadaşlık yayınları bütün `friends/*`'i yeniler (seyrek).
- **İmzalı fotoğraf URL'leri** süresi dolmadan yeniden kullanılır (`pure/photoUrlCache.ts`): fonksiyon aynı yolu yarım saat aynı URL'le döner (Storage çağrısı yok), uygulama bir dosyanın ilk URL'ini 25 dakika tutar (fotoğraf yeniden inmez). Kimin hangi fotoğrafı göreceğine yine her okumada sunucu karar verir: URL yalnızca o okuma yolu yeniden verdiğinde kullanılır.

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
- **Oyun kataloğu (adım 9):** alt sınırların tek kaynağı `pure/gameCatalog.ts` → `GAME_CATALOG`. Tek telefonda: Sahtekar 3; Harf Kapmaca, Şarkıda Geçsin, İbre ve Sesli Tabu 2; Sohbet kartları 1. İki masada: Sahtekar toplam 3 (diğerlerinde iki masa zaten yeter). Oyun modülleri (`SAHTEKAR.minPlayers`, `SAY_CONFIG.*.minLocalPlayers`, `IBRE_CONFIG.minLocalPlayers`) değerlerini buradan okur. Odadaki ve Aktiviteler'deki oyun kartının soluk hâli ve nedeni ("En az 3 kişi") `gameAvailability(concept, mode, players)`'tan gelir; soluk kart basılmaz, öneri ya da oyun başlamaz. Odada "Masanla oyna" masanın check-in sayısıyla, "Oyun öner" iki masanın check-in sayılarının toplamıyla; Aktiviteler'de "Tek telefonla" mekandayken masanın sayısıyla. Aktiviteler'deki "İki masayla" soluk olmaz: karşı masa ve dolayısıyla toplam oda kurulmadan bilinmez. Soluk hâl yalnızca görünümdür; sunucunun `not_enough_players` kontrolü aynen kalır.

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
- Kelimenin çekimli hâli de sayılır ("göz" için "gözlerin" geçerli). Bu yüzden deste kök kelimelerden oluşur; zamir, bağlaç ve her şarkıda geçen sözcükler (ben, sen, bir, hiç…) destede yoktur (proje sahibi kararı).
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
- **İçerik:** `content/harf-categories.json` (174 kategori) ve `content/sarki-words.json` (456 kelime), proje sahibinin incelemesiyle: siyaset, din, askerlik, savaş, argo ve hastalık kategorileri; alkol, sigara ve dini sözcükler; zamirler, bağlaçlar ve çekimli tekrarlar çıkarıldı (yerlerine gündelik ve kampüs kategorileri, somut kelimeler). Seed, JSON'dan çıkarılan kartı silmez, deste deste `is_active = false` yapar.

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
- Karşı masa 15 sn içinde "Solunda" ya da "Sağında" der; doğruysa 1 puan alır.
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
- Bot "Sağında" der. Açılış görünür.
- Bot anlatan masa olur, cihaz taraf seçer.
- Entegrasyon testi: hedef, karşı masaya ve odanın satırına açılıştan önce gitmez.

### 20.5a Uygulamada netleşenler (7.4 sunucu)

- **Anlatan masanın süresi:** 90 sn (`IBRE_CONFIG.clueSeconds`): hedefe bakma, ipucu ve masanın tartışması, ibreyi onaylama. Süre hazır ekranında "Başla"ya basılınca (ya da `readyEndsAt`'te) başlar (proje sahibi kararı).
- **İbre onaylanmazsa:** süre dolunca `advance` turu ibresiz kapatır: anlatan masaya 0, taraf aşaması yok; açılış hedefi `needle: null` ile gösterir (proje sahibi kararı). Uygulama, ibre onaylanmamışsa son 3 sn'de ibrenin o anki değerini kendisi `ibre/lock` ile onaylar; elle onay da istemcinin gönderdiği değere dayandığı için güven düzeyi aynıdır. Telefon arka plandaysa onay gitmez, tur 0 kalır.
- **Hazır durumu:** "Başla" yalnızca anlatan masadan. `readyEndsAt` geçince iki telefon da `advance` çağırır; süre çağrıdan değil `readyEndsAt`'ten başlar (§20.1). Geç basılan "Başla" da süreyi uzatmaz.
- **Hedef:** sunucuda 0-100 tamsayı, eşit olasılıkla (`floor(random() * 101)`); `game_secrets.secret = { roundNo, target }`, her turda yenilenir. `ibre/target { round }` anlatan masaya süre işlerken (kendi süresi ve taraf süresi) döner; başka tur `turn_over`, oyun yoksa `no_game`.
- **Yok sayılanlar:** hazır durumunda ya da diğer masadan `lock`, eski tur, ikinci `lock`, süre dışı; anlatan masadan ya da süre dışı `side`, ikinci `side`: oda değişmeden `{ ok: true }`. 0-100 dışı ya da kesirli değer 400.
- **Açılış:** `game_state.reveal = { roundNo, scale, table, target, needle, band, side, sidePoint }` (ölçek o turunki; `game_state.scale` artık sonraki turun), sonraki turun hazır durumunda durur. Puanlar anlatan masaya bant, karşı masaya doğru taraf için 1. `bullseyes` (masa başına 4 puanlı tur) `game_completed`'ın `bullseyes` özelliği için tutulur.
- **Bitiş:** iki hesaba `game_results` (`mode = 'ibre'`, masa skoru, çok puan alan `won`), `game_completed` olayı, oda sohbete döner; `lastGame = { concept, scores, bullseyes, reveal }`. "Oyunu bitir" `abandoned`, tur ve skorları yazar.
- **Tek masalı oyun:** `ibre/start` 4 ölçek döner (`{ scales: [{ left, right }] }`) ve odanın etkinliğini İbre yapar; hedefleri ve oyunu telefon `pure/ibre.ts` ile yürütür.
- **Deste:** `cards` satırı ölçek başına: `prompt` sol uç, `word` sağ uç. Seed boş ucu, iki ucu aynı olanı ve (iki yönde de) tekrar eden çifti reddeder; uç en çok 40 karakter.
- **Öneri:** `rooms/propose-game` `ibre`yi kabul eder (`PROPOSABLE_CONCEPTS`); uygulamanın düğmeleri ekranlarla gelir.
- **İdempotentlik:** `ibre/begin`, `ibre/target`, `ibre/advance` `IDEMPOTENT_CALLS`'ta.
- **İçerik:** `content/ibre-scales.json` (225 ölçek), proje sahibinin incelemesiyle: "Kötü X | İyi X" kalıbı en çok 30, aynı kavramın tekrarı yok, Ucuz/Pahalı ve Kolay/Zor türevleri üçer. Seed iki ucun ters sırasını da tekrar sayar.

### 20.5b Uygulamada netleşenler (7.4 ekranlar)

- **Öneri ve Aktiviteler:** İbre `CONCEPTS`'te; öneri kutucuğu ibre ikonuyla, Aktiviteler'de kart ve "Nasıl oynanır".
- **Kadranın genişliği:** her kadran, içinde durduğu sütunun gerçek genişliğini `onLayout` ile ölçer ve onunla çizilir (en çok 360). Sabit genişlik yok.
- **Açılışta ibre ve bant numarası:** bant numaraları gösterilirken (açılış) ibre numaraların halkasının içinde biter; ucunu gösterdiği numarayı örtmez. Onaylanmamış ibre açılışta çizilmez.
- **İki masalı ekran** (`IbreGame`): hazır durumda önceki turun açılışı (ilk turda boş ölçek) ve `TurnReady` (Başla yalnızca anlatan masada). Anlatan masada hedef basılı tutulunca `ibre/target`'tan gelir (tur boyunca saklanır), altında sürüklenen ya da − / + ile oynatılan ibre ve "İbreyi onayla". Karşı masada ölçek ve "… ipucu veriyor". Taraf aşamasında kilitli ibre; karşı masa "Solunda / Sağında" seçer. Süre dolunca iki telefon da bir kez `advance` çağırır.
- **Otomatik onay:** anlatan masanın ibresi son 3 sn'de onaylanmamışsa uygulama o anki değeri `ibre/lock` ile kendisi gönderir (`ibreAutoLockDue`, tur başına bir kez); ipucu satırı bunu söyler. Tek masalı oyunda da aynı. Arka plandaki telefon göndermez, tur 0 kalır.
- **Tek masalı oyun** (`LocalIbre`): "Masanla oyna"da düğme (en az 2 kişi); hedefi telefon üretir; anlatıcı basılı tutarak görür, takımı ibreyi ayarlar, diğer takım aynı telefonda taraf seçer. Ölçekler `ibre/start`'tan bir kerede gelir.
- **Bitiş:** oda sohbete döner; son turun açılışı ve son oyun kartı (iki skor, "Rövanş").
- **Analitik:** iki masalı oyunu sahip masanın telefonu `lastGame`'den bir kez gönderir (`score` ve `bullseyes` sahip masanın). "Oyunu bitir" `game_abandoned` gönderir.
- **Bot ve E2E:** `ibre-begin`, `ibre-lock` (`value` ya da hedefin yakını), `ibre-side`, yerelde `ibre-hold` (saatleri 60 sn ileri iter) ve `ibre-end`. Karşı masa modu kendi turunda hedefin yakınına kilitler, diğer turda rastgele taraf seçer. Akış `12-ibre.yaml` (11'den sonra).

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

## 21. Adım 9: Yanıt ve tepki

Üç sohbette de (DM, oda sohbeti, mekan sohbeti) WhatsApp'taki gibi bir mesaja yanıt verilir ve tepki bırakılır. Kapsam bilerek dar: düzenleme, silme, iletme, birden çok tepki ve tepki bildirimi yok. Görsel parçalar (alıntı şeridi, kaydırma, tepki seçici, tepki çipleri) tasarımın Aşama 8 sohbet PR'ından gelir; bu bölüm veri, API ve kuralları tanımlar.

### 21.1 Yanıt

- **Hareket:** balon sağa kaydırılınca yazma alanının üstünde alıntı şeridi açılır (alıntılanan kişi ya da masa, metnin başı, kapatma düğmesi). Gönderilen mesaj alıntılanan mesajın kimliğini taşır.
- **Veri:** her mesaj tablosuna `reply_to_id uuid null` (`messages.reply_to_id → messages`, `dm_messages.reply_to_id → dm_messages`, `venue_chat_messages.reply_to_id → venue_chat_messages`), hepsi `on delete set null`. Alıntının metni kopyalanmaz; okumada sunucu birleştirir.
- **Gönderme:** `chat/send`, `dm/send` ve `venue-chat/send` isteğe bağlı `replyTo` alır. Sunucu alıntılanan mesajın aynı odada, aynı konuşmada ya da aynı mekanda olduğunu ve gönderenin onu o an görebildiğini doğrular; değilse `reply_unavailable` (409) döner ve mesaj yazılmaz.
- **Okuma:** sayfa her mesajla birlikte `replyTo` döner: `{ id, body (en çok 80 karakter), from_me }` ve gönderenin o sohbetteki etiketi.
  - Oda sohbeti: masa takma adı.
  - DM: etiket yok, `from_me` yeter.
  - Mekan sohbeti: mesajın kendi kuralıyla, yani anonimse masa takma adı, profilliyse görünen ad (§7.2). Profil kimliği, fotoğraf ve hesap kimliği alıntıda da gitmez.
- **"Mesaj artık yok":** alıntılanan mesaj silinmişse (`reply_to_id` boş kalır), gizlenmişse (mekan sohbetinde `hidden_at`), iki yönlü engel yüzünden okuyana görünmüyorsa ya da okuyanın göremeyeceği bir zamandaysa `replyTo` `{ gone: true }` döner; balonda "Mesaj artık yok" yazar. Hangisinin olduğu ayırt edilmez (kural 5'in ruhu).
- Alıntıya dokununca liste alıntılanan mesaja kayar; mesaj yüklenmiş sayfada yoksa hiçbir şey olmaz.

### 21.2 Tepki

- **Hareket:** balona uzun basınca 6 sabit emojiden biri seçilir. Liste tek kaynaktır: `pure/reactions.ts` → `REACTIONS = ['👍', '❤️', '😂', '😮', '🎉', '🔥']` (tasarımın listesi, onaylı; tepki çubuğu ve sunucu aynı listeyi okur). Başka emoji sunucuda reddedilir (400).
- **Kural:** kişi başına mesaj başına tek tepki. Aynı emojiye yeniden basmak tepkiyi geri alır, başka emoji seçmek değiştirir. Kendi mesajına da tepki verilebilir (onaylı).
- **Hız sınırı (yalnızca mekan sohbeti, onaylı):** hesap başına 10 saniyede en çok 10 tepki isteği (koyma, değiştirme, kaldırma). Aşılırsa mesajlardaki gibi `rate_limited` (429) döner; uygulama bunu sessizce yok sayar (balon eski hâlinde kalır, hata gösterilmez). Sayaç `venue_chat_reaction_rate`'te, mesaj sınırından (`venue_chat_rate`) ayrı tutulur. DM ve oda sohbetinde sınır yok.
- **Kim "kişi":** DM'de hesap. Oda sohbetinde masa oturumu (odada her masa tek telefondur, gösterilen ad masa takma adıdır). Mekan sohbetinde hesap.
- **API:** `dm/react { messageId, emoji | null }`, `chat/react { messageId, emoji | null }`, `venue-chat/react { messageId, emoji | null }`. `null` tepkiyi kaldırır. İdempotenttir: aynı istek iki kez gönderilince bir kez gönderilmiş gibi aynı durum (`IDEMPOTENT_CALLS`'a testiyle girer). Yetki gönderme yetkisiyle aynıdır: DM'de arkadaşlık ve engel yokluğu, oda sohbetinde odanın üyesi olmak, mekan sohbetinde o mekanda aktif masa. Gizlenmiş mesaja tepki verilemez (`not_found`, var olmayan mesajla aynı).
- **Okuma:** sayfa her mesajla birlikte tepkileri döner.
  - DM: `[{ emoji, from_me }]`, en çok iki satır; kişi `from_me` ile ayrılır, hesap ya da profil kimliği gitmez.
  - Oda sohbeti: emoji başına `{ emoji, count, aliases, mine }`; `aliases` tepki veren masaların takma adları.
  - Mekan sohbeti: emoji başına yalnızca `{ emoji, count, mine }`. **Kimin verdiği gitmez** (kural 4): masa takma adı da görünen ad da yok; `mine` yalnızca çağıranın kendi tepkisidir.
- Tepki bildirim ve push üretmez; okunmamış sayacını ve Mesajlar'daki önizlemeyi değiştirmez.

### 21.3 Veri, kilit, Realtime, silme

- **Yeni tablolar** (her biri politikalarıyla aynı migration'da, kural 2; istemci yazamaz, kural 1):
  - `dm_reactions (message_id → dm_messages on delete cascade, user_id → auth.users on delete cascade, emoji, created_at)`, birincil anahtar `(message_id, user_id)`. RLS açık, politika yok; okuma `dm_messages_page` üzerinden.
  - `message_reactions (message_id → messages on delete cascade, session_id → table_sessions on delete cascade, emoji, created_at)`, birincil anahtar `(message_id, session_id)`. RLS açık, politika yok. Oda sohbeti mesajları bugün tablo okumasıyla (RLS) ve Postgres Changes ile alır; bu değişmez. Tepkiler ve alıntı özetleri yeni, yalnızca okuyan `room_chat_extras(room_id)` RPC'siyle okunur (security definer, `set search_path = ''`, yalnızca odanın üyesine; masa oturum kimliği ve takma ad döner, hesap kimliği dönmez).
  - `venue_chat_reactions (message_id → venue_chat_messages on delete cascade, user_id → auth.users on delete cascade, emoji, created_at)`, birincil anahtar `(message_id, user_id)`. RLS açık, politika yok; `user_id` istemciye hiç gitmez.
  - `venue_chat_reaction_rate (user_id → auth.users on delete cascade, window_started_at, count)`: mekan sohbeti tepki sınırı (§21.2). RLS açık, politika yok.
- **Kilit sırası (kural 10):** tepki tablosu kendi mesaj tablosundan hemen sonra gelir.
  - Oda: `… messages` → `message_reactions` → `game_events`, `play_history`.
  - İki hesap: `… dm_threads` → `dm_messages` → `dm_reactions`, `dm_reads`.
  - Mekan sohbeti: `table_sessions` → `venue_chat_rate` → `venue_chat_reaction_rate` → `venue_chat_messages` → `venue_chat_reactions` → `venue_chat_reports`.
  - Yanıt yeni kilit almaz: alıntılanan mesaj kilitsiz okunur.
- **Realtime (kural 9):** yeni kanal yok. Tepki değişince mesajın kanalına veri içermeyen yayın gider: `dm:{thread_id}` → `dm_reaction`, oda kanalı → `reaction`, `venue_chat:{venue_id}` → `venue_chat_reaction`. Alıcı yalnızca o sayfayı yeniden okur. Yükte emoji, mesaj kimliği ya da kişi yoktur. Oda sohbetinin tepkileri de yayınla gelir; `message_reactions` Postgres Changes ile dinlenmez.
- **Silme:** tepkiler mesajla birlikte silinir (cascade): mekan sohbetinde mesajlar 24 saatte silindiği için tepkileri de 24 saatte gider; oda mesajları oda kapandıktan 24 saat sonra silinir. Şikayet kopyası (`reports.messages_snapshot`) tepki ve alıntı içermez.
- **Hesap silme ve ban:** `user_id` ve `session_id` cascade ile tepkileri siler.

### 21.4 Kabul

- Entegrasyon testleri:
  - yanıt aynı sohbet dışından ya da görünmeyen mesaja `reply_unavailable`;
  - silinen, gizlenen ya da engelli mesaja yanıt "Mesaj artık yok" (`gone`);
  - kişi başına tek tepki, değiştirme, geri alma ve iki kez gönderilince aynı sonuç;
  - mekan sohbetinde tepki verenin kimliği, takma adı ya da görünen adı sayfada ve Realtime yüklerinde yok;
  - mesaj silinince tepkiler gidiyor;
  - yeni yollar için `locks` testi.
- Birim testleri: `pure/reactions.ts` (liste, geçerlilik, emoji başına sayım).
- E2E: DM'de yanıt ve tepki, oda sohbetinde tepki; görsel parçalar Aşama 8 sohbet PR'ı birleştikten sonra.
- Yayın: migration + üç fonksiyonun deploy'u (`chat`, `dm`, `venue-chat`), sonra OTA.

### 21.5 Kararlar (proje sahibi onayı)

1. 6 sabit emoji: tasarımın listesi `👍 ❤️ 😂 😮 🎉 🔥` (`pure/reactions.ts` → `REACTIONS`); ilk taslaktaki `😢 👏` yerine `🎉 🔥`.
2. Kendi mesajına tepki verilebilir.
3. Mekan sohbetinde tepkiye hız sınırı: hesap başına 10 sn'de 10; aşılırsa `rate_limited`, arayüz sessizce yok sayar (§21.2).
4. Oda sohbetinde tepki verenler masa takma adıyla görünür; oda bittiğinde oyun geçmişindeki oda sohbeti kapanır, tepki de görünmez kalır.

### 21.6 Uygulamada netleşenler

- **`replied` kolonu:** `reply_to_id` silinen mesajla boşaldığı için (`on delete set null`) her mesaj tablosunda bir de `replied boolean` var; "yanıttı ama alıntı gitti" ile "yanıt değildi" böyle ayrılır.
- **Gönderme fonksiyonları:** `chat_send`, `dm_send`, `dm_send_message` ve `venue_chat_send` sonda `reply_to uuid default null` alır; yayındaki eski fonksiyonlar bu parametre olmadan çağırmayı sürdürür.
- **Oda kanalı:** tepki yayını odanın sohbet kanalına, `messages:{room_id}`'ye gider (Postgres Changes'in geldiği kanal); istemci aynı abonelikte okur.
- **Oda sohbetinde görünürlük:** misafir masa, odaya katılmadan önceki mesajı alıntılayamaz ve ona yapılmış yanıtı `{ gone: true }` görür (mesajların kendi politikası, `guest_joined_at`).
- **Yeniden deneme:** `dm/react` ve `chat/react` `IDEMPOTENT_CALLS`'tadır. `venue-chat/react` değildir: her istek tepki sınırına sayılır, iki kez gönderilince durum (sayaç) aynı kalmaz.
- **Alıntıya dokunma:** alıntı dokunmayı alır (`ChatBubble` → `onPressQuote`, ekran okuyucuda "Yanıtlanan mesaja git"); liste alıntılanan mesaja kayar (`ChatRow` / `ChatScroll` → `jumpTo`). Mesaj yüklenmiş sayfada yoksa ya da alıntı "Mesaj artık yok" ise hiçbir şey olmaz.

---

## 22. Faz 2: Takımlar

**Onaylandı.** Proje sahiplerinin dokuz kararı önerildiği gibi onaylandı (karar belgesi: https://claude.ai/artifact/EnSwLZraAEhLkAqVDAcnDE; kararlar §22.P'de). Bu bölüm kararları şemaya, RLS'e, Edge Function'lara ve Realtime'a oturtur. Uygulama §22.N'deki sırayla yapılır; her adım kendi dalı ve PR'ıyla gelir ve "onaylandı" olmadan birleşmez. Bu bölümde olmayan bir karar gerekirse uygulama durur ve sorulur.

Alt bölümler harfle numaralanır (§22.A, §22.B…); **adım** numaraları (adım 22.1…22.6) §22.N'deki uygulama adımlarıdır.

### 22.A Amaç ve kapsam

Bugün kişi başına check-in var: her telefon mekanda kendi masa oturumunu, takma adını ve profilini taşır. Ama odada her tarafta tam bir telefon var; aynı masadaki ikinci telefon odaya giremez, oyunu ve sohbeti göremez, tanışmada kendi adına cevap veremez. Faz 2 bunu kapatır:

- Oda iki taraflı kalır (kuran taraf `owner`, katılan taraf `guest`). Her tarafa en çok **4 telefon**: lider ve en çok 3 üye.
- Masadaki herkes kendi telefonu ve kendi seçtiği katılımla (anonim ya da profilli) odaya girer, istediği an çıkar.
- Oyun ve skor tarafa bağlıdır; telefonlar gelip gitse de oyun sürer.
- Tanışma kişi başınadır; oyun geçmişi ve "Arkadaş ekle" karşı taraftaki her çift için ayrıdır.
- Mekan sohbetinde anonim ya da profilli seçimi check-in başına bir kez yapılır; "Profilimle" her yerde profil fotoğrafı ister.

**Kapsam dışı:** QR kod ve davet bağlantısı; taraf sayısını artırmak (oyunların hepsi iki tarafa kurulu); Sahtekar'da her telefonun bir koltuk olması (Faz 3); "Masanla oyna" (tek telefonlu oyunlar) değişmez.

**Native değişiklik yok:** Faz 2'nin bütün adımları JS ve sunucu değişikliğidir. `app.json` → `version` 0.3.0 kalır, istemci OTA ile gider. Bir adımda native bağımlılık gerekirse uygulama durur ve sorulur. Pilot build 0.4.0 Faz 2'den sonra alınır (`docs/PILOT_RELEASE.md`).

### 22.B Model

**Taraf, lider, üye.**

- **Lider:** tarafın bugünkü masa telefonu. `rooms.owner_session_id` ve `rooms.guest_session_id` tarafların lideridir; kayıttaki yerleri ve anlamları değişmez. `owner_alias`/`guest_alias` ve `owner_profiled`/`guest_profiled` liderin takma adı ve o odadaki seçimidir.
- **Üye:** lidere katılan telefon. Taraf başına en çok 3.
- **`room_members`:** odadaki **her** telefonun (liderler dahil) satırı: `room_id`, `session_id`, `side`, `alias`, `profiled`, `joined_at`, `left_at`. Liderin de satırı olması iki şeyi sağlar:
  - "Bir telefon aynı anda tek odadadır, lider ya da üye olarak" tek bir kısmi benzersiz indeksle veritabanında zorlanır: `unique (session_id) where left_at is null`.
  - Bir telefonun odada bulunduğu aralıklar (oyun geçmişindeki 3 dakika kuralı, §22.F) herkes için aynı yoldan hesaplanır.
  - `rooms.owner_session_id`/`guest_session_id` her zaman o tarafın `left_at is null` bir satırını gösterir. Lideri değiştiren her yol iki kaydı aynı işlemde yazar; bir entegrasyon testi her yoldan sonra bunu denetler.
- **Hesap başına tek taraf:** bir hesap bir odada yalnızca bir tarafta bulunabilir. Odadan çıkan telefon aynı odaya yeniden istek gönderebilir, ama yalnızca daha önce bulunduğu tarafa; diğer tarafa istek `wrong_side` (409) döner. Gerekçe: oyun geçmişi ve tanışma karşı taraf çiftleri üzerinden kurulur; taraf değiştiren biri eski takım arkadaşlarıyla çift olurdu.

**Tarafın kişi sayısı** = max(tarafın beyan ettiği kişi sayısı, taraftaki telefon sayısı).

- Beyan edilen sayı `rooms.owner_headcount`/`guest_headcount`'tur: tarafın ilk liderinin check-in'de beyan ettiği masa sayısı. **Liderlik devrinde değişmez:** masanın sayısını anlatır, liderin kendisini değil. Üyelerin kendi check-in sayıları kullanılmaz.
- Telefon sayısı `rooms.owner_phones`/`guest_phones`'tur (§22.H): taraftaki `left_at is null` satır sayısı.
- Kural `pure/teams.ts` → `sideHeadcount(declared, phones)`'tadır ve testlidir; SQL'deki karşılığı `private.side_headcount` bir testle aynı sonucu verir (`tabu_mode` kalıbı).
- Tabu'nun modu ve Sahtekar'ın koltukları oyun başlarken bu sayıdan belirlenir ve **oyun bitene kadar değişmez** (§22.E). Oyun kataloğunun soluk kart kuralı (`gameAvailability`, §20.1) odada iki tarafın bu sayılarının toplamını kullanır.

**Eski uygulama: takım yeteneği.** Güncellemeyen telefon yalnızca lider olarak oynar ve hiçbir şey bozulmaz. Sunucu, OTA ile değişmeyen build numarasından (`x-app-build`) eski JS'i ayırt edemez; bu yüzden yeni istemci bunu kendisi söyler:

- `checkin/check-in { …, teams: true }` → `table_sessions.team_capable = true`. Eski istemci alanı göndermez; masası `false` kalır.
- Bir tarafa üye yalnızca **iki tarafın lideri de** takım yetenekliyse katılır (açık odada yalnızca sahip). Değilse oda "Süren odalar"da görünmez, açık odada "Bu masadayım" görünmez ve istek `room_not_available` döner.
- **Ters yön:** sahibin tarafında üye bulunan açık oda, takım yeteneği olmayan masaya lobide görünmez ve o masanın "Katıl" isteği `room_not_available` döner (kabul anında da denetlenir: istek beklerken sahibin tarafına üye girdiyse kabul `room_not_available` döner). Yoksa eski istemcili masa misafir lider olarak üyeli bir odaya girer ve tanışmada sessiz tutarsızlık çıkar: karşıdaki üye eşleşmeyi görür, eski telefon "Güzel oyundu" görür.
- Böylece eski istemcili bir lider hiçbir zaman üyeli bir odada bulunmaz: oda, oyunlar, tanışma ve geçmiş onun için bugünküyle birebir aynıdır. Lider devri yalnızca üyeye, yani yeni istemciye olur.
- Bugünkü entegrasyon testleri `teams` göndermez; bu yüzden bugünkü davranışı sınar ve **değişmeden yeşil kalır** (§22.M).

### 22.C Katılma

**Lobi** iki bölümdür:

- **Açık odalar** (bugünkü gibi, karşı masa arayan): sahibin takma adı, kişi sayısı, telefon sayısı, varsa niyet ve "profilli" işareti (bugünkü kural 4). İki düğme:
  - **"Katıl"** (boş misafir tarafı): bugünkü karşı masa isteği. Kabul edilince istek sahibi misafir tarafın lideri olur.
  - **"Bu masadayım"** (sahibin tarafı): sahibin tarafına üye olarak katılma isteği. Sahip takım yetenekli değilse ya da taraf 4 telefondaysa görünmez.
- **Süren odalar** (yeni): iki taraflı, açık (`visibility = 'open'`) ve tanışma penceresinde olmayan odalar. Yalnızca iki liderin takma adı, taraf başına telefon sayısı ve taraf başına kişi sayısı görünür (karar 4); niyet, "profilli" işareti, üyelerin adları ve oyun görünmez. Her tarafın yanında "Bu masadayım"; taraf 4 telefondaysa o düğme görünmez.

Lobide bir oda şu durumlarda görünmez (iki bölüm için de): çağıranla odadaki herhangi bir telefon arasında engel varsa; oda tanışma penceresindeyse (`status = 'ending'`); odadaki bir telefon penceresi süren başka bir odadan geldiyse (`lobby_listed_from`, aşağıda "Pencere sürerken lobi"); iki liderden biri takım yetenekli değilse (yalnızca Süren odalar); sahibin tarafında üye varken çağıranın masası takım yetenekli değilse (yalnızca Açık odalar, §22.B). Kampüs noktası kuralı aynıdır: başka noktadaki odaya istek `different_spot` döner, "Bu noktadayım" yolu değişmez.

**İstek (`rooms/request-join { roomId, profiled, side? }`).**

- `side` yoksa bugünkü istektir ("Katıl", misafir tarafa lider olarak). `side: 'owner' | 'guest'` "Bu masadayım"dır: o tarafa üye olarak.
- İstek o tarafın **şu anki liderine** gider (`session:{lider}` → `join_request`, bugünkü push dahil). "Katıl"ı bugünkü gibi sahip onaylar.
- `profiled` seçimi istekle gelir, varsayılan anonim. `profiled: true` profil fotoğrafı ister (karar 8, §22.G).
- **Lider arkadaşını adından tanır (22.5'te tuvale girer):** "Bu masadayım" isteği gönderen telefon beklerken kendi takma adını büyük gösterir ve "Liderine bu adı söyle" der; liderin istek kartında aynı ad aynı büyüklükte durur. Takma adlar rastgele olduğu için lider, arkadaşının isteğini yabancınınkinden ancak böyle ayırır. Yeni veri gerekmez: ad bugün de istekte (`join_requests.requester_alias`) ve istek sahibinin kendi masasındadır.
- **"Katıl"ın `unavailable`'ı kesindir, "Bu masadayım"ınki değil:** "Katıl"a gelen `unavailable` o masa için o odada kesindir (bugünkü kural, MVP_SPEC §4.4; oda lobiden de kalkar). "Bu masadayım" yeniden gönderilebilir: lider arkadaşının isteğini 60 sn içinde görmeyebilir. İsteyen telefon da takım yetenekli olmalıdır; güncellemeyen telefon üye olamaz.
- **Red ve zaman aşımı aynıdır (kural 5):** lider reddederse ya da 60 sn cevap vermezse istek sahibi ikisini ayırt edemez; `my_join_requests` `expires_at`'e kadar `pending`, sonra `unavailable` döner (bugünkü görünüm, değişmez).
- **Sınırlar:** saatte 10 istek, "Katıl" ve "Bu masadayım" için **ortak** sayaç (`MAX_JOIN_REQUESTS_PER_HOUR`); masa başına aynı anda tek bekleyen istek (bugünkü indeks).
- İstek sahibi başka bir odadaysa `already_in_room` (bugünkü kod). Taraf doluysa, oda pencerede ya da takım yeteneksizse, engel varsa ya da oda yoksa `room_not_available` (hepsi aynı yanıt).
- Lider istek beklerken değişirse istek düşmez: yeni lider de okur ve cevaplar (RLS "tarafın lideri okur"); süresi aynıdır.

**Kabul (`rooms/respond { requestId, accept }`).**

- Yalnızca isteğin tarafının şu anki lideri cevaplar ("Katıl"da sahip); başkası `request_not_found`.
- Üye kabulünde sunucu kilit altında şunları denetler: taraf hâlâ 4'ten az telefon, oda pencerede değil, istek sahibinin masası aktif ve başka odada değil, hesap diğer tarafta bulunmamış (`wrong_side` değil), engel yok. Biri tutmazsa kabul `room_not_available` döner ve istek beklemede kalır; süresi dolunca `unavailable` olur (istek sahibi bunu da redden ayırt edemez).
- Kabul edilen telefon `room_members`'a o tarafın üyesi olarak girer, oda kanallarına abone olur, odanın sohbetini ve süren oyununu görür. Sohbeti tarafının odaya geldiği andan beri okur: sahibin tarafı baştan, misafir tarafı misafir tarafın geldiği andan (`guest_joined_at`; liderlik devrinde değişmez). İstek sahibine `session:` → `join_accepted` (bugünkü).

### 22.D Ayrılma ve liderlik devri

**Yeni eylem `rooms/leave { roomId }`** (v3 §5.5'te kalkan eylemin adı yeniden kullanılır; davranışı yenidir). Çağıran telefon odadan çıkar:

| Kim çıkar                               | Ne olur                                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Üye                                     | Yalnızca o telefon çıkar (`left_at`), oda sürer. Pencerede ise o telefonun cevabı "Hayır" olarak yazılır.                                                                                                    |
| Lider, tarafta başka telefon varken     | Liderlik o taraftaki **en eski üyeye** (en küçük `joined_at`) geçer; oyun sürer. Karşı taraf o tarafın adının değiştiğini görür.                                                                             |
| Taraftaki son telefon (lider ya da üye) | Bugünkü kural: iki taraflı odada tanışma penceresi açılır, çıkanın cevabı "Hayır"dır ve karşı taraf bunu "Hayır"dan ayırt edemez; tek taraflı (bekleyen) oda kapanır. Bugünkü masa bitişi yolunun aynısıdır. |

- **Liderlik devri:** `rooms.<taraf>_session_id`, `<taraf>_alias` ve `<taraf>_profiled` yeni liderinkine döner; `<taraf>_headcount` değişmez (§22.B). Bekleyen istekler yeni lidere geçer. Devir oyun durumunu değiştirmez; `game_state` tarafları `owner`/`guest` olarak tutar.
- **Engelleme** (`safety/block { roomId, sessionId? }`): odadaki her telefon odadaki başka bir telefonu engelleyebilir, kendi tarafından da (`sessionId` oda üyelerine görünen masa oturum id'sidir, kural 4). `sessionId` yoksa karşı tarafın lideri engellenir (eski istemcinin bugünkü çağrısı). Kimin çıkacağı engelleyene ve hedefe göredir:
  - **Lider kendi tarafındaki bir üyeyi engellerse** üye odadan çıkarılır, lider kalır (pencerede liderin kendi cevabı değişmez; takım arkadaşıyla çifti yoktur). Engel o hesabın odayı lobide görmesini ve yeniden istek göndermesini zaten keser (§22.C). Lider, yanlışlıkla onayladığı bir yabancıyı böyle çıkarır; tarafta yalnızca yabancı kalsa bile liderlik ona geçmez.
  - **Üye kimi engellerse engellesin** (kendi lideri dahil) üye çıkar.
  - **Karşı tarafı engelleyen** kim olursa olsun kendisi çıkar (bugünkü kural; kural 5'teki "Hayır").
  - Çıkan telefon için yukarıdaki tablo işler. Pencerede çıkan ya da çıkarılan telefonun cevabı "Hayır" sayılır (§22.F).
  - Engelle dışında ayrı bir "Çıkar" düğmesi yoktur.
- **Mekandan ayrılma, masa süresinin dolması:** bugünkü gibi; telefon odadan da çıkar ve tablo işler.
- **Hesap silme ve ban:** hesap silinmeden önce masa bitirilir (bugünkü `account/delete` ve `admin:delete` sırası); böylece liderlik devreder ve oda diğer telefonlar için sürer. `admin:ban` da önce aynı masa bitişi yolunu çağırır: `banUser` hesabı `deleteAccount` ile siler, o da önce `end_table_session`'ı çağırır (`scripts/admin/account.ts`; 22.2'de değişiklik gerekmedi). Masa bitmeden silinseydi `rooms.owner_session_id`'nin `on delete cascade`'i odayı herkes için silerdi.
- **Pencerede çıkış:** pencere sürerken oda satırı değişmez (kural 5): liderlik devri olmaz, telefon sayıları donar. Üyenin her çıkışı ("Odadan çık", engelleme, liderinin engellemesi, mekandan ayrılma) "Hayır"dır. Liderin kendi "Odadan çık"ı ve engellemesi de "Hayır"dır (bugünkü engelleme gibi); liderin mekandan ayrılması ya da masa süresinin dolması bugünkü gibi cevap yazmaz.
- **10 dakika hareketsizlik:** bugünkü gibi (odadaki herhangi bir telefonun eylemi etkinlik sayılır).
- **Erişim hemen kapanır:** çıkan telefonun `room_members` satırı kapanır kapanmaz `rooms`, `messages`, `game_events`, `game_proposals` okumaları ve oda kanallarının yetkisi biter (§22.I).

**Menü** (görünüm tasarım oturumunda):

- Üye: "Odadan çık", "Şikayet et", "Engelle".
- Lider: "Odayı bitir" (bugünkü gibi; iki tarafın bütün telefonları için pencereyi açar), "Şikayet et", "Engelle"; tarafında başka telefon varken ayrıca "Odadan çık" (liderliği devreder).
- **`rooms/end` yalnızca liderdir;** üyeden gelirse `not_leader` (403). Tek telefonlu taraf için "Odadan çık" yoktur: orada çıkmak "Odayı bitir" ile aynı sonucu verir (v3'ün tek çıkış kuralı).

### 22.E Oyunlar: yetki ve gizli bilgi

Oyun kuralları değişmez; değişen, hangi telefonun basabildiği ve gizli bilginin hangi telefona gittiğidir. Bugün "masa" denen her yetki Faz 2'de **tarafa** aittir: o taraftaki her telefon kullanabilir.

**Temel kurallar.**

- **Anlatıcı telefon:** turu başlatan telefon o turun anlatıcısıdır. Anlatan taraftan bir telefon "Başla"ya basınca (`tabu/begin-turn`, `ibre/begin`) sunucu o telefonu anlatıcı yazar: Tabu'da `tabu_turns.describer_session_id` (kolon var; bugün anlatan masanın oturumu, artık basan telefon), İbre'de `game_secrets` ve `game_state.describer`. Hazır süresi dolup tur kendiliğinden başlarsa (karşı taraf ya da zamanlayıcı çağırır) anlatıcı o anki anlatan tarafın lideridir.
- `game_state.describer` anlatıcının masa oturum id'sidir (kural 4: oda üyelerine gidebilir); telefonlar kimin anlattığını buradan bilir.
- **Telefonu olmayan kişi** anlatıcı olacaksa bugünkü gibi bir telefonu eline alır.
- **İlk gelen geçer:** iki telefon aynı eyleme basarsa sunucu oda satırını kilitler, ilkini uygular, ikincisini yok sayar (`{ ok: true }`, oda değişmez). Her eylem bugünkü gibi bir tur ve adım (ya da kart) indeksine bağlıdır.
- **Yetki hataları bugünkü kodlardır:** anlatıcı olmayan telefonun anlatıcı eylemi `not_describer`, karşı tarafın eylemi `not_judge`, Sahtekar'da liderden başka telefonun koltuk eylemi `not_your_seat`.

| Oyun                         | Turu kim başlatır                                     | Kim basar                                                                                                                                                                     | Gizli bilgi kime gider                                                                                   |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Sesli Tabu, hakemli          | Anlatan taraftaki herhangi bir telefon; anlatıcı olur | Doğru: iki tarafın her telefonu. Tabu: hakem tarafın her telefonu. Pas: yalnızca anlatıcı                                                                                     | Kart (`tabu/turn-cards`): anlatıcı ve hakem tarafın bütün telefonları; takım arkadaşları `not_describer` |
| Sesli Tabu, iş birliği       | Aynı                                                  | Doğru, Tabu, Pas: yalnızca anlatıcı                                                                                                                                           | Kart yalnızca anlatıcıya                                                                                 |
| İbre                         | Anlatan taraftaki herhangi bir telefon; anlatıcı olur | Kilit (`ibre/lock`): anlatan tarafın anlatıcı dışındaki telefonları, ilk gelen geçer; taraf tek telefonsa anlatıcı. Solunda/Sağında (`ibre/side`): karşı tarafın her telefonu | Hedef (`ibre/target`) yalnızca anlatıcıya                                                                |
| Harf Kapmaca, Şarkıda Geçsin | Sırası gelen taraftaki herhangi bir telefon           | Harf (`harf/claim`) ve Söyledik (`sarki/said`): sırası gelen tarafın her telefonu. İtiraz (`*/object`): karşı tarafın her telefonu; hak taraf başına                          | Yok                                                                                                      |
| Sahtekar                     | Bugünkü gibi                                          | Koltuk eylemleri (`view`, `said`, `vote`, `options`, `guess`) yalnızca tarafın **liderinin** telefonundan; koltuklar o telefonda dolaşır, üyeler izler                        | Kartlar yalnızca liderin telefonunda, koltuk koltuk                                                      |
| Sohbet kartları              | —                                                     | Sonraki kart (`sohbet/next-card`): her telefon                                                                                                                                | Yok                                                                                                      |

- **Öneri ve kabul:** taraftaki her telefon önerebilir (`rooms/propose-game`) ve karşı taraftaki her telefon cevaplayabilir (`rooms/answer-game`); önerenin takım arkadaşları cevaplayamaz (`no_proposal`). Odada yine tek oyun ve tek öneri olur; öneri tarafa aittir (`game_proposals.proposer_side`), öneren telefon çıksa da geçerli kalır.
- **"Oyunu bitir"** (`rooms/end-game`) ve rövanş: her telefon (bugün iki masa da basabiliyor).
- **Hazır süresi** (`*/advance`, `tabu/end-turn`): bugünkü gibi herhangi bir telefon; sunucu süreyi denetler.
- **Tek masalı oyun** (misafir tarafı yokken odadaki "Masanla oyna", `<oyun>/start`): bugün masanın yetkisidir, artık sahibin tarafının; desteyi o taraftaki her telefon alabilir ve oyun o telefonda oynanır.

**Oyun ortasında telefon gelir ya da giderse.**

- **Mod ve koltuklar donar:** Tabu modu (`game_state.mode`) ve Sahtekar koltukları (`game_state.players`, `seats`) oyun başlarken iki tarafın kişi sayısından hesaplanır ve oyun bitene kadar değişmez. Oyun ortasında gelen üye, tarafın sayısını yalnızca bir sonraki oyun için artırır. Gerekçe: skor karşılaştırılabilir kalır (§6.1'in gerekçesi) ve Sahtekar'da kelime dağıtılmış koltuk sayısı değişemez.
- Sahtekar'da koltuk sayısının varsayılanı tarafın kişi sayısıdır, en çok 4 (bugün masanın check-in sayısı, en çok 4). İstemci sayı göndermezse iki tarafın sayısı da kabul anında, yani oyun başlarken hesaplanır; `game_proposals.proposer_players` yalnızca öneren telefonun verdiği sayıdır, vermediyse boştur.
- **Yeni gelen telefon hemen oynar:** gizli bilgisi olmayan oyunlarda (Harf, Şarkı, Sohbet) ve kendi tarafının yetkisiyle (Doğru, Tabu, kilit, Solunda/Sağında, itiraz) katıldığı andan itibaren basabilir. Hakem tarafa gelen telefon süren turun kartını `turn-cards` ile alır; anlatan tarafa gelen almaz.
- **İbre'de kilit yetkisi tur başında donar:** `ibre/begin` anında anlatan tarafta tek telefon varsa kilidi anlatıcı, birden fazla varsa anlatıcı dışındakiler basar (`game_state.lockBy: 'describer' | 'team'`). Turda takım arkadaşlarının hepsi çıkarsa anlatıcı da kilitleyebilir; kilitlenmezse süre sonunda bugünkü otomatik kilit işler.
- **Anlatıcı turda çıkarsa** tur süresi dolana kadar sürer; o turda anlatıcıya özgü eylemleri (Pas; iş birliğinde üç eylem) kimse basamaz, gizli bilgi kimseye yeniden verilmez. Sonraki turu taraftaki herhangi bir telefon başlatır. Hesabını silen anlatıcı da turu silmez: `tabu_turns.describer_session_id` boşalır (`on delete set null`) ve tur süresi dolana kadar sürer.
- **Lider Sahtekar sırasında çıkarsa** koltuk eylemleri yeni liderin telefonuna geçer; görülen koltuklar sunucuda sayılı olduğu için kaldığı yerden sürer (görmeyen koltuk kuralı §20.2 aynıdır).

**Sonuç ve rozetler.** İki taraflı oyun bitince `game_results`'a bir telefonun hesabı için satır yalnızca o telefon **oyun başladığında da odadaysa ve oyun bittiğinde odada bulunuyorsa** yazılır; puan ve kazanma tarafındır. Oyun ortasında giren telefon satır almaz: son saniyede girip oyun sayısı ve galibiyet rozeti toplanamaz. Sunucu oyunun başladığı anı `rooms.game_started_at`'e yazar; `room_members` aralıkları o anda odada olanı gösterir. Başlangıç anı `game_state`'te değil bu kolondadır (22.3 PR'ında belgeden sapma): bugünkü bir entegrasyon testi Tabu'nun `game_state` anahtarlarını birebir sabitler ve mevcut testler değişmez (§22.M). Oyun sayısı ve Sesli Tabu galibiyeti rozetleri buradan sayılır (bugün yalnızca iki masanın hesabı).

**Gizli bilgi denetimi (kural 4 ve 3).** Kart, kelime, hedef ve sahtekar bilgisi `rooms.game_state`'te, `game_events`'te ve hiçbir Realtime yükünde yoktur (değişmez). Yanıtla giden gizli bilgi yalnızca tablodaki telefonlara gider; entegrasyon testi anlatıcının takım arkadaşının, iş birliğinde karşı tarafın ve Sahtekar'da üyenin hiçbir yanıtta gizli bilgi almadığını denetler.

### 22.F Tanışma, arkadaşlık ve oyun geçmişi

**Kişi başına cevap.** Pencere açılınca odadaki her telefon "Tanışalım mı?"yı kendi adına cevaplar (`reveal/decide { roomId, wantsMeet }`; `reveal_decisions` zaten `(room_id, session_id)` anahtarlıdır). Cevap verilince değişmez (bugünkü gibi).

- **Pencerenin katılımcıları:** pencere açıldığı anda odada bulunan telefonlar ve pencereyi açan çıkış yaptıysa o telefon (cevabı "Hayır").
- **Pencere ne zaman açılır:** lider "Odayı bitir"e basınca, bir taraftaki son telefon çıkınca (çıkış, engelleme, mekandan ayrılma, masa süresi) ya da 10 dakika hareketsizlikte (bugünkü yollar).
- **Pencerede çıkış:** üye çıkarsa, engellerse ya da lideri onu engelleyip çıkarırsa cevabı "Hayır" yazılır (önceden "Evet" dediyse "Hayır"a döner, bugünkü engelleme kuralı); ama **zaten gösterilmiş bir eşleşme geri alınmaz**. Engel bundan sonraki arkadaşlık isteğini ve "Arkadaş ekle"yi bugünkü gibi sessizce yutar.
- Pencerede yeni istek ve katılma yoktur; bekleyen istekler süresi dolunca `unavailable` olur.

**Eşleşme.** Karşı taraflardan iki telefonun ikisi de "Evet" dediğinde o çift eşleşir.

- **Hemen ve yalnızca o ikisine görünür:** ikinci "Evet" geldiği anda sunucu iki telefonun `session:` kanalına veri içermeyen `reveal_match` yayını yapar. Telefon `reveal/matches { roomId }` ile kendi eşleşmelerini okur: her eşleşen telefon için masa oturum id'si, takma adı ve profilliyse profili (görünen ad, yaş, imzalı fotoğraf). Yanıt, en az bir eşleşmesi olan telefona sinyali taşır:
  - **Oda başına tek renk:** masalar birbirini bulsun diye.
  - **Her eşleşen çifte ayrı emoji:** kişiler birbirini bulsun diye. Çiftin iki telefonu aynı emojiyi görür; aynı odadaki farklı çiftlerin emojisi farklıdır (16 çift için `REVEAL_EMOJIS` en az 16 emojiye çıkar, 22.4).
  - Eşleşmesi olan telefon "Ekranını kaldır, eşleştiğini bul." (birden çok eşleşmede "Ekranını kaldır, eşleştiklerini bul.") ile rengi tam ekran gösterir, altında liste: her satırda çiftin emojisi ve eşleştiği kişinin takma adı ya da profili. Ekran bölünmez.
- Renk pencere açılırken, her çiftin emojisi eşleşme anında seçilir; ikisi de sunucuda kalır (`reveal_signals`, §22.H). `rooms` satırına yazılmaz, çünkü o satırı odadaki herkes okur.
- **Geri kalan her şey pencere bitince:** hayır, cevapsız, ayrılma ve engelleme yalnızca `reveal_ends_at`'te açıklanır. O ana kadar "Evet" diyen telefon bunları birbirinden ve henüz cevap vermemekten ayırt edemez: `rooms` satırı, `room_phones`, telefon sayıları, presence, kanal olayları, `reveal/matches` yanıtı ve zamanlama aynıdır (kural 5, çift başına).
- **Pencere sonunda** `reveal/matches` eşleşmeyen karşı taraf telefonlarını tek bir sonuçla ("eşleşmedi"; neden yok) ekler; eşleşmesi olmayan telefon bugünkü "Güzel oyundu"yu görür.
- **Erken kapanma:** pencerenin bütün katılımcıları "Evet" dediyse oda hemen kapanır; `rooms.reveal_result = 'mutual'`. `rooms.reveal_token` yalnızca pencerede iki telefon varken (bugünkü iki masa) yazılır ve oda rengiyle çiftin emojisini taşır; böylece iki telefonlu odada bu bugünkü davranışın aynısıdır. Daha kalabalık odada `reveal_token` boş kalır, sinyal yalnızca `reveal/matches`'tedir (eski istemci böyle bir odada bulunmaz, §22.B). Diğer her durumda oda `reveal_ends_at`'te `reveal_result = 'none'` ile kapanır; eşleşmeler yalnızca `reveal/matches`'tedir.
- **Pencere sürerken lobi:** pencerenin herhangi bir katılımcısının açtığı yeni oda ya da gönderdiği istek, bugünkü `lobby_listed_from` kuralıyla `reveal_ends_at`'e kadar lobide görünmez ve lobi yayını üretmez (bugün iki masa için; artık bütün katılımcılar için).
- **Takım arkadaşları** arasında tanışma yoktur: aynı taraftaki iki telefon eşleşmez ve birbirinin cevabını görmez.

**Oyun geçmişi çift başına.**

- Karşı taraflardaki her iki telefonun hesabı bir **çift**tir; bir oda en çok 4 × 4 = 16 çift, 32 kayıt.
- Çiftin odada birlikte geçirdiği süre, iki telefonun `room_members` aralıklarının kesişimidir (yeniden katılma dahil, toplanır). **3 dakika kuralı çift başınadır:** kesişimi 3 dakikadan kısa olan çifte kayıt yazılmaz.
- **Ne zaman yazılır:** oda iki taraflıyken bir telefon çıkınca, o telefonun karşı taraftaki telefonlarla çiftleri (`available_at = now()`); pencere açılınca, katılımcıların çiftleri (`available_at = reveal_ends_at`). Bir çift için tek kayıt; yazılmış kayıt sonradan değişmez (`on conflict do nothing`), yalnızca eşleşme onu açar.
- **Eşleşen çiftin** iki kaydı eşleşme anında `reveal_mutual = true` ve `available_at = now()` olur (bugün iki masanın kaydı "karşılıklı" sonuçta böyle açılıyor).
- **`encounter_id` çift karşılaşmasıdır:** her çift kendi `encounter_id`'sini alır. Böylece `unique (user_id, encounter_id)` anlamı değişerek korunur ve onun üstüne kurulu her şey (`mutual_friend_intents` anahtarı, `friend_requests.encounter_id`, `my_*_requests` birleşimleri) çift başına doğru çalışır. Gerekçe: oda düzeyinde tek `encounter_id` tutulsaydı bir hesabın aynı karşılaşmada 4 kaydı olurdu ve bu birleşimlerin hepsi satır çoğaltırdı.
- Kayıttaki `other_alias` ve `other_profiled` çiftteki karşı telefonun, `own_alias` kendisinin, `other_headcount` karşı tarafın kişi sayısıdır.
- **Bugünkü tetikleyici** (`private.on_room_encounter`) yerini bu kurallarla yazan `private.write_pair_history(room_id, session_id?)` fonksiyonuna bırakır; çağrıyı çıkış, pencere açılışı ve eşleşme yolları yapar. İki telefonlu odada sonuç bugünkünün aynısıdır: aynı iki kayıt, aynı `available_at`.

**Arkadaşlık çift başına.** İstek (`friends/request { historyId }`), "Arkadaş ekle" (`friends/add-from-room { historyId }`), engelleme ve şikayet bugünkü gibi oyun geçmişi kaydından yapılır; kayıt artık bir çifttir. Eşleşen çiftte ikisi de "Arkadaş ekle"ye basarsa arkadaş olurlar; yalnızca biri basarsa hiçbir şey olmaz ve karşı taraf bunu görmez (değişmez). Takım arkadaşları arasında kayıt olmadığı için bu yollar da yoktur.

**Uygulama notları (22.4 PR'ı).**

- **Katılımcılar** `room_members` aralıklarından bulunur: pencerenin açıldığı anı (`reveal_signals.created_at`) kapsayan aralığı olan her telefon (`private.reveal_participants`). Pencereyi çıkarak açan telefonun satırı o anda kapandığı için o da katılımcıdır.
- **`reveal/matches` yanıtı:** `{ color, matches, unmatched }`. `color` yalnızca en az bir eşleşme varken dolar. `matches` her eşleşme için masa oturum id'si, takma ad, emoji ve profilliyse profil (görünen ad, yaş, imzalı fotoğraf; `public_id` yok); profil yalnızca `reveal_ends_at`'ten önce gelir (aşağıda). `unmatched` pencere sürerken `null`, `reveal_ends_at`'ten sonra eşleşmeyen karşı taraf telefonları (yalnızca masa oturum id'si ve takma ad). Katılımcı olmayan telefon `not_in_room` alır.
- **Gösterilmiş eşleşme geri alınmaz:** sonradan gelen engel ya da çıkış eşleşmeyi ve pencere içinde profilini `reveal/matches`'ten kaldırmaz; kaldırsaydı "Evet" diyen telefon engeli zamanlamadan ayırt ederdi (kural 5).
- **Eşleşmenin profili yalnızca `reveal_ends_at`'ten önce gelir** (kural 4: profil yalnızca oda sürerken gider): görünen ad, yaş ve yeni imzalı fotoğraf pencere içindeki yanıtlardadır; herkes "Evet" deyip oda erken kapansa da `reveal_ends_at`'e kadar gelir. Sonrasında eşleşme yalnızca masa oturum id'si, takma ad ve emojiyle döner, fotoğraf imzalanmaz; engel olsa da olmasa da herkes için aynı. **İstemci eşleşmenin profilini pencere içindeki yanıttan tutar; pencere sonundaki yanıtta profil yoktur** (22.5 buna göre yapılır).
- **`room_member_profiles` pencerede** katılımcıların listesini döner ve engele bakmaz: çıkan ya da engelleyen profilli telefon `reveal_ends_at`'e kadar listede kalır (kural 5). Oda sürerken (`waiting`, `active`) odadaki açık satırlar ve engel süzgeci. Eski `room_member_profile` eski istemci için kalır.
- **"Evet" deyip mekandan ayrılan lider:** cevabı durur ve eşleşebilir (bugünkü iki masalı davranışın aynısı); "Hayır" yalnızca odadan çıkış ve engellemede yazılır (§22.D).
- **`reveal/finalize`** her katılımcıdan çağrılabilir (bugün yalnızca iki lider); davranışı değişmez.
- **`reveal_decide`'nin `token` parametresi** artık kullanılmaz: renk ve emojiyi sunucu `private.reveal_colors()` ve `private.reveal_emojis()`'ten (`pure/reveal.ts` ile aynı listeler, testli) seçer. Parametre yalnızca migration ile fonksiyon yayını arasındaki kısa sürede eski çağrı çözülsün diye durur.
- **Bir çift için tek kayıt:** `play_history` üzerinde `unique (room_id, user_id, other_user_id)`; çıkışta yazılan çift pencerede yeniden yazılmaz. `other_headcount` karşı tarafın kişi sayısıdır (`side_headcount`).
- **İki tarafın ilk telefonları** `rooms.guest_joined_at`'ten (tarafların buluştuğu an) sayılır: misafirin ilk satırı o anda yazılır, sahibin ilk satırı ondan eskidir, yani üretimde hiçbir şey değişmez; iki telefonlu odanın 3 dakika kuralı bugünkü gibi `guest_joined_at`'ten ölçülür ve bugünkü testler (karşılaşmayı `guest_joined_at` ile eskiten `friends.test.ts`) değişmeden geçer.

### 22.G Mekan sohbeti ve "Profilimle" (kararlar 7 ve 8)

**Karar 7: mekan sohbetinde seçim check-in başına bir kez.**

- **Seçim anı (önerim): mekan sohbetinde ilk mesajı gönderirken.** Check-in akışına adım eklenmez; sohbeti hiç kullanmayan kimse seçim yapmaz. Telefon ilk "Gönder"de tek seferlik bir seçim gösterir: "Bu check-in boyunca mekan sohbetinde nasıl görüneceksin?" Anonim / Profilimle. Seçim mesajla birlikte gider; ekranda değiştirme anahtarı yoktur, yalnızca seçilen biçim yazar ("Profilinle yazıyorsun" ya da "Anonim yazıyorsun").
- **Sunucu:** `table_sessions.venue_chat_profiled boolean null` (null = seçilmedi). `venue-chat/send { profiled }`: kolon boşsa yazar (kilit altında, aynı işlemde); doluysa ve gelen değer farklıysa `venue_chat_mode_locked` (409), mesaj yazılmaz. Sunucu sessizce düzeltmez: eski istemcinin anahtarıyla anonim sandığı bir mesajın profilli gitmesi gizlilik hatası olurdu.
- `venue-chat/page` yanıtı `mode: 'anonymous' | 'profiled' | null` taşır; telefon seçimi ve yazı biçimini buradan bilir.
- Seçim yeni check-in'de sıfırlanır (yeni masa oturumu). Gerekçe (karar belgesi): aynı kişi ikisini birden kullanınca anonimlik zamanlamayla delinir; anonim tacizin arkasına saklanmak da zorlaşır.

**Karar 8: "Profilimle" için profil fotoğrafı şart.**

- Oda kurarken (`rooms/create { profiled: true }`), katılma isteğinde ve "Bu masadayım"da (`rooms/request-join { profiled: true }`) ve mekan sohbetindeki ilk profilli seçimde sunucu fotoğrafa bakar: `profiles.photo_path` dolu ve `photo_hidden_at` boş olmalı. Değilse `photo_required` (409).
- Yalnızca var mı yok mu bakılır; yüz kontrolü yok. Gizlenmiş fotoğraf yok sayılır, çünkü karşı tarafa gösterilmez.
- Fotoğraf odadayken silinirse ya da gizlenirse o odanın profilli işareti kalır; şart yalnızca seçim anında denetlenir.
- İstemci fotoğrafsız hesapta "Profilimle"yi seçilemez gösterir ve neden olduğunu söyler; seçimi tasarım oturumunun tuvaline göre kurulur.

**Karar 9: oda başlığı.** Oda başlığı karşı tarafın liderinin takma adıyla kalır ("<ad> ile", #90'daki `rooms.withOther`); altında karşı tarafın telefon sayısı. Başlık iki satırı aşmaz (`ChatTopBar` → `titleLines`). Liderlik devrinde başlık yeni liderin adına döner.

**Odada adlar ve profiller (kural 4).** Her telefon odada kendi takma adıyla görünür; takma adlar ve profilli telefonların profili oda sürerken odanın **iki tarafındaki** bütün telefonlara gider (karar belgesindeki görünürlük tablosu). Lobideki diğer masalar yalnızca liderin takma adını ve sayıları görür. Oda sohbetinde mesaj göndericisinin takma adıyla durur (bugünkü gibi). `room_member_profile(room_id)` yerine `room_member_profiles(room_id)`: odadaki, çağıran dışındaki her profilli telefon için masa oturum id'si ve `public_id` (oda sürerken; bugünkü kural). Profil bugünkü gibi `profile/get { publicId }` ile açılır.

### 22.H Veri modeli ve migration planı

Eski migration'lara dokunulmaz; her adım kendi migration'ını getirir, tablo ve politikaları aynı migration'dadır (kural 2), her migration'dan sonra `pnpm gen:types`.

| Migration               | İçerik                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Adım |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `…_venue_chat_mode.sql` | `table_sessions.venue_chat_profiled`; mekan sohbeti gönderiminde seçim kilidi; `venue_chat_page_for` + `mode`                                                                                                                                                                                                                                                                                                                                                            | 22.1 |
| `…_teams.sql`           | `room_members` (politikaları ve açık odaların liderleri için doldurma), `table_sessions.team_capable`, `rooms.owner_phones`/`guest_phones`, `join_requests.side`/`as_member`, `private.side_headcount`, `private.is_room_member` ve `private.realtime_topic_allowed` (üyeler; pencerede presence yok), `room_phones`, `venue_lobby` (tarafın kişi sayısı, filtreler) ve `venue_lobby_phones`, `venue_running_rooms`, katılma, çıkış, devir, `lobby_listed_from` (üyeler) | 22.2 |
| `…_team_games.sql`      | `game_proposals.proposer_side`, `rooms.game_started_at`, oyun fonksiyonlarında taraf yetkisi ve anlatıcı telefon, mod ve koltuklarda `side_headcount`, `game_results` telefon başına (oyunun başında ve sonunda odada olanlar)                                                                                                                                                                                                                                           | 22.3 |
| `…_team_reveal.sql`     | `reveal_signals`, kişi başına karar ve eşleşme, `private.write_pair_history` (`on_room_encounter` tetikleyicisinin yerine), `room_member_profiles`                                                                                                                                                                                                                                                                                                                       | 22.4 |

**Değişen tablolar.**

```
table_sessions   + team_capable boolean not null default false     (check-in'de teams: true; 22.2)
                 + venue_chat_profiled boolean null                (null = seçilmedi; 22.1)
rooms            ~ owner_session_id / guest_session_id             (tarafın lideri; devirde değişir)
                 ~ owner_alias, guest_alias, owner_profiled, guest_profiled  (liderin; devirde değişir)
                 ~ owner_headcount / guest_headcount               (tarafın beyanı; devirde değişmez)
                 + owner_phones smallint not null default 1
                 + guest_phones smallint null                      (misafir tarafı yokken null)
                 + game_started_at timestamptz null                (iki taraflı oyunun başladığı an; 22.3)
join_requests    + side text not null default 'guest' check (side in ('owner', 'guest'))
                 + as_member boolean not null default false        (false = "Katıl", true = "Bu masadayım")
game_proposals   + proposer_side text check (proposer_side in ('owner', 'guest'))   (22.3; eski satırlar doldurulur)
                 ~ proposer_players                                (önerenin verdiği sayı ya da null; 22.3)
tabu_turns       ~ describer_session_id                            (turu başlatan telefon; null olabilir, on delete set null; 22.3)
play_history     ~ encounter_id                                    (çift karşılaşması; unique (user_id, encounter_id) korunur)
                 + unique (room_id, user_id, other_user_id)        (oda başına çift başına tek kayıt; 22.4)
```

- `rooms.*_phones` lobi ve oda ekranındaki telefon sayısıdır; taraftaki `left_at is null` satır sayısıyla aynı işlemde güncellenir. **Pencerede donar:** `status = 'ending'` iken çıkış sayıyı değiştirmez (kural 5); oda kapanınca anlamı kalmaz. Sayı değişince `rooms` satırı değiştiği için oda kanalındaki telefonlar `room_phones`'u yeniden okur.

**Yeni tablolar.**

```
room_members     id pk, room_id → rooms on delete cascade,
                 session_id → table_sessions on delete cascade,
                 side text not null check (side in ('owner', 'guest')),
                 alias text not null, profiled boolean not null default false,
                 joined_at timestamptz not null default now(), left_at timestamptz null
                 unique index (session_id) where left_at is null       (telefon başına tek oda)
                 index (room_id, side) where left_at is null
reveal_signals   room_id pk → rooms on delete cascade, color text not null,
                 pair_emojis jsonb not null default '{}'   (çift → emoji; anahtar çiftin iki masa
                                                          oturum id'si, sıralı; odada her emoji bir kez)
                 created_at
                 (sunucu; politika yok)
```

- `room_members`'ta hesap kimliği yoktur; hesap `table_sessions` üzerinden yalnızca sunucuda bulunur.
- Açık odaların (`status <> 'closed'`) liderleri için migration satır ekler (`joined_at` = sahipte `created_at`, misafirde `guest_joined_at`). Eski odalar ve satırlar değişmez.

### 22.I RLS ve Realtime

**Okumalar.**

| Tablo / RPC                                          | İstemci okuması                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room_members`                                       | Yok. `room_phones(room_id)` ile                                                                                                                                                                                                          |
| `room_phones(room_id)` (yeni)                        | Odadaki telefonlar: masa oturum id'si, taraf, takma ad, `profiled`, lider mi, `joined_at`. Yalnızca odada bulunan telefona döner. Pencerede, pencerenin açıldığı andaki listeyi döner (sonradan çıkan da listede kalır; kural 5)         |
| `rooms`, `messages`, `game_events`, `game_proposals` | Odanın liderleri ve odada bulunan üyeler (`private.is_room_member`)                                                                                                                                                                      |
| `join_requests`                                      | İsteğin onaylayıcısı: "Bu masadayım"da o tarafın lideri, "Katıl"da sahip. İstek sahibi bugünkü gibi yalnızca `my_join_requests`                                                                                                          |
| `reveal_decisions`                                   | Kendi cevabı (değişmez)                                                                                                                                                                                                                  |
| `reveal_signals`                                     | Yok (sunucu)                                                                                                                                                                                                                             |
| `venue_running_rooms(venue_id)` (yeni)               | Süren odalar: oda id, iki liderin takma adı, taraf başına telefon ve kişi sayısı, taraf başına "Bu masadayım" açık mı ve odanın noktası (`spot_id`, `spot_name`; `venue_lobby`'deki gibi mekan verisi). Profil, niyet, üye adı, oyun yok |
| `venue_lobby(venue_id)`                              | Kolonları değişmez (bugünkü testler kolon listesini denetler); `headcount` tarafın kişi sayısıdır. Sahibin telefon sayısı ve "Bu masadayım" açık mı `venue_lobby_phones(venue_id)` (yeni) ile, oda başına                                |
| `room_member_profiles(room_id)` (yeni)               | Odadaki diğer profilli telefonlar: masa oturum id'si ve `public_id`, oda sürerken                                                                                                                                                        |

Hepsi security definer, yalnızca okur, `set search_path = ''` (kural 1). Genel testler yeni RPC'lerin hesap id'si ve oda dışına `public_id` döndürmediğini doğrular.

**Realtime (kural 9).**

| Topic                                | Kim abone olur                                                  | Kim yayın yapar   | Değişen                                                      |
| ------------------------------------ | --------------------------------------------------------------- | ----------------- | ------------------------------------------------------------ |
| `room:` `messages:` `game:{room_id}` | İki tarafın lideri ve odada bulunan üyeler (`left_at is null`)  | Sunucu            | Üyeler eklenir; çıkan telefonun yetkisi hemen biter          |
| `presence:{room_id}`                 | Aynı; **pencerede kimse** (`status = 'ending'` iken reddedilir) | Üyeler (presence) | Anahtar taraf adıdır (`owner`/`guest`), oturum id'si değil   |
| `session:{session_id}`               | O masa (değişmez)                                               | Sunucu            | + `reveal_match` (veri yok); `join_request` tarafın liderine |
| `venue:{venue_id}`                   | Değişmez                                                        | Sunucu            | `lobby_changed` süren odalar için de                         |

- Presence pencerede kapalıdır, çünkü penceredeki bir telefonun ayrılması presence'tan görünürdü (kural 5). İstemci pencere açılınca presence'tan çıkar; politika ayrıca reddeder.
- `room_members` Realtime yayınına (`supabase_realtime`) eklenmez: satır değişiklikleri doğrudan gitmez, telefonlar `rooms` değişikliğinde `room_phones`'u okur.
- Yeni kanal türü yoktur.

**Ölçüm (Faz 2'de değiştirilmez, izlenir).** Oda bugün Postgres Changes kullanıyor: her `rooms` değişikliği her abone için ayrı yetki kontrolüyle iletilir ve her telefon oda durumunu 4 sn'de bir yokluyor (`ROOM_CHECK_SECONDS`; oda denetimi ve öneri, iki sorgu). 8 telefonlu odada abone ve yetki kontrolü 4 katına çıkar. Faz 2 bunu değiştirmez; adım 22.6'da şunlar ölçülür:

- **Gecikme:** `pnpm latency`'ye oda adımı eklenir: bir oyun eyleminin yanıtından `rooms` değişikliğinin her telefona varışına kadar geçen süre, 2, 4 ve 8 telefonla (botlar), medyan ve p90.
- **Panel (dev, saha testi günü):** Realtime → Reports'ta günlük mesaj sayısı ve aynı anda bağlantı zirvesi; Database → Query Performance'ta `private.is_room_member` ve `private.realtime_topic_allowed`'ın toplam süredeki payı ve yoklama sorgularının çağrı sayısı.
- **Eşik ve sonraki adım:** 8 telefonda p90 gecikme 1 sn'yi geçerse, aylık mesaj tahmini Pro kotasının (5 milyon) yarısını aşarsa ya da iki fonksiyonun payı veritabanı süresinin %20'sini aşarsa oda kanalı veri içermeyen sunucu yayınına geçer (mekan sohbetindeki `venue_chat` kalıbı: `room_changed` yayını, telefon satırı okur) ve yoklama aralığı uzatılır. %20 eşiği `scripts/latency/room-load.sql`'deki Grup 1 (Postgres Changes) ve Grup 2 (`realtime.messages`: kanal yetkisi ve yayın) toplamına uygulanır. Bu toplam, iki fonksiyonun payının üst sınırıdır ve eşik aşılınca yapılacak iş tam bu iki grubu azaltır, yani doğru sinyaldir. Bu ayrı bir PR'dır ve önce spec'e yazılır; Faz 2'ye girmez.
- **Hazırlık (22.6):** nasıl ölçüleceği ve kayıt tablosu `docs/ROOM_LOAD.md`'de; gecikme `pnpm latency` oda adımıyla (`STEPS=room`, `ROOM_PHONES`), panel sayıları `scripts/latency/room-load.sql` ile. İki fonksiyon politikaların içinde çalıştığı için Query Performance'ta kendi satırları yoktur; payları, onları çalıştıran sorgu gruplarından (Postgres Changes ve `realtime.messages`) üst sınır olarak okunur.

### 22.J API (Edge Function'lar)

| Fonksiyon        | Değişen                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Adım      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `venue-chat`     | `send`: ilk mesaj seçimi kilitler, farklı seçim `venue_chat_mode_locked`, profilli seçim `photo_required`; `page`: + `mode`                                                                                                                                                                                                                                                                                                                                             | 22.1      |
| `rooms`          | `create`, `request-join`: `profiled: true` → `photo_required`                                                                                                                                                                                                                                                                                                                                                                                                           | 22.1      |
| `checkin`        | `check-in { …, teams? }` → `team_capable`; `leave` ve masa bitişi oda çıkış yolunu kullanır (devir dahil)                                                                                                                                                                                                                                                                                                                                                               | 22.2      |
| `rooms`          | `request-join { roomId, profiled, side? }` (`wrong_side`); `respond` (tarafın lideri, `room_not_available`); **`leave { roomId }`** (yeni); `end` yalnızca lider (`not_leader`)                                                                                                                                                                                                                                                                                         | 22.2      |
| `safety`         | `block { roomId, sessionId? }` (kim çıkar: §22.D; lider kendi üyesini engellerse üye çıkar); `report { target: 'room', roomId, sessionId? }`: şikayet edilen hesap adı verilen telefonun (odadaki ya da odada bulunmuş herhangi bir telefon, kendi tarafı dahil; kendisi ve odaya hiç girmemiş telefon `not_found`), `sessionId` yoksa karşı tarafın lideri (eski istemci yalnızca üyesiz odada bulunur); kopya değişmez, odadaki bütün telefonların mesajlarını içerir | 22.2      |
| `account`        | `delete` değişmez (önce masa bitişi); `admin:ban` önce masa bitişi yolunu çağırır                                                                                                                                                                                                                                                                                                                                                                                       | 22.2      |
| `rooms`          | `propose-game` ve `answer-game` tarafa göre; `end-game` her telefon                                                                                                                                                                                                                                                                                                                                                                                                     | 22.3      |
| `tabu`           | `begin-turn` anlatıcıyı yazar; `turn-cards` anlatıcıya ve (hakemlide) hakem tarafa; `mark` §22.E tablosuna göre                                                                                                                                                                                                                                                                                                                                                         | 22.3      |
| `ibre`           | `begin` anlatıcıyı ve `lockBy`'ı yazar; `target` yalnızca anlatıcı; `lock`, `side` tarafa göre                                                                                                                                                                                                                                                                                                                                                                          | 22.3      |
| `harf`, `sarki`  | `begin`, `claim`/`said` sırası gelen taraf; `object` karşı taraf                                                                                                                                                                                                                                                                                                                                                                                                        | 22.3      |
| `sahtekar`       | Koltuk eylemleri yalnızca tarafın lideri; koltuk sayısı tarafın kişi sayısından (en çok 4)                                                                                                                                                                                                                                                                                                                                                                              | 22.3      |
| `sohbet`, `chat` | Her telefon (`is_room_member`)                                                                                                                                                                                                                                                                                                                                                                                                                                          | 22.2–22.3 |
| `reveal`         | `decide` telefon başına, eşleşmede `reveal_match`; **`matches { roomId }`** (yeni: oda rengi; her eşleşme için emoji, takma ad ve profilliyse imzalı fotoğraflı profil; pencere sonunda eşleşmeyenler); `finalize` değişmez                                                                                                                                                                                                                                             | 22.4      |
| `friends`        | `request { historyId }`, `add-from-room { historyId }` aynı; kayıt çifttir                                                                                                                                                                                                                                                                                                                                                                                              | 22.4      |

- **Kalıp değişmez:** tek endpoint, `action`, zod v4, `{ error: { code, message } }`. Yeni fonksiyon yok; `config.toml` ve `pnpm functions:deploy` listesi 18'de kalır.
- **Yeni hata kodları:** `wrong_side` (409), `not_leader` (403), `photo_required` (409), `venue_chat_mode_locked` (409). Hepsi `tr.ts`'te metinle gelir (metin anahtarlarını ihtiyaç duyan oturum ekler).
- **Yeniden gönderim (`IDEMPOTENT_CALLS`):** yalnızca `reveal/matches` eklenir (okuma; iki kez gönderen testle). `rooms/leave` iki kez gönderilince ikincisi `not_in_room` döner; tekrar gönderilmez.
- **Eski istemci:** `teams` göndermeyen check-in, `side` göndermeyen istek ve `sessionId` göndermeyen engelleme bugünkü yanıtı verir. Fotoğrafsız hesabın eski istemciden profilli oda kurması artık `photo_required` alır (eski istemci genel hata gösterir); bu, karar 8'in bilinen tek eski istemci etkisidir ve 22.1'in kendi OTA'sıyla kapanır (§22.N).

### 22.K Kilit sırası (kural 10)

- **Masa ve oda zinciri:** `profiles` → `table_sessions` → `rooms` → **`room_members`** → `join_requests` → `game_proposals` → odanın satırları (`tabu_turns`, `game_secrets`, `room_used_cards`, `reveal_decisions` → **`reveal_signals`**, `messages` → `message_reactions`, `game_events`, `play_history`).
- **Yollar:**
  - Üye kabulü: istek kilitsiz okunur; istek sahibinin ve liderin masa oturumu (`for no key update`), oda, tarafın `room_members` satırları, istek. İstek kilit altında yeniden okunur (`rooms_respond` kalıbı).
  - Çıkış ve devir: çıkanın masa oturumu, oda, `room_members` (devirde yeni liderin satırı), bekleyen istekler; son telefonsa pencere yolu (bugünkü masa bitişi sırası).
  - Odada engelleme: engelleyenin masa oturumu (lider üyesini engellerse sonra üyenin masa oturumu; `table_sessions` satırları id sırasıyla), oda, `room_members` (çıkanın satırı), sonra çift kilidi zinciri (`play_history` → `private.lock_pair` → …; bugünkü engelleme).
  - Kişi başına karar: oda, `room_members`, `reveal_decisions`, `reveal_signals`, eşleşen çiftin `play_history` satırları.
  - Mekan sohbeti seçimi: `table_sessions` → `venue_chat_rate` → … (bugünkü mekan sohbeti zinciri; seçim masa oturumu kilidi altında yazılır).
- **Zamanlanmış işler** (`end_expired_table_sessions`, `close_idle_rooms`, istek süresi) `room_members` satırlarını `skip locked` ile seçer.
- Her yeni yol `locks` kalıbında testle gelir (`supabase/tests/teams.test.ts` → `locks`): başka bir telefonun oturumu ya da oda tutulurken yol geçer ya da bekler ama kilitlenmez; iki telefon aynı anda basınca tek sonuç.

### 22.L Analitik

Değişiklikler `pure/analytics.ts` kataloğuna yalnızca izinli özelliklerle girer; kimlik, takma ad, mekan ve karşı taraf gitmez.

| Olay                                                  | Değişiklik                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| `join_requested`, `join_accepted`, `join_unavailable` | + `as_member: boolean` ("Bu masadayım" mı)                        |
| `team_left` (yeni)                                    | — (üye ya da lider "Odadan çık"a bastı)                           |
| `leader_transferred` (yeni)                           | — (bu telefon lider oldu)                                         |
| `game_completed`                                      | + `phones: number` (oyun bittiğinde odadaki telefon sayısı)       |
| `reveal_mutual`                                       | Anlamı: bu telefonun en az bir eşleşmesi var; + `matches: number` |
| `reveal_none`                                         | Anlamı: bu telefonun eşleşmesi yok (değişmez)                     |
| `venue_chat_mode_chosen` (yeni)                       | `profiled: boolean`                                               |

### 22.M Kabul kriterleri ve testler

**Her adımda:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` ve entegrasyon testleri temiz. **Bugünkü entegrasyon testleri değişmeden yeşil kalır:** `supabase/tests` altındaki mevcut testlerin hiçbir satırı değiştirilmez; yeni davranış yeni dosyalarda (`teams.test.ts`, `teamGames.test.ts`, `teamReveal.test.ts`, `venueChatMode.test.ts`) test edilir. Mevcut bir test kırılırsa bu, eski istemcinin bozulduğu anlamına gelir ve adım birleşmez. **Not (22.1 PR'ı):** "Mevcut testler değişmez" kuralı adım 22.2'den itibaren geçerlidir. 22.1'in kararları 7 ve 8 bütün istemciler için bilinçli bir davranış değişikliğidir; o adımda yalnızca hazırlık satırları değişebilir (geçici fotoğraf, karışık mod için ayrı check-in); hiçbir beklenti silinmez, gevşetilmez ya da değiştirilmez, kaldırılan davranış `venueChatMode.test.ts`'te ters yönden sınanır. Her kod PR'ı `e2e` etiketi taşır; E2E (bugünkü akışlar) yeşildir.

**Adım 22.1 (kararlar 7 ve 8).**

- İlk mesaj seçimi yazar; aynı check-in'de farklı seçim `venue_chat_mode_locked`, mesaj yazılmaz; yeni check-in seçimi sıfırlar. `page` `mode` döner.
- Fotoğrafsız ya da gizli fotoğraflı hesap: profilli oda kurma, profilli istek ve mekan sohbetinde profilli ilk seçim `photo_required`; anonim hepsi çalışır.
- E2E: mekan sohbetinde ilk mesajda seçim (cihaz anonim seçer); bot fotoğraflı profilli yazar.

**Adım 22.2 (katılma ve ayrılma).**

- `teams` göndermeyen check-in ile bugünkü her şey aynı; takım yeteneksiz liderin odası "Süren odalar"da yok, "Bu masadayım" `room_not_available`.
- **Ters yön (`teams.test.ts`):** sahibin tarafında üye bulunan açık oda, takım yeteneği olmayan masanın lobisinde yok ve o masanın "Katıl" isteği `room_not_available`; istek beklerken sahibin tarafına üye girerse kabul de `room_not_available`. Üyesi olmayan açık odaya aynı masanın "Katıl"ı bugünkü gibi çalışır.
- "Bu masadayım": istek tarafın liderine gider; kabulle `room_members` satırı açılır; red ve zaman aşımı `my_join_requests`'te birebir aynıdır (bugünkü kural 5 testinin "Bu masadayım" hâli). 4. telefondan sonra istek ve kabul `room_not_available`. Saatte 10 sınırı "Katıl" ile ortaktır. Diğer tarafa istek `wrong_side`.
- Tek oda: başka odadaki telefonun isteği `already_in_room`; lider ya da üye olarak iki odada birden bulunmak veritabanı indeksiyle reddedilir.
- Çıkış: üye çıkar, oda sürer; lider çıkar, en eski üye lider olur ve `rooms` ile `room_members` tutarlıdır; son telefon çıkar, bugünkü pencere yolu. Mekandan ayrılma ve masa süresi aynı yolları izler.
- Engelleme: lider kendi tarafındaki üyeyi engeller, üye çıkar, lider kalır (tarafta yalnızca o üye olsa da liderlik geçmez) ve üye odayı lobide görmez, yeniden istek gönderemez; üye kendi liderini ya da takım arkadaşını engeller, üye çıkar; karşı tarafı engelleyen (lider ya da üye) kendisi çıkar. Pencerede çıkarılan üyenin cevabı "Hayır"dır.
- Erişim: çıkan telefon `rooms`, `messages`, `game_events`, `game_proposals`'ı okuyamaz ve oda kanallarına abone olamaz; üye abone olur. Pencerede `presence:` reddedilir.
- Lobi: "Süren odalar" yalnızca iki liderin takma adını ve sayıları döner; profil, niyet, üye adı, `public_id` ve hesap id'si yok. Engelli telefonun bulunduğu oda görünmez.
- `locks`: üye kabulü, çıkış, devir, odada engelleme (karşı tarafı engelleme ve liderin üyesini engelleyip çıkarması ayrı ayrı).
- E2E: bugünkü akışlar yeşil (bot yeni alanları kullanmaz).

**Adım 22.3 (oyunlar).**

- Tabu: anlatıcıyı başlatan telefon olur; hakemlide kart anlatıcıya ve hakem tarafın her telefonuna gider, anlatıcının takım arkadaşına gitmez (`not_describer`); iş birliğinde yalnızca anlatıcıya. Doğru, Tabu ve Pas yetkileri §22.E'deki gibi; aynı karta iki telefon basınca tek eylem.
- Mod oyun başında `side_headcount`'tan; oyun ortasında gelen üye modu değiştirmez (`private.side_headcount` ↔ `pure/teams.ts` eşitlik testi).
- İbre: hedef yalnızca anlatıcıya; kilit tarafın diğer telefonlarından (tek telefonda anlatıcı), ilk gelen geçer; Solunda/Sağında karşı tarafın her telefonu.
- Harf ve Şarkı: sırası gelen tarafın her telefonu harf alır ya da "Söyledik"e basar; itiraz karşı tarafın her telefonu, hak taraf başına.
- Sahtekar: koltuk eylemleri yalnızca liderden; üye `not_your_seat`; üyeye hiçbir yanıtta kelime ya da sahtekar bilgisi gitmez.
- Öneri ve kabul tarafa göre; önerenin takım arkadaşı cevaplayamaz.
- `game_results` yalnızca oyun başladığında ve bittiğinde odada olan telefonların hesabına; oyun ortasında giren telefon satır almaz.
- Gizli bilgi taraması (`readableBy`, `watchRoomChannel` kalıbı) üye telefonlarını da kapsar.
- `locks`: iki telefon aynı eyleme aynı anda basınca tek sonuç.

**Adım 22.4 (tanışma, geçmiş, arkadaşlık).**

- Eşleşme yalnızca karşı taraftan iki "Evet"le olur ve yalnızca o iki telefona `reveal_match` gider; takım arkadaşları eşleşmez.
- **Kural 5, çift başına:** "Evet" diyen telefon A için, karşı taraftaki B'nin "Hayır"ı, cevapsızlığı, çıkışı, engellemesi ve kendi lideri tarafından engellenip çıkarılması `reveal_ends_at`'e kadar birebir aynıdır: `rooms` satırı, `room_phones`, `rooms.*_phones`, `reveal/matches` yanıtı, A'nın kanallarına gelen olaylar (sayı ve tür) ve presence (kapalı). Aynı test B'nin takım arkadaşlarının eylemleriyle de koşar.
- Herkes "Evet" derse oda erken kapanır; iki telefonlu odada sonuç bugünkü testlerle aynıdır.
- Sinyal: eşleşmesi olan her telefon aynı rengi alır; çiftin iki telefonu aynı emojiyi, aynı odadaki farklı çiftler farklı emoji görür; renk ve emojiler `rooms` satırında, `game_events`'te ve Realtime yükünde yok.
- Oyun geçmişi: 2+3 telefonlu odada 6 çift, 12 kayıt; 3 dakikadan kısa kesişen çift yok; eşleşen çiftin iki kaydı hemen açılır, diğerleri `reveal_ends_at`'te; takım arkadaşları arasında kayıt yok. Çıkan üyenin çiftleri çıkış anında yazılır.
- "Arkadaş ekle" çift başına: iki taraf basınca arkadaş, biri basınca hiçbir şey ve karşı taraf görmez. İstek, engelleme ve şikayet çift kaydından.
- Hesap id'si ve arkadaşlık öncesi `public_id` taraması `reveal/matches` ve `room_member_profiles`'ı kapsar (oda dışından boş).

**Adım 22.5 (istemci) ve 22.6 (test).** E2E açık ve koyu yeşil; yeni akışlar: "Bu masadayım" ile katılma ve takım arkadaşının (ikinci bot) Tabu'da hakem/takım ekranı; liderlik devri; kişi başına tanışma (bir eşleşme, bir "Hayır"). 3-4 gerçek telefonla saha testi geçti (`docs/FIELD_TEST.md` güncel). §22.I'deki ölçüm yapıldı ve sonucu PR'a yazıldı.

### 22.N Uygulama sırası ve yayın

| Adım                    | Sunucu                                                                             | İstemci                                                                                                                                                                                                                                                                                     | Yayın                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 22.0 Belge              | —                                                                                  | —                                                                                                                                                                                                                                                                                           | Bu PR                                                                                |
| 22.1 Kararlar 7 ve 8    | `…_venue_chat_mode.sql`, `venue-chat`, `rooms` (fotoğraf şartı)                    | Mekan sohbeti ilk mesaj seçimi, "Profilimle"nin fotoğrafsız hâli (önce tuval, sonra kod)                                                                                                                                                                                                    | `db push` + `venue-chat`, `rooms` deploy; **hemen ardından istemci OTA** (`preview`) |
| 22.2 Katılma ve ayrılma | `…_teams.sql`; `checkin`, `rooms`, `safety`, `chat`; `admin:ban` sırası            | —                                                                                                                                                                                                                                                                                           | `db push` + deploy (dev); eski uygulamada değişiklik yok                             |
| 22.3 Oyunlar            | `…_team_games.sql`; `rooms`, `tabu`, `ibre`, `harf`, `sarki`, `sahtekar`, `sohbet` | —                                                                                                                                                                                                                                                                                           | `db push` + deploy (dev)                                                             |
| 22.4 Tanışma ve geçmiş  | `…_team_reveal.sql`; `reveal`, `friends`, `safety`                                 | —                                                                                                                                                                                                                                                                                           | `db push` + deploy (dev)                                                             |
| 22.5 İstemci            | —                                                                                  | Tasarım oturumu: önce tuval (lobide süren odalar, "Bu masadayım" ve istek sahibiyle liderin aynı büyüklükte gördüğü takma ad (§22.C), odada taraf üyeleri, anlatıcı ve takım arkadaşı ekranları, kişi başına tanışma, liderlik devri notu, oda başlığı altındaki telefon sayısı), sonra kod | —                                                                                    |
| 22.6 Test               | —                                                                                  | İkinci bot (`BOT_ROLE=teammate`: cihazın ya da karşı botun tarafına "Bu masadayım"), yeni E2E akışları, `FIELD_TEST.md`, `pnpm latency` oda adımı                                                                                                                                           | **Faz 2 OTA'sı** (`preview`), saha testi                                             |
| Pilot build             | —                                                                                  | 0.4.0 (bildirim, titreşim, ses; `docs/PILOT_RELEASE.md`)                                                                                                                                                                                                                                    | `version` artışı → production build                                                  |

- **Sıra:** kural başlamayı değil birleşmeyi bekletir. Bir adımın çalışması öncekinin yayınını beklemeden başlayabilir; birleşme şuna bağlıdır:
  - **Sunucu adımları 22.2–22.4** telefonda görünen bir değişiklik getirmez. Bir sonraki sunucu adımının PR'ı, önceki adım (ve araya giren sunucu PR'ları) dev projesine yayınlanıp uygulamanın açıldığı ve mekan lobisinin yüklendiği görüldükten sonra birleşir. Örnek: 22.3'ün PR'ı, 22.2 dev'e yayınlanıp uygulama açılıp mekan lobisi yüklendikten sonra birleşir.
  - **Tam telefon kontrolü** 22.5 (istemci) ve 22.6'da (Faz 2 OTA'sı, saha testi) yapılır. 22.2'nin PR'ı, 22.1 ve #95 (fotoğraf yolları) dev'e yayınlanıp telefonda kontrol edildikten sonra birleşti.
  - Her PR yine "onaylandı" bekler; her birleşmeden sonra dev yayın komutları sırasıyla yazılır (aşağıda "Yayın sırası").
  - Sunucu adımları (22.1–22.4) eski uygulamayı bozmadan yayınlanır.
- **22.2'de üyelerin yapabildikleri:** odayı okur (`rooms`, `messages`, `game_events`, `game_proposals`, `room_phones`), oda kanallarına abone olur, sohbete yazar ve tepki verir, odayı şikayet eder, engeller ve odadan çıkar. Oyun eylemleri, öneri ve kabul, Sohbet kartları ve "Tanışalım mı?" cevabı bu adımda yalnızca iki lidere açıktır (üyeye `not_in_room`); üyeler 22.3'te oyunlara, 22.4'te tanışmaya girer. Oyun geçmişi de 22.4'e kadar bugünkü gibi odanın sonundaki iki lider için yazılır; liderlik devri kayıt yazmaz. Liderlik devrinde açık bir öneri yeni liderin olur (`game_proposals.proposer_session_id`); 22.3'te öneri tarafa bağlanır (`proposer_side`).
- **22.3'te üyelerin yapabildikleri:** yukarıdakilere ek olarak oyunlar (§22.E tablosu), öneri ve kabul, Sohbet kartları, "Oyunu bitir" ve tek masalı oyunun destesi. "Tanışalım mı?" cevabı ve oyun geçmişi 22.4'e kadar iki liderindir (`private.room_membership` yalnızca `reveal_decide`'de kalır).
- **22.4'ten sonra** üyeler tanışmaya girer: her telefon kendi adına cevaplar, oyun geçmişi ve "Arkadaş ekle" çift başınadır (§22.F). `private.room_membership`'i artık hiçbir oyun ya da tanışma yolu kullanmaz.
- **22.1'in istemcisi kendi OTA'sıyla gider:** 22.1 sunucusu yayınlanır yayınlanmaz istemci kısmı (ilk mesaj seçimi, fotoğrafsız "Profilimle") ayrı bir OTA ile gönderilir; 22.6'yı beklemez. Gerekçe: sunucunun `photo_required` ve `venue_chat_mode_locked` kodlarını bilmeyen istemci bunları genel hata olarak gösterir; fotoğrafsız test kullanıcıları haftalarca genel hata görmesin. Bu yüzden 22.1'in istemci PR'ı (önce tuval) sunucusuyla birlikte hazırlanır ve ondan hemen sonra birleşir.
- **Faz 2 OTA'sı:** 22.5'in istemci değişiklikleri 22.6'da tek OTA'yla gider; saha testi bu OTA'yla yapılır.
- **Version artmaz:** hepsi JS ve sunucu değişikliğidir; telefonlardaki 0.3.0'a OTA ile gider. Native bağımlılık gerekirse durulur ve sorulur.
- **Yayın sırası (her sunucu adımında, Windows cmd):** `pnpm supabase migration list` → `pnpm supabase db push --include-seed --skip-vault --dry-run` → `pnpm supabase db push --include-seed --skip-vault` → `pnpm functions:deploy` → `pnpm supabase functions list`. Seed değişikliği yok (seed satırı görünmez). Yeni sır ve panel ayarı yok.
- **PR kuralları:** her kod PR'ı `e2e` etiketi taşır, açıklamasında "Telefonda kontrol" (3-5 madde), "Maliyet ve risk" ve sunucu değiştiyse yayın sırası bulunur; "onaylandı" olmadan birleşmez. `tr.ts`'e yeni anahtar gerekirse onu ihtiyaç duyan oturum kendi PR'ında ekler.
- Faz 2, 18 fonksiyonun yaklaşık 12'sine dokunur; bu yüzden sunucu üç PR'a bölünür ve her biri bugünkü testleri değişmeden geçer.

### 22.O CLAUDE.md değişmez kuralları: yeni metinler

Bu PR'da CLAUDE.md'ye işlendi. Her ek ilgili kuralın sonunda "Faz 2" başlığıyla durur ve **§22'nin ilgili adımıyla yürürlüğe girer**; o adım gelene kadar bugünkü metin geçerlidir ve bugünkü davranışı koruyan kod o adımda değişir (v3 eklemelerinin kalıbı).

**Kural 3 (adım 22.3).**

> "Faz 2 (§22; adım 22.3 ile yürürlüğe girer): Eylem yetkisi masaya değil tarafa bağlıdır; taraf lider ve en çok 3 üyedir (en çok 4 telefon). Turu başlatan telefon o turun anlatıcısıdır; gizli bilgi (Tabu kartı, İbre hedefi) yalnızca ona, hakemli Tabu'da ayrıca hakem tarafın bütün telefonlarına gider, anlatıcının takım arkadaşlarına gitmez. Hakemli Tabu'da Doğru iki tarafın her telefonu, Tabu hakem tarafın her telefonu, Pas yalnızca anlatıcı basar; iş birliği modunda üçünü de yalnızca anlatıcı basar. Tarafın kişi sayısı, tarafın beyan ettiği sayı ile taraftaki telefon sayısının büyüğüdür; Tabu modu ve Sahtekar koltukları oyun başlarken bu sayıdan belirlenir ve oyun bitene kadar değişmez. Sahtekar'da koltuk eylemleri yalnızca tarafın liderinin telefonundan gelir. Öneri ve kabul tarafın her telefonundan yapılır; iki telefon aynı eyleme basarsa ilk gelen geçer."

**Kural 4 (adımlar 22.1, 22.2).**

> "Faz 2 (§22; ilgili adımla yürürlüğe girer): Odadaki her telefon kendi takma adıyla görünür ve anonim ya da profilli katılımı odaya girerken kendisi seçer (varsayılan anonim); takma adlar ve profilli telefonların profili ile profil kimliği oda sürerken odanın iki tarafındaki bütün telefonlara gider. Lobide süren oda yalnızca iki liderin takma adını, taraf başına telefon ve kişi sayısını gösterir (adım 22.2). 'Profilimle' (oda, katılma isteği, mekan sohbeti) yalnızca profil fotoğrafı varken seçilebilir; mekan sohbetinde anonim ya da profilli seçimi check-in başına bir kez, ilk mesajda yapılır ve değişmez (adım 22.1)."

**Kural 5 (adımlar 22.2, 22.4).**

> "Faz 2 (§22; ilgili adımla yürürlüğe girer): 'Bu masadayım' isteğinde red ve zaman aşımı istek sahibine birebir aynı görünür (`unavailable`; adım 22.2). Tanışma kişi başınadır (adım 22.4): her telefon kendi adına cevaplar; eşleşme karşı taraflardan iki telefonun ikisi de 'Evet' dediğinde olur ve hemen, yalnızca o iki telefona görünür. Hayır, cevapsız, ayrılma ve engelleme yalnızca `reveal_ends_at`'te açıklanır; 'Evet' diyen telefon bunları satırlardan, telefon sayısından, presence'tan, kanal olaylarından ya da zamanlamadan ayırt edemez. Pencerede bir telefonun çıkması, engellemesi ya da lideri tarafından çıkarılması onun 'Hayır'ıdır; gösterilmiş eşleşme geri alınmaz. Lider kendi tarafındaki bir üyeyi engellerse üye odadan çıkarılır, lider kalır; üye kimi engellerse engellesin üye çıkar; karşı tarafı engelleyen kim olursa olsun kendisi çıkar. Pencere bir taraftaki son telefon çıkınca da açılır. Aynı taraftaki telefonlar arasında tanışma, oyun geçmişi ve 'Arkadaş ekle' yoktur; oyun geçmişi ve 'Arkadaş ekle' karşı taraftaki her çift için ayrıdır."

**Kural 9 (adımlar 22.2, 22.4).**

> "Faz 2 (§22; ilgili adımla yürürlüğe girer): Oda kanallarına (`room:`, `messages:`, `game:`, `presence:`) iki tarafın lideri ve odada bulunan üyeler abone olur; odadan çıkan telefonun erişimi hemen kapanır. Tanışma penceresinde `presence:` kanalına kimse abone olamaz (adım 22.2). Eşleşme bildirimi `session:{session_id}` üzerinde veri içermeyen sunucu yayınıdır (`reveal_match`; adım 22.4). Yeni kanal türü yoktur."

**Kural 10 (adım 22.2).**

> "Faz 2 (§22; adım 22.2 ile yürürlüğe girer): Masa ve oda zincirinde `rooms` → `room_members` → `join_requests` (zincirin geri kalanı aynı); odanın satırlarında `reveal_decisions` → `reveal_signals`. Üye kabulü, odadan çıkış, liderlik devri ve kişi başına tanışma kararı bu sırayla kilitler; her biri `locks` kalıbında testle gelir."

**Değişmeyen kurallar:** 1, 2, 6, 7, 8 ve 11. Yeni tablolar (`room_members`, `reveal_signals`) politikalarıyla aynı migration'da gelir (kural 2); istemci hâlâ hiçbir tabloya yazmaz (kural 1).

**Proje paragrafı:** "Faz 2 (Takımlar) kapsamı ve teknik tasarımı `docs/SPEC_V3.md` §22'de (onaylı, §22.N sırasıyla uygulanır)."

### 22.P Kararlar

**Proje sahiplerinin dokuz kararı (önerildiği gibi onaylandı):**

1. Taraf başına en çok 4 telefon: lider ve en çok 3 üye.
2. Katılmak isteyen tarafı kendisi seçer ("Bu masadayım"), o tarafın lideri onaylar. Red ve 60 sn zaman aşımı istek sahibine aynı görünür (kural 5). Saatte 10 istek sınırı ortak. QR ve davet bağlantısı yok.
3. Lider çıkınca liderlik o taraftaki en eski üyeye geçer, oyun sürer. Taraftaki son telefon çıkınca bugünkü kural işler.
4. Süren odalar lobide görünür: yalnızca iki liderin takma adı, telefon sayısı ve kişi sayısı. Tanışma penceresinde görünmez.
5. Tanışma kişi başına: her telefon kendi adına cevaplar; eşleşme karşı taraflardan iki kişinin ikisi de "Evet" dediğinde olur; eşleşen çift hemen görünür; hayır, cevapsız ve ayrılma yalnızca `reveal_ends_at`'te açıklanır. "Arkadaş ekle" ve oyun geçmişi çift başına; aynı taraftakiler arasında ikisi de yok.
6. Sahtekar ilk sürümde: koltuklar liderin telefonunda, üyeler izler.
7. Mekan sohbetinde anonim ya da profilli seçimi check-in başına bir kez yapılır, değişmez.
8. "Profilimle" katılım (oda ve mekan sohbeti) için profil fotoğrafı şart; yalnızca var mı yok mu bakılır, yüz kontrolü yok.
9. Oda başlığı karşı tarafın liderinin takma adıyla kalır, altında telefon sayısı.

**Açık soruların cevapları (proje sahibi, #93 incelemesi):**

1. `rooms/end` yalnızca liderdir; iki tarafın lideri de odayı bitirebilir. Üyenin menüsü: "Odadan çık", "Şikayet et", "Engelle" (§22.D).
2. Çıkan telefon yalnızca daha önce bulunduğu tarafa, istek ve onayla yeniden katılır; diğer taraf `wrong_side` (§22.B).
3. `game_results` telefon başınadır, ama yalnızca oyun başladığında da odada olan ve oyun bittiğinde odada bulunan telefonlara; son saniyede girip oyun sayısı ve galibiyet rozeti toplanmaz (§22.E).
4. Liderlik devrinde ilk liderin beyan ettiği kişi sayısı kalır (§22.B).
5. Odadaki her telefon engelleyebilir, kendi tarafı dahil; kimin çıkacağı aşağıdaki zorunlu değişiklik 2'ye göredir (§22.D).
6. Oda başına tek renk (masalar birbirini bulsun) ve her eşleşen çifte ayrı emoji (kişiler birbirini bulsun); eşleşmesi olan telefon rengi ve altında emoji ile eşleştiği kişinin listesini gösterir, ekran bölünmez; `reveal_signals` taşır, `rooms` satırına yazılmaz (§22.F).
7. Herkes "Evet" derse pencere erken kapanır (§22.F).

**Zorunlu değişiklikler (proje sahibi, #93 incelemesi):**

1. Eski istemci üyeli odaya girmez, ters yönde de: sahibin tarafında üye olan açık oda takım yeteneği olmayan masaya lobide görünmez, "Katıl" `room_not_available` (§22.B, §22.C, §22.M).
2. Lider istenmeyen üyeyi engelleyerek çıkarır: lider kendi tarafındaki üyeyi engellerse üye çıkar, lider kalır; üye kimi engellerse engellesin üye çıkar; karşı tarafı engelleyen kendisi çıkar. Ayrı "Çıkar" düğmesi yok. Pencerede çıkarılan üyenin cevabı "Hayır" (§22.D, §22.F, kural 5, `locks`).
3. 22.1'in istemci kısmı, 22.1 sunucusu yayınlanır yayınlanmaz kendi OTA'sıyla gider (§22.N).
4. "Bu masadayım" isteğinde istek sahibi kendi takma adını büyük gösterir ("Liderine bu adı söyle"); liderin istek kartında aynı ad aynı büyüklükte (§22.C; 22.5 tuvali).

**Bu bölümde verilen teknik kararlar** (proje sahibinin "sen karar ver" dediği ya da kararların gerektirdiği; takım yeteneği bayrağı, liderlerin `room_members`'ta olması ve çift başına `encounter_id` #93 incelemesinde onaylandı):

- **Mod ve koltuklar oyun başında donar** (§22.E): oyun ortasında gelen üye Tabu modunu ve Sahtekar koltuklarını değiştirmez; yalnızca sonraki oyunu etkiler.
- **Karar 7'nin seçim anı:** mekan sohbetinde ilk mesaj (§22.G).
- **Takım yeteneği bayrağı** (§22.B): eski istemcili liderin odasına üye katılamaz; böylece eski istemci yalnızca lider olarak ve bugünkü gibi çalışır.
- **Liderler de `room_members`'tadır** (§22.B): "tek oda" kuralı tek indeksle veritabanında zorlanır.
- **`encounter_id` çift başına** (§22.F): `unique (user_id, encounter_id)` korunur, anlamı çift karşılaşması olur.
- **Beyan edilen kişi sayısı devirde değişmez** (§22.B).
- **Pencerede telefon listesi ve sayıları donar, presence kapalıdır** (§22.F, §22.I): kural 5 çift başına.
- **Bir hesap bir odada yalnızca bir tarafta** (§22.B).
- **Sinyal:** oda başına tek renk, eşleşen her çifte ayrı emoji; yalnızca eşleşmesi olan telefonlara gider (§22.F; açık soru 6'nın cevabı).

## 23. Faz 3: Önce buluş, sonra oyna

**Onaylı; §23.N sırasıyla uygulanır.** Saha gözleminden sonra proje sahibinin verdiği kararlar §23.B'dedir; bu bölüm onları şemaya, API'ye, RLS'e ve istemciye oturtur. Her adım kendi dalı ve PR'ıyla gelir ve "onaylandı" olmadan birleşmez. Bu bölümde olmayan bir karar gerekirse uygulama durur ve sorulur. §23.P'deki açık kararlar verilmeden ilgili iş başlamaz.

Alt bölümler harfle numaralanır (§23.A, §23.B…); **adım** numaraları (adım 23.1…23.4) §23.N'deki uygulama adımlarıdır.

### 23.A Gerekçe, ilke ve kapsam

**Gerekçe.** Saha gözleminin sonucu: kafede kimse karşı masaya bağırmaz. Hedef kullanıcı çekingen biridir ve sesli performans yapmaz. Bu yüzden masalar arası uzaktan oyun kurgusundan vazgeçildi: iki masanın kendi yerinde oturup sesli oynaması ve oyun sonunda "Tanışalım mı?". Yeni kurgu **önce buluş, sonra tek masada oyna**dır:

- Bir masa diğerine katılma isteği gönderir.
- Kabul edilince katılan fiziksel olarak o masaya gider.
- Oyunlar birleşen tek masada oynanır.

**İlke.** Uygulama yüzleri değil, kimliği ve reddi korur; kimlik yalnızca karşılıklı istekle açılır. Buluşma masa düzeyinde, kimlik ve arkadaşlık kişi düzeyinde açılır.

- Yüzler zaten görünürdür: insanlar aynı masaya oturur. Uygulamanın koruduğu şeyler ad, profil kimliği ve kimin kimi reddettiğidir.
- Red, istekçiye hiçbir zaman ayırt edilebilir görünmez (kural 5'in katılma isteği kısmı aynen kalır).
- Anonim katılanın profili ve profil kimliği yalnızca iki tarafın da "Arkadaş ekle"ye basmasıyla açılır.

**Ne değişmez.**

- Oyun motoru tarafa (side) kuruludur ve fiziksel konumu bilmez. Bu yüzden oyun sunucuları (`tabu`, `ibre`, `harf`, `sarki`, `sahtekar`, `sohbet`) değişmez.
- **§22'nin takım mekaniği bu kurgunun temelidir ve kalır:** çok telefon, taraf, lider ve üyeler, gizli bilgi dağıtımı (kural 3'ün Faz 2 eki), "Bu masadayım".
- Değişen akış katmanıdır: mekan ekranı, lobi, katılma isteği, kabul, birleşik masa ekranı ve masa sonu.
- Sunucuda `rooms` ve mevcut tablolar kalır. "Oda" kelimesi yalnızca kullanıcıya görünmez.

**Kalkan.** **§22.F'nin (adım 22.4) kişi başı tanışma penceresi adım 23.3 ile kalkar**, reveal töreniyle birlikte (renk, emoji, "Tanışalım mı?", "Güzel oyundu"). Oyun geçmişi, kalıcı red, çift kilidi, engelleme ve şikayet kalır.

**Kapsam dışı:**

- §22.A'nın "Faz 3" diye andığı Sahtekar'da telefon başına koltuk bu bölümün işi değildir; Sahtekar §22.E'deki gibi kalır.
- QR, davet bağlantısı, masa numarası ya da harita üstünde masa yeri.
- Yeni oyun ya da oyun kuralı değişikliği.
- Mekan sohbeti (§23.D).
- Takım taşıma ve karışık takım: pilotta yoktur, taraflar katılımdaki masalardır (§23.P).

**Native değişiklik yok:** bütün adımlar JS ve sunucu değişikliğidir. `app.json` → `version` 0.3.0 kalır, istemci OTA ile gider. Bir adımda native bağımlılık gerekirse uygulama durur ve sorulur.

### 23.B Kurgu (proje sahibinin kararları)

1. **Mekan ekranı ana ekrandır.** Masanın odası varken zorunlu oda yönlendirmesi kalkar. "Oda" kelimesi kullanıcıya hiç görünmez, her şey "masa"dır; sunucuda `rooms` ve mevcut tablolar kalır.
2. **Masa lobiye isteğe bağlı açılır** ("Masanı lobiye aç"). Açarken isteğe bağlı oyun etiketi seçilir: altı konseptten biri ya da "fark etmez". Lobi kartı: takma ad, kişi sayısı, varsa niyet ve oyun etiketi. Lobi herkes için takma addır; gerçek ad lobiye asla çıkmaz.
3. **Kayıtta zorunlu cinsiyet adımı:** Kadın, Erkek, Belirtmek istemiyorum.
   - Cinsiyet, doğum tarihi gibi istemciye kapalı kolondur.
   - Hiçbir kullanıcıya alan olarak gösterilmez ve uygulamadan değiştirilemez.
   - Yanlış beyan, `admin:set-birth-date` benzeri bir admin komutuyla düzeltilir.
4. **Asimetrik anonimlik kuralı.**
   - Kadın, oyun akışında (istek ve masa içi) anonim ya da profilli katılımı seçer.
   - Erkek ve belirtmeyen her zaman profillidir.
   - Profilli katılım profil fotoğrafı şartına bağlıdır. Bu yüzden erkek fotoğrafsız istek gönderemez ve lobiye masa açamaz.
   - Mekan sohbeti değişmez: orada herkes anonim kalabilir.
5. **Katılma isteği kişi ya da masa olarak gönderilir.**
   - İki yol aynı lobiyi kullanır; ikinci bir havuz yoktur.
   - Erkek istekçinin adı, yaşı ve fotoğrafı ev sahibi masaya gider. Anonim kadın istekçi takma ad ve kişi sayısıyla görünür.
   - Ev sahibi masadaki profiller istekçiye kabulden önce açılmaz.
   - Red ve 60 saniyelik zaman aşımı istekçiye birebir aynı görünür (`unavailable`); bu kural aynen kalır.
6. **Kabul buluşmadır.** Tören ve tam ekran eşleşme görseli yoktur.
   - İstekçide "Kabul edildi, X masasının yanına git", ev sahibinde "Y geliyor, N kişi" durum satırı.
   - Katılan fiziksel olarak masaya gelir.
   - İstek atanın bekleyen boş masası varsa, isteği kabul edildiğinde o masa sessizce kapanır.
7. **Birleşik masa ekranı.**
   - Üstte Masadakiler: profilliler ad ve fotoğrafla, anonim kadın takma adla.
   - İki sekme: Oyun Seç ve Masa Sohbeti.
   - Oyunlar tek masada, Faz 2'nin taraf ve çok telefon mekaniğiyle oynanır; taraflar katılımdaki masalardır.
   - Gizli bilgi kuralları (kural 3, Faz 2) aynen geçerlidir. "Masanla oyna" tek masa modu kalır.
8. **Tanışma penceresi ve reveal töreni kalkar.**
   - Masa sonu ekranı: Masadakiler listesi ve kişi başına "Arkadaş ekle". Mevcut sessiz karşılıklı mekanizma kullanılır: tek taraf basarsa hiçbir şey olmaz ve bu görünmez.
   - Kalıcı red, çift kilidi, `play_history` (3 dakika kuralı), engelleme ve şikayet aynen kalır.
   - Arkadaş ekleme karşı taraftaki çiftler içindir; aynı tarafta (birlikte gelenler) yoktur.

### 23.C Mekan ekranı ve lobi (adım 23.1)

**Ana ekran.**

- Bugün mekan ekranı (`app/(app)/(tabs)/venue.tsx`), masanın açık ya da süren odası varken oda ekranına yönlendirir. Bu yönlendirme kalkar.
- Mekan ekranında üstte kendi masa kartı durur: takma ad, kişi sayısı, kalan süre ve masanın durumu (lobide değil, lobide açık, birleşti).
- Birleşik masa ekranına bu karttan geçilir. Görünüm tasarım oturumunda belirlenir.
- Mekan sohbeti kartı mekan ekranında kalır.

**"Masanı lobiye aç".**

- Bugünkü "Oda kur"un yerini alır. Sunucuda bugünkü açık oda kullanılır: `rooms/create { profiled, intent?, gameTag? }`, `visibility = 'open'`.
- Niyet etiketi (§5.2) kalır.
- Oyun etiketi isteğe bağlıdır: altı konseptten biri (`CONCEPTS`: `tabu`, `sohbet`, `sahtekar`, `harf`, `sarki`, `ibre`) ya da "fark etmez" (boş). Yeni kolon `rooms.game_tag`'e yazılır. Etiket yalnızca lobide görünür; oyunu başlatmaz ve öneriyi kısıtlamaz.
- Masa lobiden bugünkü yolla çekilir: bekleyen tek taraflı oda kapanır. Bekleyen odada tanışma penceresi zaten yoktur. Düğmenin adı tasarım oturumunda seçilir.

**Lobi.**

- Lobi kartı: takma ad, kişi sayısı, varsa niyet ve oyun etiketi, "Katıl".
- **'profilli' işareti lobiden kalkar** (kural 4, adım 23.1). Gerekçe: erkek ve belirtmeyen her zaman profilli olduğu için (§23.D) işaret, cinsiyete dair bir ipucu olurdu. `venue_lobby.profiled` kolonu kalır ve her satırda `false` döner: eski istemci ve kolon listesini denetleyen testler kırılmaz, işaret gider.
- Görünen ad, yaş ve fotoğraf lobiye asla çıkmaz.
- `venue_lobby`'nin kolonları değişmez; eski istemci ve kolon listesini denetleyen bugünkü testler bunu bekler.
- Oyun etiketi, 22.2'deki `venue_lobby_phones` kalıbıyla oda başına ayrı bir okumadan gelir: yeni okuma RPC'si `venue_lobby_tags(target_venue_id)` → `(room_id, game_tag)`, `venue_lobby`'nin satırları üzerinden (23.1 PR'ındaki seçim). `venue_lobby_phones`'a kolon eklenmedi, çünkü onun kolonlarını da bugünkü testler birebir denetler. `public_id` ya da hesap id'si taşımaz; `game_tag` boşsa "fark etmez".
- **Süren masalar ve "Bu masadayım" (§22.C) kalır.** Bir masanın sonradan gelen telefonu kendi tarafına böyle katılır; ekrandaki adı "masa" olur.

**Katıl'da bekleyen boş masa.**

- Bugün masası lobide bekleyen telefonun başka bir odaya isteği `already_in_room` döner. 23.1'den sonra, istekçinin masasının yalnızca bekleyen (karşı tarafı olmayan, `status = 'waiting'`) bir odası varsa istek gönderilebilir.
- Değişmeyenler ve sınırlar (23.1 PR'ı): yalnızca kendi açık (`visibility = 'open'`) bekleyen odası olan masa, yalnızca "Katıl" ile. "Bu masadayım", "Masanla oyna" odasının masası ve bir odanın üyesi bugünkü gibi `already_in_room` alır; masanın kendi odasına isteği `room_not_available` olur. Üyeli bekleyen odadan, takım yetenekli olmayan (`teams` göndermeyen) bir masanın odasına istek ve kabul `room_not_available` döner (§22.B'nin ters yönü: o masanın uygulaması çok telefonlu tarafı göstermez).
- İstek kabul edildiğinde istekçinin bekleyen odası **aynı işlemde sessizce kapanır**: pencere yok, oyun geçmişi yok, çünkü oda tek taraflıdır. O odaya bekleyen istekler zaman aşımıyla `unavailable` olur (kural 5).
- İstek reddedilir ya da zaman aşımına uğrarsa bekleyen oda lobide kalır.
- İstekçinin odası istek beklerken başka bir masayla birleştiyse kabul `room_not_available` döner. İstekçi bunu bugünkü `unavailable` olarak görür. Bu denetim kabulün ilk denetimidir: birbirini aynı anda kabul eden iki masada ikinci kabulün kendi odası da birinci kabulle kapanmış olsa bile cevap `room_not_available`'dır (§23.K).
- Kabulde kapanan bekleyen oda için lobi yayını gider; taşınan üyelerin `session:` kanalına, istekçiye olduğu gibi veri içermeyen `join_accepted` gider.
- **Bekleyen odanın üyeleri** ("Bu masadayım" ile katılmış telefonlar) kabulde, aynı işlemde misafir tarafa üye olarak taşınır (karar, §23.P). Anonim ya da profilli seçimleri aynen kalır; Faz 2'de de üye sonradan gelen masaya bu seçimiyle görünüyordu. Taşınan taraf bekleyen odanın tarafının aynısıdır, bu yüzden 4 telefon sınırı aşılmaz. Taşınan üyeler istekçiyle aynı durum satırını görür (§23.E).

**"Oda" kelimesi.**

- Kullanıcıya görünen bütün metinlerden (`tr.ts`) kalkar: "Oda kur" → "Masanı lobiye aç", "Odadakiler" → "Masadakiler"; "Odayı bitir", "Odadan çık" ve benzerleri masa karşılıklarına döner. Kesin metinler tasarım oturumundadır.
- Kod, tablo ve fonksiyon adları (`rooms`, `room_members`, `rooms/*`) değişmez.

### 23.D Cinsiyet ve asimetrik anonimlik (adım 23.2)

**Kayıt adımı.**

- Profil adımında (§3.1, 3. adım) zorunlu cinsiyet sorulur: Kadın, Erkek, Belirtmek istemiyorum. Onaylar ve profille aynı çağrıda kaydedilir: `account/complete-onboarding { …, gender }`.
- **Mevcut hesaplar:** cinsiyeti boş hesaba uygulama ilk açılışta tek seferlik cinsiyet ekranını açar (§3.1'deki onboarding kapısı gibi). Bu ekran `account/set-gender { gender }` ile yalnızca alan boşken yazar; dolu alana yazma reddedilir.
- Fotoğraf adımı (isteğe bağlı kalır), erkek ve belirtmeyende sonucu kısa bir notla söyler: fotoğrafsız masalara istek gönderilemez ve lobiye masa açılamaz. Metin tasarım oturumundadır.

**Kapalı kolon (doğum tarihi kalıbı, §3.2).**

- `profiles.gender`: `female`, `male` ya da `unspecified`. Mevcut hesaplar için boş olabilir.
- Kolon yetkisiyle istemciye kapalıdır: tablo okumasıyla gelmez. İstemci yalnızca `has_gender` üretilmiş kolonunu okur. Kendi cinsiyeti, kendi `profile/get` yanıtında döner (doğum tarihi gibi).
- **Hiçbir kullanıcıya alan olarak gösterilmez.** Başkası için hiçbir yanıt, Realtime yükü, istek kartı ya da lobi okuması cinsiyet taşımaz.
- Uygulamadan değiştirilemez. Yanlış beyan, iletişim e-postasıyla gelen talep üzerine `pnpm admin:set-gender <userId> <female|male|unspecified>` ile düzeltilir; komut `admin:set-birth-date` gibi geliştirici makinesinde çalışır.
- Hesapla birlikte silinir (cascade).

**Kural.**

- Kural `pure/gender.ts`'te durur (ör. `mayStayAnonymous(gender)`). Sunucu ve istemci aynı fonksiyonu kullanır; fonksiyon testlidir.
- **Kadın:** oyun akışında anonim ya da profilli katılımı seçer; varsayılan anonimdir (bugünkü gibi). Oyun akışı: katılma isteği, "Masanı lobiye aç", "Bu masadayım" ve masaya katılım.
- **Erkek ve belirtmeyen:** her zaman profillidir. Ekranda seçim gösterilmez; gönderilecek profilin önizlemesi görünür (ad, yaş, fotoğraf).
- **Fotoğraf şartı:** profilli katılım fotoğraf ister (§22.G, karar 8). Fotoğrafsız erkek ya da belirtmeyen istek gönderemez, lobiye masa açamaz ve "Bu masadayım" gönderemez (`photo_required`).
- **Sunucu zorlar:**
  - Erkek ya da belirtmeyen hesaptan `profiled: false` ile gelen istek, oda kurma ve katılma `anonymous_not_allowed` döner (yeni hata kodu; spec'in ilk adı `profile_required` "profilini tamamla" anlamında zaten kullanıldığı için proje sahibi bu adı seçti, 23.2 sunucu PR'ı). Sunucu bunu sessizce profilliye çevirmez: kimse ekranda görmeden profiliyle görünmez (teknik karar, §23.P).
  - Cinsiyeti boş hesap oyun akışına giremez: `gender_required` (yeni hata kodu). Check-in, Keşfet ve mekan sohbeti bunu istemez.
- **"Masanla oyna" oyun akışı sayılmaz:** `visibility = 'private'` odada `anonymous_not_allowed`, `photo_required` ve `gender_required` uygulanmaz. O odada yalnızca masanın kendisi vardır ve oda lobiye çıkmaz.
- **Mekan sohbeti değişmez (§22.G):** herkes anonim yazabilir, erkek ve belirtmeyen dahil. Seçim bugünkü gibi check-in başına ilk mesajda yapılır.
- Cinsiyet kimseye gösterilmez; yalnızca ekranda seçim olup olmayacağını ve sunucunun neyi kabul edeceğini belirler.
- **Dolaylı bilgi:** oyun akışında anonim katılım yalnızca kadın beyanıyla mümkün olduğundan, anonim görünmek cinsiyet hakkında dolaylı bilgi verir. Cinsiyet alan olarak hiçbir yerde gösterilmez. Kural 12 (§23.O) ve gizlilik politikası (§23.L) bunu açıkça söyler; yanlış güven verilmez.

**Yanlış cinsiyet beyanı (şikayet).**

- Asimetrik kuralın asıl kötüye kullanım yolu, erkeğin kadın beyan etmesidir. Şikayet nedenlerine "yanlış cinsiyet beyanı" eklenir (karar, §23.P): `pure/chat.ts`'te `REPORT_REASONS`'a ek olarak `GAME_FLOW_REPORT_REASONS` (`wrong_gender` dahil), `reports.reason` kısıtına aynı değer. Ayrı liste, nedenin mekan sohbeti ve DM şikayet seçeneklerine girmemesi içindir (23.2 sunucu PR'ı): `safety` onu yalnızca masa içi kişi ve oyun geçmişi şikayetinde kabul eder.
- Neden, oyun akışındaki kişi şikayetlerinde görünür: masa içinde kişi seçerek (§22.D) ve oyun geçmişinden. Mekan sohbeti ve DM şikayetlerinde görünmez, çünkü cinsiyet kuralı orada uygulanmaz.
- Şikayet edilene bildirilmez (bugünkü kural). İnceleme bugünkü gibidir: düzeltme `pnpm admin:set-gender`, kötüye kullanımda `pnpm admin:ban`.

### 23.E Katılma isteği ve kabul (adımlar 23.1–23.3)

**İstek.**

- İstek kişi ya da masa olarak gönderilir. İstekçi masa kendi kişi sayısıyla gider; tek başına oturan kişi 1 kişilik masadır.
- İki yol aynı lobiyi ve aynı "Katıl" isteğini (`rooms/request-join`; istekçi misafir tarafın lideri olur) kullanır. Tek kişiler için ikinci bir liste ya da havuz yoktur.
- Saatte 10 istek sınırı ve 60 sn ömür (`JOIN_REQUEST_TTL_SECONDS`) aynen kalır.

**İstek kartı** (ev sahibi masa; isteği onaylayan telefon, yani tarafın lideri, §22.C):

- **Profilli istekçi** (erkek, belirtmeyen ya da profilli seçen kadın): görünen ad, yaş, fotoğraf.
  - Profil `rooms/request-profile { requestId }` ile okunur: yalnızca istek beklerken ve yalnızca onu onaylayabilen lidere. Fotoğraf imzalı URL'dir; yanıt `public_id` taşımaz (kural 4).
  - `join_requests`'e profil kolonu eklenmez; Realtime yükü profil taşımaz.
  - Adım: 23.2.
- **Anonim kadın istekçi:** takma ad ve kişi sayısı (bugünkü kart).
- Kabul ve Geç düğmeleri, 60 sn sayaç.
- **Ev sahibi masadaki profiller istekçiye kabulden önce açılmaz:** istekçi lobide yalnızca takma adı görür.
- **Red ve zaman aşımı** istekçiye birebir aynı görünür (`unavailable`), API yanıtı ve okunabilir satırlar dahil. Kural 5'in bu kısmı aynen kalır.

**Kabul buluşmadır (adım 23.3).**

- Tören ve tam ekran eşleşme görseli yoktur.
- İstekçi masanın telefonlarında (bekleyen odadan taşınan üyeler dahil, §23.C): "Kabul edildi, X masasının yanına git" (X: ev sahibi masanın takma adı).
- Ev sahibinin telefonlarında: "Y geliyor, N kişi" (Y: istekçi masanın takma adı, N: kişi sayısı).
- Durum satırları mekan ekranındaki masa kartında görünür; birleşik masa ekranına buradan geçilir.
- Katılan fiziksel olarak masaya gelir. İstekçinin bekleyen boş masası kabulde kapanır (§23.C).
- **Kabulden sonra vazgeçme:** katılan, kabulden sonra Masadakiler'de ev sahibi masanın profilli kişilerini görüp gitmemeyi seçebilir; bu bir güvenlik kapısıdır. Masadan çıkması ev sahibine bugünkü çıkış olarak görünür (red gibi gizlenmez); fiziksel dünyada gelmemekle aynı şeydir ve kabul edilebilir. Misafir tarafın son telefonu çıktıysa masa kapanır (§23.G); 3 dakika dolmadığı için oyun geçmişi kaydı ve "Arkadaş ekle" oluşmaz.
- 23.1 ile 23.3 arasında kabulden sonra bugünkü oda ekranı açılır (masa kartından, yönlendirmesiz).

### 23.F Birleşik masa ve oyunlar (adım 23.3)

- **Birleşik masa iki taraflı odadır** (`rooms.status = 'active'`). Sahip taraf lobiye açan masa, misafir taraf katılan masadır.
- **Ekran:**
  - Üstte Masadakiler şeridi: profilliler ad ve fotoğrafla, anonim kadın takma adla. Bugünkü "Odadakiler" sayfasının (§22.G, 22.5) şerit hâlidir; profil oda sürerken iki tarafa gider (kural 4, Faz 2).
  - İki sekme: Oyun Seç ve Masa Sohbeti.
- **Oyun Seç** bugünkü oyun ızgarasıdır. Öneri ve kabul kuralı (kural 3) değişmez: bir tarafın önerisini diğer taraf kabul eder.
- **Oyunlar tek masada, Faz 2'nin taraf ve çok telefon mekaniğiyle oynanır:** taraflar katılımdaki masalardır. Tabu modu tarafın kişi sayısından belirlenir (§22.B).
- **Gizli bilgi kuralları aynen geçerlidir** (kural 3, Faz 2): Tabu kartı anlatıcıya ve hakemli modda hakem tarafın telefonlarına gider, anlatıcının takım arkadaşına gitmez. İnsanlar artık aynı masada oturduğu için ekranı saklamak oyuncunun işidir; kart bugünkü gibi kapalı başlar (§19).
- **Masa Sohbeti** bugünkü oda sohbetidir (`messages`); değişmez. Oyun Seç açıkken diğer telefonlardan mesaj gelirse Masa Sohbeti sekmesinde okunmamış noktası görünür; Masa Sohbeti açılınca kalkar. Nokta yalnızca bu telefonda tutulur, sunucuda okundu durumu yoktur.
- **"Masanla oyna"** (tek masa modu, `visibility = 'private'`) kalır; oyun akışı sayılmaz (§23.D). Tek taraflı odanın ekranı (lobide bekleyen masa ve "Masanla oyna") şerit ve sekmeler olmadan bugünkü gibi kalır: oyunlar sohbetin üstünde.
- **Takım taşıma** (kişileri taraflar arasında taşımak) pilotta yoktur: taraflar katılımdaki masalardır (karar, §23.P). Karışık takım saha testinden sonra ayrı karardır.

### 23.G Masa sonu, arkadaşlık ve oyun geçmişi (adım 23.3)

**Pencere yok.**

- Bugün tanışma penceresini açan yollar 23.3'ten sonra odayı doğrudan kapatır (`status = 'closed'`; teknik karar, §23.P):
  - lider "Odayı bitir"e basar;
  - bir taraftaki son telefon çıkar (çıkış, engelleme, mekandan ayrılma, masa oturumunun bitişi: `TABLE_SESSION_HOURS`, 4 saat).
- `ending` durumu, `reveal_ends_at`, `reveal_decisions`, `reveal_signals` ve `reveal_match` yayını kullanılmaz.
- Pencerede lobiden saklama kuralı (`private.lobby_listed_from`) artık hiçbir şey saklamaz.

**Hareketsizlik** (karar, §23.P):

- **İki taraflı masa hareketsizlikle kapanmaz.** Birleşik masada insanlar yüz yüze konuşur ve telefonlar cepte durur; hareketsizlik masayı oyun aralarında kapatır, "Arkadaş ekle" anı da kaçardı. Masayı yalnızca yukarıdaki iki yol kapatır: liderin "Masayı bitir"i ve bir taraftaki son telefonun çıkışı (masa oturumunun bitişi dahil).
- **Tek taraflı masa 30 dakika hareketsizlikte sessizce kapanır.** Tek kural budur: lobide bekleyen masa (`status = 'waiting'`, `visibility = 'open'`) da "Masanla oyna" odası (`visibility = 'private'`) da. Lobide bekleyen masaya bekleyen istekler `unavailable` olur (kural 5).
- Sunucuda `private.close_idle_rooms` iki taraflı odayı atlar ve tek taraflı odayı 30 dakikada kapatır (bugün 10 dakika; `ROOM_IDLE_MINUTES` ve cron çağrısı 30 olur). Cron işinin sıklığı değişmez.

**Masa sonu ekranı.**

- Masadakiler listesi gösterilir: masada bulunmuş karşı taraf telefonları. Her birinde "Arkadaş ekle" vardır.
- İki taraf da basarsa "Arkadaş oldunuz". Tek taraf basarsa hiçbir şey olmaz ve karşı taraf bunu görmez. Mekanizma bugünkü `mutual_friend_intents`'tir.
- Arkadaş ekleme karşı taraftaki çiftler içindir. Aynı taraftakiler (birlikte gelenler) arasında yoktur.
- "Arkadaş ekle" yalnızca oyun geçmişi kaydı olan çiftte görünür; 3 dakika kuralı aynen kalır. 3 dakikadan kısa birlikte kalınan kişide düğme yoktur.
- Kapat ile mekan ekranına dönülür.

**Oyun geçmişinden "Arkadaş ekle".**

- Masa telefon cepteyken kapanırsa masa sonu ekranı hiç görülmeyebilir. Bu yüzden `friend_open` kayıtlarda aynı sessiz "Arkadaş ekle" oyun geçmişinden de sunulur: Bildirimler ekranındaki oyun geçmişi (§18.3), bugün karşılıklı "Evet" kayıtlarında olduğu gibi.
- `pure/friends.ts` → `historyAction`: `friend_open` kayıt yalnızca "Arkadaş ekle" sunar. "İstek gönder" yalnızca eski kayıtlarda (`reveal_mutual = false`, `friend_open = false`) kalır.
- İki yer aynı niyeti (`mutual_friend_intents`) yazar: masa sonunda basılan düğme geçmişte "yapıldı" görünür (`friend_action_at`). `friends_add_from_room`'da zaman sınırı yoktur.
- Bu yazılmasaydı geriye tek yol olarak görünür arkadaşlık isteği kalırdı ve sessiz karşılıklılık kaybolurdu.

**Kimlik.** Anonim katılanın profili ve profil kimliği yalnızca arkadaşlıkla açılır: arkadaşlar birbirinin profilini görür (kural 4). Bu, §23.A'daki ilkenin kendisidir.

**`friends/add-from-room`.**

- Bugün kaydın `reveal_mutual = true` olmasını ister. 23.3'te kayda yeni bir işaret gelir: `play_history.friend_open` (varsayılan `false`; teknik karar, §23.P).
- 23.3'ten sonra yazılan kayıtlarda `friend_open = true` olur ve şart `reveal_mutual or friend_open`'a döner.
- Eski kayıtlar değişmez: pencerede karşılıklı "Evet" demeyen eski çiftlere "Arkadaş ekle" sonradan açılmaz.

**Oyun geçmişi.**

- §22.F'nin çift başına kuralları aynen kalır: 3 dakika kesişim, çift başına tek kayıt, `encounter_id` çift karşılaşmasıdır.
- `private.write_pair_history` çıkışta ve pencere açılışı yerine oda kapanışında çağrılır; `available_at = now()`.
- Geçmişten arkadaşlık isteği (`friends/request { historyId }`) sunucuda kalır; ekranda yalnızca eski kayıtlarda sunulur (yukarıda). "Pencere bitmeden oda geçmişinden istek gönderilemez" kuralı anlamını yitirir, çünkü kayıt kapanışta açılır.

**Güvenlik.**

- Engelleme ve şikayet bugünkü gibi masa içinde kişi seçerek yapılır (§22.D). Pencere olmadığı için engellemenin ve ayrılmanın "Hayır" sayılması kalkar.
- Kalıcı red ve çift kilidi aynen kalır.

### 23.H Veri modeli ve migration planı

| Adım | Migration              | Değişiklik                                                                                                                                                                                                                                                                                                     |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23.1 | `…_table_lobby.sql`    | `rooms.game_tag text null check (game_tag in (CONCEPTS))`; oyun etiketi okuması (§23.C); `rooms_request_join`: istekçinin bekleyen tek taraflı odası isteği engellemez; `rooms_respond`: kabul istekçinin bekleyen odasını aynı işlemde kapatır ve üyelerini seçimleriyle misafir tarafa taşır                 |
| 23.2 | `…_gender.sql`         | `profiles.gender text null check (gender in ('female', 'male', 'unspecified'))`, kolon yetkisi kapalı, `has_gender` üretilmiş kolon; oyun akışındaki profil şartı (`anonymous_not_allowed`, `gender_required`; "Masanla oyna" hariç); istek kartı profili için okuma; `reports.reason` kısıtına `wrong_gender` |
| 23.3 | `…_table_end.sql`      | Pencere açan yolların doğrudan kapanışa dönmesi (çıkış ve engelleme yolları, "Odayı bitir"); `close_idle_rooms`: iki taraflı oda atlanır, tek taraflı oda 30 dakikada kapanır; kapanışta `write_pair_history`; `play_history.friend_open`; `friends_add_from_room` şartı                                       |
| 23.4 | `…_reveal_cleanup.sql` | Reveal fonksiyonları, `reveal_decisions`, `reveal_signals`, `rooms.reveal_*` kolonları ve `private.lobby_listed_from` kaldırılır; yalnızca okuyan kalmadığı testle gösterildikten sonra. Kaldırmanın kapsamı 23.4 PR'ında yazılır                                                                              |

- Yeni tablo yoktur; kural 2 değişmez.
- `pnpm gen:types` her migration'dan sonra çalıştırılır.
- Seed değişmez.

### 23.I RLS ve Realtime

- `profiles.gender`: kolon yetkisi `authenticated`'dan kaldırılır (`birth_date` kalıbı). Satır politikaları değişmez.
- Yeni kanal türü yoktur.
- Kabul durum satırları bugünkü `session:` kanalındaki istek olaylarından ve `rooms` değişikliğinden okunur. Yük değişmez ve profil taşımaz.
- **23.3'ten sonra:**
  - `reveal_match` yayını yapılmaz.
  - Tanışma penceresinde `presence:`'e abone olma yasağı (kural 9, Faz 2) anlamsızlaşır, çünkü pencere yoktur.
  - Kanalların politika metinleri 23.4'teki temizlikte sadeleşir.

### 23.J API (Edge Function'lar)

| Fonksiyon                    | Değişen                                                                                                                                                                                                                                                                                                                                                                                                                       | Adım      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `rooms`                      | `create { …, gameTag? }`; bekleyen odası olan masanın `request-join`'i; `respond` kabulde istekçinin bekleyen odasını kapatır ve üyelerini taşır                                                                                                                                                                                                                                                                              | 23.1      |
| `account`                    | `complete-onboarding { …, gender }`; `set-gender { gender }` (yalnızca alan boşken)                                                                                                                                                                                                                                                                                                                                           | 23.2      |
| `profile`                    | Kendi `get` yanıtında `gender`; başkası için hiçbir yanıtta yok                                                                                                                                                                                                                                                                                                                                                               | 23.2      |
| `rooms`                      | `anonymous_not_allowed`, `gender_required` ("Masanla oyna" hariç); `request-profile { requestId }`                                                                                                                                                                                                                                                                                                                            | 23.2      |
| `safety`                     | `report` ve `block { report }`: yeni neden `wrong_gender`                                                                                                                                                                                                                                                                                                                                                                     | 23.2      |
| `rooms`, `checkin`, `safety` | Pencere yerine doğrudan kapanış ("Odayı bitir", son telefonun çıkışı, mekandan ayrılma, engelleme)                                                                                                                                                                                                                                                                                                                            | 23.3      |
| `friends`                    | `add-from-room`: `friend_open` kayıtta karşılıklı "Evet" şartı yok; masa sonundan ve oyun geçmişinden aynı çağrı                                                                                                                                                                                                                                                                                                              | 23.3      |
| okuma RPC'si                 | `my_history_friends()` → `(history_id, public_id)`: o karşılaşmada iki tarafın da "Arkadaş ekle"ye bastığı (ikisinin de `mutual_friend_intents` satırı var), şu an arkadaş olan ve aralarında engel olmayan kayıtlar; ad ve DM konuşması uygulamada arkadaş listesinden. Yalnızca "şu an arkadaş" yetmez: masadan önce arkadaş olan biri anonim katıldıysa kayıt onun kimliğine bağlanırdı (kural 4). Yalnızca okur (kural 1) | 23.3      |
| `reveal`                     | 23.3'ten sonra çağrılmaz; 23.4'te kaldırılır (18 fonksiyon → 17; `config.toml`, `pnpm functions:deploy`, CLAUDE.md sayıları)                                                                                                                                                                                                                                                                                                  | 23.3–23.4 |
| `scripts/admin`              | `pnpm admin:set-gender <userId> <female\|male\|unspecified>`                                                                                                                                                                                                                                                                                                                                                                  | 23.2      |

- Kalıp değişmez: tek endpoint, `action`, zod v4, `{ error: { code, message } }`.
- Yeni hata kodları (`anonymous_not_allowed`, `gender_required`) `pure/errors.ts`'e ve Türkçe metinleri `tr.ts`'e girer.

### 23.K Kilit sırası (kural 10)

- **23.1:** kabul iki odayı kilitler: ev sahibinin odası ve istekçinin bekleyen odası.
  - Sıra: masa oturumları (`table_sessions`, bugünkü sıra) → iki `rooms` satırı `id` sırasıyla → `room_members` (bekleyen odanın üyelerinin taşınması dahil) → `join_requests`.
  - Çapraz kabul testi (`locks` kalıbı): iki masa birbirine istek gönderir ve iki istek aynı anda kabul edilir. Yalnızca biri geçer, diğeri `room_not_available` döner, kilitlenme olmaz.
  - Kural 10'a bu cümle 23.1'de eklenir.
- **23.3:** pencere kalkınca `reveal_decisions` → `reveal_signals` sırası kullanılmaz. Tablolar 23.4'te kalkınca kural metninden de çıkar.

### 23.L Analitik, yasal ve mağaza

**Analitik** (`pure/analytics.ts`):

- **Cinsiyet hiçbir olayda özellik olarak gitmez** (varsayılan; §23.P-3).
- **Kayıt hunisi olayları yalnızca herkese aynı gösterilen adımlardan tetiklenir:** fotoğraf adımı gösterildi, atlandı, yüklendi. Erkek ve belirtmeyende görünen fotoğraf notu (§23.D) ayrı bir olay değildir ve hiçbir olaya özellik olarak girmez; girseydi PostHog'a cinsiyetin vekili giderdi.
- **Oyun akışındaki `profiled` özelliği kalkar (23.2):** anonim katılım yalnızca kadın beyanıyla mümkün olduğundan `profiled: false` cinsiyetin vekili olur. Bugün bunu taşıyan olay `room_created { intent, profiled }`'dır; 23.2'de `profiled` çıkar. Mekan sohbetinin `profiled` özellikleri kalır, çünkü orada herkes anonim yazabilir.
- 23.1: lobiye açma (etiketli ya da etiketsiz), istek ve kabul.
- 23.3: `reveal_mutual` ve `reveal_none` kalkar; masa sonundaki "Arkadaş ekle" ve arkadaşlık olayları kalır.
- 23.3 (23.3b PR'ı): `reveal_mutual` ve `reveal_none` kalktı. Masa sonundaki ve oyun geçmişindeki "Arkadaş ekle" `friend_add_pressed`, eski kayıttaki "İstek gönder" `friend_request_sent { source: 'history' }` olarak kaldı; masa sonu ekranı ve sekmeler olay üretmez. `game_abandoned` masa kapanırken süren Tabu oyunu için aynen gider.
- 23.2 (23.2b PR'ı): `room_created { intent, game_tag }` (`profiled` çıktı). `participation_chosen { mode }` olayı da kalktı: yalnızca oyun akışında tetikleniyordu ve tek özelliği aynı vekildi. Cinsiyet ekranı ve fotoğraf notu olay üretmez; `onboarding_completed` herkese aynı.
- Kesin olay listesi ilgili adımın PR'ında yazılır.

**Yasal (adım 23.2, OTA'dan önce):**

- `docs/legal/kvkk-aydinlatma-metni.md` ve `gizlilik-politikasi.md`'ye cinsiyet verisi eklenir:
  - Amaç: oyun akışındaki anonimlik kuralının uygulanması.
  - Hiçbir kullanıcıya alan olarak gösterilmez ve analitiğe gitmez.
  - Açıkça yazılır: oyun akışında anonim katılım yalnızca kadın beyanıyla mümkün olduğundan, anonim görünmek cinsiyet hakkında dolaylı bilgi verir.
  - Yanlış beyan şikayet edilebilir ve düzeltilir (§23.D).
  - Hesapla silinir.
- `CURRENT_KVKK_VERSION` artırılır; mevcut kullanıcılar yeniden onaylar.
- Sayfalar taslaktır; "hukuki kontrol bekliyor" notu kalır.

**Mağaza:**

- `docs/store/listing-tr.md` → Veri güvenliği: "Kişisel bilgiler → Diğer" (cinsiyet; zorunlu; uygulama işlevi).
- **Veri güvenliği formu ve gizlilik politikası 23.2 OTA'sından önce güncellenir** (`docs/store/PLAY_CHECKLIST.md`'deki OTA sınırı: OTA, beyan edilmemiş veri toplamaya başlamak için kullanılmaz).
- Mağaza açıklaması ve ekran görüntüleri 23.4'te yeni akışa göre güncellenir.

### 23.M Kabul kriterleri ve testler

**Her adımda:**

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` ve entegrasyon testleri temiz.
- Her kod PR'ı birleşmeden önce `e2e` etiketi taşır ve E2E açık ve koyu yeşildir. Etiket PR incelemeye hazır olduğunda (taslaktan çıkarken) eklenir; taslaktaki ara push'larda E2E koşmaz (§23.N).
- Metni ya da gezinmesi değişen akış aynı PR'da güncellenir. Örneğin 23.1'de zorunlu yönlendirme kalkınca odaya giden adımlar.

**Mevcut testler:**

- Davranışı bilerek kalkan beklentiler (zorunlu yönlendirme, tanışma penceresi, reveal) yalnızca o davranışı kaldıran adımın PR'ında değişir.
- Değişen ya da silinen her test dosyası nedeniyle birlikte PR açıklamasında listelenir.
- Diğer bütün satırlar değişmez.
- Yeni davranış yeni dosyalarda test edilir: `tableLobby.test.ts` (23.1), `gender.test.ts` (23.2), `tableEnd.test.ts` (23.3).

**Adım 23.1.**

- `game_tag` yazılır ve lobi okumasından döner; geçersiz etiket `bad_request`. `venue_lobby`'nin kolonları aynı kalır.
- Bekleyen odası olan masa istek gönderir. Kabulde o oda kapanır ve ona bekleyen istekler `unavailable` olur. Red ya da zaman aşımında bekleyen oda lobide kalır.
- Bekleyen odanın üyeleri kabulde misafir tarafa üye olarak geçer; anonim ya da profilli seçimleri aynı kalır ve oda kanallarına yeni odada erişirler.
- İstekçinin odası istek beklerken birleştiyse kabul `room_not_available` döner.
- `locks`: çapraz kabul.
- Lobi okumaları `public_id`, hesap id'si ve 'profilli' işareti taşımaz.
- İstemci:
  - Mekan ekranı odası olan masada da ana ekrandır (E2E).
  - `tr.ts`'te kullanıcıya görünen "oda" kelimesi kalmadığını bir birim testi denetler.

**Adım 23.2.**

- Cinsiyetsiz `complete-onboarding` `bad_request` döner.
- Kadın anonim istek gönderir, anonim masa açar.
- Erkek ve belirtmeyen hesabın anonim isteği, oda kurması ve "Bu masadayım"ı `anonymous_not_allowed` döner. Fotoğrafsız profilli istek `photo_required`, cinsiyeti boş hesap `gender_required` döner.
- `gender` kolonu `authenticated`'a kapalıdır (`birth_date` testinin kalıbı). Başkası için hiçbir yanıt ve Realtime yükü cinsiyet taşımaz (tarama).
- `request-profile`:
  - Yalnızca onaylayabilen lidere ve yalnızca istek beklerken döner. Başkasına ya da süresi dolmuş isteğe `not_found` döner.
  - `public_id` taşımaz.
- `set-gender` yalnızca alan boşken yazar.
- Mekan sohbetinde erkek ve belirtmeyen anonim yazabilir.
- "Masanla oyna": erkek, belirtmeyen, fotoğrafsız ya da cinsiyeti boş hesap özel oda kurabilir.
- `wrong_gender` nedeniyle şikayet kaydedilir (masa içi ve oyun geçmişinden); şikayet edilen hiçbir şey görmez.
- `room_created` olayı `profiled` taşımaz (`pure/analytics.ts` birim testi).

**Adım 23.3.**

- Hiçbir yol `ending` üretmez: "Odayı bitir", son telefonun çıkışı, mekandan ayrılma, engelleme ve masa oturumunun bitişi odayı doğrudan kapatır.
- Hareketsizlik (`close_idle_rooms` doğrudan çağrılır): iki taraflı oda kapanmaz. Tek taraflı oda (lobide bekleyen ve "Masanla oyna") 30 dakikada kapanır, daha önce kapanmaz; lobide bekleyen odaya bekleyen istekler `unavailable` olur.
- Kapanışta 3 dakikayı geçen karşı taraf çiftlerine kayıt yazılır (`available_at = now()`, `friend_open = true`). Aynı taraftakiler arasında kayıt yoktur.
- `add-from-room`: iki taraf basınca arkadaş olurlar; biri basınca hiçbir şey olmaz ve karşı taraf görmez. Biri masa sonundan, diğeri oyun geçmişinden basınca da arkadaş olurlar. Eski `reveal_mutual = false` kayıtlar hâlâ açılmaz.
- `historyAction` (birim testi): `friend_open` kayıt "Arkadaş ekle", eski kayıt "İstek gönder" sunar.
- Kalıcı red, çift kilidi ve katılma isteğinin kural 5 testi değişmeden yeşil kalır.
- `reveal_match` yayını yoktur.

**Adım 23.4.**

- Ölü kod kalkar. `reveal` fonksiyonu kaldırılınca `scripts/functions/config.test.ts` 17 fonksiyonu bekler.
- `supabase/tests/reveal.test.ts` ve `teamReveal.test.ts` reveal koduyla birlikte silinir (23.3b'den beri kendi koşularında anahtarı kapatıp pencereyi sınıyorlar); diğer dosyalardaki `withWindow` testleri ve `supabase/tests/tableEndSwitch.ts` de.
- E2E akışları ve botlar (`scripts/e2e/bot-table.ts`, `13-teams.yaml` dahil) yeni akışa göre yeniden yazılır.
- `docs/FIELD_TEST.md`, mağaza metinleri ve CLAUDE.md'deki sayılar güncellenir.

**Saha testi:** 23.3'ün OTA'sından sonra 3–4 telefonla yapılır. Bulma yardımı kararı (§23.P-2) bu testin sonucuna bağlıdır.

### 23.N Uygulama sırası ve yayın

| Adım                           | Sunucu                                                                                                                    | İstemci                                                                                                                                                                                                        | Yayın                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 23.0 Belge                     | —                                                                                                                         | —                                                                                                                                                                                                              | Bu PR                                                                           |
| 23.1 Gezinme ve lobi           | `…_table_lobby.sql`; `rooms` (oyun etiketi, bekleyen masanın isteği ve kapanışı)                                          | Zorunlu yönlendirme kalkar; mekan ekranı ana ekran; masa kartı, "Masanı lobiye aç", oyun etiketi, açık masalar listesi; "oda" kelimesi UI'dan temizlenir (önce tuval). Sunucu küçük, iş ağırlıklı istemcidedir | `db push` + `rooms` deploy (dev), ardından OTA                                  |
| 23.2 Cinsiyet ve profil kuralı | `…_gender.sql`; `account`, `profile`, `rooms`; `admin:set-gender`                                                         | Kayıtta cinsiyet adımı, mevcut hesaplara ilk açılışta sorma, profilli zorunluluğu ve fotoğraf şartı, istek kartında profil (önce tuval)                                                                        | Önce `docs/legal` ve Veri güvenliği; sonra `db push` + deploy; **aynı gün** OTA |
| 23.3 Kabul-buluşma ve tek masa | `…_table_end.sql`; `rooms`, `checkin`, `safety`, `friends`; reveal akışı devre dışı, kalıcı red ve `play_history` korunur | Durum satırları, birleşik masa ekranı, masa sonu "Arkadaş ekle" listesi; tanışma ekranları kalkar (önce tuval). En büyük adım                                                                                  | `db push` + deploy; **hemen ardından** OTA; saha testi                          |
| 23.4 Temizlik ve test          | `…_reveal_cleanup.sql` (gerekirse); `reveal` fonksiyonu kalkar                                                            | Ölü kod; E2E akışları ve botlar yeniden; `FIELD_TEST.md`, mağaza metinleri                                                                                                                                     | `db push` + deploy; OTA                                                         |

**Sıra ve birleşme.**

- Her adım telefonda tek başına denenebilir: adımın sunucusu dev'e yayınlanır ve hemen ardından istemcisi OTA ile gider (22.1 kalıbı).
- Bir sonraki adımın PR'ı, önceki adımın OTA'sı telefonda kontrol edildikten sonra birleşir. Çalışma öncekinin yayınını beklemeden başlayabilir.
- İstemci işi önce tuvalde (tasarım oturumu), sonra kodda yapılır.
- **23.2 ve 23.3'te sunucu ile OTA arası kısa tutulur:**
  - Eski istemci `gender_required` ve `anonymous_not_allowed`'ı tanımaz, genel hata olarak gösterir.
  - 23.3'ün sunucusundan sonra eski istemci tanışma penceresini göremez; oda doğrudan kapanır ve uygulama mekana döner. "Arkadaş ekle" ancak OTA ile gelir.
  - Bu yüzden iki adımın sunucusu ve OTA'sı arka arkaya yayınlanır. Pilot kullanıcısı yoktur; dev projesindeki test telefonları etkilenir.
- **23.2 kademeli zorlanır** (proje sahibinin kararı, 23.2 sunucu PR'ı). Sunucu PR'ı (23.2a) bugünkü uygulamayı bozmaz, E2E'si bugünkü uygulamayla yeşil kalır:
  - 23.2a: kolon, `set-gender`, kayıtta isteğe bağlı `gender`, erkek ve belirtmeyen için `anonymous_not_allowed`, `request-profile`, `wrong_gender`, `admin:set-gender`, kural 4 ve 12, yasal metinler. Boş cinsiyet oyun akışında bugünkü gibi geçer.
  - 23.2b (istemci PR'ı, iki küçük sunucu değişikliğiyle): cinsiyetsiz `complete-onboarding` `bad_request` döner, cinsiyeti boş hesap oyun akışında `gender_required` alır ve `CURRENT_KVKK_VERSION` artar (mevcut kullanıcılar yeniden onaylar). §23.M'deki bu iki madde o PR'da test edilir.
  - **Boş cinsiyetin oyun akışında geçmesi yalnızca ara durumdur: 23.2, 23.2b "kayıtta zorunlu" ve `gender_required`'ı açıp ikisini kanıtlayan testlerle birleşmeden bitmiş sayılmaz.**
- **23.3 de kademeli zorlanır** (proje sahibinin kararı, 23.3 sunucu PR'ı). Sunucu PR'ı (23.3a) bugünkü uygulamayı bozmaz, E2E'si bugünkü uygulamayla yeşil kalır:
  - 23.3a: `…_table_end.sql`. Doğrudan kapanış, kapanışta kayıt ve yeni hareketsizlik kuralı `private.table_end_on()` anahtarının arkasındadır; anahtar kapalıdır, bugünkü pencere ve 10 dakika aynen sürer. Anahtardan bağımsız olanlar: `play_history.friend_open`, `friends_add_from_room`'un `friend_open` şartı ve `historyAction`'ın `friend_open` okuması; anahtar kapalıyken hiçbir kayıt `friend_open` almaz. `tableEnd.test.ts` anahtarı kendi koşusu için açar.
  - 23.3b (istemci PR'ı): anahtarı açan migration, cron'un 30 dakikası ve `ROOM_IDLE_MINUTES = 30`. Pencereyi bekleyen mevcut test beklentileri bu PR'da değişir (§23.M); kural 4, 5 ve 9'un 23.3 değişiklikleri bu PR'da CLAUDE.md'ye işlenir.
  - 23.3a, 23.2b birleşmeden main'e girmez.
  - **Anahtar kapalıyken 23.3 bitmiş sayılmaz: 23.3, 23.3b anahtarı istemciyle birlikte açınca biter.**
- **23.4 iki PR'dır** (proje sahibinin kararı, 23.4 başlarken; aynı a/b kalıbı):
  - 23.4a: veriyi silmeyen temizlik, migration yok. Uygulama, Edge Function'lar ve scriptler `rooms.reveal_*` kolonlarını, `reveal_decisions`, `reveal_signals` ve `private.lobby_listed_from`'u okumaz ve yazmaz; bunu bir birim testi gösterir (`scripts/reveal-removed.test.ts`, üretilen `database.ts` hariç). `reveal` fonksiyonu repodan kalkar (17 fonksiyon); pencere testleri silinir; E2E, bot, `docs/FIELD_TEST.md` ve mağaza metinleri yeni akışa göre. `functions deploy` repodan kalkan fonksiyonu barındırılan projeden silmez: `pnpm supabase functions delete reveal` dev ve üretimde elle (CLAUDE.md → "main'den dev projesine yayın" adım 6).
  - 23.4b: `…_reveal_cleanup.sql`. Reveal SQL fonksiyonları, `reveal_decisions`, `reveal_signals`, `rooms.reveal_*`, `private.lobby_listed_from`, hep açık olan `private.table_end_on()` ve dalları kalkar; Realtime politika metinleri sadeleşir; kural 9 ve 10'un metni güncellenir. Kapsam PR açıklamasında tek tek yazılır.
  - 23.4b, 23.4a'nın OTA'sı telefonlarda doğrulanıp saha testi yapılmadan birleşmez: kolonları okuyan eski istemci ya da eski fonksiyon yayın sırasında kırılmasın; bulma yardımı (§23.P-2) geri gelirse neye ihtiyaç olduğu belli olsun.
- **Açık kararlar bekletir:**
  - bulma yardımı → 23.3 saha testinden sonra;
  - analitikte cinsiyet → 23.2.

**Yayın.**

- `version` artmaz: hepsi JS ve sunucu değişikliğidir; telefonlardaki 0.3.0'a OTA ile gider.
- Yayın sırası (her sunucu adımında, Windows cmd): `pnpm supabase migration list` → `pnpm supabase db push --include-seed --skip-vault --dry-run` → `pnpm supabase db push --include-seed --skip-vault` → `pnpm functions:deploy` → `pnpm supabase functions list`.
- Yeni sır ve panel ayarı yoktur.

**PR kuralları.**

- Kod PR'ı ilk push'ta taslak (draft) olarak ve `e2e` etiketi olmadan açılır. Etiket **PR incelemeye hazır olduğunda** (taslaktan çıkarken) eklenir: etiket her push'ta tam E2E koşusu başlattığı için ara push'larda E2E koşmaz. Güvence aynı kalır, bekleme kısalır. Etiket eklendikten sonraki her push E2E'yi yeniden koşturur; birleşme için E2E açık ve koyu yeşildir.
- Açıklamada "Telefonda kontrol" (3–5 madde), "Maliyet ve risk" ve sunucu değiştiyse yayın sırası bulunur.
- Her PR "onaylandı" olmadan birleşmez. Belge PR'ları `e2e` etiketi taşımaz.

### 23.O Değişmez kurallar: adım adım değişiklikler

Bu PR kurallara dokunmaz (Faz 2 geleneği). Aşağıdaki her değişiklik ilgili adımın PR'ında CLAUDE.md'ye işlenir; o adım gelene kadar bugünkü metin geçerlidir ve bugünkü davranışı koruyan kod o adımda değişir.

**Kural 3:** değişmez. Taraflar katılımdaki masalardır; öneri ve kabul, yetki ve gizli bilgi Faz 2 ekindeki gibidir. Takım taşıma pilotta yoktur (§23.P). Karışık takım saha testinden sonra ayrı karardır; "evet" çıkarsa o işin PR'ı kurala taraf değiştirme cümlesini ekler.

**Kural 4:**

- **23.1:** Lobi yalnızca takma ad, kişi sayısı, varsa niyet ve oyun etiketini gösterir. "Profilli odada lobi … yalnızca 'profilli' işaretini görür" cümlesi lobiden 'profilli' işaretini kaldıracak biçimde değişir.
- **23.2:**
  - Asimetrik anonimlik: kadın oyun akışında anonim ya da profilli seçer, erkek ve belirtmeyen her zaman profillidir. "Masanla oyna" oyun akışı sayılmaz.
  - Profilli istekçinin görünen adı, yaşı ve fotoğrafı istek sırasında isteği onaylayan lidere gider (profil kimliği gitmez). Ev sahibi masanın profilleri istekçiye kabulden önce gitmez.
  - Cinsiyet hiçbir kullanıcıya gitmez.
  - Bu cümleler bugünkü "Profilli odada … katılma isteği yalnızca 'profilli' işaretini görür" cümlesinin yerini alır.
- **23.3:** Tanışma ve eşleşme profiline yapılan atıflar kalkar; arkadaşlık öncesi `public_id` kuralı aynen kalır.

**Kural 5 (23.3):**

- Tanışma penceresine dair cümleler kalkar: "Evet"/"Hayır", `reveal_ends_at`, pencerede lobiden saklama, engelleme ve ayrılmanın "Hayır" sayılması, hareketsizliğin pencereyi açması, Faz 2 ekinin kişi başı tanışma kısmı.
- Yerine:
  - İki taraflı masa hareketsizlikle kapanmaz. Tek taraflı masa (lobide bekleyen ve "Masanla oyna") 30 dakika hareketsizlikte sessizce kapanır; lobide bekleyen masaya bekleyen istekler `unavailable` olur.
  - Masa sonunda "Arkadaş ekle" karşı taraftaki her çift için ayrıdır ve aynı sessiz düğme oyun geçmişinden de sunulur. İki taraf basarsa arkadaş olunur; tek taraf basarsa hiçbir şey olmaz ve görünmez.
- Aynen kalanlar:
  - katılma isteğinde ve "Bu masadayım"da red ve zaman aşımının aynı görünmesi;
  - arkadaşlık isteğinde red ve kalıcı red;
  - arkadaşlıktan çıkarma;
  - mekan sohbetinden gelen isteğin günlük sınırı;
  - aynı taraftakiler arasında oyun geçmişi ve "Arkadaş ekle" olmaması.

**Kural 9 (23.3):** `reveal_match` yayını ve pencerede `presence:` yasağı kalkar. Oda kanallarının üyelik kuralı (Faz 2) aynen kalır.

**Kural 10:**

- **23.1:** kabulde iki oda `id` sırasıyla kilitlenir (§23.K).
- **23.4:** `reveal_decisions` ve `reveal_signals` kaldırılınca kural metninden çıkar.

**Kural 12 (yeni, 23.2):**

> "Cinsiyet kayıtta zorunludur (Kadın, Erkek, Belirtmek istemiyorum) ve istemciye kapalı kolondur; hiçbir kullanıcıya gösterilmez, hiçbir yanıt, Realtime yükü ya da analitik olayı taşımaz ve uygulamadan değiştirilemez. Yalnızca oyun akışındaki anonimlik kuralını uygular ('Masanla oyna' oyun akışı sayılmaz): kadın anonim ya da profilli katılır, erkek ve belirtmeyen her zaman profillidir. Oyun akışında anonim katılım yalnızca kadın beyanıyla mümkün olduğundan, anonim görünmek cinsiyet hakkında dolaylı bilgi verir; cinsiyet alan olarak hiçbir yerde gösterilmez."

**Değişmeyen kurallar:** 1, 2, 6, 7, 8 ve 11.

**Proje paragrafı:** bu PR'da CLAUDE.md'ye işlendi.

### 23.P Kararlar

**Proje sahibinin kararları (#108 incelemesi):**

1. **Hareketsizlik** (§23.G; adım 23.3):
   - İki taraflı masa hareketsizlikle kapanmaz. Yalnızca liderin "Masayı bitir"i, son telefonun çıkışı ya da masa oturumunun bitişi kapatır.
   - Tek taraflı masa 30 dakika hareketsizlikte sessizce kapanır. Tek kural budur: lobide bekleyen masa da "Masanla oyna" odası da.
2. **Takım taşıma (P-1)** (§23.F): pilotta yok. Taraflar katılımdaki masalardır. Karışık takım saha testinden sonra ayrı karardır.
3. **Bekleyen masanın üyeleri (P-4)** (§23.C; adım 23.1): kabulde misafir tarafa üye olarak taşınırlar; anonim ya da profilli seçimleri aynen kalır.
4. **Mekan sohbeti** (§23.D): §22.G okuması doğru, aynen kalır. "Mekan sohbeti değişmez" kararı §22.G'nin check-in başına tek seçimidir: herkes anonim yazabilir; seçim ilk mesajda yapılır ve o check-in boyunca değişmez.
5. **Yanlış cinsiyet beyanı** (§23.D; adım 23.2): şikayet nedenlerine eklenir.

**Açık kararlar (karar verilmeden ilgili iş başlamaz):**

- **P-2. Bulma yardımı.**
  - Soru: kabul anındaki iki satır kalabalık mekanda yeterli mi?
  - Yetmezse eski renk-emoji ekranı geri gelebilir.
  - Karar saha testinden sonra verilir.
- **P-3. Analitikte cinsiyet.**
  - Kayıt hunisindeki fotoğraf adımı kaybı ölçülecek.
  - Varsayılan: cinsiyet PostHog'a özellik olarak gitmez; ölçüm cinsiyetsiz olay sayımlarıyla yapılır (§23.L).

**Bu bölümde verilen teknik kararlar (onaylı):**

- **Pencere açan her yol doğrudan kapanır** (§23.G): "Tanışma penceresi kalkar" kararının sunucudaki karşılığı.
- **`anonymous_not_allowed` reddi** (§23.D): erkek ve belirtmeyenin anonim isteği sessizce profilliye çevrilmez; kimse ekranda görmeden profiliyle görünmez.
- **`gender_required`** (§23.D): cinsiyeti boş hesap oyun akışına giremez. Check-in, Keşfet ve mekan sohbeti bunu istemez.
- **İstek kartı profili `rooms/request-profile` ile okunur** (§23.E): `join_requests`'e ve Realtime yüküne profil girmez.
- **`play_history.friend_open`** (§23.G): şart yalnızca yeni kayıtlarda kalkar; eski çiftlere "Arkadaş ekle" sonradan açılmaz.
- **Oyun etiketi `venue_lobby`'nin kolonlarını değiştirmeden okunur** (§23.C).
- **'profilli' işareti lobiden kalkar** (§23.C): işaret cinsiyete dair ipucu olurdu.
- **Çapraz kabul kilidi** (§23.K): iki `rooms` satırı `id` sırasıyla kilitlenir.
- **"Bu masadayım" ve süren masalar kalır** (§23.C): çok telefonlu masanın sonradan gelen telefonu için.

**İncelemeden gelen eklemeler** (CTO incelemesi, maddeler 2, 3, 4, 5, 6 ve 8):

- Oyun geçmişinden "Arkadaş ekle" (§23.G).
- "Masanla oyna" oyun akışı sayılmaz (§23.D).
- Kayıt hunisi olayları yalnızca herkese aynı gösterilen adımlardan (§23.L).
- Kural 12'de ve gizlilik politikasında dolaylı bilgi cümlesi (§23.D, §23.L, §23.O).
- Kabulden sonra vazgeçme (§23.E).
- `e2e` etiketi PR incelemeye hazır olunca (§23.M, §23.N).

**İncelemeden sonra eklenen teknik ayrıntılar (onaylı):**

- **`room_created` olayından `profiled` kalkar** (§23.L): 23.2'den sonra `profiled: false` cinsiyetin vekili olurdu.
- **`wrong_gender` yalnızca oyun akışındaki kişi şikayetlerinde görünür** (§23.D): mekan sohbeti ve DM şikayetlerinde cinsiyet kuralı uygulanmaz.
- **`friend_open` kaydın geçmiş satırı yalnızca "Arkadaş ekle" sunar** (§23.G): bugün karşılıklı "Evet" kaydında olduğu gibi; "İstek gönder" eski kayıtlarda kalır.
- **Bekleyen odadan taşınan üyeler istekçiyle aynı durum satırını görür** (§23.E).
