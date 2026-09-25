# KVKK Aydınlatma Metni (TASLAK)

> **HUKUKİ KONTROL GEREKLİ.** 6698 sayılı Kişisel Verilerin Korunması Kanunu m. 10 uyarınca hazırlanmış taslaktır; hukuki görüş alınmadan yayımlanmamalıdır. Köşeli parantezli alanlar doldurulmalıdır.
>
> **v2 taslağı:** Profil, arkadaşlık, DM, oyun geçmişi ve hata raporları (`docs/SPEC_V2.md`) eklendi. v2 yayınından önce hukuki kontrolden geçmeli; yayınla birlikte uygulama içi onay sürümü artırılır.

## 1. Veri sorumlusu

[Unvan, adres, iletişim]

## 2. İşlenen kişisel veriler, amaçlar ve hukuki sebepler

| Veri kategorisi                                                                                                                                                                                  | Amaç                                                                           | Hukuki sebep (KVKK m. 5)                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Kimlik/iletişim: telefon numarası                                                                                                                                                                | Üyelik, SMS doğrulama                                                          | Sözleşmenin kurulması ve ifası (m. 5/2-c)                       |
| İşlem güvenliği: onay kayıtları, oturum kayıtları, şikayet ve engelleme kayıtları, banlanan telefonun HMAC özeti                                                                                 | Hizmet ve kullanıcı güvenliği, hukuki yükümlülükler, uyuşmazlıkların önlenmesi | Meşru menfaat (m. 5/2-f), hakkın tesisi ve korunması (m. 5/2-e) |
| Konum: check-in anında bir kez alınan konum (**saklanmaz**) ve cihazın bildirdiği doğruluk yarıçapı (metre)                                                                                      | Yakındaki mekanların gösterilmesi, mekanda bulunmanın doğrulanması, eşik ayarı | Açık rıza (m. 5/1)                                              |
| Kullanıcı işlemleri: mekan seçimi, masa bilgisi, oda ve oyun verileri, sohbet mesajları, tanışma cevabı                                                                                          | Hizmetin sunulması                                                             | Sözleşmenin ifası (m. 5/2-c)                                    |
| Profil (isteğe bağlı): görünen ad, profil fotoğrafı, kısa biyografi, varsayılan katılım biçimi (anonim/profilli)                                                                                 | Arkadaşlara ve profille katılınan odanın üyelerine profil gösterilmesi         | Sözleşmenin ifası (m. 5/2-c)                                    |
| Arkadaşlık ve mesajlaşma: oyun geçmişi (tarih, oyun, karşı masanın takma adı ve kişi sayısı), arkadaşlık istekleri ve "Arkadaş ekle" kayıtları, arkadaşlar arası mesajlar (DM), okunma zamanları | Karşılaşılan masalarla arkadaşlık kurulması ve mesajlaşma                      | Sözleşmenin ifası (m. 5/2-c)                                    |
| Hata raporları: uygulama çöktüğünde teknik hata kaydı ve kullanıcı kimliği (telefon, konum, mesaj içeriği ve yazılan metin telefondan çıkmadan silinir)                                          | Hataların giderilmesi                                                          | Meşru menfaat (m. 5/2-f) [hukuki görüşle teyit edilecek]        |
| Pazarlama dışı kullanım istatistikleri (kullanıcı kimliği ve olay adı)                                                                                                                           | Ürün geliştirme                                                                | Meşru menfaat (m. 5/2-f) [hukuki görüşle teyit edilecek]        |

## 3. Aktarım

Veriler, hizmetin sunulması için Supabase (AB/Almanya), Twilio (ABD), Expo ve Google Firebase (ABD), PostHog (AB) ve Sentry'ye ([bölge: DSN'in bağlı olduğu Sentry bölgesi]) aktarılır. Yurt dışına aktarımın dayanağı: [KVKK m. 9 kapsamında hukuki görüşle belirlenecek]. Diğer kullanıcılara varsayılan olarak yalnızca masa takma adı, kişi sayısı ve oyun türü gösterilir. Bir masa için profille katılmayı seçerseniz, o oda sürerken odadaki diğer masa profilinizi (görünen ad, fotoğraf, biyografi, rozetler) görür; lobide yalnızca "profilli" işareti görünür. Arkadaşlarınız profilinizi görür. Konumunuz, bulunduğunuz mekan ve aktif masanız hiçbir kullanıcıya, arkadaşlarınıza da gösterilmez.

## 4. Toplama yöntemi

Uygulama üzerinden, elektronik ortamda; konum yalnızca açık rızanızla ve check-in anında. Profil fotoğrafı telefonunuzda yeniden kodlanır; fotoğraftaki konum dahil bütün ek bilgiler (EXIF vb.) yüklenmeden önce silinir.

## 5. Saklama süreleri

Oda sohbet mesajları oda kapandıktan 24 saat sonra, şikayet kayıtları (şikayet edilen fotoğraf ve mesaj kopyaları dahil) 30 gün sonra silinir. Arkadaşlar arası mesajlar arkadaşlık sürdükçe saklanır; arkadaşlık bittiğinde ya da hesap silindiğinde silinir. Profil fotoğrafı değiştirildiğinde ya da kaldırıldığında eski fotoğraf silinir. Diğer veriler hesap silinene kadar saklanır. Banlanan hesabın telefon numarasının geri döndürülemez özeti güvenlik amacıyla süresiz saklanır.

## 6. Haklarınız (KVKK m. 11)

Kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacını öğrenme, aktarıldığı kişileri bilme, düzeltme, silme, itiraz ve zararın giderilmesini isteme haklarına sahipsiniz. Başvuru: [e-posta / adres]. Hesabınızı uygulama içinden silebilirsiniz.
