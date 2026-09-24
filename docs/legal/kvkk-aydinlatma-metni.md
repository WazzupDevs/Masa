# KVKK Aydınlatma Metni (TASLAK)

> **HUKUKİ KONTROL GEREKLİ.** 6698 sayılı Kişisel Verilerin Korunması Kanunu m. 10 uyarınca hazırlanmış taslaktır; hukuki görüş alınmadan yayımlanmamalıdır. Köşeli parantezli alanlar doldurulmalıdır.

## 1. Veri sorumlusu

[Unvan, adres, iletişim]

## 2. İşlenen kişisel veriler, amaçlar ve hukuki sebepler

| Veri kategorisi                                                                                                  | Amaç                                                                           | Hukuki sebep (KVKK m. 5)                                        |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Kimlik/iletişim: telefon numarası                                                                                | Üyelik, SMS doğrulama                                                          | Sözleşmenin kurulması ve ifası (m. 5/2-c)                       |
| İşlem güvenliği: onay kayıtları, oturum kayıtları, şikayet ve engelleme kayıtları, banlanan telefonun HMAC özeti | Hizmet ve kullanıcı güvenliği, hukuki yükümlülükler, uyuşmazlıkların önlenmesi | Meşru menfaat (m. 5/2-f), hakkın tesisi ve korunması (m. 5/2-e) |
| Konum: check-in anında bir kez alınan konum (**saklanmaz**) ve cihazın bildirdiği doğruluk yarıçapı (metre)      | Yakındaki mekanların gösterilmesi, mekanda bulunmanın doğrulanması, eşik ayarı | Açık rıza (m. 5/1)                                              |
| Kullanıcı işlemleri: mekan seçimi, masa bilgisi, oda ve oyun verileri, sohbet mesajları, tanışma cevabı          | Hizmetin sunulması                                                             | Sözleşmenin ifası (m. 5/2-c)                                    |
| Pazarlama dışı kullanım istatistikleri (kullanıcı kimliği ve olay adı)                                           | Ürün geliştirme                                                                | Meşru menfaat (m. 5/2-f) [hukuki görüşle teyit edilecek]        |

## 3. Aktarım

Veriler, hizmetin sunulması için Supabase (AB/Almanya), Twilio (ABD), Expo ve Google Firebase (ABD) ile PostHog'a (AB) aktarılır. Yurt dışına aktarımın dayanağı: [KVKK m. 9 kapsamında hukuki görüşle belirlenecek]. Diğer kullanıcılara yalnızca masa takma adı, kişi sayısı ve oyun türü gösterilir.

## 4. Toplama yöntemi

Uygulama üzerinden, elektronik ortamda; konum yalnızca açık rızanızla ve check-in anında.

## 5. Saklama süreleri

Sohbet mesajları oda kapandıktan 24 saat sonra, şikayet kayıtları 30 gün sonra silinir. Diğer veriler hesap silinene kadar saklanır. Banlanan hesabın telefon numarasının geri döndürülemez özeti güvenlik amacıyla süresiz saklanır.

## 6. Haklarınız (KVKK m. 11)

Kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacını öğrenme, aktarıldığı kişileri bilme, düzeltme, silme, itiraz ve zararın giderilmesini isteme haklarına sahipsiniz. Başvuru: [e-posta / adres]. Hesabınızı uygulama içinden silebilirsiniz.
