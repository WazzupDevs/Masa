# MVP Spec — Mekan İçi Sosyal Oyun Uygulaması

Çalışma adı: Masa (değişebilir)

## 1. Ürün tanımı
Aynı mekandaki insanların, konsept üzerine kurulu odalarda birlikte oyun oynayıp sohbet edebildiği bir mobil uygulama. Tanışma ikinci planda ve isteğe bağlı: iki taraf da isterse oda sonunda fiziksel olarak buluşurlar. Kafe anlaşması gerekmez.

**MVP'nin test ettiği hipotez:** İnsanlar mekandaki yabancılarla oyun ve sohbet üzerinden etkileşime girmek için odalarını mekana açıyor mu?

## 2. Temel kavramlar
- **Masa (`table_session`):** Tek telefon, tek masa demek. Hesap sahibi masayı açar ve kişi sayısını girer (1-6). Masadaki diğer kişilerin hesabı olmaz. Masa rastgele bir takma ad alır ("Mor Baykuş" gibi); bu ad check-in süresince geçerlidir.
- **Mekan (`venue`):** Önceden seed edilmiş mekanlar. MVP'de kullanıcı mekan ekleyemez.
- **Oda (`room`):** Bir masanın kurduğu ve bir konsepte (Tabu ya da Sohbet) sahip alan. En fazla 2 masa alır. Görünürlük `private` (sadece kendi masam) ya da `open` (mekan lobisinde listelenir) olabilir.
- **Lobi:** Bir mekandaki `open` ve `waiting` durumundaki odaların listesi.
- **Katılma isteği:** Lobideki bir odaya katılmak için gönderilen istek. Oda sahibi kabul eder ya da etmez.

## 3. Kapsam

### İçeride
- Telefon doğrulamalı hesap, takma ad, 18+ onayı
- Mekan check-in'i ve masa oturumu
- Oda kurma, mekan lobisi, katılma isteği
- Oda içi sohbet
- Üç konsept: Tabu (tek masa, sesli), Tabu (iki masa, yazılı, işbirliği), Sohbet kartları
- Oda sonunda karşılıklı tanışma sinyali
- Şikayet, engelleme, küfür filtresi, hesap silme
- Push bildirimleri (katılma isteği, kabul)
- Ürün analitiği

### Dışarıda (v2 ve sonrası)
- Ödeme, jeton, abonelik
- BLE ile aynı mekanda olmayı doğrulama
- Web üzerinden misafir katılımı
- Fotoğraflı profil, arkadaş listesi, oda dışı mesajlaşma
- İkiden fazla masalı odalar
- Skor tabloları, rozetler
- Kullanıcının mekan eklemesi

## 4. Ana akışlar

### 4.1 Onboarding
1. Telefon numarası girilir, SMS ile OTP gelir (Supabase Auth).
2. Takma ad seçilir (3-20 karakter, küfür filtresinden geçer). Bu ad diğer kullanıcılara hiç gösterilmez.
3. "18 yaşından büyüğüm" onayı, Kullanım Koşulları ve KVKK aydınlatma metni onayı alınır. Onaylar zaman damgasıyla saklanır.

### 4.2 Check-in ve masa
1. Konum izni istenir (sadece "uygulama kullanılırken"). Arka planda konum takibi yok.
2. Konum bir kez alınır. `nearby_venues` RPC'si 300 m içindeki mekanları mesafeye göre sıralı döner.
3. Kullanıcı mekanı seçer. Sunucu mesafeyi tekrar kontrol eder (300 m). Koordinat saklanmaz. `checkin` fonksiyonu koordinatı loglamaz ve hata mesajlarında da döndürmez.
4. Kişi sayısı girilir, masa oluşur, takma ad atanır. Takma ad `content/aliases-tr.json` içindeki sıfat ve hayvan listelerinden üretilir ve mekandaki aktif masalar arasında benzersizdir.
5. Masa 4 saat sonra ya da kullanıcı "Mekandan ayrıl" dediğinde biter. Biten masanın odaları kapanır.

### 4.3 Oda kurma ve lobi
1. Masa, konsept (Tabu / Sohbet) ve görünürlük (Sadece masam / Mekana açık) seçerek oda kurar.
2. `open` oda lobide şu bilgilerle görünür: masa takma adı, kişi sayısı, konsept, bekleme süresi. Masa numarası, konum ya da profil bilgisi yok.
3. Lobide açık oda yoksa lobi bölümü hiç gösterilmez. Onun yerine "Masanla oyna" çağrısı görünür.
4. Bir masa aynı anda yalnızca bir odada olabilir.
5. Engelleme iki yönlüdür: engellenen kullanıcının odaları lobide görünmez, o da seninkileri görmez.

### 4.4 Katılma isteği
1. Lobideki bir odaya "Katılmak istiyorum" denir.
2. Oda sahibine push bildirimi ve uygulama içi pencere gelir: "Mor Baykuş (3 kişi) odana katılmak istiyor" — Kabul / Geç. Süre 60 saniye.
3. Kabul edilirse iki masa odaya girer.
4. "Geç" ya da 60 saniyelik zaman aşımı, istek sahibine aynı görünür: "Masa şu an müsait değil." İstek sahibine dönen durum her iki halde de `unavailable`.
5. Bir masanın aynı anda en fazla 1 bekleyen isteği olabilir. Saatte en fazla 10 istek gönderilebilir.
6. `unavailable` ile sonuçlanan istekten sonra aynı masa aynı odaya tekrar istek gönderemez.

### 4.5 Oda içi
- Üstte konsept alanı (oyun ya da sohbet kartı), altta sohbet.
- Menüde: Odadan çık, Şikayet et, Engelle.
- Sahibi çıkarsa oda kapanır. Misafir çıkarsa oda `waiting` durumuna döner; oda açıksa lobiye geri düşer.
- 10 dakika hareketsiz kalan oda kapanır.

### 4.6 Oda sonu ve tanışma
1. İki masalı bir oda biterken (Tabu bittiğinde ya da biri "Odayı bitir" dediğinde) iki masaya da "Tanışalım mı?" sorusu gelir. Süre 60 saniye.
2. İki taraf da "Evet" derse iki ekranda aynı renk ve emoji 60 saniye tam ekran görünür: "Ekranını kaldır, birbirinizi bulun."
3. Diğer tüm durumlarda (hayır, cevapsız) iki tarafa da "Güzel oyundu 👋" gösterilir ve lobiye dönülür. Kimin hayır dediği asla gösterilmez.

## 5. Konseptler

### 5.1 Tabu — tek masa (sesli)
- Oda tek masalıyken oynanır. Tamamen istemci tarafında çalışır, sunucu yalnızca desteyi sağlar.
- Tek masa Tabu sürerken gelen katılma isteği kabul edilebilir. Kabulde yerel oyun biter; iki masalı oyun (§5.2) sıfırdan ve sunucu otoriter olarak başlar. Destenin istemcide kalmış olması sorun değildir: iki masalı oyun işbirliğidir, hile teşviki yoktur.
- Kart: hedef kelime ve 5 yasak kelime. Tur 60 saniye. Butonlar: Doğru / Pas / Tabu.
- İki takım (A/B) sırayla oynar. Varsayılan: takım başına 3 tur.

### 5.2 Tabu — iki masa (yazılı, işbirliği)
- İki masa tek takımdır: ortak skor, süreye karşı. İşbirliği tanışmaya rekabetten daha iyi hizmet eder ve sabotaj teşviki yaratmaz.
- Tur sırası: Masa A anlatır, Masa B tahmin eder, sonra roller değişir. Toplam 6 tur (her masa 3 kez anlatır), tur başı 60 saniye.
- Anlatan masa hedef kelimeyi ve yasakları görür, ipucu yazar. İstemci gönderimden önce uyarır, sunucu son kararı verir. Yasak kelimeyi, hedef kelimeyi ya da bunların kökünü içeren ipucu reddedilir (ceza yok, sadece gönderilmez).
- Tahmin eden masa ipucu akışını görür ve tahmin yazar. Doğru tahmin +1 puan getirir ve yeni kart gelir.
- Tur başına en fazla 3 pas.
- Kart kelimesi yalnızca anlatan masaya gider (Edge Function yanıtıyla). Oda durumunda (`game_state`) kart bilgisi tutulmaz. Tahmin eden masa kelimeyi ancak kart kapandığında görür.
- Sunucu otoriterdir: kart seçimi, `ends_at`, ipucu doğrulama, tahmin kontrolü, skor.
- Oyun sonunda ortak skor gösterilir, ardından §4.6.

### 5.3 Sohbet kartları
- Tek ya da iki masalı odada oynanır. Deste temalara ayrılır: Isınma, Film/Dizi/Müzik, "Hiç … yaptın mı?", Derin.
- Oda ekranında güncel kart görünür. İki masa da "Sonraki"ye basabilir (5 saniye bekleme süresi). Sohbet altta.
- Oyun sonu yok. "Odayı bitir" ile §4.6'ya geçilir.

## 6. Türkçe metin eşleştirme (kritik modül)
`supabase/functions/_shared/pure/trText.ts`: bağımlılıksız, saf TypeScript. Hem mobil uygulama (`@shared/*` alias'ı) hem Edge Function kullanır. Unit test (vitest) zorunlu.

- `normalize(s)`: `toLocaleLowerCase('tr-TR')`, ardından Türkçe karakter katlama (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u), ardından harf ve rakam dışındaki her şeyi boşluğa çevirme.
- `tokenize(s)`: boşluklardan böler. Ardışık tek harfli token dizilerini birleştirir ("d e n i z" → "deniz").
- `containsForbidden(clue, words)`: hedef kelime ve her yasak kelime için kök = `normalize(kelime)`. Kök en az 4 harfse `token.startsWith(kök)` eşleşme sayılır. 4 harften kısaysa sadece tam eşleşme sayılır.
- `isCorrectGuess(guess, target)`: normalize edilmiş tahmin hedefe eşitse ya da hedefle başlayıp en fazla 4 harf uzunsa doğrudur.
- Zorunlu test vakaları: "denizde", "Denize", "DENİZ", "deniz'de", "d e n i z", "Ilık" / "ılık", "İstanbul" / "istanbul", "öğretmen" / "ogretmen", kısa kök yanlış pozitifi ("kar" yasakken "kara" eşleşmemeli).
- Bilinen ödünleşim: 4 harften kısa köklerde ekli haller ("karda") yakalanmaz. MVP için kabul edilebilir.

`profanity.ts`: `content/profanity-tr.json` listesi ve aynı `normalize` ile çalışır. Takma adlara, sohbete ve ipuçlarına uygulanır.

## 7. Sohbet kuralları
- Yalnızca oda içinde ve yalnızca odadaki masalar görür. Mesaj masa takma adıyla görünür.
- Mesaj en fazla 200 karakter. Masa başına saniyede en fazla 1 mesaj.
- Gönderim `chat` Edge Function'ı üzerinden yapılır (küfür filtresi ve rate limit).
- Oda kapandıktan 24 saat sonra mesajlar silinir (pg_cron). Şikayet edilen odanın son 50 mesajı şikayet kaydına kopyalanır ve 30 gün tutulur.

## 8. Güvenlik ve uyumluluk
- **Şikayet:** Oda menüsünden yapılır. Sebep seçilir (Taciz, Uygunsuz içerik, Spam, Diğer). Son 50 mesajın kopyası eklenir.
- **Engelleme:** Masa değil kullanıcı bazlıdır: engellenen, karşı masanın hesap sahibidir (masadaki diğer kişilerin hesabı yoktur). Takma adlar her check-in'de değiştiği için masa bazlı engelleme işe yaramaz. Görünmezlik iki yönlüdür.
- **Ban:** `profiles.is_banned` alanı. MVP'de Supabase panelinden elle yönetilir. Banlı kullanıcı check-in yapamaz. Banlı kullanıcının telefon numarası, sunucu tarafı gizli anahtarla HMAC'lenmiş hash olarak `banned_phones` tablosunda tutulur ve kayıtta kontrol edilir; aksi halde ban, hesabı silip yeniden kayıt olarak aşılabilir.
- **Hesap silme:** Kullanıcının tüm verisi silinir. `reports.reporter_id` ve `reports.reported_user_id` `ON DELETE SET NULL`'dır; şikayet kaydı ve mesaj kopyası 30 gün sonunda yine silinir.
- **App Store / Play:** Kullanıcı içeriği barındıran uygulamalar için şikayet, engelleme, filtre ve iletişim bilgisi gerekir. Uygulama içi hesap silme zorunludur.
- **KVKK:** Aydınlatma metni, konum için açık rıza ve gizlilik politikası URL'i (mağaza için de gerekli).
- **SMS:** Türkiye'ye OTP teslimatını ve maliyetini seçilen sağlayıcıyla M1'de test et.

## 9. Mimari

### Stack
- **Mobil:** Expo (güncel SDK, development build), expo-router, TypeScript strict, @supabase/supabase-js, TanStack Query (sunucu durumu), Zustand (yerel durum), NativeWind, expo-location, expo-notifications, posthog-react-native.
- **Backend:** Supabase: Auth (telefon OTP), Postgres + PostGIS + RLS, Realtime, Edge Functions (Deno), pg_cron.
- **Yerel geliştirme:** Supabase test OTP numaraları (`config.toml` içinde). Supabase CLI root `devDependency` olarak sabitlenir.
- **Test:** Tek test çatısı vitest. İş mantığı `_shared/pure/` modüllerinde, Edge Function handler'ları ince.
- **Paylaşılan kod:** `supabase/functions/_shared/pure/` bağımlılıksız saf TypeScript'tir (Deno API'si ya da `npm:` import'u yok). Mobil uygulama `@shared/*` alias'ı ve Metro `watchFolders` ile yalnızca bu klasörü kullanır. Veritabanı tipleri de burada tek dosyadır (`pure/database.ts`).

### Repo yapısı
```
/
├─ CLAUDE.md
├─ MVP_SPEC.md
├─ apps/mobile/              Expo uygulaması
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  ├─ seed.sql               scripts/ tarafından üretilir
│  └─ functions/
│     ├─ _shared/            auth.ts, broadcast.ts, push.ts (Deno'ya özgü)
│     │  └─ pure/            trText.ts, profanity.ts, database.ts, iş mantığı (bağımlılıksız, mobil de kullanır)
│     ├─ checkin/            check-in, leave
│     ├─ rooms/              create, request-join, respond, leave, end
│     ├─ tabu/               start, current-card, clue, guess, pass, end-turn
│     ├─ sohbet/             next-card
│     ├─ chat/               send
│     ├─ reveal/             decide, finalize
│     ├─ safety/             report, block
│     └─ account/            update-profile, register-push, delete
├─ content/                  tabu-cards.json, sohbet-cards.json, profanity-tr.json, venues-pilot.json,
│                            aliases-tr.json
└─ scripts/                  içerikten seed üretimi (seed.sql commit'lenir)
```

### Veri modeli
```
profiles          id (= auth.users.id), nickname, push_token, is_banned,
                  terms_accepted_at, kvkk_accepted_at, location_consent_at, created_at
venues            id, name, city, district, location geography(Point),
                  source, source_ref, is_active
table_sessions    id, user_id, venue_id, alias, headcount, status (active|ended),
                  created_at, expires_at
rooms             id, venue_id, owner_session_id, guest_session_id (nullable),
                  concept (tabu|sohbet), visibility (private|open),
                  status (waiting|active|ending|closed), game_state jsonb,
                  reveal_result (null|mutual|none), reveal_token jsonb, reveal_ends_at,
                  last_activity_at, created_at, closed_at
join_requests     id, room_id, requester_session_id,
                  status (pending|accepted|declined|expired), created_at, expires_at
messages          id, room_id, session_id, body, created_at
cards             id, deck (tabu|sohbet), theme, word, forbidden text[], prompt, is_active
tabu_turns        id, room_id, turn_no, describer_session_id, card_id,
                  started_at, ends_at, passes_used, score
game_events       id, room_id, turn_id, session_id,
                  type (clue|guess|correct|pass|card_closed), payload jsonb, created_at
reveal_decisions  room_id, session_id, wants_meet, created_at   PK (room_id, session_id)
reports           id, reporter_id (null, ON DELETE SET NULL),
                  reported_user_id (null, ON DELETE SET NULL), room_id, reason,
                  messages_snapshot jsonb, status, created_at
blocks            blocker_id, blocked_id, created_at            PK (blocker_id, blocked_id)
banned_phones     phone_hash (HMAC, sunucu gizli anahtarı) PK, created_at
```

### RLS ve okuma kuralları
- Tüm tablolarda RLS açık. İstemcinin hiçbir tabloda insert, update ya da delete izni yok.
- İstemcinin çağırdığı security definer RPC'ler (`nearby_venues`, `venue_lobby`) yalnızca okur ve `set search_path = ''` ile tanımlanır.
- `venues`: kimliği doğrulanmış herkes okuyabilir.
- `profiles`, `table_sessions`: sadece kendi satırı.
- Lobi, tablo okumasıyla değil `venue_lobby(venue_id)` RPC'siyle gelir (security definer). Yalnızca güvenli kolonları döner (oda id, masa takma adı, kişi sayısı, konsept, bekleme süresi) ve engellemeleri filtreler.
- `rooms`, `messages`, `game_events`: sadece odadaki masaların sahibi okur.
- `tabu_turns`: odadakiler okur ama `card_id` kolonu istemciye açılmaz (view üzerinden). Kart kelimesi yalnızca `tabu/current-card` ile anlatana gider.
- `cards`: `sohbet` destesi okunabilir. `tabu` destesi istemciye kapalı; tek masa modu desteyi `tabu/start` üzerinden alır.
- `join_requests`: istek sahibi `declined` ve `expired` durumlarını `unavailable` olarak görür (view). Oda sahibi kendi odasına gelen istekleri görür.
- `reveal_decisions`: sadece kendi kararı. Sonuç `rooms.reveal_result` ve `reveal_token` alanlarıyla gelir.

### Realtime
- **Lobi:** Edge Function'lar `venue:{id}` kanalına veri içermeyen `lobby_changed` yayını yapar. İstemci bunu duyunca `venue_lobby` RPC'sini yeniden çağırır. Lobi verisi Realtime üzerinden taşınmaz.
- **Oda:** `rooms`, `messages` ve `game_events` için `room_id` filtreli Postgres Changes (RLS geçerli). Aynı kanalda presence ile bağlantısı kopan masa tespit edilir.
- **Katılma isteği:** Oda sahibine `session:{id}` kanalından yayın, uygulama arka plandaysa push.

### Zamanlama
- Tur süresi sunucuda `ends_at` olarak tutulur. İstemci geri sayımı buna göre gösterir. `ends_at` sonrasında gelen ipucu ya da tahmin reddedilir.
- Tur geçişi: geri sayım bittiğinde herhangi bir istemci `tabu/end-turn` çağırır. Sunucu süreyi kontrol eder, işlem idempotenttir. Cron gerekmez.
- Oda sonu: "Tanışalım mı?" penceresi açılınca oda `ending` durumuna geçer ve `reveal_ends_at` set edilir. İki karar da gelince `reveal/decide` odayı hemen kapatır. Gelmezse süre bitiminde herhangi bir istemci `reveal/finalize` çağırır (`tabu/end-turn` gibi idempotent). pg_cron yalnızca güvenlik ağıdır.
- pg_cron (her dakika): hareketsiz odaları kapat, süresi dolan masaları bitir, süresi dolan istekleri `expired` yap, süresi geçmiş `ending` odaları kapat. Saatlik: mesaj temizliği.

### Push
- Expo push token `account/register-push` ile kaydedilir.
- Gönderim Edge Function'dan Expo push API'sine yapılır. İki olay var: oda sahibine katılma isteği, istek sahibine kabul.

## 10. Ekranlar
1. **Onboarding:** Telefon, OTP, takma ad, 18+ ve onaylar.
2. **Check-in:** Konum izni açıklaması, yakındaki mekanlar (ad, mesafe), seçim, kişi sayısı. Sonunda atanan masa takma adı gösterilir.
3. **Mekan ana ekranı:** Üstte mekan adı ve masa takma adı. "Oda kur" butonu (konsept ve görünürlük seçimi). Altta açık odalar listesi; liste boşsa bölüm gizli ve yerine "Masanla oyna" görünür. Bekleyen istek varsa durumu gösterilir.
4. **Katılma isteği penceresi (oda sahibi):** "Mor Baykuş (3 kişi) Tabu odana katılmak istiyor." Kabul / Geç, 60 saniyelik geri sayım.
5. **Oda:** Başlıkta konsept ve masa takma adları. Ortada konsept alanı. Altta açılıp kapanan sohbet. Menü: Çık, Şikayet et, Engelle, Odayı bitir.
6. **Tabu (tek masa):** Kart, geri sayım, Doğru / Pas / Tabu, takım skorları.
7. **Tabu (iki masa):** Anlatan için kelime, yasaklar ve ipucu girişi (yasak kelimede anlık uyarı). Tahmin eden için ipucu akışı ve tahmin girişi. Ortak skor, geri sayım, tur bilgisi.
8. **Oda sonu:** Skor (varsa), "Tanışalım mı?" Evet / Hayır. Eşleşme olursa tam ekran renk ve emoji, olmazsa "Güzel oyundu" ve lobiye dönüş.
9. **Profil ve ayarlar:** Takma ad, engellenenler, gizlilik politikası, iletişim, çıkış, hesabı sil.

## 11. İçerik
- `tabu-cards.json`: en az 500 kart, format `{ word, forbidden: [5] }`. Yasaklar tek kelime olmalı ve hedefle aynı kökten gelmemeli. Argo ya da cinsel içerik yok.
- `sohbet-cards.json`: en az 150 kart, 4 temaya dağılmış.
- `venues-pilot.json`: pilot bölgedeki mekanlar (ad, koordinat, ilçe). Google Places ya da OpenStreetMap'ten tek seferlik çekilir ve elle kontrol edilir. Çalışma anında harita API'si çağrılmaz.
- `profanity-tr.json`: Türkçe küfür ve hakaret listesi.
- `aliases-tr.json`: masa takma adları için sıfat ve hayvan listeleri (`{ adjectives: [], animals: [] }`).
- İçerik Claude ile üretilir, elle ayıklanır ve seed script'iyle yüklenir.

## 12. Analitik
**Event'ler:** `onboarding_completed`, `check_in`, `room_created {concept, visibility}`, `join_requested`, `join_accepted`, `join_unavailable`, `room_two_tables`, `game_completed {concept, score}`, `reveal_mutual`, `reveal_none`, `report_submitted`, `block_created`, `session_ended {duration_min}`.

**Metrikler:**
- **Açık oda oranı** (en kritik) = `open` oda kuran masalar / check-in yapan masalar
- İstek kabul oranı = `join_accepted` / `join_requested`
- İki masalı odalarda oyun tamamlama oranı
- Karşılıklı tanışma oranı = `reveal_mutual` / iki masalı odalar
- İkinci hafta geri dönüş oranı

## 13. Kilometre taşları
Her taş ayrı bir Claude Code oturumunda ele alınır. Kabul kriterleri karşılanmadan sonrakine geçilmez.

**M0 — Altyapı**
Kapsam: pnpm monorepo, Expo development build, Supabase yerel ortam, migration iskeleti (yalnızca extension'lar: PostGIS, pg_cron), lint, typecheck, test altyapısı (vitest). Edge Function yok.
Kabul: `pnpm typecheck` ve `pnpm lint` temiz. Uygulama Android fiziksel cihazda `expo run:android` ile açılıyor. `supabase db reset` hatasız çalışıyor.

**M1 — Auth ve profil**
Kapsam: telefon OTP, takma ad, onaylar, push token kaydı, hesap silme, `banned_phones`. İlk Edge Function (`account`) ile `supabase functions serve` doğrulanır.
Kabul: test numarasıyla giriş yapılabiliyor. Onaylar zaman damgasıyla kayıtlı. Hesap silme kullanıcının tüm verisini siliyor. Türkiye'ye gerçek SMS teslimatı denendi.

**M2 — Mekan ve masa**
Kapsam: `nearby_venues`, `checkin` fonksiyonu, takma ad üretimi (`aliases-tr.json`), masa süresi.
Kabul: pilot seed ile 300 m listesi doğru. 300 m dışından check-in reddediliyor. Koordinat hiçbir tabloda saklanmıyor.

**M3 — Oda, lobi ve katılma isteği**
Kapsam: `rooms` fonksiyonu, `venue_lobby` RPC, lobi yayını, 60 saniyelik istek akışı, push, engelleme filtresi.
Kabul: iki cihazda istek ve kabul uçtan uca çalışıyor. Red ile zaman aşımı istek sahibi tarafında, ağ yanıtı dahil, ayırt edilemiyor. Engellenen kullanıcı lobide görünmüyor.

**M4 — Sohbet ve güvenlik**
Kapsam: `chat` fonksiyonu, küfür filtresi, rate limit, Realtime, şikayet (mesaj kopyasıyla), engelleme, temizlik job'ı.
Kabul: filtre ve rate limit sunucuda çalışıyor. Şikayet kaydında son 50 mesaj var. Kapanan odanın mesajları 24 saat sonra siliniyor.

**M5 — Konseptler**
Kapsam: önce `trText.ts` ve testleri, sonra Tabu tek masa, Tabu iki masa, Sohbet kartları, içerik seed'i.
Kabul: §6'daki tüm test vakaları geçiyor. İki cihazda iki masalı Tabu baştan sona oynanabiliyor. Tahmin eden cihaz ağ trafiğinde kart kelimesini kart kapanmadan görmüyor.

**M6 — Oda sonu ve tanışma**
Kapsam: `reveal` fonksiyonu (`decide`, `finalize`), 60 saniyelik karar penceresi (`reveal_ends_at`), tam ekran sinyal.
Kabul: yalnızca karşılıklı "Evet"te sinyal görünüyor. Diğer durumlarda iki taraf aynı ekranı görüyor.

**M7 — Analitik ve mağaza**
Kapsam: PostHog event'leri, gizlilik politikası, mağaza metinleri, EAS build, iOS build, TestFlight ve Play dahili test.
Kabul: §12'deki tüm event'ler PostHog'a düşüyor. Uygulama iki mağazanın test kanalında.

Tahmini süre: tek geliştirici ve Claude Code ile yaklaşık 8 hafta. Ardından kapalı test ve pilot.

## 14. Açık kararlar
- Uygulama adı
- Pilot bölgesi ve mekan listesi
- SMS sağlayıcı
