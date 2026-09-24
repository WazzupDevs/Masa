export const tr = {
  app: {
    name: 'Masa',
  },
  common: {
    continue: 'Devam',
    cancel: 'Vazgeç',
    loading: 'Yükleniyor…',
    genericError: 'Bir şeyler ters gitti. Tekrar dener misin?',
  },
  auth: {
    phoneTitle: 'Telefon numaran',
    phoneHint: 'Sana SMS ile bir doğrulama kodu göndereceğiz.',
    phonePrefix: '+90',
    phonePlaceholder: '5xx xxx xx xx',
    sendCode: 'Kod gönder',
    otpTitle: 'Doğrulama kodu',
    otpHint: (phone: string) => `${phone} numarasına gelen 6 haneli kodu gir.`,
    verify: 'Doğrula',
    resend: 'Kodu tekrar gönder',
    resendIn: (seconds: number) => `Tekrar gönder (${seconds} sn)`,
    errors: {
      invalidPhone: 'Geçerli bir cep telefonu numarası gir (5xx xxx xx xx).',
      unsupportedPhone: 'Şimdilik yalnızca Türkiye cep numaralarıyla kayıt olunabiliyor.',
      banned: 'Bu numarayla kayıt olunamıyor.',
      tooManyRequests: 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.',
      invalidCode: 'Kod hatalı ya da süresi dolmuş.',
    },
  },
  consents: {
    title: 'Başlamadan önce',
    age: '18 yaşından büyüğüm.',
    terms: 'Kullanım Koşulları’nı okudum ve kabul ediyorum.',
    kvkk: 'KVKK Aydınlatma Metni’ni okudum.',
    read: 'Oku',
    accept: 'Onayla ve devam et',
    outdated: 'Metinler güncellendi. Lütfen tekrar onayla.',
  },
  legal: {
    termsTitle: 'Kullanım Koşulları',
    kvkkTitle: 'KVKK Aydınlatma Metni',
    // Placeholder texts (version draft-0). The real texts arrive with legal review before the pilot.
    draftNotice: 'Bu metin taslaktır ve pilot öncesinde güncellenecektir.',
    termsBody:
      'Masa, aynı mekandaki masaların birlikte oyun oynayıp sohbet etmesi için bir uygulamadır. Diğer kullanıcılara saygılı davranmayı, taciz, hakaret ve uygunsuz içerik paylaşmamayı kabul edersin.',
    kvkkBody:
      'Hesabını oluşturmak için telefon numaran işlenir. Numaran diğer kullanıcılarla paylaşılmaz. Hesabını istediğin zaman uygulama içinden silebilirsin.',
  },
  home: {
    title: 'Hoş geldin',
    placeholder: 'Mekan check-in’i yakında burada.',
    settings: 'Ayarlar',
  },
  settings: {
    title: 'Ayarlar',
    signOut: 'Çıkış yap',
    deleteAccount: 'Hesabımı sil',
    deleteConfirmTitle: 'Hesabın silinsin mi?',
    deleteConfirmBody: 'Tüm verilerin kalıcı olarak silinir. Bu işlem geri alınamaz.',
    deleteConfirm: 'Sil',
  },
  errors: {
    bad_request: 'İstek geçersiz.',
    unauthorized: 'Oturumun sona ermiş. Tekrar giriş yap.',
    banned: 'Hesabın askıya alındı.',
    consent_outdated: 'Metinler güncellendi. Lütfen tekrar onayla.',
    method_not_allowed: 'İstek geçersiz.',
    internal: 'Bir şeyler ters gitti. Tekrar dener misin?',
  },
} as const;
