# İlerleme

Otonom çalışma: M2'den M7'ye taşlar sırayla uygulanıyor. Her taş typecheck, lint, birim ve entegrasyon testleri yeşil olmadan kapanmaz. Container'da doğrulanamayan kabul kriterleri [Issue #2](https://github.com/WazzupDevs/Masa/issues/2)'de. Kararlar: [DECISIONS.md](DECISIONS.md).

## Durum

| Taş                          | Durum                       | Commit                          |
| ---------------------------- | --------------------------- | ------------------------------- |
| M0 Altyapı                   | ✅ Bitti (merge: `4ce6d29`) | `d1af2f2`                       |
| M1 Auth ve profil            | ✅ Bitti (merge: `4ce6d29`) | `94c837f`, `c114143`, `a50ee28` |
| M2 Mekan ve masa             | ✅ Bitti                    | `26ea477`                       |
| M3 Oda, lobi, katılma isteği | ✅ Bitti                    | `c974d78`                       |
| M4 Sohbet ve güvenlik        | ✅ Bitti                    | `b054c3c`                       |
| M5 Konseptler                | ✅ Bitti                    | `8ccf6da`                       |
| M6 Oda sonu ve tanışma       | ✅ Bitti                    | `4a0b84b`                       |
| M7 Analitik ve mağaza        | ✅ Bitti (mağaza hariç)     | `713dcfd`                       |
| PR #3 inceleme düzeltmeleri  | ✅ Bitti                    | bu dal, son commit              |

## Container'da doğrulanamayan kabul kriterleri

- M0: Android fiziksel cihazda açılış.
- M1: Türkiye'ye gerçek SMS teslimatı; cihazda giriş.
- M2: Cihazda check-in. Gerçek mekan listesi çekildi (43 kafe, 35'i aktif); pilot öncesi sahada ya da haritada elle doğrulanmalı.
- M3: İki cihazda istek ve kabul uçtan uca; push (EAS/Firebase hesabı yok, yapılandırma env'den).
- M4: Cihazda sohbet, şikayet, engelleme ve bağlantı durumu (sunucu tarafı kabul kriterleri container'da doğrulandı).
- M5: İki cihazda iki masalı Tabu baştan sona (sunucu akışı ve kelime sızmaması container'da doğrulandı); cihazda tek masa Tabu ve Sohbet.
- M6: İki cihazda tanışma penceresi ve tam ekran sinyal (sunucu tarafı: yalnızca karşılıklı Evet'te sinyal ve hemen; diğer durumlarda iki tarafa aynı satır, pencere sonunda; container'da doğrulandı).
- M7: §12 event'lerinin PostHog'a düşmesi (anahtar yok) ve uygulamanın iki mağazanın test kanalında olması (hesap yok; talimat gereği gönderim yapılmadı).

## İnceleme düzeltmeleri (PR #3)

Tanışma sonucunun zamanlaması (yalnızca karşılıklı Evet hemen, 30 sn pencere), Tabu bitince oda açık kalır ("Tekrar oyna"), küfür filtresi katlamasız, Engellenenler listesinde hesap id'si yok, özel Realtime kanalları. Ardından: pencere sırasında açılan açık odalar `reveal_ends_at`'e kadar lobide görünmüyor ve lobi yayını üretmiyor; kural 4 masa oturum id'lerini takma kimlik olarak kabul ediyor. Ayrıntılar: [DECISIONS.md](DECISIONS.md) → "İnceleme düzeltmeleri".

## Saha testi hazırlığı

`preview` APK profili, barındırılan projede test numaraları, `content/venues-test.json` ve iki telefonluk senaryo: [FIELD_TEST.md](FIELD_TEST.md). Adımlar CLAUDE.md'de.

## Sıradaki adım

Otonom çalışma tamamlandı; tek PR açıldı (merge edilmedi). Kalan tüm adımlar hesap ya da cihaz gerektiriyor: [Issue #2](https://github.com/WazzupDevs/Masa/issues/2).

## Yerel ortamı kaldırma (yeni oturumda)

1. Docker çalışmıyorsa: `dockerd > /tmp/dockerd.log 2>&1 &`
2. `cp supabase/.env.example supabase/.env` (yoksa), `pnpm supabase start`, `pnpm db:reset`
3. `pnpm supabase functions serve` (arka planda), sonra `pnpm test:integration`
