import { APP_NAME } from '@shared/brand.ts';
import { headcountLabel } from '@shared/checkin.ts';
import type { InboxStamp } from '@shared/dmInbox.ts';
import type { EventTime } from '@shared/explore.ts';
import { TABU } from '@shared/tabu.ts';
import { SAHTEKAR } from '@shared/sahtekar.ts';
import { SAY_CONFIG } from '@shared/sayChallenge.ts';

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];
// "12 Eylül'de": the locative suffix follows the month's last vowel and consonant.
const MONTH_SUFFIX = [
  "'ta",
  "'ta",
  "'ta",
  "'da",
  "'ta",
  "'da",
  "'da",
  "'ta",
  "'de",
  "'de",
  "'da",
  "'ta",
];

function dayMonth(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
}

function dayMonthAt(iso: string): string {
  return `${dayMonth(iso)}${MONTH_SUFFIX[new Date(iso).getMonth()] ?? ''}`;
}

// play_history.concept: the last game played in the room, or 'chat' (docs/SPEC_V3.md §5.5).
export type HistoryConcept = 'tabu' | 'sohbet' | 'sahtekar' | 'harf' | 'sarki' | 'chat';
const HISTORY_CONCEPTS: Record<HistoryConcept, string> = {
  tabu: 'Sesli Tabu',
  sohbet: 'Sohbet kartları',
  sahtekar: 'Sahtekar',
  harf: 'Harf Kapmaca',
  sarki: 'Şarkıda Geçsin',
  chat: 'Sohbet',
};

// The voice games' names in "… · yüz yüze".
const VOICE_NAMES = {
  tabu: 'Sesli Tabu',
  sahtekar: 'Sahtekar',
  harf: 'Harf Kapmaca',
  sarki: 'Şarkıda Geçsin',
} as const;

const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const WEEKDAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Turkish suffixes after a seat label ("A2'ye", "A3'te", "A2'yim"), by how its last digit is read
// (bir, iki, üç …). Seats are A1–A4 and B1–B4; the table covers 0–9.
const SEAT_SUFFIX: Record<string, { dative: string; locative: string; copula: string }> = {
  '0': { dative: 'a', locative: 'da', copula: 'um' },
  '1': { dative: 'e', locative: 'de', copula: 'im' },
  '2': { dative: 'ye', locative: 'de', copula: 'yim' },
  '3': { dative: 'e', locative: 'te', copula: 'üm' },
  '4': { dative: 'e', locative: 'te', copula: 'üm' },
  '5': { dative: 'e', locative: 'te', copula: 'im' },
  '6': { dative: 'ya', locative: 'da', copula: 'yım' },
  '7': { dative: 'ye', locative: 'de', copula: 'yim' },
  '8': { dative: 'e', locative: 'de', copula: 'im' },
  '9': { dative: 'a', locative: 'da', copula: 'um' },
};
const seatTo = (seat: string, kind: 'dative' | 'locative' | 'copula') =>
  `${seat}'${SEAT_SUFFIX[seat.slice(-1)]?.[kind] ?? ''}`;

export const tr = {
  app: {
    name: APP_NAME,
  },
  update: {
    title: 'Güncelleme gerekli',
    body: 'Uygulamanın bu sürümü artık çalışmıyor. Devam etmek için yeni sürümü yükle.',
    action: 'Güncelle',
    build: (b: string) => `Yüklü sürüm: ${b}`,
  },
  errorScreen: {
    title: 'Bir şeyler ters gitti',
    body: 'Bu ekran açılamadı. Tekrar deneyebilir ya da ana ekrana dönebilirsin.',
    retry: 'Tekrar dene',
    home: 'Ana ekrana dön',
  },
  common: {
    continue: 'Devam',
    cancel: 'Vazgeç',
    retry: 'Tekrar dene',
    loading: 'Yükleniyor…',
    genericError: 'Bir şeyler ters gitti. Tekrar dener misin?',
    close: 'Kapat',
    back: 'Geri',
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
      signupNotAllowed: 'Bu numarayla devam edilemiyor.',
      tooManyRequests: 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.',
      invalidCode: 'Kod hatalı ya da süresi dolmuş.',
    },
  },
  consents: {
    title: 'Başlamadan önce',
    terms: 'Kullanım Koşulları’nı okudum ve kabul ediyorum.',
    kvkk: 'KVKK Aydınlatma Metni’ni okudum.',
    read: 'Oku',
    accept: 'Onayla ve devam et',
    outdated: 'Metinler güncellendi. Lütfen tekrar onayla.',
  },
  // Sign-up = profile (docs/SPEC_V3.md §3).
  signup: {
    title: 'Seni tanıyalım',
    adultsOnly: `${APP_NAME} 18 yaş ve üzeri içindir.`,
    nameLabel: 'Görünen ad',
    nameHint:
      '2–24 karakter. Profilinle katıldığın odalarda ve arkadaşların arasında bu ad görünür.',
    birthLabel: 'Doğum tarihin',
    day: 'Gün',
    month: 'Ay',
    year: 'Yıl',
    birthHint:
      'Doğum tarihin kimseye gösterilmez, profilinde yalnızca yaşın görünür. Sonradan değiştirilemez.',
    birthInvalid: 'Geçerli bir tarih gir.',
    continue: 'Devam',
    extrasTitle: 'Profilini tamamla',
    extrasBody: 'Fotoğraf ve tanıtım isteğe bağlı. İstersen sonra Profil’den de ekleyebilirsin.',
    skip: 'Şimdilik geç',
    finish: 'Bitir',
  },
  underAge: {
    title: `${APP_NAME} 18 yaş ve üzeri içindir`,
    body: 'Hesabın açılmadı ve bilgilerin saklanmadı.',
  },
  legal: {
    termsTitle: 'Kullanım Koşulları',
    kvkkTitle: 'KVKK Aydınlatma Metni',
    // Placeholder texts (version draft-0). The real texts arrive with legal review before the pilot.
    draftNotice: 'Bu metin taslaktır ve pilot öncesinde güncellenecektir.',
    termsBody: `${APP_NAME}, aynı mekandaki masaların birlikte oyun oynayıp sohbet etmesi için bir uygulamadır. Diğer kullanıcılara saygılı davranmayı, taciz, hakaret ve uygunsuz içerik paylaşmamayı kabul edersin.`,
    kvkkBody:
      'Hesabını oluşturmak için telefon numaran, görünen adın ve doğum tarihin işlenir. Numaran ve doğum tarihin diğer kullanıcılarla paylaşılmaz; profilinde yalnızca yaşın görünür. 18 yaşından küçüksen hesap açılmaz ve bilgilerin saklanmaz. Hesabını istediğin zaman uygulama içinden silebilirsin.',
  },
  tabs: {
    explore: 'Keşfet',
    activities: 'Aktiviteler',
    venue: 'Mekan',
    messages: 'Mesajlar',
    profile: 'Profil',
  },
  // Mesajlar (docs/SPEC_V3.md §18.3).
  messages: {
    empty: 'Henüz mesajın yok.',
    emptyHint: 'Arkadaş olduğun kişilerle burada yazışırsın.',
    noMessage: 'Henüz mesaj yok',
    yesterday: 'Dün',
    stamp: (iso: string, stamp: InboxStamp) =>
      stamp.kind === 'time'
        ? clock(iso)
        : stamp.kind === 'yesterday'
          ? 'Dün'
          : stamp.kind === 'weekday'
            ? (WEEKDAYS_SHORT[stamp.weekday] ?? '')
            : dayMonth(iso),
    unread: (n: number) => `${n} okunmamış mesaj`,
    row: (name: string, preview: string, unread: number) =>
      unread > 0 ? `${name}, ${preview}, ${unread} okunmamış` : `${name}, ${preview}`,
  },
  // Aktiviteler: the game hub (docs/SPEC_V3.md §18.3). Same games and rules as the room.
  activities: {
    howTo: 'Nasıl oynanır',
    createWith: 'Bu oyunla oda kur',
    goToVenue: 'Oynamak için mekana gir',
    recent: 'Son oyunların',
    recentRow: (alias: string | null, iso: string) =>
      alias ? `${alias} ile · ${dayMonth(iso)}` : dayMonth(iso),
    score: (n: number) => `${n} puan`,
    won: 'Kazandınız',
    tabu: {
      body: 'Masalar takım olur: anlatan masa kartı anlatır, diğer masa yasaklı kelimeleri dinler.',
      steps: [
        `İki masa yüz yüze oynar, sırayla anlatır. Her tur ${TABU.turnSeconds} saniye, oyun ${TABU.totalTurns} tur.`,
        'Anlatan masa karttaki kelimeyi yasaklı kelimeleri söylemeden anlatır; kendi masası tahmin eder.',
        `Doğru: kelime bilindi, iki masa da basabilir. Pas: kart geçilir, yalnızca anlatan masa basar, turda en çok ${TABU.maxPasses}. Tabu: yasaklı kelime söylendi, yalnızca dinleyen masa basar.`,
        'Masalardan biri tek kişiyse iş birliği modu: tek takım, süreye karşı; üç düğmeye yalnızca anlatan masa basar.',
        'Kendi masanla oynarken masanızı iki takıma ayırın; anlatan telefonu tutar, takımı tahmin eder.',
      ],
    },
    sahtekar: {
      body: 'Herkes aynı kelimeyi görür, biri hariç: sahtekar yalnızca kategoriyi bilir. Onu bulun.',
      steps: [
        `En az ${SAHTEKAR.minPlayers} kişi. Telefon elden ele dolaşır; herkes kendi kartını basılı tutarak görür.`,
        `Kartına ${SAHTEKAR.viewSeconds / 60} dakikada bakmayan oyundan çıkar.`,
        `İki tur boyunca sırayla tek kelimelik ipucu verin; her ipucu ${SAHTEKAR.clueSeconds} saniye.`,
        'Sonra herkes gizlice sahtekar sandığı kişiye oy verir; kendine oy verilmez.',
        'Sahtekar yakalanırsa kelimeyi altı seçenek arasından tahmin eder. Bilirse ya da yakalanmazsa sahtekar kazanır.',
      ],
    },
    harf: {
      body: 'Kategoriye uyan bir kelime söyle, baş harfini kap. Diğer masa itiraz edebilir.',
      steps: [
        `Masalar sırayla oynar; her sıra ${SAY_CONFIG.harf.turnSeconds} saniye.`,
        'Kategoriye uyan, tahtada açık bir harfle başlayan bir kelime söyle ve o harfe dokun.',
        `Diğer masa ${SAY_CONFIG.harf.objectionSeconds} saniye içinde itiraz edebilir; itiraz alan ya da süresi dolan masa turu kaybeder, rakip 1 puan alır. Her masanın ${SAY_CONFIG.harf.objections} itiraz hakkı var.`,
        `Bütün harfler kapanırsa tur son harfi kapatanın. ${SAY_CONFIG.harf.totalRounds} kategori oynanır.`,
        'Kendi masanla oynarken iki takıma ayrılın; telefon ortada durur.',
      ],
    },
    sarki: {
      body: 'Kelimenin geçtiği bir şarkıdan bir dize söyleyin. Söyleyemeyen kaybeder.',
      steps: [
        `Masalar sırayla, ${SAY_CONFIG.sarki.turnSeconds} saniye içinde kelimenin geçtiği bir dize söyler ve "Söyledik"e basar.`,
        `Diğer masa ${SAY_CONFIG.sarki.objectionSeconds} saniye içinde itiraz edebilir; itiraz alan ya da söyleyemeyen masanın rakibi 1 puan alır. Her masanın ${SAY_CONFIG.sarki.objections} itiraz hakkı var.`,
        `Bir kelimede en çok ${SAY_CONFIG.sarki.maxSteps} dize; sekizinci de geçerse kelime puansız biter.`,
        `${SAY_CONFIG.sarki.totalRounds} kelime oynanır; son iki kelimede süre ${SAY_CONFIG.sarki.shortSeconds} saniye.`,
        'Uygulama müzik çalmaz, şarkı göstermez; dizeyi siz söylersiniz.',
      ],
    },
    sohbet: {
      body: 'Sırayla kart çekin, soruyu masanızda konuşun.',
      steps: [
        'Bir tema seçin: Isınma, Film, dizi, müzik, Hiç … yaptın mı? ya da Derin.',
        'Sırayla kart çekin; karttaki soruyu masanızda konuşun.',
        'Başka bir masayla oynarken iki masa aynı kartı görür; sohbet oda sohbetinde de sürer.',
      ],
    },
  },
  explore: {
    backToVenue: 'Mekan ekranına dön',
    views: { list: 'Liste', map: 'Harita' },
    buckets: { calm: 'Sakin', lively: 'Hareketli', buzzing: 'Çok canlı' },
    eventShort: 'Etkinlik',
    eventTag: (when: string, title: string) => `${when} · ${title}`,
    eventTime: (when: EventTime): string => {
      switch (when.kind) {
        case 'now':
          return 'Şimdi';
        case 'today':
          return `Bugün ${when.time}`;
        case 'tomorrow':
          return `Yarın ${when.time}`;
        case 'weekday':
          return `${WEEKDAYS[when.weekday] ?? ''} ${when.time}`;
      }
    },
    empty: 'Şu an listede mekan yok.',
    count: (n: number) => `${n} mekan`,
    locationHidden: 'Konumun gösterilmez',
    viewSwitch: 'Görünüm',
    mapLabel: 'Mekan haritası. Bir mekana dokununca altta kartı açılır.',
    goToVenue: 'Mekana git',
    notFound: 'Bu mekan artık listede değil.',
    back: 'Geri dön',
    checkInHint:
      'Mekanı sen seçtin; konumun yalnızca mekanda olduğunu doğrulamak için bir kez alınır.',
    checkInHere: 'Buraya giriş yap',
    eventsTitle: 'Etkinlikler',
    noEvents: 'Bu hafta planlı etkinlik yok.',
    comingSoon: 'Yeni mekanlar yakında.',
  },
  friends: {
    empty: "Henüz arkadaşın yok. Birlikte oynadığın masaları Bildirimler'de bulabilirsin.",
    requestsAndHistory: 'Geçmiş ve istekler',
    message: (name: string) => `${name} ile mesajlaş`,
    newRequests: (n: number) => `${n} yeni arkadaşlık isteği`,
    unread: 'Yeni mesaj',
    noMessagesYet: 'Henüz mesaj yok. İlk mesajı sen yaz.',
    // Ablative: the locative suffix plus "n" (Eylül'den, Ocak'tan).
    since: (iso: string) => `${dayMonthAt(iso)}n beri arkadaşsınız`,
    incomingTitle: 'Gelen istekler',
    noIncoming: 'Yeni istek yok.',
    incoming: (playedAt: string, concept: HistoryConcept, alias: string) =>
      concept === 'tabu'
        ? `${dayMonthAt(playedAt)} Sesli Tabu oynadığınız ${alias} masası arkadaşın olmak istiyor`
        : `${dayMonthAt(playedAt)} sohbet ettiğiniz ${alias} masası arkadaşın olmak istiyor`,
    accept: 'Kabul et',
    decline: 'Reddet',
    declineNote: 'Reddedersen karşı tarafa bildirilmez.',
    sentTitle: 'Gönderilen istekler',
    sent: (alias: string) => `${alias} masasına istek gönderildi`,
    sentAccepted: (alias: string) => `${alias} masası isteğini kabul etti`,
    historyTitle: 'Oyun geçmişi',
    noHistory: 'Başka bir masayla en az 3 dakika oynadığınızda burada görünür.',
    // The last game played in the room, or the chat (docs/SPEC_V3.md §5.5).
    historyRow: (alias: string, concept: HistoryConcept, playedAt: string) =>
      `${alias} masasıyla ${HISTORY_CONCEPTS[concept]} · ${dayMonth(playedAt)}`,
    people: (n: number) => `${headcountLabel(n)} kişi`,
    sendRequest: 'İstek gönder',
    addFriend: 'Arkadaş ekle',
    actionDone: 'Gönderildi',
    addFriendHint: 'İki masa da basarsa arkadaş olursunuz. Karşı taraf basmazsa hiçbir şey olmaz.',
    more: 'Diğer',
    moreTitle: 'Bu masa',
    report: 'Şikayet et',
    block: 'Engelle',
    alsoReport: 'Şikayet de et',
    blockConfirm: 'Engelle',
    blockHint:
      'Birbirinizi lobide, isteklerde ve arkadaş listesinde bir daha görmezsiniz. Karşı tarafa bildirilmez.',
    removeFriend: 'Arkadaşlıktan çıkar',
    removeConfirm: 'Çıkar',
    removeHint: 'Konuşmanız silinir. Karşı tarafa bildirilmez.',
    friendMenuTitle: 'Arkadaşlık',
    viewProfile: 'Profili gör',
    done: 'Tamam',
    back: 'Geri',
  },
  notifications: {
    title: 'Bildirimler',
    withCount: (n: number) => `Bildirimler, ${n} yeni`,
    empty: 'Yeni bildirim yok.',
    emptyHint: 'Başka bir masayla en az 3 dakika oynadığınızda burada görünür.',
  },
  dm: {
    placeholder: 'Mesaj yaz…',
    send: 'Gönder',
    report: 'Konuşmayı şikayet et',
    olderMessages: 'Daha eski mesajlar',
    delivery: { sent: 'Gönderildi', delivered: 'İletildi', read: 'Okundu' },
    typing: 'yazıyor',
  },
  profile: {
    noName: 'Henüz bir adın yok',
    nameWithAge: (name: string, age: number) => `${name}, ${age}`,
    addName: 'Ad ekle',
    edit: 'Profili düzenle',
    editShort: 'Düzenle',
    birthDateNote: 'Doğum tarihin değiştirilemez; profilinde yalnızca yaşın görünür.',
    friends: 'Arkadaşlar',
    friendsCount: (n: number) => `Arkadaşlar, ${n}`,
    editTitle: 'Profili düzenle',
    nameLabel: 'Görünen ad',
    nameHint: '2–24 karakter. Arkadaşların ve profille katıldığın odalardaki masa bu adı görür.',
    bioLabel: 'Tanıtım',
    bioHint: (n: number, max: number) => `${n}/${max}`,
    save: 'Kaydet',
    photo: 'Fotoğraf',
    photoChange: 'Fotoğrafı değiştir',
    photoAdd: 'Fotoğraf ekle',
    photoFromLibrary: 'Galeriden seç',
    photoFromCamera: 'Fotoğraf çek',
    photoRemove: 'Fotoğrafı kaldır',
    photoNeedsName: 'Fotoğraf eklemek için önce bir ad seç.',
    photoHidden:
      'Fotoğrafın şikayetler nedeniyle gizlendi; kimse göremiyor. Yeni bir fotoğraf yükleyebilirsin.',
    photoPermission: 'Fotoğraf seçmek için izin gerekiyor. İzni ayarlardan verebilirsin.',
    photoInvalid: 'Bu fotoğraf kullanılamadı. Başka bir fotoğraf dene.',
    photoPrivacy:
      'Fotoğrafın konum ve cihaz bilgisi gibi bütün ek bilgilerden arındırılarak yüklenir.',
    badgesTitle: 'Rozetler',
    noBadges: 'Oynadıkça rozet kazanırsın.',
    badgeCount: (earned: number, all: number) => `${earned} / ${all}`,
    badgeLocked: (name: string) => `${name}, henüz kazanılmadı`,
    badges: {
      first_game: 'İlk oyun',
      ten_games: '10 oyun',
      voice_tabu_five_wins: 'Sesli Tabu ustası',
      five_tables: '5 farklı masa',
    },
    notVisible: 'Bu profil artık görüntülenemiyor.',
    report: 'Profili şikayet et',
    back: 'Geri dön',
  },
  // Anonymous or with the profile, chosen for each room (docs/SPEC_V3.md §5.4).
  participation: {
    title: 'Bu odada nasıl görüneceksiniz?',
    anonymous: 'Anonim',
    anonymousHint: 'Diğer masa yalnızca masa adınızı ve kişi sayınızı görür.',
    profile: 'Profilimle',
    profileHint:
      'Lobide "profilli" işareti görünür. Odadaki diğer masa, oda sürerken profilini görebilir.',
    profileNeedsName: 'Profilinle katılmak için önce Profil sekmesinden bir ad seç.',
  },
  home: {
    title: 'Hoş geldin',
    hint: 'Bir mekandaysan masanı açıp diğer masalarla oynayabilirsin.',
    checkIn: 'Mekana giriş yap',
    settings: 'Ayarlar',
  },
  checkin: {
    locationTitle: 'Konumun',
    locationBody:
      'Yakınındaki mekanları bulmak için konumunu yalnızca şimdi, bir kez kullanıyoruz. Konumun saklanmaz ve diğer masalarla paylaşılmaz; yalnızca seçtiğin mekan kaydedilir.',
    locationConsent: 'Konumumun bu amaçla kullanılmasına açık rıza veriyorum.',
    useLocation: 'Konumumu kullan',
    locating: 'Konum alınıyor…',
    permissionDenied:
      'Konum izni olmadan yakındaki mekanları bulamıyoruz. İzni ayarlardan verebilirsin.',
    openSettings: 'Ayarları aç',
    locationFailed: 'Konum alınamadı. Açık bir alanda tekrar dene.',
    venuesTitle: 'Yakındaki mekanlar',
    noVenues: 'Yakınında kayıtlı bir mekan yok.',
    retry: 'Tekrar dene',
    distance: (meters: number) => `${meters} m`,
    osmAttribution: '© OpenStreetMap katkıda bulunanlar',
    outsideBoundary: 'Kampüsün içinde görünmüyorsun. Kampüse girince tekrar dene.',
    spotTitle: 'Neredesin?',
    spotHint: 'Aynı noktadaki masalarla oynarsın. Noktanı sonra da değiştirebilirsin.',
    venueAtSpot: (venue: string, spot: string) => `${venue} · ${spot}`,
    headcountTitle: 'Masada kaç kişisiniz?',
    headcountOption: (n: number) => headcountLabel(n),
    headcountHint: 'Sen dahil. Dört ya da daha fazlaysanız 4+ seçin.',
    open: 'Masayı aç',
    doneTitle: 'Masan hazır',
    doneBody: 'Bu mekanda diğer masalar sizi bu adla görecek:',
    continue: 'Devam',
  },
  // The games (docs/SPEC_V3.md §5.1). "Sohbet" alone is the intent label, never a game.
  concepts: {
    tabu: 'Sesli Tabu',
    sohbet: 'Sohbet kartları',
    sahtekar: 'Sahtekar',
    harf: 'Harf Kapmaca',
    sarki: 'Şarkıda Geçsin',
  },
  // How a game is shown with its type (docs/SPEC_V2.md §8.1): only voice games are marked, since
  // they need the tables to come together.
  conceptWithMode: (concept: 'tabu' | 'sohbet' | 'sahtekar' | 'harf' | 'sarki') =>
    concept === 'sohbet' ? 'Sohbet kartları' : `${VOICE_NAMES[concept]} · yüz yüze`,
  // The room's optional intent label (§5.2).
  intents: { game: 'Oyun', chat: 'Sohbet' },
  voiceNote:
    'Bu oyun yüz yüze oynanır: başka bir masa katılırsa masalar bir araya gelip sesli oynar.',
  rooms: {
    create: 'Oda kur',
    playWithTable: 'Masanla oyna',
    playWithTableHint: 'Şu an mekanda açık oda yok. Kendi masanla oynayabilirsin.',
    lobbyTitle: 'Açık odalar',
    roomCount: (n: number) => `${n} oda`,
    profiled: 'profilli',
    people: (n: number) => `${headcountLabel(n)} kişi`,
    waitingFor: (minutes: number) => (minutes < 1 ? 'yeni açıldı' : `${minutes} dk bekliyor`),
    requestJoin: 'Katılmak istiyorum',
    mySpot: (name: string) => `Senin noktan · ${name}`,
    noSpot: 'Noktasız',
    spotHere: 'Bu noktadayım',
    otherSpot: 'Bu oda başka bir noktada.',
    requestPending: (seconds: number) => `İsteğin gönderildi. Yanıt bekleniyor (${seconds} sn).`,
    requestUnavailable: 'Masa şu an müsait değil.',
    newTitle: 'Oda kur',
    newHint:
      'Oda mekandaki diğer masalara açılır ve sohbetle başlar. Oyunu odada iki masa birlikte seçer.',
    intentLabel: 'Niyetin (isteğe bağlı)',
    intentNone: 'Etiket yok',
    intentHint: {
      game: 'Oyun oynamak istiyorsunuz.',
      chat: 'Sohbet etmek istiyorsunuz. Oyun yine önerilebilir.',
    },
    createConfirm: 'Odayı kur',
    // The room's eyebrow: the running game, else the chat; voice games say they are played face to
    // face (docs/SPEC_V2.md §8.1).
    roomEyebrow: (concept: 'tabu' | 'sohbet' | 'sahtekar' | 'harf' | 'sarki' | null) =>
      concept === null
        ? 'Oda'
        : concept === 'sohbet'
          ? 'Sohbet kartları'
          : `${VOICE_NAMES[concept]} · yüz yüze`,
    withGuest: (owner: string, guest: string) => `${owner} ve ${guest}`,
    waitingForGuest: 'Başka bir masa katılmak isteyebilir. Bu arada kendi masanla oynayabilirsin.',
    end: 'Odayı bitir',
    endHint: 'İki masalı odada "Tanışalım mı?" sorulur.',
    requestTitle: 'Katılma isteği',
    sendRequest: 'İsteği gönder',
    incomingTitle: 'Katılma isteği',
    incomingBody: (alias: string, headcount: number) =>
      `${alias} (${headcountLabel(headcount)} kişi) odana katılmak istiyor.`,
    accept: 'Kabul',
    decline: 'Geç',
    declineNote:
      'Geç dersen karşı masa yalnızca "Masa şu an müsait değil" görür. Kimse bilgilendirilmez.',
    viewProfile: 'Diğer masanın profilini gör',
    secondsLeft: (s: number) => `${s} sn`,
  },
  chat: {
    title: 'Sohbet',
    show: 'Sohbeti aç',
    hide: 'Sohbeti kapat',
    placeholder: 'Mesaj yaz…',
    send: 'Gönder',
    empty: 'Henüz mesaj yok.',
    counter: (n: number, max: number) => `${n}/${max}`,
    sending: 'Gönderiliyor…',
    notSent: 'Gönderilemedi.',
    retry: 'Tekrar dene',
    discard: 'Sil',
    // Chat screens: a day line over each day's first message, the time under a run (Aşama 4).
    today: 'Bugün',
    day: (iso: string) => dayMonth(iso),
    time: (iso: string) => {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },
  },
  // Mekan sohbet odası (docs/SPEC_V3.md §7).
  venueChat: {
    open: 'Sohbet odası',
    title: (venue: string) => `${venue} sohbet odası`,
    hint: 'Mekanda masası olan herkes okur ve yazar. Mesajlar 24 saat sonra silinir.',
    empty: 'Henüz mesaj yok. İlk mesajı sen yaz.',
    placeholder: 'Mekana yaz…',
    send: 'Gönder',
    asProfile: 'Profilimle yaz',
    asProfileOn: 'Adınla görünür; masa adın görünmez.',
    asProfileOff: 'Masa adınla görünür.',
    profiled: 'profilli',
    you: 'Sen',
    messageMenu: 'Mesaj',
    seeProfile: 'Profili gör',
    sendRequest: 'Arkadaşlık isteği gönder',
    requestConfirmTitle: 'İstek gönderilsin mi?',
    requestConfirmBody: 'İstek gönderirsen profilin ona görünür: adın, yaşın ve fotoğrafın.',
    requestConfirm: 'İsteği gönder',
    requestSent: 'İstek gönderildi.',
    blockConfirmTitle: 'Bu kişiyi engellemek istiyor musun?',
    blockConfirmBody:
      'Birbirinizin mesajlarını artık görmezsiniz. Karşı tarafa bildirilmez. Engeli ayarlardan kaldırabilirsin.',
    noTable: 'Sohbet odası yalnızca mekanda masan varken açılır.',
    // A request from the venue chat (§7.5): the sender's name and age.
    incoming: (venue: string, name: string, age: number | null) =>
      `${venue} sohbet odasından ${age !== null ? `${name} (${age})` : name} arkadaşın olmak istiyor`,
    sent: (name: string) => `${name} kişisine istek gönderildi`,
    sentAccepted: (name: string) => `${name} isteğini kabul etti`,
  },
  safety: {
    report: 'Şikayet et',
    reportTitle: 'Neden şikayet ediyorsun?',
    reasons: {
      harassment: 'Taciz',
      inappropriate: 'Uygunsuz içerik',
      spam: 'Spam',
      other: 'Diğer',
    },
    reportSent: 'Şikayetin alındı. Teşekkürler.',
    block: 'Engelle',
    blockConfirmTitle: 'Bu masayı engellemek istiyor musun?',
    blockConfirmBody:
      'Birbirinizin odalarını artık görmezsiniz. Oda biter ve cevabın "Hayır" sayılır. Engeli ayarlardan kaldırabilirsin.',
    blockConfirm: 'Engelle',
    blockedTitle: 'Engellenenler',
    blockedEmpty: 'Engellediğin kimse yok.',
    blockedSince: (date: string) => `${date} tarihinde engellendi`,
    unblock: 'Engeli kaldır',
    otherOffline: 'Diğer masanın bağlantısı koptu.',
  },
  games: {
    sohbetFirst: 'İlk kartı aç',
    sohbetNext: 'Sonraki',
    sohbetWait: (s: number) => `Sonraki (${s} sn)`,
    themes: {
      isinma: 'Isınma',
      'film-dizi-muzik': 'Film, dizi, müzik',
      'hic-yaptin-mi': 'Hiç … yaptın mı?',
      derin: 'Derin',
    },
    localIntro: 'Masanızı iki takıma ayırın. Anlatan telefonu tutar, takımı tahmin eder.',
    team: (t: string) => `Takım ${t}`,
    round: (n: number, total: number) => `Tur ${n}/${total}`,
    startTurn: (t: string) => `Takım ${t} başlasın`,
    forbiddenLabel: 'Yasaklı kelimeler',
    correct: 'Doğru',
    pass: 'Pas',
    taboo: 'Tabu',
    scores: (a: number, b: number) => `A ${a} – ${b} B`,
    winner: (t: string) => `Takım ${t} kazandı!`,
    draw: 'Berabere!',
    playAgain: 'Yeniden oyna',
    // Proposals (docs/SPEC_V3.md §5.3): a game starts only when the other table accepts.
    proposeTitle: 'Oyun öner',
    proposeHint: 'Diğer masa kabul edince oyun başlar.',
    propose: (game: string) => `${game} öner`,
    proposalMine: (game: string, s: number) => `${game} önerdin. Yanıt bekleniyor (${s} sn).`,
    proposalTheirs: (game: string) => `Diğer masa ${game} öneriyor.`,
    acceptProposal: 'Oynayalım',
    declineProposal: 'Şimdi değil',
    notAccepted: 'Öneri kabul edilmedi.',
    // One table: the games start at once.
    soloTitle: 'Masanla oyna',
    start: (game: string) => `${game} başlat`,
    endGame: 'Oyunu bitir',
    lastGameTabu: (owner: string, ownerScore: number, guest: string, guestScore: number) =>
      `Son oyun: ${owner} ${ownerScore} – ${guestScore} ${guest}`,
    lastGameOther: (game: string) => `${game} bitti.`,
    turn: (n: number, total: number) => `Tur ${n}/${total}`,
    turnEyebrow: (n: number, total: number) => `Tabu · Tur ${n}/${total}`,
    passesLeft: (n: number) => `${n} pas hakkı`,
    passDetail: (n: number) => `${n} hak`,
    secondsLeft: (s: number) => `${s} sn`,
    // The turn clock, "0:37".
    clock: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
    clockLabel: (s: number) => `${s} saniye kaldı`,
    correctPoints: '+1',
    tabooPoints: '−1',
    turnOverWait: 'Tur bitiyor…',
    voiceIntro:
      'Yüz yüze oynanır: masalar sırayla anlatır, diğer masa kartı görür ve hakemlik yapar. 6 tur, her tur 60 saniye.',
    sohbetIntro: 'Sohbet kartları: her kart bir soru; iki masa da sonraki kartı açabilir.',
    voiceDescribe: 'Sıra sizde: kartı masanıza anlatın. Diğer masa kartı görüyor ve Tabu der.',
    tapToReveal: 'Kartı görmek için dokun',
    hideFromTeam: 'Önce telefonu takım arkadaşlarından sakla.',
    cardsLoading: 'Kartlar geliyor…',
    voiceJudge: (alias: string) => `${alias} anlatıyor. Hakem sizsiniz.`,
    judgeCorrect: 'Doğru +1',
    judgeTaboo: 'Tabu −1',
    you: 'siz',
    describing: 'anlatıyor',
    voiceWinner: (alias: string) => `${alias} kazandı!`,
    voiceDraw: 'Berabere!',
    cardOnlyHere: 'Kartı yalnızca bu odadaki iki masa görür.',
    // Cooperative mode (docs/SPEC_V3.md §6.3): one team, the guessing table never sees the card.
    coopIntro: 'Masalardan biri tek kişi: iki masa tek takım, ortak skor süreye karşı.',
    coopDescribe: "Sıra sizde: kartı diğer masaya anlatın. Doğru, Pas ve Tabu'ya siz basarsınız.",
    coopGuess: (alias: string) => `${alias} size anlatıyor. Anlatanı dinleyin ve tahmin edin.`,
    coopCardHidden: 'Kartı yalnızca anlatan masa görür.',
    teamScore: 'Ortak skor',
    lastGameTeam: (score: number) => `Sesli Tabu bitti. Ortak skor: ${score}`,
    // Stage 6 (canvas: Aşama 6 · Oyunlar): full-screen game, turn ready, feedback, end, intro.
    scoreUp: (n: number) => `+${n}`,
    scoreDown: (n: number) => `−${n}`,
    chatButton: (unread: number) => (unread > 0 ? `Sohbet, ${unread} okunmamış` : 'Sohbet'),
    endGameConfirmTitle: 'Oyunu bitirelim mi?',
    endGameConfirmBody:
      'Skor şimdiki hâliyle kaydedilir ve iki masa sohbete döner. Diğer masa da bunu görür.',
    endGameConfirmSolo: 'Skor şimdiki hâliyle kalır ve masanız sohbete döner.',
    endGameConfirm: 'Bitir',
    keepPlaying: 'Devam et',
    turnDone: (n: number) => `${n}. tur bitti`,
    turnReadyStart: 'Başla',
    turnReadyStartLabel: 'Turu başlat',
    turnReadyYou: 'Bu tur siz anlatıyorsunuz',
    turnReadyHint: 'Telefonu takımınızdan uzak tutun; kartı yalnızca anlatan görür.',
    turnReadyWaiting: (alias: string) => `${alias} hazırlanıyor`,
    turnReadyWaitingHint: 'Onlar başlayınca ya da süre dolunca tur başlar.',
    turnReadySeconds: (s: number) => `${s} saniye`,
    statCorrect: 'Doğru',
    statTaboo: 'Tabu',
    statPass: 'Pas',
    timeUp: 'Süre bitti!',
    rematch: 'Rövanş',
    introEyebrow: 'İlk oyun',
    introSkip: 'Geç',
    introTitle: 'Sesli Tabu nasıl oynanır?',
    introStep: (n: number) => `${n}. adım`,
    introSteps: [
      {
        title: 'Anlatan masa',
        body: 'Kartı yalnızca anlatan görür. Kelimeyi yasaklı kelimeleri söylemeden kendi takımına anlatır.',
      },
      { title: 'Hakem masa', body: 'Karşı masa dinler. Yasaklı kelime geçerse "Tabu"ya basar.' },
      {
        title: 'Düğmeler',
        body: 'Bilinince "Doğru" (+1), geçmek için "Pas" (turda 3 hak). Tur 60 sn sürer.',
      },
    ],
    introDone: 'Anladım, başlayalım',
    // Step 7 A2 (docs/SPEC_V3.md §19.2): the ready screen's summary and the time-up line.
    turnSummaryTitle: (alias: string) => `${alias} anlattı`,
    signedPoints: (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'),
    turnPointsLine: (alias: string, n: number) =>
      `${alias} bu turda ${n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'}`,
    gameBrand: (game: string) => `${APP_NAME} · ${game}`,
  },
  // Harf Kapmaca and Şarkıda Geçsin (docs/SPEC_V3.md §20.3–20.4): say, then the other table may
  // object within 3 seconds; three objections per table.
  say: {
    category: 'Kategori',
    word: 'Kelime',
    letterClosed: (l: string) => `${l}, kapandı`,
    said: 'Söyledik',
    object: 'İtiraz',
    objected: 'İtiraz!',
    objectionsShort: (n: number) => `${n} hak`,
    objectionsLeft: (n: number) => `${n} itiraz hakkı kaldı`,
    window: (s: number) => `İtiraz penceresi · ${s} sn`,
    windowLabel: (s: number) => `İtiraz için ${s} saniye`,
    sayLine: 'Geçtiği bir şarkıdan bir dize söyleyin',
    // The game screens (docs/SPEC_V3.md §20.3–20.4).
    round: (n: number, total: number) => `Tur ${n} / ${total}`,
    yourTurn: 'Sıra sizde',
    theirTurn: (alias: string) => `Sıra ${alias} masasında`,
    teamTurn: (team: string) => `Sıra Takım ${team}'de`,
    team: (team: string) => `Takım ${team}`,
    roundWon: (alias: string, reason: 'objection' | 'timeout' | 'board' | 'lines') =>
      reason === 'objection'
        ? `İtiraz! ${alias} +1`
        : reason === 'board'
          ? `Tahta doldu. ${alias} +1`
          : `Süre doldu. ${alias} +1`,
    roundEnd: { objection: 'İtiraz!', timeout: 'Süre doldu, tur bitti.', board: 'Tahta doldu.' },
    roundNoPoint: 'Sekiz dize söylendi; puan yok.',
    readyHint: (s: number) => `Başlayınca her sıra ${s} saniye. İstem ekranda.`,
    readyWaitingHint: 'Onlar başlayınca ya da süre dolunca tur başlar.',
    needsTwo: 'Bu oyun için masada en az 2 kişi olmalı.',
    pickLetter: 'Kelimeyi söyle, baş harfine dokun.',
  },
  // İbre (docs/SPEC_V3.md §20.5): a two-ended scale, values 0–100.
  ibre: {
    scale: (l: string, r: string) => `${l} ile ${r} arasında ölçek`,
    hold: 'Basılı tut, hedefi gör',
    holdLabel: 'Hedefi görmek için basılı tut',
    holdHint: 'Bırakınca hedef kapanır. Takımın görmesin.',
    loading: 'Hedef geliyor…',
    target: (v: number) => `Hedef: ${v}`,
    targetLabel: (v: number, l: string, r: string) => `Hedef ${v}; ${l} 0, ${r} 100`,
    needleLabel: (v: number, l: string, r: string) => `İbre ${v}; ${l} 0, ${r} 100`,
    left: 'İbreyi sola al',
    right: 'İbreyi sağa al',
    moreLeft: '← Daha sol',
    moreRight: 'Daha sağ →',
    revealLabel: (t: number, n: number) => `Hedef ${t}, ibre ${n}`,
    points: (n: number) => `+${n}`,
    pointsWord: 'puan',
  },
  // Sahtekar (docs/SPEC_V3.md §20.2): seats are game labels, never identities.
  sahtekar: {
    seatDone: (seat: string) => `${seat}, baktı`,
    viewedCount: (seen: number, total: number) => `${seen} / ${total} baktı`,
    passTo: (seat: string) => `Telefonu ${seatTo(seat, 'dative')} ver`,
    passHint: 'Başkası ekrana bakmasın.',
    ready: (seat: string) => `Ben ${seatTo(seat, 'copula')}, kartımı göster`,
    hold: 'Basılı tut',
    holdHint: 'Parmağını kaldırınca kart kapanır.',
    holdLabel: (seat: string) => `${seat}, kartını görmek için basılı tut`,
    loading: 'Kart geliyor…',
    category: (c: string) => `Kategori: ${c}`,
    notImposter: 'Sahtekar değilsin',
    youAreImposter: 'Sahtekarsın',
    imposterHint: 'Kelimeyi bilmiyorsun. Dinle, belli etme.',
    seen: 'Gördüm, telefonu ver',
    clueRound: (n: number, total: number) => `İpucu turu ${n} / ${total}`,
    turnOf: (seat: string) => `Sıra ${seatTo(seat, 'locative')}`,
    clueHint: 'Tek kelime, 15 sn. Söyleyince bu masa "Söyledi"ye basar.',
    speaking: (seat: string) => `${seat} söylüyor`,
    said: (seat: string) => `${seat} söyledi`,
    saidButton: 'Söyledi',
    otherSpeaking: 'Sıra diğer masada. Dinleyin.',
    votesCast: (n: number, total: number) => `Oylama · ${n} / ${total} oy`,
    whoIsImposter: (seat: string) => `${seat}, sahtekar kim?`,
    voteHint: 'Gizli oy: kimse göremez. Oy verince telefonu sıradakine ver.',
    selfVote: (seat: string) => `${seat}, kendine oy veremezsin`,
    you: 'sen',
    voteFor: (seat: string) => `${seatTo(seat, 'dative')} oy ver`,
    pickSeat: 'Bir koltuk seç',
    lastChance: (seat: string) => `Son şans · ${seat}`,
    guessTitle: 'Yakalandın. Kelime neydi?',
    guessHint: (c: string) => `Bilirsen sahtekar yine kazanır. Kategori: ${c}`,
    guessSubmit: (w: string) => `${w}, tahminim bu`,
    pickWord: 'Bir kelime seç',
    caught: (seat: string) => `${seat} yakalandı`,
    guessingNow: 'Şimdi kelimeyi tahmin ediyor. Bilirse sahtekar kazanır.',
    imposterWas: 'Sahtekar',
    tablesWon: 'Masalar kazandı!',
    imposterWon: 'Sahtekar kazandı!',
    word: (w: string) => `Kelime: ${w}`,
    wordAndGuess: (w: string, g: string) => `Kelime: ${w} · tahmin: ${g}`,
    votesLabel: 'Oylar',
    voteLine: (voter: string, target: string) => `${voter}, ${seatTo(target, 'dative')} oy verdi`,
    // The game screens (docs/SPEC_V3.md §20.2).
    ownTable: 'Sizin masanız',
    otherTable: 'Diğer masa',
    ownDone: 'Masanızda herkes baktı. Diğer masa bekleniyor.',
    redealt:
      'Sahtekar kartına bakmadı ve oyundan çıktı. Yeni kelime dağıtıldı; herkes yeniden baksın.',
    dealing: 'Yeni kelime geliyor…',
    votesDone: 'Masanızın oyları verildi. Diğer masa bekleniyor.',
    notEnough: 'Kartına bakmayanlar oyundan çıktı; 3 kişi kalmadı. Oyun bitti.',
    needsThree: `Sahtekar için masada en az ${SAHTEKAR.minPlayers} kişi olmalı.`,
  },
  reveal: {
    question: 'Tanışalım mı?',
    hint: 'İki masa da "Evet" derse aynı renk ve işaret iki ekranda da belirir. Kimin ne dediği gösterilmez.',
    yes: 'Evet',
    no: 'Hayır',
    secondsLeft: (s: number) => `${s} sn`,
    answered: 'Cevabın alındı. Sonuç birazdan.',
    signal: 'Ekranını kaldır, birbirinizi bulun.',
    signalTop: 'Tanışalım mı? · İki masa da "Evet" dedi',
    signalSame: 'Diğer masada da aynı renk ve aynı işaret var.',
    goodGame: 'Güzel oyundu',
    backToVenue: 'Mekana dön',
    score: (n: number) => `Ortak skor: ${n}`,
    addFriend: 'Arkadaş ekle',
    addFriendDone: 'Eklendi. İkiniz de basarsanız arkadaş olursunuz.',
  },
  venue: {
    here: 'Mekandasın',
    yourTable: 'Masanın adı',
    people: (n: number) => `${headcountLabel(n)} kişi`,
    remaining: (h: number, m: number) => (h > 0 ? `${h} sa ${m} dk kaldı` : `${m} dk kaldı`),
    leave: 'Mekandan ayrıl',
    leaveConfirmTitle: 'Mekandan ayrılıyor musun?',
    leaveConfirmBody: 'Masan kapanır. Sonra yeniden giriş yapabilirsin.',
    leaveConfirm: 'Ayrıl',
    spot: (name: string) => `Noktan: ${name}`,
    noSpot: 'Henüz nokta seçmedin.',
    changeSpot: 'Değiştir',
    chooseSpot: 'Noktanı seç',
    changeSpotTitle: 'Neredesin?',
    changeSpotHint:
      'Aynı noktadaki masalarla oynarsın. Odadayken ya da bir isteğin beklerken değiştiremezsin.',
    changeSpotSave: 'Bu noktadayım',
    // "Masa adını değiştir" (docs/SPEC_V3.md §5.6).
    rerollAlias: 'Adı değiştir',
    rerollsLeft: (n: number) =>
      n > 0 ? `${n} hakkın kaldı` : 'Bu masada adı değiştirme hakkın bitti',
  },
  design: {
    title: 'Tasarım (test)',
    hint: 'Yalnızca test sürümünde görünür. Seçimin bu cihazda saklanır.',
    schemeLabel: 'Görünüm',
    schemes: { light: 'Açık', dark: 'Koyu', system: 'Sistem' },
    previewTitle: 'Bileşen önizleme',
    previewOpen: 'Bileşen önizlemesini aç',
  },
  settings: {
    title: 'Ayarlar',
    accountSection: 'Hesap',
    birthDate: 'Doğum tarihin',
    // "2000-01-15" → "15.01.2000"
    birthDateValue: (iso: string) => iso.split('-').reverse().join('.'),
    birthDateHint: 'Yalnızca sen görürsün. Yanlışsa düzeltmek için bize yaz.',
    notificationsSection: 'Bildirimler',
    notifyDm: 'Mesajlar',
    notifyFriendRequests: 'Arkadaşlık istekleri',
    legalSection: 'Yasal',
    signOut: 'Çıkış yap',
    deleteAccount: 'Hesabımı sil',
    deleteConfirmTitle: 'Hesabın silinsin mi?',
    deleteConfirmBody: 'Tüm verilerin kalıcı olarak silinir. Bu işlem geri alınamaz.',
    deleteConfirm: 'Sil',
    privacy: 'Gizlilik politikası',
    kvkk: 'KVKK Aydınlatma Metni',
    terms: 'Kullanım Koşulları',
    contact: 'İletişim',
    about: 'Hakkında',
    version: (v: string) => `Sürüm ${v}`,
    osm: 'Mekan verileri © OpenStreetMap katkıda bulunanlar (ODbL).',
  },
  errors: {
    bad_request: 'İstek geçersiz.',
    unauthorized: 'Oturumun sona ermiş. Tekrar giriş yap.',
    consent_outdated: 'Metinler güncellendi. Lütfen tekrar onayla.',
    onboarding_required: 'Önce kaydını tamamlaman gerekiyor.',
    profile_required: 'Önce profilini tamamlaman gerekiyor.',
    under_age: `${APP_NAME} 18 yaş ve üzeri içindir.`,
    birth_date_invalid: 'Geçerli bir doğum tarihi gir. Kayıtlı doğum tarihi değiştirilemez.',
    venue_not_found: 'Bu mekan artık listede değil.',
    too_far: 'Bu mekana çok uzaktasın. Mekandayken tekrar dene.',
    alias_exhausted: 'Şu an bu mekanda masa açılamıyor. Biraz sonra tekrar dene.',
    spot_required: 'Önce nerede olduğunu seç.',
    spot_invalid: 'Bu nokta artık seçilemiyor. Listeden başka bir nokta seç.',
    different_spot: 'Bu oda başka bir noktada. Önce "Bu noktadayım"a dokun.',
    in_room: 'Odadayken ya da bir isteğin beklerken bunu yapamazsın.',
    reroll_limit: 'Bu masada adı değiştirme hakkın bitti.',
    proposal_pending: 'Zaten bekleyen bir öneri var.',
    no_proposal: 'Bu öneri artık geçerli değil.',
    no_active_table: 'Önce mekana giriş yapman gerekiyor.',
    already_in_room: 'Masan zaten bir odada.',
    room_not_available: 'Masa şu an müsait değil.',
    request_pending: 'Yanıt bekleyen bir isteğin var.',
    rate_limited: 'Çok fazla istek gönderdin. Biraz sonra tekrar dene.',
    request_expired: 'Bu isteğin süresi doldu.',
    request_not_found: 'İstek bulunamadı.',
    not_in_room: 'Bu odada değilsin.',
    nothing_to_block: 'Odada engellenecek başka masa yok.',
    message_invalid: 'Mesaj 1-200 karakter olmalı.',
    profanity_rejected: 'Mesajın uygun olmayan bir ifade içeriyor.',
    wrong_concept: 'Bu oda başka bir oyun için.',
    two_tables: 'Oda artık iki masalı.',
    not_owner: 'Oyunu oda sahibi başlatır.',
    needs_two_tables: 'Bu oyun için ikinci masa gerekiyor.',
    game_in_progress: 'Oyun zaten sürüyor.',
    no_game: 'Şu an oyun yok.',
    not_describer: 'Bu turda anlatan siz değilsiniz.',
    turn_over: 'Tur bitti.',
    turn_not_started: 'Tur henüz başlamadı.',
    not_your_seat: 'Bu sıra senin masanın değil.',
    not_enough_players: 'Bu oyun için en az 3 oyuncu gerekiyor.',
    no_objections_left: 'İtiraz hakkınız kalmadı.',
    no_passes_left: 'Pas hakkınız kalmadı.',
    too_soon: 'Biraz bekle.',
    no_cards: 'Kart kalmadı.',
    reveal_closed: 'Süre doldu.',
    not_found: 'Bulunamadı.',
    already_friends: 'Zaten arkadaşsınız.',
    not_friends: 'Artık arkadaş değilsiniz.',
    not_judge: 'Bu turda hakem diğer masa.',
    display_name_required: 'Önce profilinde bir ad seç.',
    display_name_invalid: 'Ad 2–24 karakter olmalı ve uygun olmayan ifade içermemeli.',
    bio_invalid: 'Tanıtım en fazla 160 karakter olmalı ve uygun olmayan ifade içermemeli.',
    photo_invalid: 'Fotoğraf yüklenemedi. Başka bir fotoğraf dene.',
    method_not_allowed: 'İstek geçersiz.',
    update_required: 'Uygulamanın yeni sürümünü yüklemen gerekiyor.',
    internal: 'Bir şeyler ters gitti. Tekrar dener misin?',
  },
} as const;
