# Masa v2 — Teknik tasarım

Durum: **taslak, onay bekliyor.** Bu belge proje sahibinin v2 ürün kararlarını (navigasyon, Keşfet, profil, arkadaşlar ve DM, sesli Tabu) mevcut şemaya, RLS'e, Edge Function'lara ve Realtime'a oturtur. Ürün kararları tartışılmaz. Tartışmaya açık olanlar yalnızca teknik seçimler ve en sondaki açık sorulardır. Onaydan sonra kararlar `MVP_SPEC.md`, `CLAUDE.md` ve `docs/DECISIONS.md`'ye işlenir. Uygulama, §12'deki sırayla ve her adım kendi PR'ıyla yapılır.

Faz 8A'da v2'nin native bağımlılıkları build'e girdi: MapLibre, `expo-image-picker`, `expo-image-manipulator`, `expo-notifications`. Bu yüzden aşağıdaki adımların hepsi, tek bir istisna dışında, **sunucu deploy'u + OTA** ile gider. İstisna: DM push'u, Firebase'in `google-services.json`'ı build'e girmemişse yeni bir build ister (§12).

---

## 1. İlkeler (v1'den korunanlar)

1. **İstemci yazmaz.** Her yazma bir Edge Function üzerinden gider. Profil fotoğrafı da buna dahil (§5.3).
2. **Diğer kullanıcıların hesap kimliği (`auth.users.id`) istemciye gitmez.** v2'de kişiler iki kimlikle tanınır:
   - Masa oturum id'si: takma kimlik, check-in süresince geçerli.
   - Yeni **profil kimliği** `profiles.public_id`: arkadaşlara ve oda üyelerine yalnızca profille katılımda gider.

   Hesap id'sine başvuran her yeni kolon, `blocks.blocked_id`'deki gibi, kolon yetkisiyle istemciden kapatılır.

3. **Red sessizdir.** Kural 5'teki ilke arkadaşlık isteğine de uygulanır: istek sahibi reddi ve cevapsızlığı ayırt edemez (§6.2).
4. **Tanışma sızıntı korumaları aynen kalır:**
   - "Evet" dışındaki her sonuç yalnızca `reveal_ends_at`'te açıklanır.
   - Pencere sırasında açılan odalar lobide görünmez.

   v2'de bunlara, pencere bitmeden arkadaşlık isteği yapılamaması eklenir (§6.4).

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

| Migration              | İçerik                                                                                                                      | Adım           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `…_explore.sql`        | `venue_activity`, `explore_venues()`, cron                                                                                  | Keşfet         |
| `…_profiles_v2.sql`    | `profiles` yeni kolonlar, `table_sessions.participation`, `rooms` profil kolonları, Storage kovası, `reports` hedef türleri | Profil/Ayarlar |
| `…_friends_dm.sql`     | `play_history`, `friend_requests`, `friendships`, `dm_threads`, `dm_messages`, RPC'ler, Realtime politikaları               | Arkadaşlar/DM  |
| `…_reveal_friends.sql` | `reveal_decide`'ın karşılıklı Evet'te arkadaşlık kurması, geçmiş kayıtları                                                  | Arkadaşlar/DM  |
| `…_voice_tabu.sql`     | İki masa Tabu'nun sesli `game_state`'i, hakem eylemleri, eski yazılı eylemlerin kaldırılması (§8.3)                         | Sesli Tabu     |

### 3.1 Değişen tablolar

```
profiles           + public_id uuid not null unique default gen_random_uuid()
                   + display_name text null        (açık soru S1; 2–24 karakter, küfür filtresi)
                   + bio text null                 (≤ 160 karakter, küfür filtresi)
                   + photo_path text null          (Storage yolu; yalnızca sunucu okur)
                   + default_participation text not null default 'anonymous'
                       check (in 'anonymous','profile')
                   + notify_dm boolean not null default true
                   + notify_friend_requests boolean not null default true
table_sessions     + participation text not null default 'anonymous'   (check-in'de seçilir)
rooms              + owner_public_id uuid null, guest_public_id uuid null
                       (yalnızca o masa profille katıldıysa dolu; takma ad her zaman dolu)
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

play_history       id pk, user_id → auth.users on delete cascade,
                   other_user_id → auth.users on delete set null      (istemciye KAPALI kolon)
                   room_id → rooms on delete set null, concept text, mode text ('voice','text'),
                   own_alias text, other_alias text,
                   other_public_id uuid null      (yalnızca diğer masa profille katıldıysa)
                   played_at timestamptz, available_at timestamptz  (≥ reveal_ends_at; §6.4)
                   unique (user_id, room_id)
                   Her iki masalı oda için iki satır (her hesap için bir tane).

game_results       id pk, user_id → auth.users on delete cascade, room_id → rooms on delete set null,
                   concept, mode, completed_at, score int null, won boolean null
                   (rozetler için; yalnızca sunucunun bildiği oyunlar: iki masalı Tabu, Sohbet odaları)

friend_requests    id pk, from_user_id, to_user_id (ikisi de → auth.users on delete cascade; istemciye KAPALI),
                   history_id → play_history on delete set null   (bağlam: tarih, oyun, takma ad)
                   status text check (in 'pending','accepted','declined'), created_at, responded_at
                   unique (from_user_id, to_user_id)          (red kalıcı: aynı yöne ikinci satır yok)

friendships        user_a, user_b (→ auth.users on delete cascade; istemciye KAPALI), check (user_a < user_b),
                   source text check (in 'reveal','request'), created_at
                   primary key (user_a, user_b)

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
- **Görünen ad:** v1'de kullanıcı takma adı yoktu (M1 kararı). Arkadaş listesi ve DM için bir ad gerekiyor. Öneri: isteğe bağlı `display_name` (2–24 karakter, küfür filtresi). Yoksa arkadaşlar birbirini ilk tanıştıkları oyundaki masa takma adıyla görür. Açık soru S1.

### 5.2 Kim kimin profilini görür

| Kim                                                 | Ne görür                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Kendisi                                             | Hepsi                                                                                   |
| Arkadaşı                                            | Görünen ad, fotoğraf, biyografi, rozetler. **Mekan, konum, aktif masa asla.**           |
| Aynı odadaki diğer masa, o masa profille katıldıysa | Aynısı. Oda kapanınca oda bağlamı biter.                                                |
| Lobi ve Keşfet                                      | Hiçbir profil bilgisi yok; yalnızca masa takma adı, kişi sayısı, konsept. Açık soru S2. |
| Diğer herkes                                        | Hiçbir şey                                                                              |

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
- Check-in akışının son adımında o masa için değiştirilebilir. Değer `table_sessions.participation`'a yazılır ve masa süresince sabittir.
- **Profille katılım:** `rooms_create` ve `rooms_respond` o masanın `public_id`'sini `owner_public_id`/`guest_public_id` olarak odaya kopyalar. Oda üyesi diğer masanın profilini `profile/get` ile açabilir. Anonimde bu kolonlar boştur.
- Lobi her iki biçimde de yalnızca takma ad gösterir (S2).

### 5.5 Ayarlar

- **Hesap:** telefon (maskeli gösterim), çıkış, hesabı sil. Hesap silme uygulama içinde yapılır (Play şartı) ve bugünkü `account/delete`'i kullanır.
- **Bildirimler:** DM ve arkadaşlık isteği push'ları açık/kapalı.
- **Gizlilik:** varsayılan katılım biçimi.
- **Engellenenler:** bugünkü liste.
- **Yasal metinler, iletişim, hakkında:** bugünkü bölümler.

---

## 6. Arkadaşlar ve DM

### 6.1 Oyun geçmişi

- **Satırlar ne zaman yazılır:** İki masalı bir oda "Odayı bitir" ile pencereye geçtiğinde ya da iki masalıyken kapandığında. Her hesap için bir satır yazılır. Minimum süre ya da tamamlanmış oyun şartı açık soru S4.
- **`available_at`:**
  - Pencere açıldıysa `reveal_ends_at`, değilse `now()`.
  - Satır istemciye `available_at <= now()` olunca görünür (RLS).
- **Okuma:** Kendi satırları okunur. `other_user_id` kolonu istemciye kapalıdır.

### 6.2 Arkadaşlık isteği

- **Nereden:** yalnızca oyun geçmişinden (`history_id`) ya da oda sonu ekranından. Oda sonu ekranı da aynı geçmiş satırını kullanır.
- **`friends/request { historyId }`:** Sunucu `other_user_id`'yi çözer. Şu durumların hepsinde yanıt **aynıdır** (`{ ok: true }`), satır oluşmaz ya da değişmez:
  - karşı taraf silinmiş;
  - iki yönden birinde engel var;
  - aynı yönde istek zaten var (bekleyen ya da reddedilmiş).

  Zaten arkadaşsalar `already_friends` döner (yeni bir bilgi sızdırmaz).

- **Karşı yönden bekleyen istek varsa** doğrudan arkadaşlık kurulur.
- **Gönderenin görünümü:** `my_sent_requests()` durumu `pending` ya da `accepted` olarak döner. Reddedilen istek **süresiz olarak `pending`** görünür. Red hiçbir yayın, push ya da yanıt alanı üretmez.
- **Alıcının görünümü:** `my_incoming_requests()` bağlamı gösterir: oyunun tarihi, konsept, gönderenin o oyundaki masa takma adı. Gönderen o oyuna profille katıldıysa profili de görünür.
- **Profillerin açılması:** Kabulden sonra iki taraf da birbirinin profilini `profile/get` ile açabilir.
- **`friends/respond { requestId, accept }`:** Red kalıcıdır. Aynı gönderenden aynı alıcıya ikinci satır oluşmaz.

### 6.3 Arkadaşlık, DM, engelleme

- **Liste:** `my_friends()` public_id, görünen ad (yoksa ilk oyundaki takma ad), fotoğraf URL'i ve başlangıç tarihini döner.
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
  - **Engelle:** `safety/block { publicId }` bugünkü `blocks`'a yazar, arkadaşlığı siler (konuşma cascade ile gider). Karşı tarafa bildirilmez. Engel iki yönlü görünmezliği lobiye, isteklere ve Keşfet dışındaki her yere uygular.
- **Okunmamış:** `dm/read { threadId }` yalnızca `dm_reads`'i günceller. Okundu bilgisi karşı tarafa gitmez.

### 6.4 "Tanışalım mı?" ile birleşme

Oda sonundaki tek soru "Tanışalım mı?" kalır ve anlamı genişler: "Evet" = "tanışalım ve arkadaş olalım".

- **Karşılıklı Evet (hemen):** Bugünkü tam ekran sinyal gösterilir. Aynı transaction'da iki masanın hesap sahipleri arasında `friendships` satırı oluşur (`source = 'reveal'`). Ekranda "Artık arkadaşsınız" görünür. Otomatik arkadaşlığın onayı açık soru S3.
- **Diğer her sonuç:** Bugünkü gibi `reveal_ends_at`'te "Güzel oyundu" gösterilir. Arkadaşlık oluşmaz.
  - Her iki masanın geçmiş satırı `available_at = reveal_ends_at` ile yazılır. İstek düğmesi ancak o zaman görünür.
  - Bu yüzden "Hayır" diyen masanın hemen gönderdiği bir istek pencere sırasında karşıya ulaşamaz. Ulaşsaydı "Hayır"ı ele verirdi.
- **Korunan kurallar:** Lobi tutma (pencere sırasında açılan odalar `reveal_ends_at`'e kadar görünmez) ve `reveal_finalize` yayını aynen kalır.
- **Pencerede "Hayır" demek** kalıcı red sayılmaz. Taraflar daha sonra geçmişten istek gönderebilir. İstek, kalıcı reddin tek yoludur. Açık soru S5.

### 6.5 Masa = bir telefon, birden çok kişi

- Arkadaşlık isteği, DM, rozet ve geçmiş hesap sahibine aittir. Masadaki diğer kişilerin hesabı yoktur.
- Sonuçları (açık soru S8):
  - Masada "Evet" diyen kişi hesap sahibi olmayabilir. Karşılıklı Evet'le kurulan arkadaşlık ise hesap sahipleri arasındadır.
  - Rozetler ve geçmiş, masadaki herkesin oynadığı oyunları hesap sahibine yazar.
  - Profille katılımda odadaki diğer masa yalnızca telefonun sahibinin profilini görür, masadaki herkesi değil.
  - DM yalnızca hesap sahibine gider. Masadaki diğerleri kendi hesaplarıyla ayrı masa açmadıkça bağlantı kuramaz.

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

| Fonksiyon | Eylemler                                                                                                                                 | Durum   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `profile` | `get`, `update` (bio, display_name, default_participation, bildirim tercihleri), `photo-upload-url`, `photo-commit`, `photo-remove`      | Yeni    |
| `friends` | `request`, `respond`, `remove`                                                                                                           | Yeni    |
| `dm`      | `send`, `read`                                                                                                                           | Yeni    |
| `checkin` | `check-in`'e `participation`                                                                                                             | Değişir |
| `rooms`   | `create`/`respond`: profil kolonlarını kopyalar; oda sonu geçmiş satırları                                                               | Değişir |
| `reveal`  | `decide`: karşılıklı Evet'te arkadaşlık + `inbox` yayını                                                                                 | Değişir |
| `tabu`    | Sesli mod: `start`, `current-card` (iki masa), `judge { result: correct/taboo/pass }`, `end-turn`; `clue`/`guess` bir sürüm sonra kalkar | Değişir |
| `safety`  | `report`'a `target` (room/dm/profile); `block`'a `publicId` (DM/profil); engel arkadaşlığı siler                                         | Değişir |
| `account` | `delete`: Storage klasörü + PostHog (mevcut)                                                                                             | Değişir |

Hepsi bugünkü kalıbı izler: tek endpoint, `action`, zod v4, `{ error: { code, message } }`. Yazan SQL fonksiyonları yalnızca service role'e açıktır. İstemcinin çağırdığı RPC'ler yalnızca okur: `explore_venues`, `my_friends`, `my_incoming_requests`, `my_sent_requests`, `my_history`, `dm_threads`, `dm_messages`. Hepsi `set search_path = ''`.

Yeni hata kodları: `already_friends`, `not_friends`, `photo_invalid`, `bio_invalid`, `not_judge`.

---

## 10. RLS ve kolon yetkileri

| Tablo                                   | İstemci okuması                                                         | Not                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `profiles`                              | Kendi satırı; `photo_path` hariç                                        | Başkası `profile/get` ile                                            |
| `venue_activity`                        | Yok                                                                     | `explore_venues()`                                                   |
| `table_sessions`                        | Kendi satırı (değişmez)                                                 | `participation` dahil                                                |
| `rooms`                                 | Üyeler (değişmez)                                                       | `owner_public_id`/`guest_public_id` yalnızca profil katılımında dolu |
| `play_history`                          | `user_id = auth.uid() and available_at <= now()`; `other_user_id` hariç | Kolon yetkisi                                                        |
| `game_results`                          | Kendi satırları                                                         | Rozetler sunucuda hesaplanır                                         |
| `friend_requests`                       | Yok                                                                     | RPC'ler; `declined` gönderene `pending` döner                        |
| `friendships`                           | Yok                                                                     | `my_friends()`                                                       |
| `dm_threads`, `dm_messages`, `dm_reads` | Yok                                                                     | RPC'ler; `from_me` hesaplanır                                        |
| `reports`                               | Yok (değişmez)                                                          |                                                                      |
| `storage.objects` (`profile-photos`)    | Politika yok                                                            | İmzalı URL'ler                                                       |
| `realtime.messages`                     | `private.realtime_topic_allowed`                                        | `inbox`, `dm` eklenir                                                |

Yeni RPC'lerin hiçbiri hesap id'si döndürmez. Bunu genel bir test doğrular (§11).

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
  - **Keşfet:** 1 ve 2 masa "sakin", 3 masa "hareketli" görünür. Sayı hiçbir alanda dönmez. Cron dışında değişmez.
  - **Profil görünürlüğü:** Yabancıya `not_found`; arkadaşa ve profille katılmış oda üyesine görünür; anonim oda üyesine görünmez.
  - **Fotoğraf:** Başka kullanıcının yoluna commit reddedilir. 300 KB üstü ve JPEG dışı reddedilir. Hesap silinince klasör silinir.
  - **Arkadaşlık isteği:** Kabul edilen, reddedilen ve cevapsız isteklerde gönderenin gördüğü satırlar ve yanıtlar aynı. Reddedilen isteğe ikinci istek sessizce yutulur. Engel her iki yönde isteği sessizce yutar.
  - **Oda sonu:** Pencere sırasında geçmiş satırı görünmez ve istek `ok` dönüp hiçbir şey yazmaz. Karşılıklı Evet'te arkadaşlık hemen kurulur. Evet+Hayır ve Evet+cevapsız durumlarında Evet tarafının satırları, `inbox` olayları ve zamanlaması aynı (bugünkü testin genişletilmesi).
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

| Olay                                   | Özellikler                         |
| -------------------------------------- | ---------------------------------- |
| `explore_viewed`                       | `view: 'list' \| 'map'`            |
| `checkin_out_of_range`                 | — (istemci uyarısı gösterildi)     |
| `participation_chosen`                 | `mode: 'anonymous' \| 'profile'`   |
| `profile_photo_set`, `profile_bio_set` | —                                  |
| `friend_request_sent`                  | `source: 'history' \| 'room_end'`  |
| `friend_request_accepted`              | —                                  |
| `friendship_created`                   | `source: 'reveal' \| 'request'`    |
| `dm_sent`                              | —                                  |
| `game_completed`                       | mevcut + `mode: 'voice' \| 'text'` |

`reveal_mutual` ve `reveal_none` kalır. Arkadaşlık oranı `friendship_created` / iki masalı odalar olarak ölçülür.

---

## 14. CLAUDE.md değişmez kurallarıyla çelişkiler ve önerilen yeni metinler

CLAUDE.md değiştirilmedi. Onaydan sonra aşağıdaki metinlerle güncellenir.

**Kural 1 (istemci yazmaz).** Çelişki: profil fotoğrafı istemciden Storage'a yüklenir.

> Öneri: "İstemci hiçbir tabloya doğrudan yazmaz. Tüm yazmalar Edge Function üzerinden yapılır. Dosya yüklemesi yalnızca bir Edge Function'ın tek yol için verdiği süreli imzalı URL'e yapılır ve aynı fonksiyonun `commit` eylemiyle kayda geçer; `storage.objects` üzerinde istemci politikası yoktur. (devamı aynı)"

**Kural 4 (anonimlik).** Çelişki: profille katılımda diğer masaya profil bilgisi gider; arkadaşlar birbirinin profilini görür.

> Öneri: "Anonimlik: diğer masalara varsayılan olarak yalnızca masa takma adı, kişi sayısı ve konsept gider. Kullanıcı o masa için profille katılmayı seçtiyse oda üyeleri profilini (görünen ad, fotoğraf, biyografi, rozetler) görür; lobi ve Keşfet her durumda profil göstermez. Arkadaşlar birbirinin profilini görür. Koordinat, mekan ve aktif masa hiçbir kullanıcıya, arkadaşa da gitmez. Diğer kullanıcıların hesap kimliği istemciye asla gitmez. Masa oturum id'si ve profil kimliği (`public_id`) takma kimliklerdir: oturum id'si oda üyelerine, profil kimliği arkadaşlara ve profille katılınan odanın üyelerine gidebilir."

**Kural 5 (red = zaman aşımı).** Genişleme, çelişki değil.

> Öneri: mevcut metnin sonuna "Arkadaşlık isteğinde red, istek sahibine süresiz bekleyen istekle aynı görünür; reddedilmiş ya da engellenmiş kişiye yeni istek sessizce yutulur. Pencere bitmeden oda geçmişinden istek gönderilemez." eklenir.

**Kural 6 (konum).** Çelişki yok, netleştirme.

> Öneri: "…yalnızca seçilen `venue_id` saklanır. Harita ve Keşfet kullanıcının konumunu göstermez; mekan elle seçilir, konum yalnızca check-in'de doğrulama için alınır."

**Kural 3 (sunucu otoriter).** Sesli Tabu'da doğruluğa insan (hakem masa) karar verir.

> Öneri: "Oyun sunucu otoriterdir: tur süresi (`ends_at`), kart dağıtımı, eylem yetkisi (kim ne zaman hangi eylemi yapabilir) ve skor sunucuda hesaplanır. Yazılı oyunlarda ipucu doğrulama ve tahmin kontrolü de sunucudadır; sesli oyunlarda doğruluğa hakem masa karar verir, eylemi sunucu doğrular."

**Kural 7 (trText/profanity).** Kapsam genişler: biyografi, görünen ad ve DM de `profanity.ts`'ten geçer. Yazılı Tabu kalkarsa `containsForbidden` ve `isCorrectGuess` kullanılmaz hale gelir (§8.3).

> Öneri: "…küfür filtresi (sohbet, DM, biyografi, görünen ad) yalnızca `pure/profanity.ts` üzerinden yapılır…"

**Kural 9 (Realtime).** Genişleme: `inbox:{user_id}` (yalnızca sahibi) ve `dm:{thread_id}` (iki üye), ikisinde de yalnızca sunucu yayın yapar.

**MVP_SPEC ile çelişen eski kararlar** (onayla güncellenir):

- M1'deki "kullanıcı takma adı yok" kararı (S1'e bağlı).
- M5'teki "iki masa tek takım, işbirliği" kararı. Sesli Tabu'da masalar karşı takım olur; sabotaj teşviki riskini yüz yüze oyun azaltır.
- §4.6 "Tanışalım mı?" = yalnızca fiziksel tanışma sinyali. v2'de arkadaşlık da içerir.

---

## 15. Açık sorular

- **S1 — Görünen ad:** Arkadaş listesi ve DM için bir ad gerekiyor. İsteğe bağlı bir `display_name` (küfür filtreli) mı eklensin, yoksa arkadaşlar ilk tanıştıkları oyundaki masa takma adıyla mı görünsün?
- **S2 — Profilin görünürlüğü:** Profille katılımda profil yalnızca oda içinde mi görünsün (öneri), yoksa lobide de mi?
- **S3 — Karşılıklı Evet:** Karşılıklı "Evet" otomatik arkadaşlık kursun mu (öneri), yoksa sinyal ekranında "Arkadaş ekle" mi olsun? Masadaki kişi ile hesap sahibi farklı olabilir (§6.5).
- **S4 — Geçmişe yazılma şartı:** Oyun geçmişine yazılmak için şart ne: pencerenin açılması ya da iki masalı odanın kapanması (öneri), en az X dakika birlikte kalma ya da tamamlanmış bir oyun? Kısa bir katılıp çıkmayla istek hakkı toplanmasını önlemek için.
- **S5 — Pencerede "Hayır":** Tanışma penceresinde "Hayır" demek, o kişiden gelecek arkadaşlık isteklerini de kalıcı olarak kapatsın mı? Öneri: hayır; kalıcı red yalnızca istek reddiyle olur.
- **S6 — DM saklama:** Arkadaşlık bitince konuşma silinsin mi (öneri: evet, şikayet edilmişse kopyası 30 gün `reports`'ta kalır)? Arkadaşlık sürerken mesajlar süresiz mi saklanır, yoksa bir süre sonra silinir mi? KVKK aydınlatma metni buna göre güncellenir.
- **S7 — DM push metni:** Yalnızca "Yeni bir mesajın var" mı (öneri), gönderenin adı da olsun mu?
- **S8 — Hesap sahibi ile masadaki kişiler:** Arkadaşlık, DM, rozet ve geçmiş masadaki herkesin oyunlarını hesap sahibine yazar (§6.5). Bu kabul mü? Profille katılım yalnızca telefon sahibinin profilini gösterir; bu da kabul mü?
- **S9 — Keşfet kovaları:** Eşikler (sakin 0–2, hareketli 3–5, çok canlı 6+) ve 5 dakikalık güncelleme adımı uygun mu? Pilot ölçeğinde (35 mekan) çoğu mekan çoğu zaman "sakin" görünecek.
- **S10 — Fotoğraf moderasyonu:** Şikayet edilen fotoğraf inceleme bitene kadar otomatik gizlensin mi (ör. 2 ayrı şikayette)? Kaldırma için `admin:remove-photo` script'i eklensin mi?
- **S11 — Sesli Tabu takımları:** Takım = masa mı (öneri), karışık takımlar mı? Tabu cezası −1 mi (tek masa Tabu ile aynı) yoksa 0 mı?
- **S12 — `trText` temizliği:** Yazılı Tabu kalkınca `containsForbidden` ve `isCorrectGuess` testleriyle silinsin mi, yoksa ileride yazılı bir oyun için tutulsun mu?
- **S13 — Yasal metinler ve mağaza formları:** Profil fotoğrafı, biyografi, arkadaşlık ve DM, KVKK metninde ve Play/App Store "Veri güvenliği" formlarında yeni veri türleridir. Hukuki kontrol v2 yayınından önce mi yapılacak?
- **S14 — Mevcut kullanıcılar:** v2'ye geçişte varsayılan katılım biçimi `anonymous` olsun mu (öneri)? v1 döneminde oynanan odalar geçmişe aktarılsın mı (öneri: hayır, geçmiş v2 ile başlasın)?
