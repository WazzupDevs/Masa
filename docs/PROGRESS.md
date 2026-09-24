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
| M5 Konseptler                | ✅ Bitti                    | "M5: …" commit'i                |
| M6 Oda sonu ve tanışma       | ⏳ Devam ediyor             |                                 |
| M7 Analitik ve mağaza        | Bekliyor                    |                                 |

## Container'da doğrulanamayan kabul kriterleri

- M0: Android fiziksel cihazda açılış.
- M1: Türkiye'ye gerçek SMS teslimatı; cihazda giriş.
- M2: Gerçek mekan listesi (`overpass-api.de` container'dan engelli); cihazda check-in.
- M3: İki cihazda istek ve kabul uçtan uca; push (EAS/Firebase hesabı yok, yapılandırma env'den).
- M4: Cihazda sohbet, şikayet, engelleme ve bağlantı durumu (sunucu tarafı kabul kriterleri container'da doğrulandı).
- M5: İki cihazda iki masalı Tabu baştan sona (sunucu akışı ve kelime sızmaması container'da doğrulandı); cihazda tek masa Tabu ve Sohbet.

## Sıradaki adım

M6: `reveal` fonksiyonu (`decide`, `finalize`), `ending` durumu ve `reveal_ends_at`, tam ekran sinyal.

## Yerel ortamı kaldırma (yeni oturumda)

1. Docker çalışmıyorsa: `dockerd > /tmp/dockerd.log 2>&1 &`
2. `cp supabase/.env.example supabase/.env` (yoksa), `pnpm supabase start`, `pnpm db:reset`
3. `pnpm supabase functions serve` (arka planda), sonra `pnpm test:integration`
