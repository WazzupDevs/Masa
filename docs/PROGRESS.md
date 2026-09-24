# İlerleme

Otonom çalışma: M2'den M7'ye taşlar sırayla uygulanıyor. Her taş typecheck, lint, birim ve entegrasyon testleri yeşil olmadan kapanmaz. Container'da doğrulanamayan kabul kriterleri [Issue #2](https://github.com/WazzupDevs/Masa/issues/2)'de. Kararlar: [DECISIONS.md](DECISIONS.md).

## Durum

| Taş                          | Durum                       | Commit                          |
| ---------------------------- | --------------------------- | ------------------------------- |
| M0 Altyapı                   | ✅ Bitti (merge: `4ce6d29`) | `d1af2f2`                       |
| M1 Auth ve profil            | ✅ Bitti (merge: `4ce6d29`) | `94c837f`, `c114143`, `a50ee28` |
| M2 Mekan ve masa             | ✅ Bitti                    | `26ea477`                       |
| M3 Oda, lobi, katılma isteği | ⏳ Devam ediyor             |                                 |
| M4 Sohbet ve güvenlik        | Bekliyor                    |                                 |
| M5 Konseptler                | Bekliyor                    |                                 |
| M6 Oda sonu ve tanışma       | Bekliyor                    |                                 |
| M7 Analitik ve mağaza        | Bekliyor                    |                                 |

## Container'da doğrulanamayan kabul kriterleri

- M0: Android fiziksel cihazda açılış.
- M1: Türkiye'ye gerçek SMS teslimatı; cihazda giriş.
- M2: Gerçek mekan listesi (`overpass-api.de` container'dan engelli); cihazda check-in.
- M3: İki cihazda istek ve kabul uçtan uca; push (EAS/Firebase hesabı yok, yapılandırma env'den).

## Sıradaki adım

M3.

## Yerel ortamı kaldırma (yeni oturumda)

1. Docker çalışmıyorsa: `dockerd > /tmp/dockerd.log 2>&1 &`
2. `cp supabase/.env.example supabase/.env` (yoksa), `pnpm supabase start`, `pnpm db:reset`
3. `pnpm supabase functions serve` (arka planda), sonra `pnpm test:integration`
