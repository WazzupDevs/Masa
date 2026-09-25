# Masa v2 — Teknik tasarım

Durum: **onaylandı** (26.09.2026). Proje sahibinin düzeltmeleri (EXIF, engelle/çıkar ile şikayet, arkadaşlık öncesi `public_id`, `profile/get` yanıtları, hesap çiftine bağlı kalıcı red) ve S1–S17'nin cevapları işlendi. Kararlar `MVP_SPEC.md`, `CLAUDE.md` ve `docs/DECISIONS.md`'ye de işlendi. Uygulama §12'deki sırayla yapılır; her adım kendi dalı ve PR'ıyla. Bu belgede olmayan bir karar gerekirse uygulama durur ve proje sahibine sorulur.

Bu belge v2 ürün kararlarını (navigasyon, Keşfet, profil, arkadaşlar ve DM, sesli Tabu) mevcut şemaya, RLS'e, Edge Function'lara ve Realtime'a oturtur.

Faz 8A'da v2'nin native bağımlılıkları build'e girdi: MapLibre, `expo-image-picker`, `expo-image-manipulator`. `expo-notifications` M0'dan beri kurulu. Bu yüzden aşağıdaki adımların hepsi, tek bir istisna dışında, **sunucu deploy'u + OTA** ile gider. İstisna: DM push'u, Firebase'in `google-services.json`'ı build'e girmemişse yeni bir build ister (§12).

---

## 1. İlkeler (v1'den korunanlar)

1. **İstemci yazmaz.** Her yazma bir Edge Function üzerinden gider. Profil fotoğrafı da buna dahil (§5.3).
2. **Diğer kullanıcıların hesap kimliği (`auth.users.id`) istemciye gitmez.** v2'de kişiler iki kimlikle tanınır:
   - **Masa oturum id'si:** takma kimlik, check-in süresince geçerli.
   - **Profil kimliği `profiles.public_id`:** yalnızca arkadaşlara gider. Profille katılan bir masanınki, oda sürerken o odanın üyelerine de gider.
   - **Arkadaşlık öncesi:** hiçbir yanıt `public_id` taşımaz. İstek, engelleme ve şikayet oyun geçmişi kaydıyla (`historyId`) yapılır (§6.2).

   Hesap id'sine başvuran her yeni kolon, `blocks.blocked_id`'deki gibi, kolon yetkisiyle istemciden kapatılır.

3. **Red sessizdir.** Kural 5'teki ilke arkadaşlık isteğine de uygulanır: istek sahibi reddi ve cevapsızlığı ayırt edemez. Kalıcı red hesap çiftine bağlıdır (§6.2).
4. **Tanışma sızıntı korumaları aynen kalır:**
   - "Evet" dışındaki her sonuç yalnızca `reveal_ends_at`'te açıklanır.
   - Pencere sırasında açılan odalar lobide görünmez.

   v2'de bunlara, pencere bitmeden arkadaşlık isteği yapılamaması eklenir (§6.5).

5. **Konum yalnızca check-in anında alınır.** Harita kullanıcının konumunu göstermez; mekan elle seçilir, GPS yalnızca doğrular. Fotoğraflardaki konum dahil bütün metadata istemcide silinir, sunucu metadata içeren dosyayı reddeder (§5.3).
6. **Kişi ya da masa sayısı gösterilmez.** Keşfet'te yalnızca sunucuda hesaplanmış kova ve planlı etkinlik etiketi görünür (§4).

---

## 2. Navigasyon ve iskelet

Yeni iskelet sıfırdan kurulur. Mevcut ekranlar içine taşınır; iş mantığı değişmez.

```
app/
  _layout.tsx                    Stack (auth / onboarding / app korumaları, değişmez)
  (app)/
    _layout.tsx                  Stack: (tabs) + tam ekran rotalar
    (tabs)/
      _layout.tsx                Tabs: Keşfet · Mekan · Arkadaşlar · Profil
      explore/index.tsx          Keşfet (liste ↔ harita, aynı ekranda geçiş)
      explore/[venueId].tsx      Mekan detayı + "Buraya giriş yap"
      venue/index.tsx            Aktif masanın mekan ekranı (bugünkü ana ekran: lobi, oda kur, mekandan ayrıl)
      friends/index.tsx          Arkadaşlar + istekler + DM listesi (tek sekme)
      friends/[threadId].tsx     DM konuşması
      friends/requests.tsx       Gelen istekler, oyun geçmişi
      profile/index.tsx          Profil (sağ üstte ayarlar dişlisi)
      profile/settings/…         Hesap, bildirimler, gizlilik, engellenenler, yasal, çıkış, hesap silme
    room/[id].tsx                Oda (tam ekran, sekme çubuğu yok)
    room/new.tsx                 Oda kur
    checkin/…                    Check-in akışı (Keşfet'ten mekan seçilmiş olarak girer)
```

- **Açılış ekranı:** Keşfet (`(tabs)/_layout`'ta `initialRouteName: 'explore'`).
- **Mekan sekmesi:**
  - Özel `tabBarButton` ile ortada, görsel olarak vurgulu bir düğme.
  - Basınca aktif masa yoksa Keşfet'e, varsa o mekanın ekranına gider. Aktif masa `useActiveTable`'dan gelir; `tabPress` dinleyicisi `preventDefault` ile yönlendirir.
  - Mekandan çıkış, mekan ekranındaki açık bir eylemdir (bugünkü "Mekandan ayrıl").
- **Oda:** `room/[id]` sekme grubunun dışındaki Stack'te olduğu için sekme çubuğu görünmez. Bugünkü `Redirect` ile odaya dönüş mantığı mekan ekranına taşınır.
- **Ayarlar dişlisi** yalnızca Profil başlığında görünür.
- **Hata sınırları** (Faz 8A) her yeni grubun `_layout`'ında dışa verilir.
- Beyaz ekran dersi (Faz 8A): sekmeler arası geçişte ekranlar bağlı kalır. Bütün Realtime abonelikleri `useChannel` üzerinden gider; aynı topic'e iki ekran bağlanabilir.

---

## 3. Veri modeli ve migration planı

Eski migration'lara dokunulmaz. Her uygulama adımı kendi migration'ını getirir. Tablo ve politikaları aynı migration'da gelir (kural 2). Tipler `pnpm gen:types` ile üretilir.

| Migration              | İçerik                                                                                                                                                                                                                                             | Adım                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `…_explore.sql`        | `venue_activity`, `venue_events`, `explore_venues()`, cron                                                                                                                                                                                         | Keşfet                         |
| `…_profiles_v2.sql`    | `profiles` yeni kolonlar, `table_sessions.participation` ve kişi sayısı seçenekleri, `venue_lobby`'ye "profilli" işareti, `room_member_profile()`, `join_requests.requester_profiled`, Storage kovası, `reports` hedef türleri ve fotoğraf gizleme | Profil/Ayarlar                 |
| `…_friends_dm.sql`     | `play_history`, `friend_requests`, `friendships`, `mutual_friend_intents`, `dm_threads`, `dm_messages`, `dm_reads`, RPC'ler, Realtime politikaları                                                                                                 | Arkadaşlar/DM                  |
| `…_encounters.sql`     | Oda sonu geçmiş kayıtları (3 dakika kuralı), karşılıklı Evet'te `reveal_mutual`                                                                                                                                                                    | Arkadaşlar/DM                  |
| `…_voice_tabu.sql`     | İki masa Tabu'nun sesli `game_state`'i, hakem eylemleri                                                                                                                                                                                            | Sesli Tabu                     |
| `…_drop_text_tabu.sql` | Eski yazılı `clue`/`guess` eylemlerinin kaldırılması (§8.3)                                                                                                                                                                                        | Sesli Tabu'dan bir sürüm sonra |

### 3.1 Değişen tablolar

```
profiles           + public_id uuid not null unique default gen_random_uuid()
                   + display_name text null        (2–24 karakter, küfür filtresi; kayıtta sorulmaz, §6.3)
                   + bio text null                 (≤ 160 karakter, küfür filtresi)
                   + photo_path text null          (Storage yolu; istemciye KAPALI)
                   + photo_hidden_at timestamptz null   (2 ayrı şikayette otomatik gizleme; istemciye KAPALI)
                   + default_participation text not null default 'anonymous'
                       check (in 'anonymous','profile')
                   + notify_dm boolean not null default true
                   + notify_friend_requests boolean not null default true
table_sessions     + participation text not null default 'anonymous'   (check-in'de seçilir)
                   ~ headcount: check (between 1 and 4); 4 = "4+" (bugün 1–6; §6.6)
                     migration: aktif oturumlarda 4'ten büyük değerler 4 olur
join_requests      + requester_profiled boolean not null default false
                       (sahibin istek penceresindeki "profilli" işareti; public_id değil)
rooms              (değişmez: public_id kolonu EKLENMEZ. Lobi okuması, oda satırı ve Postgres Changes
                    yükleri profil kimliği taşımaz; üyeler room_member_profile() ile okur, §5.4)
reports            + target_type text not null default 'room'
                       check (in 'room','dm','profile','history')
                   + dm_thread_id uuid null, history_id uuid null,
                   + profile_snapshot jsonb null   (görünen ad, biyografi, fotoğraf kopyasının yolu)
                   (messages_snapshot mevcut; DM şikayetinde son 50 DM; geçmiş şikayetinde
                    karşılaşma bağlamı ve oda mesajları hâlâ duruyorsa son 50'si)
```

- **Kendi profili:** `profiles` kendi satırıyla okunmaya devam eder. `photo_path` ve `photo_hidden_at` istemciye kapalıdır (kolon yetkisi). Fotoğraf her zaman süreli imzalı URL ile gelir (§5.3).
- **Başkalarının profili:** tablodan değil, `profile/get` fonksiyonundan gelir (§5.2). Rozetler saf modülde hesaplanır, yalnızca görünür olanlar döner.

### 3.2 Yeni tablolar

```
venue_activity     venue_id pk → venues on delete cascade, bucket text check (in 'calm','lively','buzzing'),
                   computed_at timestamptz
                   (cron 5 dk'da bir yazar; istemci okumaz, explore_venues() okur)

venue_events       id pk, venue_id → venues on delete cascade, title text check (char_length between 1 and 60),
                   starts_at timestamptz, ends_at timestamptz   (verilmezse starts_at + 3 saat)
                   created_at
                   (yalnızca admin script'i yazar; istemci okumaz, explore_venues() okur; §4)

play_history       id pk, encounter_id uuid (iki satırda ortak), user_id → auth.users on delete cascade,
                   other_user_id → auth.users on delete set null      (istemciye KAPALI kolon)
                   room_id → rooms on delete set null, concept text, mode text ('voice','text'),
                   own_alias text, other_alias text, other_headcount smallint,
                   reveal_mutual boolean not null default false,
                   played_at timestamptz, available_at timestamptz  (≥ reveal_ends_at; §6.5)
                   unique (user_id, encounter_id)
                   Karşı tarafın public_id'si SAKLANMAZ (§6.2).
                   Her iki masalı karşılaşma için iki satır (her hesap için bir tane); yalnızca oda
                   en az 3 dakika iki masalı kaldıysa yazılır (§6.1).

game_results       id pk, user_id → auth.users on delete cascade, room_id → rooms on delete set null,
                   concept, mode, completed_at, score int null, won boolean null
                   (rozetler için; yalnızca sunucunun bildiği oyunlar: iki masalı Tabu, Sohbet odaları)

friend_requests    id pk, from_user_id, to_user_id (ikisi de → auth.users on delete cascade; istemciye KAPALI),
                   encounter_id uuid not null     (yalnızca bağlam: ilk isteğin yapıldığı karşılaşma)
                   status text check (in 'pending','accepted','declined'), created_at, responded_at
                   unique (from_user_id, to_user_id)
                   (tekillik hesap çiftinde, karşılaşmada değil: aynı iki hesabın sonraki
                    karşılaşmalarından yeni istek satırı oluşmaz; red kalıcıdır)

friendships        user_a, user_b (→ auth.users on delete cascade; istemciye KAPALI), check (user_a < user_b),
                   source text check (in 'room_end_mutual','request'), created_at
                   primary key (user_a, user_b)

mutual_friend_intents  encounter_id, user_id → auth.users on delete cascade (istemciye KAPALI), created_at
                   primary key (encounter_id, user_id)
                   (yalnızca reveal_mutual = true karşılaşmalarda; iki niyet olunca arkadaşlık kurulur;
                    süresiz, §6.5)

dm_threads         id pk, user_a, user_b (istemciye KAPALI), created_at, last_message_at
                   unique (user_a, user_b); foreign key (user_a, user_b) → friendships on delete cascade
                   (arkadaşlık bitince konuşma ve mesajları gider; sürerken saklanır)

dm_messages        id pk, thread_id → dm_threads on delete cascade,
                   sender_user_id → auth.users on delete cascade (istemciye KAPALI),
                   body text check (char_length between 1 and 500), created_at

dm_reads           thread_id, user_id, last_read_at   (okunmamış rozeti; karşı taraf görmez, okundu bilgisi yok)
```

- **Silme:** Hesap silme ve ban (bugünkü `admin:ban` = hesabı silmek), FK'lar üzerinden hepsini temizler: arkadaşlıklar, DM'ler, kendi geçmişi, istekleri, niyetleri ve sonuçları. Karşı tarafın `play_history.other_user_id` kolonu `null` olur; o satır geçmişte kalır, ama ondan istek, engel ya da şikayet yapılamaz (sessizce `ok`).
- **Fotoğraflar:** Storage nesneleri FK ile silinmez. Bunları `account/delete` ve `admin:ban` açıkça siler (§5.3).
- **Şikayet kopyaları:** `reports` 30 gün sonra silinir (mevcut cron). Şikayetle kopyalanan fotoğraf şikayet satırında durur (`reports.photo_copy`, bytea) ve satırla birlikte aynı cron'la silinir. _Adım 3 sapması (onay bekliyor): ilk metin `reports/{report_id}.jpg` diyordu; Storage nesneleri SQL'den silinemediği için (`storage.protect_delete()`) kopya satıra alındı._

---

## 4. Keşfet

- **Liste ↔ harita:** Aynı ekranda bir anahtarla geçilir. Harita MapLibre'dir. Stil `EXPO_PUBLIC_MAP_STYLE_URL`'den gelir (varsayılan OpenFreeMap), anahtar gerekmez. Kullanıcının konum noktası gösterilmez (ilke 5).
- **Veri:** `explore_venues()` RPC'si. Security definer'dır, yalnızca okur, `set search_path = ''`. Aktif mekanların id, ad, ilçe, koordinat, kova ve varsa etkinlik etiketini döner. Mekan koordinatları zaten herkese açık (`venues` okunabilir).
- **Kova (yoğunluk):**
  - `private.refresh_venue_activity()` 5 dakikada bir çalışır. Her mekanın aktif masa sayısını (`table_sessions.status = 'active' and expires_at > now()`) `pure/explore.ts`'teki eşiklerle kovaya çevirir:
    - `calm` (sakin): 0–2 masa
    - `lively` (hareketli): 3–5
    - `buzzing` (çok canlı): 6 ve üzeri

    Eşikler SQL'e parametre olarak verilir; tek kaynak saf modüldür.

  - Eşik altı, sıfır dahil, "sakin" görünür. Böylece tek bir masanın mekanda olduğu çıkarılamaz.
  - Sayılar tabloya yazılmaz, yalnızca kova yazılır. 5 dakikalık adım, tek bir check-in'in anlık etkisini gözlemlemeyi zorlaştırır.
- **Planlı etkinlikler (`venue_events`):**
  - Örnek: "Salı 20.00 Masa gecesi". Yalnızca `pnpm admin:event` ile girilir (`add`, `list`, `remove`). `admin:ban` gibi geliştirici makinesinde, `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` ortam değişkenleriyle çalışır.
  - `explore_venues()` her mekan için şu an süren ya da önümüzdeki 7 gün içinde başlayacak en yakın etkinliği (`title`, `starts_at`) döner.
  - Keşfet'te listede ve haritada mekanın yanında etiket olarak görünür. Kişi ya da masa sayısı içermez.
- **Mekan seçimi:** Mekan elle seçilir, sonra bugünkü check-in akışı çalışır: rıza, izin, konum, kişi sayısı, katılım biçimi (§5.4). Sunucu 300 m kuralını aynen uygular (`too_far`). İstemci konumu aldıktan sonra mesafe 300 m'yi aşıyorsa önce uyarır. Uyarı yalnızca kolaylıktır, karar sunucudadır.
- **Tazeleme:** Keşfet 60 sn'lik `staleTime` ile yeniden sorgulanır. Realtime gerekmez, çünkü kovalar zaten 5 dakikada bir değişir.

---

## 5. Profil ve ayarlar

### 5.1 Profil alanları

- **Fotoğraf:** isteğe bağlı (§5.3).
- **Biyografi:** ≤ 160 karakter. `profanity.ts` ile süzülür; küfürlüyse reddedilir, maskelenmez.
- **Görünen ad (`display_name`):** 2–24 karakter, `profanity.ts` ile süzülür. Kayıtta sorulmaz. Profil kurulurken, arkadaşlık isteği gönderirken ve ilk arkadaşlık kabulünde zorunlu olur (§6.3).
- **Rozetler/ünvanlar:** saklanmaz. `game_results` ve `play_history` sayımlarından `pure/badges.ts` ile türetilir. Örnek kurallar:
  - İlk oyun
  - 10 iki masalı oyun
  - Sesli Tabu'da 5 galibiyet
  - 5 farklı masayla oynamış
  - Sohbet kartlarında 3 tema

  Kurallar ve eşikler saf modülde ve testlidir. Ünvan metinleri `tr.ts`'te.

- **Takipçi/arkadaş sayısı** gösterilmez.

### 5.2 Kim kimin profilini görür

| Kim                                                                 | Ne görür                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Kendisi                                                             | Hepsi                                                                                             |
| Arkadaşı                                                            | Görünen ad, fotoğraf, biyografi, rozetler. **Mekan, konum, aktif masa asla.**                     |
| O an aynı odanın üyesi olan diğer masa, bu masa profille katıldıysa | Aynısı, `room_member_profile()` ve `profile/get` üzerinden. Oda üyeliği bitince erişim biter.     |
| Lobi                                                                | Masa takma adı, kişi sayısı, konsept ve yalnızca "profilli" işareti. `public_id` ve fotoğraf yok. |
| Keşfet                                                              | Hiçbir masa ya da profil bilgisi yok (yalnızca mekan kovası ve etkinlik etiketi).                 |
| Arkadaşlık öncesi geçmiş ve istekler                                | Yalnızca masa takma adı, kişi sayısı, tarih, konsept. `public_id` yok (§6.2).                     |
| Diğer herkes                                                        | Hiçbir şey                                                                                        |

**`profile/get { publicId }`** yalnızca iki durumda profil döner: çağıran ile profil sahibi arkadaşsa, ya da çağıran o an profil sahibinin profille katıldığı odanın üyesiyse. Diğer her durumda yanıt, var olmayan bir `public_id` için verilen yanıtla **birebir aynıdır**: aynı HTTP durumu, aynı gövde (`not_found`). İki durum aynı kod yolundan geçer; yanıttan varlık, engel ya da eski arkadaşlık çıkarılamaz. Görünür profilde fotoğraf için 1 saatlik imzalı URL verilir; gizlenmiş fotoğraf (`photo_hidden_at`) verilmez.

### 5.3 Fotoğraf (Supabase Storage)

- **Kova:** `profile-photos`. Özeldir. `file_size_limit` 300 KB, `allowed_mime_types = ['image/jpeg']`. Kova migration'la oluşturulur (`insert into storage.buckets`).
- **İstemci:** `storage.objects` üzerinde istemciye hiçbir politika yoktur. Hem okuma hem yazma sunucunun verdiği imzalı URL'lerle yapılır.
- **Metadata (EXIF) iki tarafta da silinir ve denetlenir:**
  - **İstemci:** Fotoğraf `expo-image-manipulator` ile yeniden kodlanır (512×512 kırpma, JPEG kalite 0.7). Yeniden kodlama bütün metadata'yı (EXIF, GPS, XMP, IPTC, yorumlar) atar. Yüklemeden önce çıktı `pure/jpegMetadata.ts` ile denetlenir; metadata kalmışsa yüklenmez ve kullanıcıya hata gösterilir.
  - **Sunucu:** `profile/photo-commit` dosyayı indirir ve aynı saf modülle denetler. Yalnızca beklenen türü kabul eder: JPEG imzası (`FF D8 FF`), JFIF (APP0) dışında hiçbir APPn segmenti yok (APP1 EXIF/XMP, APP13 IPTC vb.), yorum (COM) segmenti yok. Uymayan dosya reddedilir (`photo_invalid`) ve silinir.
  - Saf modül vitest ile, sunucu tarafı entegrasyon testiyle, istemci tarafı yükleme öncesi aynı modülle test edilir (§11).
- **Akış:**
  1. `expo-image-picker` ile galeri ya da kamera.
  2. `expo-image-manipulator` ile yeniden kodlama (tipik olarak 40–120 KB) ve metadata denetimi.
  3. `profile/photo-upload-url` yolu `{public_id}/{uuid}.jpg` olan tek seferlik bir imzalı yükleme URL'i verir.
  4. İstemci dosyayı bu URL'e yükler.
  5. `profile/photo-commit { path }` nesnenin kullanıcıya ait yolda olduğunu, boyutunu, türünü ve metadata'sızlığını doğrular, `profiles.photo_path`'i yazar, `photo_hidden_at`'i temizler ve eski fotoğrafı siler.
- **Şikayet ve gizleme:**
  - Profil ve fotoğraf şikayet edilebilir. `safety/report { target: 'profile', publicId, reason }` fotoğrafı şikayet satırına kopyalar (`reports.photo_copy`, 30 gün; adım 3 sapması, §3.2) ve görünen adı ve biyografiyi `profile_snapshot`'a yazar. Şikayet eden o an profili göremiyorsa yanıt `profile/get` ile aynıdır (`not_found`) ve hiçbir şey yazılmaz. Arkadaşlık öncesi bağlamda aynı şikayet `historyId` ile yapılır (§6.2).
  - Aynı fotoğraf için **2 ayrı hesaptan** şikayet gelince `photo_hidden_at` dolar ve fotoğraf hiç kimseye verilmez. Sahibi yeni fotoğraf yükleyene ya da inceleme sonucu geri açılana kadar gizli kalır.
  - İnceleme sonrası kaldırma: `pnpm admin:remove-photo <publicId>` fotoğrafı siler ve `photo_path`'i boşaltır. Geliştirici makinesinde, `admin:ban` gibi ortam değişkenleriyle çalışır.
  - Otomatik içerik denetimi yok (kapsam dışı).
- **Silme:** Hesap silme ve ban `profile-photos/{public_id}/` klasörünü siler.

### 5.4 Anonim ya da profille katılım

- `profiles.default_participation` Ayarlar → Gizlilik'ten değişir. Varsayılan `anonymous`; mevcut kullanıcılar da `anonymous` ile başlar.
- Check-in akışında, kişi sayısıyla birlikte, o masa için değiştirilebilir. Değer `table_sessions.participation`'a yazılır ve masa süresince sabittir. Profille katılım `display_name` ister (§6.3).
- **Lobi:** `venue_lobby()` yeni bir `profiled boolean` döner. Profilli masa lobide yalnızca takma ad ve "profilli" işaretiyle görünür. `public_id` ve fotoğraf dönmez. Sahibin katılma isteği penceresi de yalnızca işareti görür (`join_requests.requester_profiled`).
- **Oda içi:** `rooms` tablosuna profil kolonu eklenmez. Böylece ne lobi okuması ne oda satırı ne de Postgres Changes yükü profil kimliği taşıyabilir. Oda üyesi, diğer masanın profilini `room_member_profile(room_id)` RPC'siyle alır. Bu RPC security definer'dır, yalnızca okur ve şunları yapar:
  - Çağıran o an odanın üyesi değilse boş döner.
  - Diğer masa profille katıldıysa `public_id` döner. Anonimse boş döner; anonim oturumun `public_id`'si hiçbir yanıtta dönmez.
  - Profil gösterimi `profile/get` ile yapılır; aynı üyelik kontrolü orada da uygulanır (§5.2).

### 5.5 Ayarlar

- **Hesap:** telefon (maskeli gösterim), çıkış, hesabı sil. Hesap silme uygulama içinde yapılır (Play şartı) ve bugünkü `account/delete`'i kullanır.
- **Bildirimler:** DM ve arkadaşlık isteği push'ları açık/kapalı.
- **Gizlilik:** varsayılan katılım biçimi.
- **Engellenenler:** bugünkü liste.
- **Yasal metinler, iletişim, hakkında:** bugünkü bölümler.

---

## 6. Arkadaşlar ve DM

Bu bölümde "masa" dili kullanılır. Arkadaşlık, DM, geçmiş ve rozetler teknik olarak hesap sahibine aittir (§6.6). Kullanıcıya görünen geçmiş ve istek metinleri ise kişiden değil masadan söz eder, çünkü karşı tarafın gördüğü şey bir masaydı.

### 6.1 Oyun geçmişi (`play_history`)

- **Ne zaman yazılır:** İki masalı bir karşılaşma bittiğinde. Bitiş şu geçişlerden biridir:
  - "Odayı bitir" ile pencere açılması;
  - misafir masanın ayrılması, engellemesi ya da masasının bitmesi;
  - oda sahibinin ayrılması ya da odanın hareketsizlikten kapanması.

  **Şart:** Oda en az **3 dakika** iki masalı kalmış olmalı (`now() - rooms.guest_joined_at >= 3 dk`). Daha kısa karşılaşmalar geçmişe yazılmaz; kısa bir katılıp çıkmayla istek hakkı toplanamaz.

- **Satırlar:** Her hesap için bir satır yazılır. İki satır aynı `encounter_id`'yi paylaşır.
- **Satırın içeriği (kendi gözünden):** tarih, konsept, oyun tipi, kendi masa takma adı, karşı masanın takma adı ve kişi sayısı. Karşı tarafın `public_id`'si saklanmaz.
- **`available_at`:**
  - Pencere açıldıysa `reveal_ends_at`, açılmadıysa `now()`.
  - Karşılıklı Evet'te pencere hemen kapanır. O anda iki satır da `reveal_mutual = true` ve `available_at = now()` olur. Sonuç zaten iki tarafa da açıklanmıştır.
  - Satır istemciye `available_at <= now()` olunca görünür (RLS).
- **Okuma:** Kendi satırları okunur. `other_user_id` kolonu istemciye kapalıdır.
- **Metin örnekleri (`tr.ts`):**
  - Geçmiş: "Mor Baykuş masasıyla Tabu · 12 Eylül"
  - Gelen istek: "12 Eylül'de Tabu oynadığınız Mor Baykuş masası arkadaşın olmak istiyor"
  - Gönderilen istek: "Mor Baykuş masasına istek gönderildi"
- **v1 geçmişi aktarılmaz;** geçmiş v2 ile başlar.

### 6.2 Arkadaşlık öncesi: istek, engel, şikayet `historyId` ile

Arkadaşlık kurulana kadar hiçbir yanıt karşı tarafın `public_id`'sini taşımaz. Bu, geçmiş okuması (`my_history`), gelen ve giden istekler (`my_incoming_requests`, `my_sent_requests`), Edge Function yanıtları ve Realtime yükleri için geçerlidir. Karşı tarafa yönelik her eylem kişiye değil, kendi geçmiş kaydına bağlanır.

- **Eylemler:**
  - `friends/request { historyId }`: arkadaşlık isteği. `display_name` ister (§6.3).
  - `safety/block { historyId }`: engelleme. `blocked_alias` olarak o karşılaşmadaki takma ad yazılır.
  - `safety/report { target: 'history', historyId, reason }`: şikayet. Karşılaşma bağlamı ve oda mesajları hâlâ duruyorsa son 50'si kopyalanır.

  Sunucu `other_user_id`'yi kaydın sahibi üzerinden çözer. Başkasının kaydıyla ya da `available_at`'i gelmemiş kayıtla yapılan eylem hiçbir şey yazmaz ve yanıt değişmez.

- **Yanıtlar sızdırmaz.** `friends/request` şu durumların hepsinde **aynı** yanıtı döner (`{ ok: true }`) ve satır oluşmaz ya da değişmez:
  - karşı taraf silinmiş;
  - iki yönden birinde engel var;
  - bu hesap çifti arasında aynı yönde istek zaten var (bekleyen ya da reddedilmiş), hangi karşılaşmadan olursa olsun;
  - kaydın `available_at`'i henüz gelmemiş (§6.5).

  Zaten arkadaşsalar `already_friends` döner (yeni bir bilgi sızdırmaz).

- **Kalıcı red hesap çiftine bağlıdır.** `friend_requests` tekilliği `(from_user_id, to_user_id)` üzerindedir. Aynı iki hesap yeniden karşılaşsa bile yeni istek satırı oluşmaz. `encounter_id` yalnızca ilk isteğin bağlamıdır.
- **Karşı yönden bekleyen istek varsa** doğrudan arkadaşlık kurulur (`source = 'request'`).
- **Gönderenin görünümü:** `my_sent_requests()` karşı masanın o karşılaşmadaki takma adını, tarihi, konsepti ve durumu (`pending` ya da `accepted`) döner. Reddedilen istek **süresiz olarak `pending`** görünür. Red hiçbir yayın, push ya da yanıt alanı üretmez.
- **Alıcının görünümü:** `my_incoming_requests()` bağlamı alıcının kendi geçmiş kaydından verir: tarih, konsept, gönderen masanın takma adı ve kişi sayısı. Kabul, red, engel ve şikayet bu kayıt üzerinden yapılır. `public_id` dönmez.
- **`friends/respond { requestId, accept }`:**
  - Kabul `display_name` ister (§6.3).
  - Red kalıcıdır.
- **Profillerin açılması:** Profiller yalnızca kabulden, yani arkadaşlık kurulduktan sonra açılır. `my_friends()` ve `profile/get` iki tarafın `public_id`'sini ancak o zaman döner.

### 6.3 Görünen ad (`display_name`)

- Kayıtta sorulmaz. v1 akışı değişmez.
- **Şu durumlarda zorunlu olur;** ad yoksa sunucu `display_name_required` döner, uygulama ad ekranını açar ve sonra aynı eylemi tekrarlar:
  - **Profil kurulurken:** fotoğraf ya da biyografi eklemek, varsayılan ya da o masanın katılım biçimini `profile` yapmak.
  - **Arkadaşlık isteği gönderirken:** `friends/request`.
  - **İlk arkadaşlık kabulünde:** `friends/respond { accept: true }` ve "Arkadaş ekle" (§6.5).

  Böylece arkadaş listesinde adsız kimse olmaz.

- 2–24 karakter, küfür filtresi, istediği zaman değiştirilebilir. Benzersiz değildir. Arkadaşlar birbirini `public_id` ile ayırt eder.

### 6.4 Arkadaşlık, DM, engelleme

- **Liste:** `my_friends()` şunları döner: `public_id`, görünen ad, fotoğraf URL'i (gizlenmemişse), başlangıç tarihi.
  - Mekan, konum, aktif masa ya da "şu an nerede" hiçbir yerde yoktur.
  - Test bunu tüm dönüş kolonları üzerinden doğrular (§11).
- **Arkadaşlığı bitirme ve engelleme, isteğe bağlı şikayetle:**
  - `friends/remove { publicId, report?: reason }` sessizdir. Karşı taraf yalnızca arkadaşın listeden çıktığını görür.
  - `safety/block { publicId, report?: reason }` bugünkü `blocks`'a yazar ve arkadaşlığı siler. Karşı tarafa bildirilmez.
  - Engellemede de karşı tarafın gördüğü aynıdır: arkadaş listeden çıkar. Karşı taraf ikisini ayırt edemez.
  - **"Şikayet de et":** İki akışta da bir seçenek olarak sunulur. Seçilirse, konuşmanın son 50 mesajının kopyası arkadaşlık ve konuşma cascade ile silinmeden önce, **aynı transaction'da** `reports`'a yazılır (`target_type = 'dm'`). Silme ve kopya birlikte başarılı olur ya da birlikte geri alınır.
- **DM kuralları:** Yalnızca karşılıklı arkadaşlar yazışır, çünkü `dm_threads`'in FK'sı `friendships`'e bağlıdır.
  - Arkadaşlık sürerken mesajlar saklanır.
  - Arkadaşlık bitince konuşma silinir.
  - Hesap silinince konuşma gider.
  - Şikayet kopyası 30 gün saklanır.
- **`dm/send { threadId, body }`:**
  - Arkadaşlığı kontrol eder, `profanity.ts` ile süzer, hız sınırını (kullanıcı başına 1 mesaj/sn) uygular.
  - Mesajı yazar ve karşı tarafın `inbox:{user_id}` kanalına ve `dm:{thread_id}`'ye veri içermeyen yayın yapar.
  - Push'u yalnızca "Yeni bir mesajın var" metniyle gönderir. İçerik önizlemesi ve gönderen adı yoktur.
- **Okuma:** `dm_messages(threadId, before?)` RPC'si 50'şer mesaj ve her biri için `from_me boolean` döner. Tablolar istemciye kapalıdır: `sender_user_id` hiç gitmez. Postgres Changes kolon yetkilerini uygulamadığı için yayın veri içermez, istemci RPC ile yeniden okur.
- **Şikayet tek dokunuşla:** Her mesajda ve profilde **Şikayet et**. `safety/report { target: 'dm', threadId }` son 50 mesajı kopyalar; `{ target: 'profile', publicId }` profili kopyalar.
- **Engelin kapsamı:** Engel; lobide, isteklerde, "Arkadaş ekle"de ve profil görüntülemede iki yönlü görünmezlik sağlar.
- **Okunmamış:** `dm/read { threadId }` yalnızca `dm_reads`'i günceller. Okundu bilgisi karşı tarafa gitmez.

### 6.5 "Tanışalım mı?" ve "Arkadaş ekle"

Oda sonundaki soru "Tanışalım mı?" kalır; anlamı değişmez (yüz yüze tanışma sinyali). Karşılıklı Evet **otomatik arkadaşlık kurmaz.**

- **Karşılıklı Evet (hemen):** Bugünkü tam ekran sinyal gösterilir. Sinyal ekranında iki masaya da **"Arkadaş ekle"** düğmesi çıkar.
  - `friends/add-from-room { historyId }` bir niyet kaydı yazar (`mutual_friend_intents`). Yalnızca `reveal_mutual = true` olan geçmiş kayıtlarında çalışır. Ad yoksa `display_name_required` döner (§6.3).
  - **İki taraf da basarsa** istek-onay turu olmadan arkadaşlık kurulur (`source = 'room_end_mutual'`). İkisine de `inbox` üzerinden `friendship_changed` yayını gider.
  - **Biri basmazsa** sessiz kalır. Basan taraf hiçbir şey görmez; yanıt her zaman `{ ok: true }`. Basmayan tarafa niyet gösterilmez.
  - Düğme sinyal ekranında ve o karşılaşmanın geçmiş kaydında durur. Bu kayıtta "İstek gönder" yerine yalnızca "Arkadaş ekle" vardır. Niyet süresizdir, geri alınamaz, eylem idempotenttir.
- **Diğer her sonuç:** Bugünkü gibi yalnızca `reveal_ends_at`'te "Güzel oyundu" gösterilir. Niyet düğmesi yoktur.
  - Her iki masanın geçmiş kaydı `available_at = reveal_ends_at` ile yazılır. "İstek gönder" düğmesi ancak o zaman görünür.
  - Bu yüzden "Hayır" diyen masanın hemen gönderdiği bir istek, pencere sırasında karşıya ulaşamaz. İstek `ok` döner, hiçbir şey yazılmaz. Ulaşsaydı "Hayır"ı ele verirdi.
- **Korunan kurallar:**
  - Lobi tutma: pencere sırasında açılan odalar `reveal_ends_at`'e kadar görünmez.
  - `reveal_finalize` yayını.
  - "Evet" tarafının satırlarının ve zamanlamasının "Hayır", ayrılma ve cevapsızlıkta aynı olması.

  Hepsi aynen geçerlidir. Niyet düğmesi yalnızca zaten açıklanmış karşılıklı sonuçta var olduğu için yeni bir zamanlama kanalı açmaz.

- **Pencerede "Hayır" demek** kalıcı red sayılmaz. Taraflar daha sonra geçmişten istek gönderebilir. Kalıcı red yalnızca istek reddiyle olur.

### 6.6 Masa = bir telefon, birden çok kişi

Kabul edildi. Arkadaşlık isteği, "Arkadaş ekle", DM, rozetler ve geçmiş hesap sahibine aittir; masadaki diğer kişilerin hesabı yoktur.

- **Masa dili:** Geçmiş ve istek metinleri "kişi" değil "masa" der (§6.1). Arkadaş listesi ve DM, kurulan arkadaşlık hesaplar arasında olduğu için görünen adı kullanır.
- **"Kaç kişisiniz?":**
  - Masa açarken seçenekler 1 / 2 / 3 / 4+. Bugünkü 1–6 yerine geçer.
  - Değer `table_sessions.headcount`'a yazılır (4 = "4+"). Lobide, istek penceresinde ve geçmişte "4+ kişi" olarak gösterilir.
  - `check_in` analitik olayına `headcount` özelliği eklenir (§13). Seçenekler ve etiket `pure/checkin.ts`'te tek kaynaktır.
  - Migration, aktif oturumlarda 5–6 olan değerleri 4 yapar.
- **Sonuçları:**
  - Oda sonunda "Evet" ya da "Arkadaş ekle"ye masadaki herhangi biri basabilir. Kurulan arkadaşlık yine hesap sahipleri arasındadır.
  - Rozetler ve geçmiş, masadaki herkesin oynadığı oyunları hesap sahibine yazar.
  - Profille katılımda odadaki diğer masa yalnızca telefon sahibinin profilini görür.
  - DM yalnızca hesap sahibine gider. Masadaki diğerleri kendi telefonlarıyla ayrı masa açmadıkça bağlantı kuramaz.

---

## 7. Realtime kanalları

Hepsi özeldir. Politika `private.realtime_topic_allowed`'a yeni `kind`'lar olarak eklenir. Yayınlar veri içermez; istemci RPC ile yeniden okur.

| Topic                                            | Kim abone olur                  | Kim yayın yapar           | Olaylar                                      |
| ------------------------------------------------ | ------------------------------- | ------------------------- | -------------------------------------------- |
| `venue:{venue_id}`                               | Mekanda aktif masası olanlar    | Sunucu                    | `lobby_changed` (değişmez)                   |
| `session:{session_id}`                           | O masa                          | Sunucu                    | `join_request`, `join_accepted` (değişmez)   |
| `room:` `messages:` `game:` `presence:{room_id}` | Odanın iki masası               | Üyeler (presence), sunucu | Değişmez; sesli Tabu `game:`'i kullanır      |
| `inbox:{user_id}` (yeni)                         | Yalnızca `auth.uid() = user_id` | Sunucu                    | `friend_request`, `friendship_changed`, `dm` |
| `dm:{thread_id}` (yeni)                          | Konuşmanın iki üyesi            | Sunucu                    | `dm_message`                                 |

- `inbox:` topic'i hesap id'sini içerir. Bu id yalnızca sahibine görünür; topic başkasına söylenmez ve politika başkasının aboneliğini reddeder.
- Keşfet için kanal yoktur (§4).

---

## 8. Oyunlar

### 8.1 Oyun tipi

`pure/concepts.ts`'e konsept başına `mode: 'voice' | 'text'` eklenir: `tabu: 'voice'`, `sohbet: 'text'`. Konsept zaten tipi belirlediği için veritabanında ayrı kolon gerekmez. Oda kur ekranı, lobi ve katılma isteği penceresi tipi gösterir. Sesli oyunda oda kurulurken "Bu oyun yüz yüze oynanır" uyarısı çıkar.

### 8.2 İki masa sesli Tabu

Masalar bir araya gelir. **Takım = masa:** A masası B masasına karşı oynar.

- **Tur:**
  - Anlatan masanın telefonu kartı gösterir; anlatan telefonu tutar.
  - Karşı masanın telefonu kartı ve **Doğru / Tabu / Pas** düğmelerini gösterir. Bu masa hakemdir.
- **Sunucu otoriter (kural 3):**
  - Kart seçimi, `ends_at`, puan ve tur başına pas sınırı sunucudadır.
  - Puan: Doğru +1, **Tabu −1**, Pas 0 (tek masa Tabu ile aynı).
  - Hakem eylemlerini yalnızca anlatmayan masa gönderebilir.
  - Tur sırası A, B, A… şeklindedir; 6 tur, her tur 60 sn.
- **`game_state` (sesli):**
  ```
  { concept:'tabu', mode:'voice', phase, gameNo, turnNo, totalTurns,
    describingTable:'owner'|'guest', turnEndsAt, scores:{owner,guest}, passesUsed, maxPasses }
  ```
- **Kart:** İki masaya da gider. Anlatanın takım arkadaşları kartı telefondan değil anlatandan duyar. Karşı masa hakem olduğu için kartı görmek zorundadır. Oda dışındaki hiçbir masa kartı alamaz.
- **Oyun sonu:** Skorlar gösterilir. Oda sahibi "Yeniden oyna" ile yeni oyun açar. `game_results` her hesap için `score` ve `won` ile yazılır. Pencere yalnızca "Odayı bitir" ile açılır (değişmez).
- **Tek masa Tabu** bugünkü yerel reducer'la aynen kalır.

### 8.3 Yazılı ipucu/tahmin akışı kaldırılır

- **Sebepler:**
  - Sesli modda iki masa aynı yerde; yazılı ipucu yavaşlatır ve yüz yüze oyunu böler.
  - İki mod, iki ayrı UI, test ve sunucu yolu demek.
  - İpucu ve tahmin denetimi (`checkClue`, `containsForbidden`, `isCorrectGuess`) yalnızca bu akışta kullanılıyordu.
- **Geçiş:**
  1. Sesli Tabu'nun OTA'sı UI'dan yazılı akışı kaldırır.
  2. Sunucudaki `clue`/`guess` eylemleri bir sürüm daha kalır. Faz 8A öncesi APK'lar farklı native parmak izine sahip, OTA'yı almaz ve eski akışı çağırabilir.
  3. `…_drop_text_tabu.sql` eylemleri ve `game_state`'in yazılı alanlarını kaldırır.
- **`trText.ts` temizliği:** `containsForbidden`, `isCorrectGuess` ve `checkClue` testleriyle birlikte silinir. `normalize` ve `tokenize` küfür filtresinde kullanıldığı için kalır; kural 7'nin modülü olmaya devam eder.

### 8.4 Sohbet kartları ve serbest sohbet

Yazılı kalır, değişmez. Yeni oyun yok.

---

## 9. Edge Function'lar

| Fonksiyon | Eylemler                                                                                                                                                                                                                                                                    | Durum   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `profile` | `get` (arkadaş ya da o anki oda üyesi; diğer her durumda var olmayanla aynı yanıt), `update` (bio, display_name, default_participation, bildirim tercihleri), `photo-upload-url`, `photo-commit` (JPEG, metadata'sız), `photo-remove`; profil alanları `display_name` ister | Yeni    |
| `friends` | `request { historyId }` (`display_name` ister), `respond` (kabul `display_name` ister), `add-from-room { historyId }` (karşılıklı Evet niyeti), `remove { publicId, report? }`                                                                                              | Yeni    |
| `dm`      | `send`, `read`                                                                                                                                                                                                                                                              | Yeni    |
| `checkin` | `check-in`'e `participation`; `headcount` 1–4 (4 = 4+)                                                                                                                                                                                                                      | Değişir |
| `rooms`   | `request-join`: `requester_profiled`; karşılaşmanın bittiği her geçişte geçmiş kayıtları (3 dakika kuralı, `encounter_id`, `available_at`)                                                                                                                                  | Değişir |
| `reveal`  | `decide`: karşılıklı Evet'te geçmiş kayıtlarını `reveal_mutual = true`, `available_at = now()` yapar; arkadaşlık kurmaz                                                                                                                                                     | Değişir |
| `tabu`    | Sesli mod: `start`, `current-card` (iki masa), `judge { result: correct/taboo/pass }`, `end-turn`; `clue`/`guess` bir sürüm sonra kalkar                                                                                                                                    | Değişir |
| `safety`  | `report`: `target` room/dm/profile/history (`historyId` kabul eder). `block`: `publicId` (arkadaş, DM, profil) ya da `historyId` (arkadaşlık öncesi), isteğe bağlı `report`. Engel arkadaşlığı siler; şikayet kopyası aynı transaction'da alınır                            | Değişir |
| `account` | `delete`: Storage klasörü + PostHog (mevcut)                                                                                                                                                                                                                                | Değişir |

Hepsi bugünkü kalıbı izler: tek endpoint, `action`, zod v4, `{ error: { code, message } }`. Yazan SQL fonksiyonları yalnızca service role'e açıktır. İstemcinin çağırdığı RPC'ler yalnızca okur: `explore_venues`, `venue_lobby` (+ `profiled`), `room_member_profile`, `my_friends`, `my_incoming_requests`, `my_sent_requests`, `my_history`, `dm_threads`, `dm_messages`. Hepsi `set search_path = ''`.

**Admin script'leri** (geliştirici makinesi, `SUPABASE_URL` ve `SUPABASE_SECRET_KEY` ortamdan; secret key hiçbir dosyaya yazılmaz):

- `pnpm admin:event add|list|remove`: planlı etkinlikler (§4).
- `pnpm admin:remove-photo <publicId>`: şikayet incelemesi sonrası fotoğraf kaldırma (§5.3).

Yeni hata kodları: `already_friends`, `not_friends`, `display_name_required`, `display_name_invalid`, `photo_invalid`, `bio_invalid`, `not_judge`.

---

## 10. RLS ve kolon yetkileri

| Tablo                                   | İstemci okuması                                                         | Not                                                                |
| --------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `profiles`                              | Kendi satırı; `photo_path` ve `photo_hidden_at` hariç                   | Başkası yalnızca `profile/get` ile                                 |
| `venue_activity`, `venue_events`        | Yok                                                                     | `explore_venues()`                                                 |
| `table_sessions`                        | Kendi satırı (değişmez)                                                 | `participation` dahil                                              |
| `rooms`                                 | Üyeler (değişmez)                                                       | Profil kolonu yok; profil kimliği yalnızca `room_member_profile()` |
| `join_requests`                         | Oda sahibi (değişmez)                                                   | `requester_profiled` işareti; `public_id` yok                      |
| `play_history`                          | `user_id = auth.uid() and available_at <= now()`; `other_user_id` hariç | Karşı tarafın `public_id`'si saklanmaz                             |
| `game_results`                          | Kendi satırları                                                         | Rozetler sunucuda hesaplanır                                       |
| `friend_requests`                       | Yok                                                                     | RPC'ler; `declined` gönderene `pending` döner; `public_id` dönmez  |
| `friendships`                           | Yok                                                                     | `my_friends()`                                                     |
| `mutual_friend_intents`                 | Yok                                                                     | Niyet karşı tarafa hiç görünmez                                    |
| `dm_threads`, `dm_messages`, `dm_reads` | Yok                                                                     | RPC'ler; `from_me` hesaplanır                                      |
| `reports`                               | Yok (değişmez)                                                          |                                                                    |
| `storage.objects` (`profile-photos`)    | Politika yok                                                            | İmzalı URL'ler                                                     |
| `realtime.messages`                     | `private.realtime_topic_allowed`                                        | `inbox`, `dm` eklenir                                              |

Yeni RPC'lerin hiçbiri hesap id'si döndürmez. Arkadaşlık öncesi hiçbir yanıt `public_id` döndürmez. İkisini de genel testler doğrular (§11).

---

## 11. Test planı

- **Saf modüller (vitest):**
  - `explore.ts`: kova eşikleri; 0–2 masanın "sakin" olması; etkinlik penceresi (şu an süren ya da 7 gün içinde başlayan).
  - `jpegMetadata.ts`: temiz JFIF kabul; EXIF (APP1), XMP (APP1), IPTC (APP13), diğer APPn ve COM içeren dosyalar ile JPEG olmayan dosyalar ret. İstemcinin yükleme öncesi denetimi ve sunucunun `photo-commit` denetimi aynı fonksiyonu çağırır.
  - `badges.ts`: kurallar, sınırlar.
  - `concepts.ts`: mod eşlemesi.
  - Sesli Tabu puan reducer'ı: Doğru +1, Tabu −1, Pas 0, pas sınırı.
  - Biyografi ve görünen ad doğrulaması.
  - İstek durumunun istek sahibine görünümü: `declined` → `pending`.
  - Karşılaşma süresi kuralı: 3 dakikanın altı yazılmaz.
- **Entegrasyon (yerel stack):**
  - **Hesap kimliği sızmıyor:** Her kullanıcıyla istemcinin okuyabildiği tüm tabloları, görünümleri ve RPC dönüşlerini tara; başka bir kullanıcının `auth.users.id` değeri hiçbir yerde geçmesin. Bugünkü koordinat testinin genellemesi.
  - **Arkadaşlık öncesi `public_id` hiçbir yanıtta dönmez:**
    - A ve B (biri profilli, biri anonim; sonra ikisi de profilli) aynı odada en az 3 dakika oynar, oda biter.
    - Tam akış: geçmişten istek, kabul ve red, iki yönlü "Arkadaş ekle", geçmişten engel ve şikayet.
    - Arkadaşlık kurulana kadar karşı tarafın `public_id` değeri şu yanıtların hiçbirinde bulunmamalı:
      - tüm okunabilir tablolar ve RPC'ler (`venue_lobby`, `my_history`, `my_incoming_requests`, `my_sent_requests`);
      - `room_member_profile`: oda bittikten sonra;
      - Edge Function yanıtları;
      - Realtime yükleri (`room:` Postgres Changes, `inbox:`, `venue:`).
    - Profilli masanın `public_id`'si yalnızca oda sürerken, üyelere, `room_member_profile` ile döner. Kabulden sonra `my_friends()` ve `profile/get` döner. Reddedilirse hiç dönmez.
  - **`profile/get` yanıtları:** Şu durumların hepsinde yanıt var olmayan bir `public_id` ile birebir aynıdır (durum ve gövde):
    - yabancı;
    - arkadaşlık öncesi karşılaşma;
    - oda bittikten sonra eski oda üyesi;
    - engellenmiş ya da engelleyen;
    - arkadaşlığı bitmiş.

    Profil yalnızca arkadaşa ve o anki oda üyesine döner.

  - **Fotoğraf:**
    - Başka kullanıcının yoluna commit reddedilir. 300 KB üstü ve JPEG dışı reddedilir.
    - EXIF (APP1) ya da diğer metadata segmentleri içeren JPEG `photo_invalid` ile reddedilir ve silinir. Temiz JFIF kabul edilir.
    - Aynı fotoğrafa 2 ayrı hesaptan şikayet gelince fotoğraf hiç kimseye verilmez; tek hesabın iki şikayeti yetmez.
    - `admin:remove-photo` fotoğrafı ve yolu siler.
    - Hesap silinince klasör silinir.
  - **Lobi:** Profilli masa lobide `profiled = true` ile görünür. Dönüşte ve `join_requests` satırında `public_id` ya da fotoğraf yoktur. Oda satırı ve Postgres Changes yükünde profil kolonu yoktur. `room_member_profile` üye olmayana ve anonim masaya boş döner.
  - **Görünen ad:** Adsız kullanıcıda şunlar `display_name_required` döner: profil alanı yazmak, katılımı `profile` yapmak, istek göndermek, isteği kabul etmek ve "Arkadaş ekle".
  - **Kişi sayısı:** 1–4 kabul edilir, 5 reddedilir. Migration aktif oturumlardaki 5–6'yı 4 yapar. `check_in` olayı `headcount` taşır (izin listesi testi).
  - **Keşfet:** 1 ve 2 masa "sakin", 3 masa "hareketli" görünür. Sayı hiçbir alanda dönmez. Cron dışında değişmez. Etkinlik yalnızca süren ya da 7 gün içindeki için döner; biten ve uzak olan dönmez.
  - **Oyun geçmişi:** 3 dakikadan kısa iki masalı karşılaşma geçmişe yazılmaz; 3 dakika ve üstü, her bitiş geçişinde (pencere, misafirin ayrılması, sahibin ayrılması, hareketsizlik) iki kayıt yazar.
  - **Arkadaşlık isteği:**
    - Kabul edilen, reddedilen ve cevapsız isteklerde gönderenin gördüğü satırlar ve yanıtlar aynı.
    - Reddedilen isteğe ikinci istek sessizce yutulur.
    - **Aynı iki hesabın ikinci karşılaşmasından yeni istek satırı oluşmaz** (bekleyen ve reddedilmiş durumlarda).
    - Engel her iki yönde isteği sessizce yutar.
  - **Oda sonu:**
    - Pencere sırasında geçmiş kaydı görünmez ve istek `ok` dönüp hiçbir şey yazmaz.
    - Karşılıklı Evet'te arkadaşlık kurulmaz. İki taraf da "Arkadaş ekle"ye basarsa kurulur.
    - Tek taraf basarsa hiçbir şey olmaz: basanın yanıtı ve satırları, karşı taraf hiç basmamış gibi aynıdır; karşı tarafa yayın gitmez.
    - Karşılıklı olmayan karşılaşmada `add-from-room` hiçbir şey yazmaz.
    - Evet+Hayır, Evet+ayrılma ve Evet+cevapsız durumlarında Evet tarafının satırları, `inbox` olayları ve zamanlaması aynıdır (bugünkü testin genişletilmesi).
  - **DM:**
    - Arkadaş olmayana `not_friends`; küfür reddi; hız sınırı.
    - `dm:` ve `inbox:` kanallarına üye olmayan abone olamaz ve yayın yapamaz.
    - Engelleyince arkadaşlık ve konuşma gider, karşı tarafa yayın ve push gitmez. Arkadaşlığı bitirme ve engelleme karşı taraftan aynı görünür.
    - **"Şikayet de et":** engelleme ve arkadaşlıktan çıkarmada seçilirse `reports`'ta son 50 mesajın kopyası vardır ve konuşma silinmiştir. Şikayet yazımı başarısız olursa silme de geri alınır (aynı transaction).
  - **Silme:** Hesap silme ve ban arkadaşlıkları, DM'leri, istekleri, niyetleri ve fotoğrafları siler. Karşı tarafın geçmiş kaydı kalır, ondan istek gönderilemez.
  - **Sesli Tabu:** Hakem eylemini yalnızca anlatmayan masa yapabilir. Süre dolunca eylem reddedilir. Skor (Tabu −1) ve tur geçişi doğru. İki masa da kartı alır, oda dışındaki masa alamaz.
- **Mobil:** Sekme iskeletinde her grup `ErrorBoundary` dışa verir. Keşfet ↔ mekan geçişlerinde aynı topic'e çift bağlanma `useChannel` ile güvenli (Faz 8A testleri). Fotoğraf seçildikten sonra yeniden kodlanmış dosyanın metadata'sız olduğu yükleme öncesi `jpegMetadata` ile doğrulanır; saha testinde gerçek bir konumlu fotoğrafla da denenir.

---

## 12. Uygulama sırası ve yayın türü

| Adım                                        | Sunucu                                                                                                                    | İstemci                                                               | Yayın                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1. İskelet (sekmeler, ekranların taşınması) | Yok                                                                                                                       | Yeni rota yapısı                                                      | **OTA**                                                                                                              |
| 2. Keşfet                                   | `…_explore.sql`, cron, `admin:event`                                                                                      | Liste/harita, etkinlik etiketi, mekan detayı, check-in girişi         | Deploy → **OTA** (MapLibre build'de)                                                                                 |
| 3. Profil/Ayarlar                           | `…_profiles_v2.sql`, Storage kovası, `profile`, `checkin`/`rooms`/`safety`/`account` değişiklikleri, `admin:remove-photo` | Profil, ayarlar, fotoğraf, katılım biçimi, kişi sayısı                | Deploy → **OTA** (image picker build'de)                                                                             |
| 4. Arkadaşlar/DM                            | `…_friends_dm.sql`, `…_encounters.sql`, `friends`, `dm`, `reveal`, `safety`                                               | Arkadaşlar sekmesi, DM, oda sonu, "Arkadaş ekle"                      | Deploy → **OTA**. DM push'u için FCM gerekir: Faz 8A build'i `google-services.json` olmadan alındıysa **yeni build** |
| 5. Sesli Tabu                               | `…_voice_tabu.sql`, `tabu`                                                                                                | Sesli iki masa ekranları, oda kur uyarısı, yazılı akışın kaldırılması | Deploy → **OTA**; `…_drop_text_tabu.sql` bir sürüm sonra                                                             |

- Her adımda sunucu önce yayına girer (CLAUDE.md "Neyi ne zaman yayınlamalı"). Her adım kendi dalı, PR'ı ve saha testiyle kapanır.
- **Yayından önce:** `docs/legal/` KVKK metni ve `docs/store/` Play "Veri güvenliği" taslağı v2 veri türleriyle güncellenir (görünen ad, fotoğraf, biyografi, arkadaşlık, DM, oyun geçmişi). Hukuki kontrol üretimden önce yapılır.

---

## 13. Analitik

Yeni olaylar `_shared/pure/analytics.ts` izin listesine eklenir. Hepsi yalnızca kullanıcı id'siyle gider; mekan, konum, içerik, karşı taraf yok.

| Olay                                   | Özellikler                               |
| -------------------------------------- | ---------------------------------------- |
| `explore_viewed`                       | `view: 'list' \| 'map'`                  |
| `check_in` (mevcut)                    | + `headcount: 1 \| 2 \| 3 \| 4` (4 = 4+) |
| `checkin_out_of_range`                 | — (istemci uyarısı gösterildi)           |
| `participation_chosen`                 | `mode: 'anonymous' \| 'profile'`         |
| `profile_photo_set`, `profile_bio_set` | —                                        |
| `friend_request_sent`                  | `source: 'history' \| 'room_end'`        |
| `friend_request_accepted`              | —                                        |
| `friend_add_pressed`                   | — (karşılıklı Evet sonrası niyet)        |
| `friendship_created`                   | `source: 'room_end_mutual' \| 'request'` |
| `dm_sent`                              | —                                        |
| `game_completed`                       | mevcut + `mode: 'voice' \| 'text'`       |

`reveal_mutual` ve `reveal_none` kalır. Arkadaşlık oranı `friendship_created` / iki masalı odalar olarak ölçülür.

---

## 14. CLAUDE.md değişmez kuralları: yeni metinler

Onaylandı. Aşağıdaki metinler CLAUDE.md'ye işlendi.

**Kural 1 (istemci yazmaz).**

> "İstemci hiçbir tabloya doğrudan yazmaz. Tüm yazmalar Edge Function üzerinden yapılır. Dosya yüklemesi yalnızca bir Edge Function'ın tek yol için verdiği süreli imzalı URL'e yapılır ve aynı fonksiyonun `commit` eylemiyle kayda geçer; `storage.objects` üzerinde istemci politikası yoktur. (devamı aynı)"

**Kural 3 (sunucu otoriter).**

> "Oyun sunucu otoriterdir: tur süresi (`ends_at`), kart dağıtımı, eylem yetkisi (kim ne zaman hangi eylemi yapabilir) ve skor sunucuda hesaplanır. Yazılı oyunlarda ipucu doğrulama ve tahmin kontrolü de sunucudadır; sesli oyunlarda doğruluğa hakem masa karar verir, eylemi sunucu doğrular."

**Kural 4 (anonimlik).**

> "Anonimlik: diğer masalara varsayılan olarak yalnızca masa takma adı, kişi sayısı ve konsept gider. Masa profille katıldıysa lobi ve katılma isteği yalnızca 'profilli' işaretini görür; profil (görünen ad, fotoğraf, biyografi, rozetler) ve profil kimliği (`public_id`) yalnızca oda sürerken o odanın üyelerine gider. Arkadaşlar birbirinin profilini ve profil kimliğini görür. Arkadaşlık öncesi hiçbir yanıt (oyun geçmişi, arkadaşlık istekleri, Realtime yükleri dahil) profil kimliği taşımaz; istek, engelleme ve şikayet oyun geçmişi kaydıyla (`historyId`) yapılır. Koordinat, mekan ve aktif masa hiçbir kullanıcıya, arkadaşa da gitmez. Diğer kullanıcıların hesap kimliği istemciye asla gitmez. Masa oturum id'si, takma ad gibi check-in süresince geçerli bir takma kimliktir ve oda üyelerine gidebilir."

**Kural 5 (red = zaman aşımı).**

> Mevcut metnin sonuna: "Arkadaşlık isteğinde red, istek sahibine süresiz bekleyen istekle aynı görünür. Kalıcı red hesap çiftine bağlıdır: reddedilmiş ya da engellenmiş kişiye, hangi karşılaşmadan olursa olsun, yeni istek sessizce yutulur. Pencere bitmeden oda geçmişinden istek gönderilemez. Karşılıklı 'Evet' sonrasında 'Arkadaş ekle'ye yalnızca bir taraf basarsa hiçbir şey olmaz ve karşı taraf bunu hiçbir biçimde görmez."

**Kural 6 (konum).**

> "Konum yalnızca check-in anında, uygulama açıkken alınır. Koordinat saklanmaz, sadece seçilen `venue_id` saklanır. Harita ve Keşfet kullanıcının konumunu göstermez; mekan elle seçilir, konum yalnızca check-in'de doğrulama için alınır. Yüklenen fotoğraflar istemcide yeniden kodlanır ve konum dahil bütün metadata (EXIF, XMP, IPTC, yorumlar) silinir; sunucu yalnızca metadata'sız JPEG kabul eder, metadata içeren dosyayı reddeder."

**Kural 7 (trText/profanity).**

> "Metin eşleştirme ve küfür filtresi (oda sohbeti, DM, biyografi, görünen ad) yalnızca `pure/trText.ts` ve `pure/profanity.ts` üzerinden yapılır… (devamı aynı)"

**Kural 9 (Realtime).** Genişleme: `inbox:{user_id}` (yalnızca sahibi) ve `dm:{thread_id}` (iki üye) eklenir; ikisinde de yalnızca sunucu yayın yapar. Hiçbir Realtime yükü profil kimliği taşımaz: `rooms`'a profil kolonu eklenmez (§5.4).

**MVP_SPEC'te değişen eski kararlar** (işlendi):

- M1'deki "kullanıcı takma adı yok" kararı: `display_name` eklenir. Kayıtta sorulmaz; profil kurulurken, istek gönderirken ve ilk arkadaşlık kabulünde zorunludur.
- §4.2'deki kişi sayısı 1–6 yerine 1 / 2 / 3 / 4+ olur.
- M5'teki "iki masa tek takım, işbirliği" kararı: sesli Tabu'da masalar karşı takımdır.
- §4.6 "Tanışalım mı?": anlamı değişmez (tanışma sinyali). Karşılıklı Evet'ten sonra iki tarafa "Arkadaş ekle" çıkar; ikisi de basarsa arkadaşlık kurulur.

---

## 15. Kararlar (açık soruların cevapları)

- **S1 — Görünen ad:** `display_name` eklenir. Kayıtta sorulmaz; profil kurulurken, istek gönderirken ve ilk arkadaşlık kabulünde zorunludur (§6.3).
- **S2 — Profilin görünürlüğü:** Lobide yalnızca takma ad ve "profilli" işareti görünür. `public_id` ve fotoğraf yalnızca oda sürerken oda üyelerine döner (§5.4).
- **S3 — Karşılıklı Evet:** Otomatik arkadaşlık yok. İki tarafa "Arkadaş ekle" çıkar; ikisi de basarsa arkadaşlık kurulur, biri basmazsa sessiz kalır (§6.5).
- **S4 — Geçmişe yazılma:** Karşılaşmanın bittiği her geçiş (pencere, ayrılma, kapanma), oda en az 3 dakika iki masalı kaldıysa (§6.1).
- **S5 — Pencerede "Hayır":** Kalıcı red sayılmaz. Kalıcı red yalnızca istek reddiyle olur.
- **S6 — DM saklama:** Arkadaşlık sürerken saklanır, bitince silinir, hesap silinince gider. Şikayet kopyası 30 gün.
- **S7 — DM push metni:** Yalnızca "Yeni bir mesajın var".
- **S8 — Masa ile hesap sahibi:** Kabul. Masa dili; "Kaç kişisiniz?" 1/2/3/4+ (§6.6).
- **S9 — Keşfet:** Eşikler (0–2 / 3–5 / 6+) ve 5 dakikalık adım uygun. Ek olarak `venue_events`: admin script'iyle girilen planlı etkinlik, Keşfet'te etiket (§4).
- **S10 — Fotoğraf moderasyonu:** 2 ayrı hesaptan şikayette otomatik gizleme; `admin:remove-photo` (§5.3).
- **S11 — Sesli Tabu:** Takım = masa, Tabu −1 (§8.2).
- **S12 — `trText` temizliği:** `containsForbidden`, `isCorrectGuess` ve `checkClue` testleriyle silinir (§8.3).
- **S13 — Yasal metinler:** `docs/legal/` KVKK metni ve `docs/store/` Play "Veri güvenliği" taslağı v2 yayınından önce güncellenir; hukuki kontrol üretimden önce.
- **S14 — Mevcut kullanıcılar:** Varsayılan katılım `anonymous`; v1 geçmişi aktarılmaz.
- **S15 — İstek gönderirken ad:** Evet, istek göndermek de `display_name` ister.
- **S16 — "Arkadaş ekle" süresi:** Süresiz.
- **S17 — Eski kişi sayıları:** Aktif oturumlardaki 5–6 migration'da 4 olur.

Proje sahibi düzeltmeleri (onayla birlikte): fotoğraf metadata'sı (§5.3), engelle/çıkar ile birlikte şikayet (§6.4), arkadaşlık öncesi `public_id` yok ve `historyId` ile eylemler (§6.2), `profile/get`'in var olmayanla aynı yanıtı (§5.2), kalıcı reddin hesap çiftine bağlı olması (§6.2).
