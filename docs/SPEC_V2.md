# Masa v2 — Teknik tasarım

Durum: **taslak, onay bekliyor.** S1, S2, S3, S8 ile lobi ve `public_id` kuralları proje sahibince yanıtlandı ve işlendi. Bu belge proje sahibinin v2 ürün kararlarını (navigasyon, Keşfet, profil, arkadaşlar ve DM, sesli Tabu) mevcut şemaya, RLS'e, Edge Function'lara ve Realtime'a oturtur. Ürün kararları tartışılmaz. Tartışmaya açık olanlar yalnızca teknik seçimler ve en sondaki açık sorulardır. Onaydan sonra kararlar `MVP_SPEC.md`, `CLAUDE.md` ve `docs/DECISIONS.md`'ye işlenir. Uygulama, §12'deki sırayla ve her adım kendi PR'ıyla yapılır.

Faz 8A'da v2'nin native bağımlılıkları build'e girdi: MapLibre, `expo-image-picker`, `expo-image-manipulator`, `expo-notifications`. Bu yüzden aşağıdaki adımların hepsi, tek bir istisna dışında, **sunucu deploy'u + OTA** ile gider. İstisna: DM push'u, Firebase'in `google-services.json`'ı build'e girmemişse yeni bir build ister (§12).

---

## 1. İlkeler (v1'den korunanlar)

1. **İstemci yazmaz.** Her yazma bir Edge Function üzerinden gider. Profil fotoğrafı da buna dahil (§5.3).
2. **Diğer kullanıcıların hesap kimliği (`auth.users.id`) istemciye gitmez.** v2'de kişiler iki kimlikle tanınır:
   - Masa oturum id'si: takma kimlik, check-in süresince geçerli.
   - Yeni **profil kimliği** `profiles.public_id`: arkadaşlara gider. Profille katılan masanınki yalnızca o odanın üyelerine gider. Lobi yalnızca "profilli" işaretini görür. Anonim oturumun `public_id`'si hiçbir yanıtta dönmez (§5.4, §6.2).

   Hesap id'sine başvuran her yeni kolon, `blocks.blocked_id`'deki gibi, kolon yetkisiyle istemciden kapatılır.

3. **Red sessizdir.** Kural 5'teki ilke arkadaşlık isteğine de uygulanır: istek sahibi reddi ve cevapsızlığı ayırt edemez (§6.2).
4. **Tanışma sızıntı korumaları aynen kalır:**
   - "Evet" dışındaki her sonuç yalnızca `reveal_ends_at`'te açıklanır.
   - Pencere sırasında açılan odalar lobide görünmez.

   v2'de bunlara, pencere bitmeden arkadaşlık isteği yapılamaması eklenir (§6.5).

5. **Konum yalnızca check-in anında alınır.** Harita kullanıcının konumunu göstermez; mekan elle seçilir, GPS yalnızca doğrular.
6. **Kişi ya da masa sayısı gösterilmez.** Keşfet'te yalnızca sunucuda hesaplanmış kova görünür (§4).

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

| Migration              | İçerik                                                                                                                                                                                                                         | Adım           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `…_explore.sql`        | `venue_activity`, `explore_venues()`, cron                                                                                                                                                                                     | Keşfet         |
| `…_profiles_v2.sql`    | `profiles` yeni kolonlar, `table_sessions.participation` ve kişi sayısı seçenekleri, `venue_lobby`'ye "profilli" işareti, `room_member_profile()`, `join_requests.requester_profiled`, Storage kovası, `reports` hedef türleri | Profil/Ayarlar |
| `…_friends_dm.sql`     | `play_history`, `friend_requests`, `friendships`, `dm_threads`, `dm_messages`, RPC'ler, Realtime politikaları                                                                                                                  | Arkadaşlar/DM  |
| `…_reveal_friends.sql` | Oda sonu geçmiş kayıtları, karşılıklı Evet'te "Arkadaş ekle" niyetleri (`mutual_friend_intents`)                                                                                                                               | Arkadaşlar/DM  |
| `…_voice_tabu.sql`     | İki masa Tabu'nun sesli `game_state`'i, hakem eylemleri, eski yazılı eylemlerin kaldırılması (§8.3)                                                                                                                            | Sesli Tabu     |

### 3.1 Değişen tablolar

```
profiles           + public_id uuid not null unique default gen_random_uuid()
                   + display_name text null        (2–24 karakter, küfür filtresi; kayıtta sorulmaz, §6.3)
                   + bio text null                 (≤ 160 karakter, küfür filtresi)
                   + photo_path text null          (Storage yolu; yalnızca sunucu okur)
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
                       check (in 'room','dm','profile')
                   + dm_thread_id uuid null, profile_snapshot jsonb null
                   (messages_snapshot mevcut; DM şikayetinde son 50 DM)
```

- **İstemciye açılan profil kolonları:** `profiles` kendi satırıyla okunmaya devam eder, ama `photo_path` istemciye kapatılır (kolon yetkisi). Fotoğraf her zaman süreli imzalı URL ile gelir (§5.3).
- **Başkalarının profili** tablodan değil, `profile/get` fonksiyonundan gelir (§5.2). Böylece rozetler saf modülde hesaplanır ve yalnızca görünür olanlar döner.

### 3.2 Yeni tablolar

```
venue_activity     venue_id pk → venues on delete cascade, bucket text check (in 'calm','lively','buzzing'),
                   computed_at timestamptz
                   (cron 5 dk'da bir yazar; istemci okumaz, explore_venues() okur)

play_history       id pk, encounter_id uuid (iki satırda ortak), user_id → auth.users on delete cascade,
                   other_user_id → auth.users on delete set null      (istemciye KAPALI kolon)
                   room_id → rooms on delete set null, concept text, mode text ('voice','text'),
                   own_alias text, other_alias text, other_headcount smallint,
                   other_public_id uuid null      (yalnızca diğer masa o oyuna profille katıldıysa)
                   reveal_mutual boolean not null default false,
                   played_at timestamptz, available_at timestamptz  (≥ reveal_ends_at; §6.5)
                   unique (user_id, encounter_id)
                   Her iki masalı oda sonu için iki satır (her hesap için bir tane).

game_results       id pk, user_id → auth.users on delete cascade, room_id → rooms on delete set null,
                   concept, mode, completed_at, score int null, won boolean null
                   (rozetler için; yalnızca sunucunun bildiği oyunlar: iki masalı Tabu, Sohbet odaları)

friend_requests    id pk, from_user_id, to_user_id (ikisi de → auth.users on delete cascade; istemciye KAPALI),
                   encounter_id uuid not null     (bağlam: iki tarafın kendi play_history satırı; public_id DEĞİL)
                   status text check (in 'pending','accepted','declined'), created_at, responded_at
                   unique (from_user_id, to_user_id)          (red kalıcı: aynı yöne ikinci satır yok)

friendships        user_a, user_b (→ auth.users on delete cascade; istemciye KAPALI), check (user_a < user_b),
                   source text check (in 'room_end_mutual','request'), created_at
                   primary key (user_a, user_b)

mutual_friend_intents  encounter_id, user_id → auth.users on delete cascade (istemciye KAPALI), created_at
                   primary key (encounter_id, user_id)
                   (yalnızca reveal_mutual = true karşılaşmalarda; iki niyet olunca arkadaşlık kurulur, §6.5)

dm_threads         id pk, user_a, user_b (istemciye KAPALI), created_at, last_message_at
                   unique (user_a, user_b); foreign key (user_a, user_b) → friendships on delete cascade
                   (arkadaşlık bitince konuşma ve mesajları gider; açık soru S6)

dm_messages        id pk, thread_id → dm_threads on delete cascade,
                   sender_user_id → auth.users on delete cascade (istemciye KAPALI),
                   body text check (char_length between 1 and 500), created_at

dm_reads           thread_id, user_id, last_read_at   (okunmamış rozeti; karşı taraf görmez, okundu bilgisi yok)
```

- **Silme:** Hesap silme ve ban (bugünkü `admin:ban` = hesabı silmek), FK'lar üzerinden hepsini temizler:
  - arkadaşlıklar ve DM'ler;
  - kendi geçmişi, istekleri, sonuçları.

  Karşı tarafın `play_history.other_user_id` kolonu `null` olur. O satır geçmişte kalır, ama ondan istek gönderilemez.

- **Fotoğraflar:** Storage nesneleri FK ile silinmez. Bunları `account/delete` ve `admin:ban` açıkça siler (§5.3).

---

## 4. Keşfet

- **Liste ↔ harita:** Aynı ekranda bir anahtarla geçilir. Harita MapLibre'dir. Stil `EXPO_PUBLIC_MAP_STYLE_URL`'den gelir (varsayılan OpenFreeMap), anahtar gerekmez. Kullanıcının konum noktası gösterilmez (ilke 5).
- **Veri:** `explore_venues()` RPC'si. Security definer'dır, yalnızca okur, `set search_path = ''`. Aktif mekanların id, ad, ilçe, koordinat ve kovasını döner. Mekan koordinatları zaten herkese açık (`venues` okunabilir).
- **Kova (yoğunluk):**
  - `private.refresh_venue_activity()` 5 dakikada bir çalışır. Her mekanın aktif masa sayısını (`table_sessions.status = 'active' and expires_at > now()`) `pure/explore.ts`'teki eşiklerle kovaya çevirir:
    - `calm` (sakin): 0–2 masa
    - `lively` (hareketli): 3–5
    - `buzzing` (çok canlı): 6 ve üzeri

    Eşikler SQL'e parametre olarak verilir; tek kaynak saf modüldür.

  - Eşik altı, sıfır dahil, "sakin" görünür. Böylece tek bir masanın mekanda olduğu çıkarılamaz.
  - Sayılar tabloya yazılmaz, yalnızca kova yazılır.
  - 5 dakikalık adım, tek bir check-in'in anlık etkisini gözlemlemeyi zorlaştırır.
  - Kalan risk: 3 masa eşiğinde tek bir masanın gelip gitmesi kovayı değiştirebilir. Eşik ve adım açık soru S9.
- **Mekan seçimi:** Mekan elle seçilir, sonra bugünkü check-in akışı çalışır: rıza, izin, konum, kişi sayısı, katılım biçimi (§5.4). Sunucu 300 m kuralını aynen uygular (`too_far`). İstemci konumu aldıktan sonra mesafe 300 m'yi aşıyorsa önce uyarır. Uyarı yalnızca kolaylıktır, karar sunucudadır.
- **Tazeleme:** Keşfet 60 sn'lik `staleTime` ile yeniden sorgulanır. Realtime gerekmez, çünkü kovalar zaten 5 dakikada bir değişir.

---

## 5. Profil ve ayarlar

### 5.1 Profil alanları

- **Fotoğraf:** isteğe bağlı.
- **Biyografi:** ≤ 160 karakter. `profanity.ts` ile süzülür; küfürlüyse reddedilir, maskelenmez.
- **Rozetler/ünvanlar:** saklanmaz. `game_results` ve `play_history` sayımlarından `pure/badges.ts` ile türetilir. Örnek kurallar:
  - İlk oyun
  - 10 iki masalı oyun
  - Sesli Tabu'da 5 galibiyet
  - 5 farklı masayla oynamış
  - Sohbet kartlarında 3 tema

  Kurallar ve eşikler saf modülde ve testlidir. Ünvan metinleri `tr.ts`'te.

- **Takipçi/arkadaş sayısı** gösterilmez.
- **Görünen ad (`display_name`):** 2–24 karakter, `profanity.ts` ile süzülür. Kayıtta sorulmaz. Profil kurulurken ya da ilk arkadaşlık kabulünde zorunlu olur (§6.3).

### 5.2 Kim kimin profilini görür

| Kim                                                 | Ne görür                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Kendisi                                             | Hepsi                                                                                             |
| Arkadaşı                                            | Görünen ad, fotoğraf, biyografi, rozetler. **Mekan, konum, aktif masa asla.**                     |
| Aynı odadaki diğer masa, o masa profille katıldıysa | Aynısı, `room_member_profile()` üzerinden. Oda üyeliği bitince bağlam biter.                      |
| Lobi                                                | Masa takma adı, kişi sayısı, konsept ve yalnızca "profilli" işareti. `public_id` ve fotoğraf yok. |
| Keşfet                                              | Hiçbir masa ya da profil bilgisi yok (yalnızca mekan kovası).                                     |
| Diğer herkes                                        | Hiçbir şey                                                                                        |

`profile/get { publicId }` yetkiyi sunucuda kontrol eder. Yetkisizse `not_found` döner (varlığı sızdırmaz). Fotoğraf için 1 saatlik imzalı URL verir.

### 5.3 Fotoğraf (Supabase Storage)

- **Kova:** `profile-photos`. Özeldir. `file_size_limit` 300 KB, `allowed_mime_types = ['image/jpeg']`. Kova migration'la oluşturulur (`insert into storage.buckets`).
- **İstemci:** `storage.objects` üzerinde istemciye hiçbir politika yoktur. Hem okuma hem yazma sunucunun verdiği imzalı URL'lerle yapılır.
- **Akış:**
  1. `expo-image-picker` ile galeri ya da kamera.
  2. `expo-image-manipulator` ile 512×512'ye kırpma ve boyutlandırma, JPEG kalite 0.7 (tipik olarak 40–120 KB).
  3. `profile/photo-upload-url` yolu `{public_id}/{uuid}.jpg` olan tek seferlik bir imzalı yükleme URL'i verir.
  4. İstemci dosyayı bu URL'e yükler.
  5. `profile/photo-commit { path }` nesnenin kullanıcıya ait yolda olduğunu, boyutunu ve türünü doğrular, `profiles.photo_path`'i yazar ve eski fotoğrafı siler.
- **Şikayet:** Profil ve fotoğraf şikayet edilebilir. `safety/report { target: 'profile', publicId, reason }` fotoğrafı `reports/{report_id}.jpg`'e kopyalar (30 gün) ve biyografiyi `profile_snapshot`'a yazar.
- **Otomatik denetim yok** (kapsam dışı). İnceleme sonrası fotoğraf kaldırma için `pnpm admin:remove-photo <publicId>` önerisi var; açık soru S10.
- **Silme:** Hesap silme ve ban `profile-photos/{public_id}/` klasörünü siler.

### 5.4 Anonim ya da profille katılım

- `profiles.default_participation` Ayarlar → Gizlilik'ten değişir.
- Check-in akışında, kişi sayısıyla birlikte, o masa için değiştirilebilir. Değer `table_sessions.participation`'a yazılır ve masa süresince sabittir. Profille katılım `display_name` ister (§6.3).
- **Lobi:** `venue_lobby()` yeni bir `profiled boolean` döner. Profilli masa lobide yalnızca takma ad ve "profilli" işaretiyle görünür. `public_id` ve fotoğraf dönmez. Sahibin katılma isteği penceresi de yalnızca işareti görür (`join_requests.requester_profiled`).
- **Oda içi:** `rooms` tablosuna profil kolonu eklenmez. Böylece ne lobi okuması ne oda satırı ne de Postgres Changes yükü profil kimliği taşıyabilir. Oda üyesi, diğer masanın profilini `room_member_profile(room_id)` RPC'siyle alır. Bu RPC security definer'dır, yalnızca okur ve şunları yapar:
  - Çağıran o an odanın üyesi değilse boş döner.
  - Diğer masa profille katıldıysa `public_id` döner. Anonimse boş döner; anonim oturumun `public_id`'si hiçbir yanıtta dönmez.
  - Profil gösterimi `profile/get` ile yapılır; aynı üyelik kontrolü orada da uygulanır.

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

- **Ne zaman yazılır:** İki masalı bir oda "Odayı bitir" ile pencereye geçtiğinde ya da iki masalıyken kapandığında. Her hesap için bir satır yazılır. İki satır aynı `encounter_id`'yi paylaşır. Minimum süre ya da tamamlanmış oyun şartı açık soru S4.
- **Satırın içeriği (kendi gözünden):** tarih, konsept, oyun tipi, kendi masa takma adı, karşı masanın takma adı ve kişi sayısı. Karşı masa o oyuna profille katıldıysa `other_public_id` da yazılır; anonimse boş kalır.
- **`available_at`:**
  - Pencere açıldıysa `reveal_ends_at`, açılmadıysa `now()`.
  - Karşılıklı Evet'te pencere hemen kapanır. O anda iki satır da `reveal_mutual = true` ve `available_at = now()` olur. Sonuç zaten iki tarafa da açıklanmıştır.
  - Satır istemciye `available_at <= now()` olunca görünür (RLS).
- **Okuma:** Kendi satırları okunur. `other_user_id` kolonu istemciye kapalıdır.
- **Metin örnekleri (`tr.ts`):**
  - Geçmiş: "Mor Baykuş masasıyla Tabu · 12 Eylül"
  - Gelen istek: "12 Eylül'de Tabu oynadığınız Mor Baykuş masası arkadaşın olmak istiyor"
  - Gönderilen istek: "Mor Baykuş masasına istek gönderildi"

### 6.2 Arkadaşlık isteği

- **Nereden:** yalnızca oyun geçmişinden ya da oda sonu ekranından. İkisi de aynı geçmiş satırını kullanır.
- **Bağlantı `public_id`'ye değil karşılaşmaya kurulur.** `friends/request { historyId }` gönderenin geçmiş satırından `encounter_id`'yi ve `other_user_id`'yi sunucuda çözer. İstek satırı `encounter_id` ile yazılır. İki taraf da isteği kendi geçmiş satırı üzerinden görür. Bu yüzden anonim bir oyundan istek gönderilebilir ve gönderen de alıcı da hiçbir aşamada karşı tarafın `public_id`'sini öğrenmez.
- **Yanıtlar sızdırmaz.** Şu durumların hepsinde yanıt **aynıdır** (`{ ok: true }`) ve satır oluşmaz ya da değişmez:
  - karşı taraf silinmiş;
  - iki yönden birinde engel var;
  - aynı yönde istek zaten var (bekleyen ya da reddedilmiş);
  - satırın `available_at`'i henüz gelmemiş (§6.5).

  Zaten arkadaşsalar `already_friends` döner (yeni bir bilgi sızdırmaz).

- **Karşı yönden bekleyen istek varsa** doğrudan arkadaşlık kurulur (`source = 'request'`).
- **Gönderenin görünümü:** `my_sent_requests()` karşı masanın o oyundaki takma adını, tarihi, konsepti ve durumu (`pending` ya da `accepted`) döner. Reddedilen istek **süresiz olarak `pending`** görünür. Red hiçbir yayın, push ya da yanıt alanı üretmez.
- **Alıcının görünümü:** `my_incoming_requests()` bağlamı alıcının kendi geçmiş satırından verir: tarih, konsept, gönderen masanın o oyundaki takma adı ve kişi sayısı. Gönderen o oyuna profille katıldıysa `public_id` de döner; bu, alıcının o odada zaten görebildiği bilgidir. **Gönderen anonim oynadıysa `public_id` dönmez.**
- **`friends/respond { requestId, accept }`:**
  - Kabul `display_name` ister (§6.3).
  - Red kalıcıdır. Aynı gönderenden aynı alıcıya ikinci satır oluşmaz.
- **Profillerin açılması:** Profiller yalnızca kabulden, yani arkadaşlık kurulduktan sonra açılır. `my_friends()` ve `profile/get` iki tarafın `public_id`'sini ancak o zaman döner.

### 6.3 Görünen ad (`display_name`)

- Kayıtta sorulmaz. v1 akışı değişmez.
- **Şu durumlarda zorunlu olur:**
  - **Profil kurulurken:** fotoğraf ya da biyografi eklemek, ya da varsayılan ya da o masa için katılım biçimini `profile` yapmak. Sunucu adsız isteği `display_name_required` ile reddeder; uygulama ad ekranını açar.
  - **İlk arkadaşlık kabulünde:** `friends/respond { accept: true }` ve "Arkadaş ekle" (§6.5), ad yoksa `display_name_required` döner. Uygulama adı sorar, sonra aynı eylemi tekrarlar.
- **İstek gönderen adsız olabilir.** Gönderen masanın isteği kabul edilince arkadaşlık kurulur. Adı olmayan taraf, arkadaşının listesinde ad girene kadar tanıştıkları masanın takma adıyla görünür. Uygulama bir sonraki açılışta Arkadaşlar sekmesinde adı sorar. İstek gönderirken de adın zorunlu olup olmayacağı açık soru S15.
- 2–24 karakter, küfür filtresi, istediği zaman değiştirilebilir. Benzersiz değildir. Arkadaşlar birbirini `public_id` ile ayırt eder.

### 6.4 Arkadaşlık, DM, engelleme

- **Liste:** `my_friends()` şunları döner: `public_id`, görünen ad (yoksa tanışılan masanın takma adı), fotoğraf URL'i, başlangıç tarihi.
  - Mekan, konum, aktif masa ya da "şu an nerede" hiçbir yerde yoktur.
  - Test bunu tüm dönüş kolonları üzerinden doğrular (§11).
- **Arkadaşlığı bitirme:**
  - `friends/remove { publicId }` sessizdir. Karşı taraf yalnızca arkadaşın listeden çıktığını görür.
  - Engellemede de karşı tarafın gördüğü aynıdır: arkadaş listeden çıkar. Karşı taraf ikisini ayırt edemez.
- **DM kuralları:** Yalnızca karşılıklı arkadaşlar yazışır, çünkü `dm_threads`'in FK'sı `friendships`'e bağlıdır. Arkadaşlık bitince konuşma gider (S6).
- **`dm/send { threadId, body }`:**
  - Arkadaşlığı kontrol eder, `profanity.ts` ile süzer, hız sınırını (kullanıcı başına 1 mesaj/sn) uygular.
  - Mesajı yazar ve karşı tarafın `inbox:{user_id}` kanalına ve `dm:{thread_id}`'ye veri içermeyen yayın yapar.
  - Push'u içerik önizlemesi olmadan gönderir: "Yeni bir mesajın var". Gönderen adının push'ta olup olmayacağı açık soru S7.
- **Okuma:** `dm_messages(threadId, before?)` RPC'si 50'şer mesaj ve her biri için `from_me boolean` döner. Tablolar istemciye kapalıdır: `sender_user_id` hiç gitmez. Postgres Changes kolon yetkilerini uygulamadığı için yayın veri içermez, istemci RPC ile yeniden okur.
- **Şikayet ve engel tek dokunuşla:**
  - Her mesajda ve profilde **Şikayet et**: `safety/report { target: 'dm', threadId }` son 50 mesajı kopyalar; `{ target: 'profile', publicId }` profili kopyalar.
  - **Engelle:** `safety/block { publicId }` bugünkü `blocks`'a yazar, arkadaşlığı siler (konuşma cascade ile gider). Karşı tarafa bildirilmez. Engel; lobide, isteklerde, "Arkadaş ekle"de ve profil görüntülemede iki yönlü görünmezlik sağlar.
- **Okunmamış:** `dm/read { threadId }` yalnızca `dm_reads`'i günceller. Okundu bilgisi karşı tarafa gitmez.

### 6.5 "Tanışalım mı?" ve "Arkadaş ekle"

Oda sonundaki soru "Tanışalım mı?" kalır; anlamı değişmez (yüz yüze tanışma sinyali). Karşılıklı Evet **otomatik arkadaşlık kurmaz.**

- **Karşılıklı Evet (hemen):** Bugünkü tam ekran sinyal gösterilir. Sinyal ekranında iki masaya da **"Arkadaş ekle"** düğmesi çıkar.
  - `friends/add-from-room { historyId }` bir niyet kaydı yazar (`mutual_friend_intents`). Yalnızca `reveal_mutual = true` olan geçmiş satırlarında çalışır. Ad yoksa `display_name_required` döner (§6.3).
  - **İki taraf da basarsa** istek-onay turu olmadan arkadaşlık kurulur (`source = 'room_end_mutual'`). İkisine de `inbox` üzerinden `friendship_changed` yayını gider.
  - **Biri basmazsa** sessiz kalır. Basan taraf hiçbir şey görmez; yanıt her zaman `{ ok: true }`. Basmayan tarafa niyet gösterilmez.
  - Düğme sinyal ekranında ve o karşılaşmanın geçmiş satırında durur. Bu satırda "İstek gönder" yerine yalnızca "Arkadaş ekle" vardır. Niyet geri alınamaz, eylem idempotenttir. Süre sınırı açık soru S16.
- **Diğer her sonuç:** Bugünkü gibi yalnızca `reveal_ends_at`'te "Güzel oyundu" gösterilir. Niyet düğmesi yoktur.
  - Her iki masanın geçmiş satırı `available_at = reveal_ends_at` ile yazılır. "İstek gönder" düğmesi ancak o zaman görünür.
  - Bu yüzden "Hayır" diyen masanın hemen gönderdiği bir istek, pencere sırasında karşıya ulaşamaz. İstek `ok` döner, hiçbir şey yazılmaz. Ulaşsaydı "Hayır"ı ele verirdi.
- **Korunan kurallar:**
  - Lobi tutma: pencere sırasında açılan odalar `reveal_ends_at`'e kadar görünmez.
  - `reveal_finalize` yayını.
  - "Evet" tarafının satırlarının ve zamanlamasının "Hayır", ayrılma ve cevapsızlıkta aynı olması.

  Hepsi aynen geçerlidir. Niyet düğmesi yalnızca zaten açıklanmış karşılıklı sonuçta var olduğu için yeni bir zamanlama kanalı açmaz.

- **Pencerede "Hayır" demek** kalıcı red sayılmaz. Taraflar daha sonra geçmişten istek gönderebilir. Kalıcı red yalnızca istek reddiyle olur. Açık soru S5.

### 6.6 Masa = bir telefon, birden çok kişi

Kabul edildi. Arkadaşlık isteği, "Arkadaş ekle", DM, rozetler ve geçmiş hesap sahibine aittir; masadaki diğer kişilerin hesabı yoktur.

- **Masa dili:** Geçmiş ve istek metinleri "kişi" değil "masa" der (§6.1). Arkadaş listesi ve DM, kurulan arkadaşlık hesaplar arasında olduğu için görünen adı kullanır.
- **"Kaç kişisiniz?":**
  - Masa açarken seçenekler 1 / 2 / 3 / 4+. Bugünkü 1–6 yerine geçer.
  - Değer `table_sessions.headcount`'a yazılır (4 = "4+"). Lobide, istek penceresinde ve geçmişte "4+ kişi" olarak gösterilir.
  - `check_in` analitik olayına `headcount` özelliği eklenir (§13). Seçenekler ve etiket `pure/checkin.ts`'te tek kaynaktır.
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

Masalar bir araya gelir. Takım = masa: A masası B masasına karşı oynar. Takımların masa yerine karışık kurulması açık soru S11.

- **Tur:**
  - Anlatan masanın telefonu kartı gösterir; anlatan telefonu tutar.
  - Karşı masanın telefonu kartı ve **Doğru / Tabu / Pas** düğmelerini gösterir. Bu masa hakemdir.
- **Sunucu otoriter (kural 3):**
  - Kart seçimi, `ends_at`, puan (Doğru +1, Tabu −1, Pas 0) ve tur başına pas sınırı sunucudadır.
  - Hakem eylemlerini yalnızca anlatmayan masa gönderebilir. Tur sırası A, B, A… şeklindedir; 6 tur, her tur 60 sn.
- **`game_state` (sesli):**
  ```
  { concept:'tabu', mode:'voice', phase, gameNo, turnNo, totalTurns,
    describingTable:'owner'|'guest', turnEndsAt, scores:{owner,guest}, passesUsed, maxPasses }
  ```
- **Kart:** İki masaya da gider. Anlatanın takım arkadaşları kartı telefondan değil anlatandan duyar. Karşı masa hakem olduğu için kartı görmek zorundadır.
- **Oyun sonu:** Skorlar gösterilir. Oda sahibi "Yeniden oyna" ile yeni oyun açar. `game_results` her hesap için `score` ve `won` ile yazılır. Pencere yalnızca "Odayı bitir" ile açılır (değişmez).
- **Tek masa Tabu** bugünkü yerel reducer'la aynen kalır.

### 8.3 Yazılı ipucu/tahmin akışı kaldırılsın mı? — Öneri: evet

- **Sebepler:**
  - Sesli modda iki masa aynı yerde; yazılı ipucu yavaşlatır ve yüz yüze oyunu bölerdi.
  - İki mod iki ayrı UI, test ve sunucu yolu demek, ama ürün kararı iki masa Tabu'nun sesli olması.
  - İpucu ve tahmin denetimi yalnızca bu akışta kullanılıyor (`checkClue`, `containsForbidden`, `isCorrectGuess`). Kaldırılınca küfür filtresi Tabu'dan çıkar ve istemcideki uyarı kodu gider.
- **Geçiş:**
  1. Sesli Tabu'nun OTA'sı UI'dan yazılı akışı kaldırır.
  2. Sunucudaki `clue`/`guess` eylemleri bir sürüm daha kalır. Faz 8A öncesi APK'lar farklı native parmak izine sahip, OTA'yı almaz ve eski akışı çağırabilir.
  3. Sonraki migration eylemleri ve `game_state`'in yazılı alanlarını kaldırır.
- **`trText.ts`:** Kural 7'nin modülü kalır. `normalize` ve `tokenize` küfür filtresinde kullanılıyor. `containsForbidden` ve `isCorrectGuess` kullanılmaz hale gelir; testleriyle birlikte silinmeleri ayrı bir karar olarak sorulur.

### 8.4 Sohbet kartları ve serbest sohbet

Yazılı kalır, değişmez. Yeni oyun yok.

---

## 9. Edge Function'lar

| Fonksiyon | Eylemler                                                                                                                                                                  | Durum   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `profile` | `get`, `update` (bio, display_name, default_participation, bildirim tercihleri), `photo-upload-url`, `photo-commit`, `photo-remove`; profil alanları `display_name` ister | Yeni    |
| `friends` | `request { historyId }`, `respond` (kabul `display_name` ister), `add-from-room { historyId }` (karşılıklı Evet niyeti), `remove`                                         | Yeni    |
| `dm`      | `send`, `read`                                                                                                                                                            | Yeni    |
| `checkin` | `check-in`'e `participation`; `headcount` 1–4 (4 = 4+)                                                                                                                    | Değişir |
| `rooms`   | `request-join`: `requester_profiled`; `end`: oda sonu geçmiş satırları (`encounter_id`, `available_at`)                                                                   | Değişir |
| `reveal`  | `decide`: karşılıklı Evet'te geçmiş satırlarını `reveal_mutual = true`, `available_at = now()` yapar; arkadaşlık kurmaz                                                   | Değişir |
| `tabu`    | Sesli mod: `start`, `current-card` (iki masa), `judge { result: correct/taboo/pass }`, `end-turn`; `clue`/`guess` bir sürüm sonra kalkar                                  | Değişir |
| `safety`  | `report`'a `target` (room/dm/profile); `block`'a `publicId` (DM/profil); engel arkadaşlığı siler                                                                          | Değişir |
| `account` | `delete`: Storage klasörü + PostHog (mevcut)                                                                                                                              | Değişir |

Hepsi bugünkü kalıbı izler: tek endpoint, `action`, zod v4, `{ error: { code, message } }`. Yazan SQL fonksiyonları yalnızca service role'e açıktır. İstemcinin çağırdığı RPC'ler yalnızca okur: `explore_venues`, `venue_lobby` (+ `profiled`), `room_member_profile`, `my_friends`, `my_incoming_requests`, `my_sent_requests`, `my_history`, `dm_threads`, `dm_messages`. Hepsi `set search_path = ''`.

Yeni hata kodları: `already_friends`, `not_friends`, `display_name_required`, `display_name_invalid`, `photo_invalid`, `bio_invalid`, `not_judge`.

---

## 10. RLS ve kolon yetkileri

| Tablo                                   | İstemci okuması                                                         | Not                                                                |
| --------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `profiles`                              | Kendi satırı; `photo_path` hariç                                        | Başkası `profile/get` ile                                          |
| `venue_activity`                        | Yok                                                                     | `explore_venues()`                                                 |
| `table_sessions`                        | Kendi satırı (değişmez)                                                 | `participation` dahil                                              |
| `rooms`                                 | Üyeler (değişmez)                                                       | Profil kolonu yok; profil kimliği yalnızca `room_member_profile()` |
| `join_requests`                         | Oda sahibi (değişmez)                                                   | `requester_profiled` işareti; `public_id` yok                      |
| `play_history`                          | `user_id = auth.uid() and available_at <= now()`; `other_user_id` hariç | Kolon yetkisi                                                      |
| `game_results`                          | Kendi satırları                                                         | Rozetler sunucuda hesaplanır                                       |
| `friend_requests`                       | Yok                                                                     | RPC'ler; `declined` gönderene `pending` döner                      |
| `friendships`                           | Yok                                                                     | `my_friends()`                                                     |
| `mutual_friend_intents`                 | Yok                                                                     | Niyet karşı tarafa hiç görünmez                                    |
| `dm_threads`, `dm_messages`, `dm_reads` | Yok                                                                     | RPC'ler; `from_me` hesaplanır                                      |
| `reports`                               | Yok (değişmez)                                                          |                                                                    |
| `storage.objects` (`profile-photos`)    | Politika yok                                                            | İmzalı URL'ler                                                     |
| `realtime.messages`                     | `private.realtime_topic_allowed`                                        | `inbox`, `dm` eklenir                                              |

Yeni RPC'lerin hiçbiri hesap id'si döndürmez. Anonim oturumun `public_id`'si de hiçbir yanıtta dönmez. İkisini de genel testler doğrular (§11).

---

## 11. Test planı

- **Saf modüller (vitest):**
  - `explore.ts`: kova eşikleri; 0–2 masanın "sakin" olması.
  - `badges.ts`: kurallar, sınırlar.
  - `concepts.ts`: mod eşlemesi.
  - Sesli Tabu puan reducer'ı: sunucuyla aynı kurallar, istemcide bekleyen gösterim için.
  - Biyografi ve görünen ad doğrulaması.
  - İstek durumunun istek sahibine görünümü: `declined` → `pending`.
- **Entegrasyon (yerel stack):**
  - **Hesap kimliği sızmıyor:** Her kullanıcıyla istemcinin okuyabildiği tüm tabloları, görünümleri ve RPC dönüşlerini tara; başka bir kullanıcının `auth.users.id` değeri hiçbir yerde geçmesin. Bugünkü koordinat testinin genellemesi.
  - **Anonim oturumun `public_id`'si hiçbir yanıtta dönmez:**
    - A anonim, B profille check-in yapar; aynı odada oynarlar, oda biter.
    - Tam akış: A'nın geçmişten gönderdiği istek, B'nin kabulü ve reddi, iki yönlü "Arkadaş ekle".
    - Arkadaşlık kurulana kadar B'nin eriştiği her yanıtta A'nın `public_id` değeri aranır ve hiçbir yerde bulunmamalı:
      - tüm okunabilir tablolar ve RPC'ler (`venue_lobby`, `room_member_profile`, `my_history`, `my_incoming_requests`, `my_sent_requests`);
      - Edge Function yanıtları (`profile/get` dahil; bilinen id ile `not_found`);
      - Realtime yükleri (`room:` Postgres Changes, `inbox:`, `venue:`).
    - Kabulden sonra yalnızca `my_friends()` ve `profile/get` döner. Reddedilirse hiç dönmez.
  - **Lobi:** Profilli masa lobide `profiled = true` ile görünür. Dönüşte ve `join_requests` satırında `public_id` ya da fotoğraf yoktur. Oda satırı ve Postgres Changes yükünde profil kolonu yoktur. `room_member_profile` üye olmayana ve anonim masaya boş döner.
  - **Görünen ad:** Adsız kullanıcıda profil alanı yazmak, katılımı `profile` yapmak, isteği kabul etmek ve "Arkadaş ekle" `display_name_required` döner. Adsız istek göndermek çalışır (S15).
  - **Kişi sayısı:** 1–4 kabul edilir, 5 reddedilir. Migration aktif oturumlardaki 5–6'yı 4 yapar. `check_in` olayı `headcount` taşır (izin listesi testi).
  - **Keşfet:** 1 ve 2 masa "sakin", 3 masa "hareketli" görünür. Sayı hiçbir alanda dönmez. Cron dışında değişmez.
  - **Profil görünürlüğü:** Yabancıya `not_found`; arkadaşa ve profille katılmış oda üyesine görünür; anonim oda üyesine görünmez.
  - **Fotoğraf:** Başka kullanıcının yoluna commit reddedilir. 300 KB üstü ve JPEG dışı reddedilir. Hesap silinince klasör silinir.
  - **Arkadaşlık isteği:** Kabul edilen, reddedilen ve cevapsız isteklerde gönderenin gördüğü satırlar ve yanıtlar aynı. Reddedilen isteğe ikinci istek sessizce yutulur. Engel her iki yönde isteği sessizce yutar.
  - **Oda sonu:**
    - Pencere sırasında geçmiş satırı görünmez ve istek `ok` dönüp hiçbir şey yazmaz.
    - Karşılıklı Evet'te arkadaşlık kurulmaz. İki taraf da "Arkadaş ekle"ye basarsa kurulur.
    - Tek taraf basarsa hiçbir şey olmaz: basanın yanıtı ve satırları, karşı taraf hiç basmamış gibi aynıdır; karşı tarafa yayın gitmez.
    - Karşılıklı olmayan karşılaşmada `add-from-room` hiçbir şey yazmaz.
    - Evet+Hayır, Evet+ayrılma ve Evet+cevapsız durumlarında Evet tarafının satırları, `inbox` olayları ve zamanlaması aynıdır (bugünkü testin genişletilmesi).
  - **DM:**
    - Arkadaş olmayana `not_friends`; küfür reddi; hız sınırı.
    - `dm:` ve `inbox:` kanallarına üye olmayan abone olamaz ve yayın yapamaz.
    - Engelleyince arkadaşlık ve konuşma gider, karşı tarafa yayın ve push gitmez. Arkadaşlığı bitirme ve engelleme karşı taraftan aynı görünür.
  - **Silme:** Hesap silme ve ban arkadaşlıkları, DM'leri, istekleri ve fotoğrafları siler. Karşı tarafın geçmiş satırı kalır, ondan istek gönderilemez.
  - **Sesli Tabu:** Hakem eylemini yalnızca anlatmayan masa yapabilir. Süre dolunca eylem reddedilir. Skor ve tur geçişi doğru. İki masa da kartı alır, oda dışındaki masa alamaz.
- **Mobil:** Sekme iskeletinde her grup `ErrorBoundary` dışa verir. Keşfet ↔ mekan geçişlerinde aynı topic'e çift bağlanma `useChannel` ile güvenli (Faz 8A testleri).

---

## 12. Uygulama sırası ve yayın türü

| Adım                                        | Sunucu                                                                                              | İstemci                                     | Yayın                                                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1. İskelet (sekmeler, ekranların taşınması) | Yok                                                                                                 | Yeni rota yapısı                            | **OTA**                                                                                                              |
| 2. Keşfet                                   | `…_explore.sql`, cron                                                                               | Liste/harita, mekan detayı, check-in girişi | Deploy → **OTA** (MapLibre build'de)                                                                                 |
| 3. Profil/Ayarlar                           | `…_profiles_v2.sql`, Storage kovası, `profile`, `checkin`/`rooms`/`safety`/`account` değişiklikleri | Profil, ayarlar, fotoğraf, katılım biçimi   | Deploy → **OTA** (image picker build'de)                                                                             |
| 4. Arkadaşlar/DM                            | `…_friends_dm.sql`, `…_reveal_friends.sql`, `friends`, `dm`, `reveal`                               | Arkadaşlar sekmesi, DM, oda sonu            | Deploy → **OTA**. DM push'u için FCM gerekir: Faz 8A build'i `google-services.json` olmadan alındıysa **yeni build** |
| 5. Sesli Tabu                               | `…_voice_tabu.sql`, `tabu`                                                                          | Sesli iki masa ekranları, oda kur uyarısı   | Deploy → **OTA**; eski eylemleri kaldıran migration bir sürüm sonra                                                  |

Her adımda sunucu önce yayına girer (CLAUDE.md "Neyi ne zaman yayınlamalı"). Her adım kendi PR'ı ve saha testiyle kapanır.

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

## 14. CLAUDE.md değişmez kurallarıyla çelişkiler ve önerilen yeni metinler

CLAUDE.md değiştirilmedi. Onaydan sonra aşağıdaki metinlerle güncellenir.

**Kural 1 (istemci yazmaz).** Çelişki: profil fotoğrafı istemciden Storage'a yüklenir.

> Öneri: "İstemci hiçbir tabloya doğrudan yazmaz. Tüm yazmalar Edge Function üzerinden yapılır. Dosya yüklemesi yalnızca bir Edge Function'ın tek yol için verdiği süreli imzalı URL'e yapılır ve aynı fonksiyonun `commit` eylemiyle kayda geçer; `storage.objects` üzerinde istemci politikası yoktur. (devamı aynı)"

**Kural 3 (sunucu otoriter).** Sesli Tabu'da doğruluğa insan (hakem masa) karar verir.

> Öneri: "Oyun sunucu otoriterdir: tur süresi (`ends_at`), kart dağıtımı, eylem yetkisi (kim ne zaman hangi eylemi yapabilir) ve skor sunucuda hesaplanır. Yazılı oyunlarda ipucu doğrulama ve tahmin kontrolü de sunucudadır; sesli oyunlarda doğruluğa hakem masa karar verir, eylemi sunucu doğrular."

**Kural 4 (anonimlik).** Çelişki: profille katılımda diğer masaya profil bilgisi gider; lobi "profilli" işaretini görür; arkadaşlar birbirinin profilini görür.

> Öneri: "Anonimlik: diğer masalara varsayılan olarak yalnızca masa takma adı, kişi sayısı ve konsept gider. Masa profille katıldıysa lobi ve katılma isteği yalnızca 'profilli' işaretini görür; profil (görünen ad, fotoğraf, biyografi, rozetler) ve profil kimliği yalnızca o odanın üyelerine, oda üyeliği sürerken gider. Arkadaşlar birbirinin profilini görür. Koordinat, mekan ve aktif masa hiçbir kullanıcıya, arkadaşa da gitmez. Diğer kullanıcıların hesap kimliği istemciye asla gitmez. Masa oturum id'si ve profil kimliği (`public_id`) takma kimliklerdir: oturum id'si oda üyelerine, profil kimliği arkadaşlara ve profille katılınan odanın üyelerine gidebilir. Anonim katılan masanın profil kimliği, arkadaşlık kurulmadıkça hiçbir yanıtta dönmez; anonim oyundan gönderilen arkadaşlık isteği profil kimliğine değil oyun geçmişi kaydına bağlanır."

**Kural 5 (red = zaman aşımı).** Genişleme, çelişki değil.

> Öneri: mevcut metnin sonuna şu eklenir: "Arkadaşlık isteğinde red, istek sahibine süresiz bekleyen istekle aynı görünür; reddedilmiş ya da engellenmiş kişiye yeni istek sessizce yutulur. Pencere bitmeden oda geçmişinden istek gönderilemez. Karşılıklı 'Evet' sonrasında 'Arkadaş ekle'ye yalnızca bir taraf basarsa hiçbir şey olmaz ve karşı taraf bunu hiçbir biçimde görmez."

**Kural 6 (konum).** Çelişki yok, netleştirme.

> Öneri: "…yalnızca seçilen `venue_id` saklanır. Harita ve Keşfet kullanıcının konumunu göstermez; mekan elle seçilir, konum yalnızca check-in'de doğrulama için alınır."

**Kural 7 (trText/profanity).** Kapsam genişler: biyografi, görünen ad ve DM de `profanity.ts`'ten geçer. Yazılı Tabu kalkarsa `containsForbidden` ve `isCorrectGuess` kullanılmaz hale gelir (§8.3).

> Öneri: "…küfür filtresi (oda sohbeti, DM, biyografi, görünen ad) yalnızca `pure/profanity.ts` üzerinden yapılır…"

**Kural 9 (Realtime).** Genişleme: `inbox:{user_id}` (yalnızca sahibi) ve `dm:{thread_id}` (iki üye) eklenir; ikisinde de yalnızca sunucu yayın yapar. Hiçbir Realtime yükü profil kimliği taşımaz: `rooms`'a profil kolonu eklenmez (§5.4).

**MVP_SPEC ile çelişen eski kararlar** (onayla güncellenir):

- M1'deki "kullanıcı takma adı yok" kararı: `display_name` eklenir. Kayıtta sorulmaz; profil kurulurken ya da ilk arkadaşlık kabulünde zorunludur.
- §4.2'deki kişi sayısı 1–6 yerine 1 / 2 / 3 / 4+ olur.
- M5'teki "iki masa tek takım, işbirliği" kararı: sesli Tabu'da masalar karşı takımdır. Sabotaj teşviki riskini yüz yüze oyun azaltır.
- §4.6 "Tanışalım mı?": anlamı değişmez (tanışma sinyali). Karşılıklı Evet'ten sonra iki tarafa "Arkadaş ekle" çıkar; ikisi de basarsa arkadaşlık kurulur.

---

## 15. Açık sorular

Yanıtlananlar (işlendi):

- **S1 — Görünen ad:** `display_name` eklenir. Kayıtta sorulmaz; profil kurulurken ya da ilk arkadaşlık kabulünde zorunlu olur (§6.3).
- **S2 — Profilin görünürlüğü:** Lobide yalnızca takma ad ve "profilli" işareti görünür. `public_id` ve fotoğraf yalnızca oda üyelerine döner. `rooms`'a profil kolonu eklenmez; oda üyeleri `room_member_profile()` ile okur (§5.4).
- **S3 — Karşılıklı Evet:** Otomatik arkadaşlık yok. İki tarafa "Arkadaş ekle" çıkar; ikisi de basarsa istek-onay turu olmadan arkadaşlık kurulur, biri basmazsa sessiz kalır (§6.5).
- **S8 — Masa ile hesap sahibi:** Kabul edildi. Geçmiş ve istek metinlerinde masa dili kullanılır. "Kaç kişisiniz?" 1/2/3/4+ olur, `table_sessions`'a yazılır ve `check_in` olayına eklenir (§6.6).

Açık kalanlar:

- **S4 — Geçmişe yazılma şartı:** Oyun geçmişine yazılmak için şart ne olsun?
  - pencerenin açılması ya da iki masalı odanın kapanması (öneri);
  - en az X dakika birlikte kalma;
  - tamamlanmış bir oyun.

  Amaç, kısa bir katılıp çıkmayla istek hakkı toplanmasını önlemek.

- **S5 — Pencerede "Hayır":** Tanışma penceresinde "Hayır" demek, o masadan gelecek arkadaşlık isteklerini de kalıcı olarak kapatsın mı? Öneri: hayır; kalıcı red yalnızca istek reddiyle olur.
- **S6 — DM saklama:** Arkadaşlık bitince konuşma silinsin mi? Öneri: evet; şikayet edilmişse kopyası 30 gün `reports`'ta kalır. Arkadaşlık sürerken mesajlar süresiz mi saklanır, yoksa bir süre sonra silinir mi? KVKK aydınlatma metni buna göre güncellenir.
- **S7 — DM push metni:** Yalnızca "Yeni bir mesajın var" mı (öneri), yoksa gönderenin görünen adı da olsun mu?
- **S9 — Keşfet kovaları:** Eşikler (sakin 0–2, hareketli 3–5, çok canlı 6+) ve 5 dakikalık güncelleme adımı uygun mu? Pilot ölçeğinde (35 mekan) çoğu mekan çoğu zaman "sakin" görünecek.
- **S10 — Fotoğraf moderasyonu:** Şikayet edilen fotoğraf inceleme bitene kadar otomatik gizlensin mi (ör. 2 ayrı şikayette)? Kaldırma için `admin:remove-photo` script'i eklensin mi?
- **S11 — Sesli Tabu takımları:** Takım = masa mı (öneri), karışık takımlar mı? Tabu cezası −1 mi (tek masa Tabu ile aynı), 0 mı?
- **S12 — `trText` temizliği:** Yazılı Tabu kalkınca `containsForbidden` ve `isCorrectGuess` testleriyle silinsin mi, yoksa ileride yazılı bir oyun için tutulsun mu?
- **S13 — Yasal metinler ve mağaza formları:** Görünen ad, profil fotoğrafı, biyografi, arkadaşlık ve DM; KVKK metninde ve Play/App Store "Veri güvenliği" formlarında yeni veri türleridir. Hukuki kontrol v2 yayınından önce mi yapılacak?
- **S14 — Mevcut kullanıcılar:** v2'ye geçişte varsayılan katılım biçimi `anonymous` olsun mu (öneri)? v1 döneminde oynanan odalar geçmişe aktarılsın mı? Öneri: hayır, geçmiş v2 ile başlasın.
- **S15 — İstek gönderirken ad:** Ad yalnızca kabulde zorunlu olduğu için adsız bir masanın isteği kabul edilebilir. O kişi arkadaşının listesinde ad girene kadar masa takma adıyla görünür. İstek göndermek de `display_name` istesin mi? Öneri: evet; arkadaş listesinde adsız kimse kalmaz ve kabul anında ad sorma adımı tek tarafta kalmaz.
- **S16 — "Arkadaş ekle" süresi:** Karşılıklı Evet sonrası "Arkadaş ekle" niyeti süresiz mi geçerli olsun, yoksa bir süre sonra düşsün mü (ör. 7 gün)? Süre dolduğunda düğme kalksa bile karşı tarafa hiçbir şey gösterilmez.
- **S17 — Eski kişi sayıları:** v1'de 5–6 seçilmiş aktif masalar migration'da 4 ("4+") olur. Yalnızca en fazla 4 saat süren aktif oturumları etkiler. Uygun mu?
