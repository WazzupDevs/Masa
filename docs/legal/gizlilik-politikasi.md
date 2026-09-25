# Gizlilik Politikası (TASLAK)

> **HUKUKİ KONTROL GEREKLİ.** Bu metin uygulamanın gerçekte işlediği verilere göre hazırlanmış bir taslaktır; hukuki görüş alınmadan yayımlanmamalıdır. Köşeli parantezli alanlar doldurulmalıdır. Uygulama içindeki onay sürümü şu an `draft-0`'dır; bu metin yayımlanınca sürüm artırılır ve kullanıcılardan yeniden onay istenir.

Son güncelleme: [tarih]

## Biz kimiz

Masa ("Uygulama"), [veri sorumlusunun unvanı, adresi, MERSİS/vergi no] tarafından sunulur. İletişim: [e-posta].

## Hangi verileri işliyoruz

| Veri                                                                                                                       | Neden                                                           | Ne kadar süre                                |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| Telefon numarası                                                                                                           | Hesap oluşturma ve SMS ile doğrulama                            | Hesap silinene kadar                         |
| Onay kayıtları (18 yaş beyanı, Kullanım Koşulları, KVKK metni, konum rızası; zaman ve metin sürümü)                        | Onayların ispatı                                                | Hesap silinene kadar                         |
| Mekan ve masa bilgisi (seçilen mekan, masadaki kişi sayısı, masa takma adı, check-in/çıkış zamanı)                         | Mekandaki diğer masalarla eşleşme                               | Hesap silinene kadar                         |
| Konum doğruluğu (metre cinsinden, cihazın bildirdiği)                                                                      | Check-in mesafe eşiğini ayarlamak                               | Hesap silinene kadar                         |
| Oda içi sohbet mesajları                                                                                                   | Sohbet                                                          | Oda kapandıktan 24 saat sonra silinir        |
| Şikayet kayıtları (sebep ve şikayet anındaki son 50 mesajın kopyası)                                                       | Güvenlik ve moderasyon                                          | 30 gün                                       |
| Engelleme kayıtları (engellenen masanın takma adı ve tarih)                                                                | Engellenenin odalarını göstermemek                              | Engel kaldırılana ya da hesap silinene kadar |
| Oyun verileri (ipuçları, tahminler, skor)                                                                                  | Oyunun oynanması                                                | Oda ve hesapla birlikte                      |
| Profil (isteğe bağlı; v2): görünen ad, profil fotoğrafı (ek bilgileri silinmiş), kısa biyografi, varsayılan katılım biçimi | Arkadaşlara ve profille katılınan odanın üyelerine gösterilmesi | Değiştirilene ya da hesap silinene kadar     |
| Oyun geçmişi (v2): tarih, oyun, karşı masanın takma adı ve kişi sayısı                                                     | Karşılaşılan masaya arkadaşlık isteği gönderebilmek             | Hesap silinene kadar                         |
| Arkadaşlık istekleri, "Arkadaş ekle" kayıtları ve arkadaşlıklar (v2)                                                       | Arkadaşlık                                                      | Hesap silinene kadar                         |
| Arkadaşlar arası mesajlar (v2)                                                                                             | Mesajlaşma                                                      | Arkadaşlık bitene ya da hesap silinene kadar |
| Hata raporları (teknik kayıt ve kullanıcı kimliği; telefon, konum ve yazılan metin silinir)                                | Hataların giderilmesi                                           | [süre: Sentry saklama ayarı]                 |
| Tanışma cevabı ("Tanışalım mı?")                                                                                           | İki tarafın isteğini eşleştirmek                                | Oda ve hesapla birlikte                      |
| Bildirim anahtarı (push token)                                                                                             | Katılma isteği ve kabul bildirimleri                            | Çıkış yapılana ya da hesap silinene kadar    |
| Kullanım istatistikleri (yalnızca kullanıcı kimliği ve olay adı; ör. "oda kuruldu")                                        | Ürünün geliştirilmesi                                           | [süre]                                       |
| Banlanan hesabın telefon numarasının geri döndürülemez özeti (HMAC)                                                        | Aynı numarayla yeniden kayıt olunmasını engellemek              | Süresiz (güvenlik amacıyla)                  |

**Konumunuzu saklamayız.** Konumunuz yalnızca check-in anında, uygulama açıkken bir kez alınır; yakındaki mekanları bulmak ve seçtiğiniz mekana 300 metre içinde olduğunuzu doğrulamak için kullanılır ve kaydedilmez. Arka planda konum alınmaz.

**Diğer kullanıcılar sizi tanımaz.** Mekandaki diğer masalar varsayılan olarak yalnızca masa takma adınızı (ör. "Mor Baykuş"), masadaki kişi sayısını ve seçtiğiniz oyunu görür. Bir masa için profille katılmayı seçerseniz yalnızca o oda sürerken odadaki diğer masa profilinizi görür. Profilinizi arkadaşlarınız görür. Telefon numaranız hiçbir kullanıcıyla paylaşılmaz; konumunuz, bulunduğunuz mekan ve aktif masanız arkadaşlarınıza da gösterilmez. "Tanışalım mı?" sorusuna verdiğiniz cevap karşı tarafa hiçbir zaman gösterilmez.

## Hizmet sağlayıcılar ve yurt dışına aktarım

| Sağlayıcı                                                   | Ne için                                            | Konum               |
| ----------------------------------------------------------- | -------------------------------------------------- | ------------------- |
| Supabase (AWS)                                              | Veritabanı, kimlik doğrulama, sunucu fonksiyonları | Almanya (Frankfurt) |
| Twilio                                                      | SMS ile doğrulama kodu                             | ABD                 |
| Expo (Expo Push Service) ve Google Firebase Cloud Messaging | Bildirim iletimi                                   | ABD                 |
| PostHog                                                     | Kullanım istatistikleri                            | AB                  |
| Sentry                                                      | Hata raporları                                     | [bölge]             |

Bu sağlayıcıların bir kısmı Türkiye dışındadır. Yurt dışına aktarımın KVKK m. 9 kapsamındaki dayanağı [hukuki görüşle belirlenecek: açık rıza / standart sözleşme vb.].

## Haklarınız

KVKK m. 11 kapsamındaki haklarınızı kullanmak için [e-posta] adresine yazabilirsiniz. Hesabınızı istediğiniz an **Ayarlar → Hesabımı sil** ile silebilirsiniz; bu işlem yukarıdaki verilerin tamamını siler (şikayet kayıtları 30 gün sonunda silinir; banlanan hesabın telefon özeti güvenlik amacıyla saklanır). Hesap silindiğinde kullanım istatistiklerindeki kişi kaydınız da silinir.

## Çocuklar

Uygulama 18 yaşından küçükler için değildir.

## Değişiklikler

Bu politika değişirse uygulama içinde yeniden onayınızı isteriz.
