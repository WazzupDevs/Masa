import { APP_NAME } from '@shared/brand.ts';
import { headcountLabel } from '@shared/checkin.ts';
import type { InboxStamp } from '@shared/dmInbox.ts';
import type { EventTime } from '@shared/explore.ts';
import { ENCOUNTER_MIN_MINUTES } from '@shared/friends.ts';
import { TABU } from '@shared/tabu.ts';
import { SAHTEKAR } from '@shared/sahtekar.ts';
import { IBRE_AUTO_LOCK_SECONDS, IBRE_CONFIG } from '@shared/ibre.ts';
import { formatTrMobile } from '@shared/phone.ts';
import { SAY_CONFIG } from '@shared/sayChallenge.ts';
import { capitalizeTr, inflectTr } from '@shared/trText.ts';
import type { VenueKind } from '@shared/venueKind.ts';

// Address (hitap): a person is "sen", a table "siz"; a sentence never mixes the two. What a phone
// chooses for itself (a room's intent and participation, "Arkadaş ekle") is a person's: in Faz 2
// everyone chooses for themselves (canvas: Faz 2 · 22.5 → Metinler).
// Numbers in the texts come from the game settings, never typed by hand.
const NUMBER_WORDS = [
  'sıfır',
  'bir',
  'iki',
  'üç',
  'dört',
  'beş',
  'altı',
  'yedi',
  'sekiz',
  'dokuz',
  'on',
];
const ORDINALS = [
  'sıfırıncı',
  'birinci',
  'ikinci',
  'üçüncü',
  'dördüncü',
  'beşinci',
  'altıncı',
  'yedinci',
  'sekizinci',
  'dokuzuncu',
  'onuncu',
];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const ordinal = (n: number) => ORDINALS[n] ?? `${n}.`;

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
export type HistoryConcept = 'tabu' | 'sohbet' | 'sahtekar' | 'harf' | 'sarki' | 'ibre' | 'chat';
const HISTORY_CONCEPTS: Record<HistoryConcept, string> = {
  tabu: 'Sesli Tabu',
  sohbet: 'Sohbet kartları',
  sahtekar: 'Sahtekar',
  harf: 'Harf Kapmaca',
  sarki: 'Şarkıda Geçsin',
  ibre: 'İbre',
  chat: 'Sohbet',
};

// The Sohbet card themes (content/sohbet-cards.json), each its own name.
const SOHBET_THEMES = {
  isinma: 'Isınma',
  'film-dizi-muzik': 'Film, dizi, müzik',
  'hic-yaptin-mi': 'Hiç … yaptın mı?',
  derin: 'Derin',
} as const;

// "… oynadığınız" in a friend request: the room's last game, or the chat.
const PLAYED_WITH: Record<HistoryConcept, string> = {
  tabu: 'Sesli Tabu oynadığınız',
  sohbet: 'Sohbet kartlarıyla oynadığınız',
  sahtekar: 'Sahtekar oynadığınız',
  harf: 'Harf Kapmaca oynadığınız',
  sarki: 'Şarkıda Geçsin oynadığınız',
  ibre: 'İbre oynadığınız',
  chat: 'sohbet ettiğiniz',
};

// The voice games' names in "… · yüz yüze".
const VOICE_NAMES = {
  tabu: 'Sesli Tabu',
  sahtekar: 'Sahtekar',
  harf: 'Harf Kapmaca',
  sarki: 'Şarkıda Geçsin',
  ibre: 'İbre',
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
    otpHint: (phone: string) => `${formatTrMobile(phone)} numarasına gelen 6 haneli kodu gir.`,
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
      '2–24 karakter. Bu adı arkadaşların görür; profilinle göründüğün masalarda ve mekan sohbetinde orada bulunanlar da görür.',
    birthLabel: 'Doğum tarihin',
    day: 'Gün',
    month: 'Ay',
    year: 'Yıl',
    birthHint:
      'Doğum tarihin kimseye gösterilmez, profilinde yalnızca yaşın görünür. Sonradan değiştirilemez.',
    birthInvalid: 'Geçerli bir tarih gir.',
    // The gender (docs/SPEC_V3.md §23.D; canvas: Faz 3 · 23.2): asked at sign-up, and once on a
    // separate screen for an account from before the step. Shown to nobody (rule 12).
    genderLabel: 'Cinsiyetin',
    genders: { female: 'Kadın', male: 'Erkek', unspecified: 'Belirtmek istemiyorum' },
    genderHint:
      'Kimseye gösterilmez ve sonradan değiştirilemez. Masalara katılırken kadınlar anonim ya da profille katılabilir; erkekler ve belirtmek istemeyenler profilleriyle katılır.',
    genderGateTitle: 'Cinsiyetini seç',
    genderGateBody: 'Masalara nasıl katılacağın buna bağlı. Bir kez sorulur.',
    genderSave: 'Kaydet',
    // Beside gender_required in the game flow: opens the one-time question in place.
    chooseGender: 'Cinsiyetini seç',
    continue: 'Devam',
    extrasTitle: 'Profilini tamamla',
    extrasBody: 'Fotoğraf ve tanıtım isteğe bağlı. İstersen sonra Profil’den de ekleyebilirsin.',
    // Only for a man and "Belirtmek istemiyorum", who always join with the profile; every account
    // sends the same events from this step (docs/SPEC_V3.md §23.L).
    photoNeededNote:
      'Fotoğrafın yoksa masalara katılamazsın, masanı da lobiye açamazsın. Fotoğrafı sonra Profil’den de ekleyebilirsin.',
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
      'Hesabını oluşturmak için telefon numaran, görünen adın, doğum tarihin ve cinsiyetin işlenir. Numaran ve doğum tarihin diğer kullanıcılarla paylaşılmaz; profilinde yalnızca yaşın görünür. Cinsiyetin hiçbir kullanıcıya gösterilmez ve kullanım istatistiğine gitmez; yalnızca masalara anonim mi profilinle mi katılabileceğini belirler. Masalara anonim katılım yalnızca kadın beyanıyla mümkün olduğundan, anonim görünmek cinsiyetin hakkında dolaylı bilgi verir. 18 yaşından küçüksen hesap açılmaz ve bilgilerin saklanmaz. Hesabını istediğin zaman uygulama içinden silebilirsin.',
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
    typing: 'yazıyor…',
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
    oneTable: 'Tek telefonla',
    twoTables: 'İki masayla',
    createWith: 'Bu oyunla lobiye aç',
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
        'Anlatan karttaki kelimeyi yasaklı kelimeleri söylemeden anlatır; kendi masası tahmin eder.',
        `Doğru: kelime bilindi, iki masa da basabilir. Pas: kart geçilir, yalnızca anlatan basar, turda en çok ${TABU.maxPasses}. Tabu: yasaklı kelime söylendi, yalnızca dinleyen masa basar.`,
        'Masalardan biri tek kişiyse iş birliği modu: tek takım, süreye karşı; üç düğmeye yalnızca anlatan basar.',
        `Kendi masanızla oynarken masanızı iki takıma ayırın; anlatan telefonu tutar, takımı tahmin eder. Her takım ${TABU.localRoundsPerTeam} kez anlatır.`,
      ],
    },
    sahtekar: {
      body: 'Herkes aynı kelimeyi görür, biri hariç: sahtekar yalnızca kategoriyi bilir. Onu bulun.',
      steps: [
        `En az ${SAHTEKAR.minPlayers} kişi. Telefon elden ele dolaşır; herkes kendi kartını basılı tutarak görür.`,
        `Kartına ${SAHTEKAR.viewSeconds / 60} dakikada bakmayan oyundan çıkar.`,
        `${capitalizeTr(numberWord(SAHTEKAR.clueRounds))} tur boyunca sırayla tek kelimelik ipucu verin; her ipucu ${SAHTEKAR.clueSeconds} saniye.`,
        'Sonra herkes gizlice sahtekar sandığı kişiye oy verir; kendine oy verilmez.',
        `Sahtekar yakalanırsa kelimeyi ${numberWord(SAHTEKAR.options)} seçenek arasından tahmin eder. Bilirse ya da yakalanmazsa sahtekar kazanır.`,
      ],
    },
    harf: {
      body: 'Kategoriye uyan bir kelime söyleyin, baş harfini kapın. Diğer masa itiraz edebilir.',
      steps: [
        `Masalar sırayla oynar; her sıra ${SAY_CONFIG.harf.turnSeconds} saniye.`,
        'Kategoriye uyan, tahtada açık bir harfle başlayan bir kelime söyleyin ve o harfe dokunun.',
        `Diğer masa ${SAY_CONFIG.harf.objectionSeconds} saniye içinde itiraz edebilir; itiraz alan ya da süresi dolan masa turu kaybeder, rakip 1 puan alır. Her masanın ${SAY_CONFIG.harf.objections} itiraz hakkı var.`,
        `Bütün harfler kapanırsa tur son harfi kapatanın. ${SAY_CONFIG.harf.totalRounds} kategori oynanır.`,
        'Kendi masanızla oynarken iki takıma ayrılın; telefon ortada durur.',
      ],
    },
    sarki: {
      body: 'Kelimenin geçtiği bir şarkıdan bir dize söyleyin. Söyleyemeyen kaybeder.',
      steps: [
        `Masalar sırayla, ${SAY_CONFIG.sarki.turnSeconds} saniye içinde kelimenin geçtiği bir dize söyler ve "Söyledik"e basar.`,
        'Kelimenin çekimli hâli de sayılır: "göz" için "gözlerin" geçen bir dize de olur.',
        `Diğer masa ${SAY_CONFIG.sarki.objectionSeconds} saniye içinde itiraz edebilir; itiraz alan ya da söyleyemeyen masanın rakibi 1 puan alır. Her masanın ${SAY_CONFIG.sarki.objections} itiraz hakkı var.`,
        `Bir kelimede en çok ${SAY_CONFIG.sarki.maxSteps} dize; ${ordinal(SAY_CONFIG.sarki.maxSteps)} de geçerse kelime puansız biter.`,
        `${SAY_CONFIG.sarki.totalRounds} kelime oynanır; son ${numberWord(SAY_CONFIG.sarki.shortRounds)} kelimede süre ${SAY_CONFIG.sarki.shortSeconds} saniye.`,
        'Uygulama müzik çalmaz, şarkı göstermez; dizeyi siz söylersiniz.',
      ],
    },
    ibre: {
      body: 'Anlatıcı gizli hedefi görür, tek ipucu verir; masası ibreyi hedefe getirmeye çalışır.',
      steps: [
        'Telefon iki uçlu bir ölçek gösterir (ör. Ucuz ile Pahalı). Masalar sırayla anlatır.',
        `Anlatıcı hedefi basılı tutarak görür, sesli tek ipucu verir. Masası ibreyi ayarlayıp onaylar; ${IBRE_CONFIG.clueSeconds} saniye.`,
        `Diğer masa ${IBRE_CONFIG.sideSeconds} saniye içinde hedefin ibrenin solunda mı sağında mı olduğunu söyler; doğruysa 1 puan.`,
        `Hedefe yakınlığa göre 4, 3 ya da 2 puan. ${IBRE_CONFIG.totalRounds} tur oynanır.`,
        'Kendi masanızla oynarken iki takıma ayrılın; anlatıcı hedefi takımından saklar.',
      ],
    },
    sohbet: {
      body: 'Sırayla kart çekin, soruyu masanızda konuşun.',
      steps: [
        `Bir tema seçin: ${Object.values(SOHBET_THEMES)
          .map((t) => `"${t}"`)
          .join(', ')
          .replace(/, ([^,]*)$/, ' ya da $1')}.`,
        'Sırayla kart çekin; karttaki soruyu masanızda konuşun.',
        'Başka bir masayla oynarken iki masa aynı kartı görür; sohbet masa sohbetinde de sürer.',
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
      `${dayMonthAt(playedAt)} ${PLAYED_WITH[concept]} ${alias} masası arkadaşın olmak istiyor`,
    accept: 'Kabul et',
    decline: 'Reddet',
    declineNote: 'Reddedersen karşı tarafa bildirilmez.',
    sentTitle: 'Gönderilen istekler',
    sent: (alias: string) => `İstek gönderildi: ${alias} masası`,
    sentAccepted: (alias: string) => `${alias} masası isteğini kabul etti`,
    historyTitle: 'Oyun geçmişi',
    noHistory: `Başka bir masayla en az ${ENCOUNTER_MIN_MINUTES} dakika oynadığınızda burada görünür.`,
    // The last game played in the room, or the chat (docs/SPEC_V3.md §5.5).
    historyRow: (alias: string, concept: HistoryConcept, playedAt: string) =>
      `${alias} masasıyla ${HISTORY_CONCEPTS[concept]} · ${dayMonth(playedAt)}`,
    people: (n: number) => `${headcountLabel(n)} kişi`,
    sendRequest: 'İstek gönder',
    addFriend: 'Arkadaş ekle',
    actionDone: 'Gönderildi',
    addFriendHint: 'İkiniz de basarsanız arkadaş olursunuz. O basmazsa hiçbir şey olmaz.',
    more: 'Diğer',
    moreTitle: 'Bu kişi',
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
    done: 'Tamam',
    back: 'Geri',
  },
  notifications: {
    title: 'Bildirimler',
    withCount: (n: number) => `Bildirimler, ${n} yeni`,
    empty: 'Yeni bildirim yok.',
    emptyHint: `Başka bir masayla en az ${ENCOUNTER_MIN_MINUTES} dakika oynadığınızda burada görünür.`,
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
    nameHint:
      '2–24 karakter. Bu adı arkadaşların görür; profilinle göründüğün masalarda ve mekan sohbetinde orada bulunanlar da görür.',
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
  // Anonymous or with the profile, chosen for each table in the lobby (docs/SPEC_V3.md §5.4).
  participation: {
    title: 'Bu masada nasıl görüneceksin?',
    anonymous: 'Anonim',
    anonymousHint: 'Diğer masalar yalnızca masa adını ve kişi sayını görür.',
    profile: 'Profilimle',
    profileHint: 'Lobide yalnızca masa adın görünür. Masadakiler, masa sürerken profilini görür.',
    profileNeedsName: 'Profilinle katılmak için önce Profil sekmesinden bir ad seç.',
    // "Bu masadayım" (canvas: Faz 2 · 22.5 → Bu masadayım: seçim): the table's phones see this one.
    memberAnonymousHint: (alias: string) => `Masadakiler yalnızca takma adını görür: ${alias}.`,
    memberProfileHint: 'Masadakiler, masa sürerken profilini görür.',
    // "Profilimle" needs a profile photo others can see (docs/SPEC_V3.md §22.G, decision 8).
    photoNeeded: 'Profilinle görünmek için profil fotoğrafı gerekiyor.',
    // A man and "Belirtmek istemiyorum" always join with the profile (docs/SPEC_V3.md §23.D): no
    // choice, the profile that goes (canvas: Faz 3 · 23.2 → profil önizlemesi).
    previewTitle: 'Masada böyle görüneceksin',
    previewJoinTitle: 'İsteğinle birlikte gider',
    previewTag: 'Profilinle',
    previewLobby: 'Lobide yalnızca masa adın görünür. Masadakiler, masa sürerken profilini görür.',
    previewJoin:
      'Masanın lideri isteğinde adını, yaşını ve fotoğrafını görür. Kabul ederse masadakiler, masa sürerken profilini görür.',
    previewMember: 'Masadakiler, masa sürerken profilini görür.',
    previewName: (name: string, age: number | null) => (age === null ? name : `${name}, ${age}`),
    photoNeededLobby: 'Masanı lobiye açmak için profil fotoğrafı gerekiyor.',
    photoNeededJoin: 'Katılma isteği göndermek için profil fotoğrafı gerekiyor.',
    photoNeededMember: 'Bu tarafa katılmak için profil fotoğrafı gerekiyor.',
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
      'Mekanda olduğunu doğrulamak için konumunu bir kez kullanıyoruz. Konumun saklanmaz.',
    locationConsent: 'Konumumun bu amaçla kullanılmasına açık rıza veriyorum.',
    useLocation: 'Konumumu kullan',
    locating: 'Konum alınıyor…',
    permissionDenied:
      'Konum izni olmadan mekanda olduğunu doğrulayamıyoruz. İzni ayarlardan verebilirsin.',
    openSettings: 'Ayarları aç',
    locationFailed: 'Konum alınamadı. Açık bir alanda tekrar dene.',
    venuesTitle: 'Yakındaki mekanlar',
    noVenues: 'Yakınında kayıtlı bir mekan yok.',
    retry: 'Tekrar dene',
    distance: (meters: number) => `${meters} m`,
    osmAttribution: '© OpenStreetMap katkıda bulunanlar',
    outsideBoundary: (kind: VenueKind) =>
      kind === 'campus'
        ? 'Kampüsün içinde görünmüyorsun. Kampüse girince tekrar dene.'
        : 'Mekanın içinde görünmüyorsun. Mekana girince tekrar dene.',
    spotTitle: 'Neredesin?',
    spotHint: 'Aynı noktadaki masalarla oynarsın. Noktanı sonra da değiştirebilirsin.',
    venueAtSpot: (venue: string, spot: string) => `${venue} · ${spot}`,
    headcountTitle: 'Masada kaç kişisiniz?',
    headcountOption: (n: number) => headcountLabel(n),
    headcountHint: 'Kendinizi de sayın. Dört ya da daha fazlaysanız 4+ seçin.',
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
    ibre: 'İbre',
  },
  // How a game is shown with its type (docs/SPEC_V2.md §8.1): only voice games are marked, since
  // they need the tables to come together.
  conceptWithMode: (concept: 'tabu' | 'sohbet' | 'sahtekar' | 'harf' | 'sarki' | 'ibre') =>
    concept === 'sohbet' ? 'Sohbet kartları' : `${VOICE_NAMES[concept]} · yüz yüze`,
  // The room's optional intent label (§5.2).
  intents: { game: 'Oyun', chat: 'Sohbet' },
  voiceNote:
    'Bu oyun yüz yüze oynanır: başka bir masa katılırsa masalar bir araya gelip sesli oynar.',
  rooms: {
    // Faz 3 (docs/SPEC_V3.md §23.C; canvas: Aşama 2 · Ekranlar → Faz 3 · 23.1 Masa ve lobi): the
    // word "oda" is never shown; the server's rooms stay.
    create: 'Masanı lobiye aç',
    playWithTable: 'Masanla oyna',
    playWithTableHint:
      'Şu an lobide masa yok. Masanı lobiye açabilir ya da kendi masanla oynayabilirsin.',
    // The empty lobby while this table is in it.
    lobbyEmptyOpen: 'Lobide şimdilik başka masa yok. Biri katılmak isterse burada görürsün.',
    lobbyLoading: 'Lobi yükleniyor…',
    lobbyError: 'Lobi yüklenemedi.',
    lobbyTitle: 'Açık masalar',
    roomCount: (n: number) => `${n} masa`,
    profiled: 'profilli',
    people: (n: number) => `${headcountLabel(n)} kişi`,
    requestJoin: 'Katıl',
    // Faz 2 (docs/SPEC_V3.md §22.C; canvas: Faz 2 · 22.5 Takımlar): a member of a side.
    requestMember: 'Bu masadayım',
    phones: (n: number) => `${n} telefon`,
    runningTitle: 'Süren masalar',
    runningHint: 'Masandakiler bunlardan birinde oynuyorsa onların tarafına katılabilirsin.',
    // Between the two sides of a running room.
    versus: 'ile',
    memberBody: (leader: string) =>
      `${inflectTr(leader, 'genitive')} tarafına katılırsın. Kabul ederse oyun ve sohbet senin telefonunda da açılır.`,
    tellLeader: 'Liderine bu adı söyle',
    tellLeaderBody: (leader: string) =>
      `${leader} bu adı istek kartında görür. Kabul ederse masaya katılırsın.`,
    incomingMemberTitle: 'Masana katılmak istiyor',
    incomingMemberBody:
      'Bu adı söyleyen arkadaşınsa kabul et. Kabul edersen senin tarafına katılır.',
    declineMemberNote: 'Geçersen o yalnızca "Masa şu an müsait değil" görür.',
    peopleTitle: 'Masadakiler',
    mySide: (phones: number) => `Senin tarafın · ${phones} telefon`,
    otherSide: (phones: number) => `Karşı taraf · ${phones} telefon`,
    leaderTag: 'Lider',
    youTag: 'Sen',
    peopleNote: 'Profilli olanların profili masa sürerken açılır.',
    leave: 'Masadan çık',
    leaveHandover: (next: string) =>
      `Çıkarsan liderlik ${inflectTr(next, 'dative')} geçer, masa sürer.`,
    leaveConfirmTitle: 'Masadan çıkıyor musun?',
    leaveConfirmLeader: (next: string) =>
      `Liderlik ${inflectTr(next, 'dative')} geçer, masa sürer. Yeniden yalnızca bu tarafa katılabilirsin.`,
    leaveConfirmMember: 'Yeniden yalnızca bu tarafa katılabilirsin.',
    // The new leader's note at the top of the chat (canvas: Liderlik devri notu).
    newLeader: (previous: string) =>
      `Artık lider sensin. ${previous} masadan çıktı; katılma istekleri sana gelir, masayı sen bitirebilirsin.`,
    mySpot: (name: string) => `Senin noktan · ${name}`,
    noSpot: 'Noktasız',
    spotHere: 'Bu noktadayım',
    otherSpot: 'Bu masa başka bir noktada.',
    requestPending: (seconds: number) => `İsteğin gönderildi. Yanıt bekleniyor (${seconds} sn).`,
    requestUnavailable: 'Masa şu an müsait değil.',
    // In place of the pending note for a few seconds once the request is accepted.
    newTitle: 'Masanı lobiye aç',
    newHint:
      'Mekandaki masalar seni lobide görür ve katılmak isteyebilir. Oyunu birleşince birlikte seçersiniz.',
    intentLabel: 'Niyetin (isteğe bağlı)',
    intentNone: 'Etiket yok',
    intentHint: {
      game: 'Oyun oynamak istiyorsun.',
      chat: 'Sohbet etmek istiyorsun. Oyun yine önerilebilir.',
    },
    // The optional game tag (docs/SPEC_V3.md §23.C): only seen in the lobby.
    gameTagLabel: 'Oyun (isteğe bağlı)',
    gameTagNone: 'Fark etmez',
    gameTagHint: 'Yalnızca lobide görünür; oyunu başlatmaz.',
    createConfirm: 'Lobiye aç',
    // The room's eyebrow: the running game, else the chat; voice games say they are played face to
    // face (docs/SPEC_V2.md §8.1).
    roomEyebrow: (concept: 'tabu' | 'sohbet' | 'sahtekar' | 'harf' | 'sarki' | 'ibre' | null) =>
      concept === null
        ? 'Masan'
        : concept === 'sohbet'
          ? 'Sohbet kartları'
          : `${VOICE_NAMES[concept]} · yüz yüze`,
    withGuest: (owner: string, guest: string) => `${owner} ve ${guest}`,
    // A two-table room's top bar: only the other table's name.
    withOther: (alias: string) => `${alias} ile`,
    waitingForGuest: 'Başka bir masa katılmak isteyebilir. Bu arada kendi masanla oynayabilirsin.',
    end: 'Masayı bitir',
    endHint:
      'Masayı bitirirsen masa herkes için kapanır. Karşı taraftakileri sonra da arkadaş ekleyebilirsin.',
    // The merged table (docs/SPEC_V3.md §23.F; canvas: Faz 3 · 23.3).
    tabsLabel: 'Oyun ve sohbet',
    tabGames: 'Oyun Seç',
    tabChat: 'Masa Sohbeti',
    unreadChat: 'okunmamış mesaj',
    peopleStrip: (n: number) => `Masadakiler · ${n}`,
    peopleAll: 'Tümü',
    requestTitle: 'Katılma isteği',
    sendRequest: 'İsteği gönder',
    incomingTitle: 'Katılma isteği',
    incomingBody: (alias: string, headcount: number) =>
      `${alias} (${headcountLabel(headcount)} kişi) masana katılmak istiyor.`,
    accept: 'Kabul',
    decline: 'Geç',
    declineNote: 'Geçersen karşı masa yalnızca "Masa şu an müsait değil" görür.',
    // The profiled requester's card (docs/SPEC_V3.md §23.E) while its profile loads.
    requestProfileLoading: 'Profil yükleniyor',
    // The leader's "Kabul" came too late: the requester's table merged with another meanwhile
    // (room_not_available) or the request ended (docs/SPEC_V3.md §23.C).
    requestGone: 'Bu masa artık müsait değil.',
    viewPeople: 'Masadakileri gör',
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
    // Aşama 8 · Saha: following the newest message, replies and reactions.
    newMessages: (n: number) => (n > 1 ? `Yeni mesaj · ${n}` : 'Yeni mesaj'),
    newMessagesLabel: (n: number) =>
      n > 1 ? `${n} yeni mesaj, en alta in` : 'Yeni mesaj, en alta in',
    reply: 'Yanıtla',
    react: 'Tepki ver',
    replyingTo: (name: string) => `Yanıtlanan: ${name}`,
    cancelReply: 'Yanıtı kaldır',
    // A reply whose message was deleted or cannot be seen (docs/SPEC_V3.md §21.1).
    quoteGone: 'Mesaj artık yok',
    goToQuote: 'Yanıtlanan mesaja git',
    // The quoted message is the reader's own.
    you: 'Sen',
    quoteLabel: (name: string, text: string) => `${name} mesajına yanıt: ${text}`,
    reactionChip: (emoji: string, n: number, mine: boolean) =>
      `${emoji} ${n}${mine ? ', senin tepkin' : ''}`,
    reactWith: (emoji: string) => `${emoji} ile tepki ver`,
    openProfile: (name: string) => `${name}, profili aç`,
  },
  // Mekan sohbeti (docs/SPEC_V3.md §7).
  venueChat: {
    open: 'Mekan sohbeti',
    title: (venue: string) => `${venue} sohbeti`,
    hint: 'Mekanda masası olan herkes okur ve yazar. Mesajlar 24 saat sonra silinir.',
    empty: 'Henüz mesaj yok. İlk mesajı sen yaz.',
    placeholder: 'Mekana yaz…',
    send: 'Gönder',
    asProfile: 'Profilimle yaz',
    asProfileOn: 'Adınla görünür; masa adın görünmez.',
    asProfileOff: 'Masa adınla görünür.',
    // One choice per check-in, asked at the first "Gönder" (§22.G, decision 7); the line over the
    // message bar says which one it is.
    modeTitle: 'Bu mekanda kaldığın sürece mekan sohbetinde nasıl görüneceksin?',
    modeAnonymousHint: (alias: string) => `Mesajların masa adınla görünür: ${alias}.`,
    modeProfileHint: 'Mesajların adın ve fotoğrafınla görünür; masa adın görünmez.',
    writingAnonymous: 'Anonim yazıyorsun',
    writingProfile: 'Profilinle yazıyorsun',
    profiled: 'profilli',
    you: 'Sen',
    messageMenu: 'Mesaj',
    sendRequest: 'Arkadaşlık isteği gönder',
    requestConfirmTitle: 'İstek gönderilsin mi?',
    requestConfirmBody: 'İstek gönderirsen profilin ona görünür: adın, yaşın ve fotoğrafın.',
    requestConfirm: 'İsteği gönder',
    requestSent: 'İstek gönderildi.',
    blockConfirmTitle: 'Bu kişiyi engellemek istiyor musun?',
    blockConfirmBody:
      'Birbirinizin mesajlarını artık görmezsiniz. Karşı tarafa bildirilmez. Engeli ayarlardan kaldırabilirsin.',
    noTable: 'Mekan sohbeti yalnızca mekanda masan varken açılır.',
    // A request from the venue chat (§7.5): the sender's name and age.
    incoming: (venue: string, name: string, age: number | null) =>
      `${venue} sohbetinden ${age !== null ? `${name} (${age})` : name} arkadaşın olmak istiyor`,
    sent: (name: string) => `İstek gönderildi: ${name}`,
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
      // Only for a person met in the game flow: a phone at the table and a history row (§23.D).
      wrong_gender: 'Yanlış cinsiyet beyanı',
    },
    reportSent: 'Şikayetin alındı. Teşekkürler.',
    block: 'Engelle',
    blockConfirmTitle: 'Bu kişiyi engellemek istiyor musun?',
    blockConfirm: 'Engelle',
    // Faz 2 (canvas: Engelle / Şikayet et: kişi seçimi): the person first.
    blockWho: 'Kimi engelliyorsun?',
    reportWho: 'Kimi şikayet ediyorsun?',
    blockOwnMember: (alias: string) =>
      `${alias} masadan çıkar, sen masada kalırsın. Birbirinizin masalarını artık görmezsiniz.`,
    blockLeaves: 'Sen masadan çıkarsın. Birbirinizin masalarını artık görmezsiniz.',
    reportNote: 'Şikayetin, şikayet ettiğin kişiye bildirilmez.',
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
    themes: SOHBET_THEMES,
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
    soloHint: (n: number) => `Tek telefonla, masada elden ele. ${n} kişisiniz.`,
    minPlayers: (n: number) => `En az ${n} kişi`,
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
    voiceIntro: `Yüz yüze oynanır: masalar sırayla anlatır, diğer masa kartı görür ve hakemlik yapar. ${TABU.totalTurns} tur, her tur ${TABU.turnSeconds} saniye.`,
    sohbetIntro: 'Sohbet kartları: her kart bir soru; iki masa da sonraki kartı açabilir.',
    voiceDescribe: 'Sıra sizde: kartı masanıza anlatın. Diğer masa kartı görüyor ve Tabu der.',
    tapToReveal: 'Kartı görmek için dokun',
    hideFromTeam: 'Önce telefonu takım arkadaşlarından sakla.',
    cardsLoading: 'Kartlar geliyor…',
    voiceJudge: (alias: string) => `${alias} anlatıyor. Hakem sizsiniz.`,
    judgeCorrect: 'Doğru +1',
    judgeTaboo: 'Tabu −1',
    // The score label of this phone's side (canvas: Faz 2 · 22.5).
    you: 'tarafın',
    // The describer's teammate (docs/SPEC_V3.md §22.E; canvas: Sesli Tabu: takım arkadaşı).
    teammateNote: (alias: string) => `${alias} anlatıyor.`,
    cardWithDescriber: 'Kart anlatanda',
    cardWithDescriberHint:
      "Kartı yalnızca anlatan ve hakem taraf görür. Sen tahmin et, bilince Doğru'ya bas.",
    describing: 'anlatıyor',
    voiceWinner: (alias: string) => `${alias} kazandı!`,
    voiceDraw: 'Berabere!',
    cardOnlyHere: 'Kartı yalnızca bu masadakiler görür.',
    // Cooperative mode (docs/SPEC_V3.md §6.3): one team, the guessing table never sees the card.
    coopIntro: 'Masalardan biri tek kişi: iki masa tek takım, ortak skor süreye karşı.',
    coopDescribe: "Sıra sizde: kartı diğer masaya anlatın. Doğru, Pas ve Tabu'ya siz basarsınız.",
    coopGuess: (alias: string) => `${alias} size anlatıyor. Anlatanı dinleyin ve tahmin edin.`,
    coopCardHidden: 'Kartı yalnızca anlatan görür.',
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
    turnReadyYou: 'Sıra tarafında',
    turnReadyHint: "Başla'ya kim basarsa o anlatır; kart yalnızca onun telefonunda açılır.",
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
        body: `Bilinince "Doğru" (+1), geçmek için "Pas" (turda ${TABU.maxPasses} hak). Tur ${TABU.turnSeconds} sn sürer.`,
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
  // object within the window; a few objections per table (SAY_CONFIG).
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
    teamTurn: (team: string) => `Sıra: Takım ${team}`,
    team: (team: string) => `Takım ${team}`,
    // The last round's winner over the next round; the points stand beside it ("+1").
    roundWon: (alias: string, reason: 'objection' | 'timeout' | 'board' | 'lines') =>
      reason === 'objection'
        ? `İtiraz! ${alias}`
        : reason === 'board'
          ? `Tahta doldu. ${alias}`
          : `Süre doldu. ${alias}`,
    // Under "İtiraz!": who took the point.
    objectionPoint: (alias: string) => `${alias} +1`,
    roundEnd: { objection: 'İtiraz!', timeout: 'Süre doldu, tur bitti.', board: 'Tahta doldu.' },
    roundNoPoint: `${capitalizeTr(numberWord(SAY_CONFIG.sarki.maxSteps))} dize söylendi; puan yok.`,
    readyHint: (s: number) => `Başlayınca her sıra ${s} saniye.`,
    readyWaitingHint: 'Onlar başlayınca ya da süre dolunca tur başlar.',
    pickLetter: 'Kelimeyi söyleyin, baş harfine dokunun.',
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
    moreLeft: '← Solunda',
    moreRight: 'Sağında →',
    revealLabel: (t: number, n: number | null) =>
      n === null ? `Hedef ${t}, ibre onaylanmadı` : `Hedef ${t}, ibre ${n}`,
    points: (n: number) => `+${n}`,
    pointsWord: 'puan',
    // The game screens (docs/SPEC_V3.md §20.5).
    round: (n: number, total: number) => `Tur ${n} / ${total}`,
    readyHint: `Başla'ya basınca ${IBRE_CONFIG.clueSeconds} saniye: hedefe bakın, tek ipucu verin, ibreyi onaylayın.`,
    readyWaitingHint: 'Karşı masa hedefe bakıp tek ipucu verecek. Dinleyin.',
    clueHint: `Anlatıcı hedefe baksın, sesli tek ipucu versin. Masası ibreyi ayarlayıp onaylasın; son ${IBRE_AUTO_LOCK_SECONDS} saniyede ibre olduğu yerde onaylanır.`,
    lock: 'İbreyi onayla',
    // Faz 2 (docs/SPEC_V3.md §22.E; canvas: İbre: anlatıcı / takım arkadaşı).
    teamLocks: 'Takım arkadaşın "İbreyi onayla"ya basınca ibre kilitlenir.',
    teamClue: (alias: string) => `${alias} ipucu veriyor. İbreyi ipucuna göre getir.`,
    otherClue: (alias: string) => `${alias} ipucu veriyor. İbre onaylanınca taraf seçeceksiniz.`,
    sideTitle: 'Hedef ibrenin solunda mı, sağında mı?',
    sideHint: (s: number) => `${s} sn içinde seçin; doğruysa 1 puan.`,
    sideWaiting: (alias: string) => `${alias} taraf seçiyor.`,
    describerTurn: (team: string) => `${team} anlatıyor. Telefonu anlatıcıya verin.`,
    sideTurn: (team: string) => `${team}: hedef ibrenin solunda mı, sağında mı?`,
    roundTitle: (alias: string, band: number) => `${alias} bu turda +${band}`,
    revealDetail: (
      target: number,
      needle: number | null,
      guesser: string,
      side: 'left' | 'right' | null,
      point: boolean,
    ) =>
      needle === null
        ? `Hedef ${target} · ibre onaylanmadı`
        : side === null
          ? `Hedef ${target} · ibre ${needle} · ${guesser} taraf seçmedi`
          : `Hedef ${target} · ibre ${needle} · ${guesser}: ${side === 'left' ? 'solunda' : 'sağında'}, ${point ? '+1' : 'puan yok'}`,
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
    clueHint: `Tek kelime, ${SAHTEKAR.clueSeconds} sn. Söyleyince bu masa "Söyledi"ye basar.`,
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
    // A member's phone (docs/SPEC_V3.md §22.E; canvas: Sahtekar: üye izler).
    memberTitle: 'Koltuklar liderinin telefonunda',
    memberBody: (leader: string) =>
      `${inflectTr(leader, 'genitive')} telefonunu izle; kartlar, ipucu sırası ve oylar orada.`,
    otherTable: 'Diğer masa',
    ownDone: 'Masanızda herkes baktı. Diğer masa bekleniyor.',
    redealt:
      'Sahtekar kartına bakmadı ve oyundan çıktı. Yeni kelime dağıtıldı; herkes yeniden baksın.',
    dealing: 'Yeni kelime geliyor…',
    votesDone: 'Masanızın oyları verildi. Diğer masa bekleniyor.',
    notEnough: `Kartına bakmayanlar oyundan çıktı; ${SAHTEKAR.minPlayers} kişi kalmadı. Oyun bitti.`,
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
      'Aynı noktadaki masalarla oynarsın. Masan lobideyken, oyundayken ya da bir isteğin beklerken değiştiremezsin.',
    changeSpotSave: 'Bu noktadayım',
    // "Masa adını değiştir" (docs/SPEC_V3.md §5.6).
    rerollAlias: 'Adı değiştir',
    rerollsLeft: (n: number) =>
      n > 0 ? `${n} hakkın kaldı` : 'Bu masada adı değiştirme hakkın bitti',
    // The table card's state (docs/SPEC_V3.md §23.C; canvas: Faz 3 · 23.1 Masa ve lobi).
    lobbyOff: 'Lobide değil',
    lobbyOpen: 'Lobide açık',
    merged: 'Birleşti',
    // Kabul is the meeting (docs/SPEC_V3.md §23.E; canvas: Faz 3 · 23.3): until this phone opens the
    // merged table once, then "Birleşti".
    acceptedGoTo: (host: string) => `Kabul edildi, ${host} masasının yanına git`,
    coming: (guest: string, people: number) => `${guest} geliyor, ${headcountLabel(people)} kişi`,
    solo: 'Masanla oynuyorsun',
    openHint: 'Bir masa katılmak isterse sana sorulur. Beklerken masanla oynayabilirsin.',
    memberOf: (leader: string) =>
      `${inflectTr(leader, 'genitive')} tarafındasın. Lobiden yalnızca o çekebilir.`,
    withdraw: 'Lobiden çek',
    goToTable: 'Masaya git',
  },
  // The table's end (docs/SPEC_V3.md §23.G; canvas: Faz 3 · 23.3 → masa sonu): the other side's
  // phones and each pair's own "Arkadaş ekle".
  tableEnd: {
    title: 'Masa bitti',
    subtitle: (alias: string) => `${alias} masasıyla oynadınız.`,
    otherSide: 'Karşı taraf',
    addFriend: 'Arkadaş ekle',
    pressed: 'Sen bastın',
    pressedHint: 'O da basarsa arkadaş olursunuz.',
    friends: 'Arkadaş oldunuz',
    message: 'Mesajlaş',
    short: `Birlikte ${ENCOUNTER_MIN_MINUTES} dakikadan az kaldınız.`,
    body: 'İkiniz de basarsanız arkadaş olursunuz. O basmazsa hiçbir şey olmaz.',
    later: 'Sonra da Bildirimler’deki oyun geçmişinden ekleyebilirsin.',
  },
  design: {
    title: 'Tasarım (test)',
    hint: 'Yalnızca test sürümünde görünür. Seçimin bu cihazda saklanır.',
    schemeLabel: 'Görünüm',
    schemes: { light: 'Açık', dark: 'Koyu', system: 'Sistem' },
    previewTitle: 'Bileşen önizleme',
    previewOpen: 'Bileşen önizlemesini aç',
    previewIncoming: 'Mesaj gelsin',
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
    different_spot: 'Bu masa başka bir noktada. Önce "Bu noktadayım"a dokun.',
    in_room: 'Masan lobideyken, oyundayken ya da bir isteğin beklerken bunu yapamazsın.',
    reroll_limit: 'Bu masada adı değiştirme hakkın bitti.',
    proposal_pending: 'Zaten bekleyen bir öneri var.',
    no_proposal: 'Bu öneri artık geçerli değil.',
    no_active_table: 'Önce mekana giriş yapman gerekiyor.',
    already_in_room: 'Masan zaten lobide ya da oyunda.',
    room_not_available: 'Masa şu an müsait değil.',
    request_pending: 'Yanıt bekleyen bir isteğin var.',
    rate_limited: 'Çok fazla istek gönderdin. Biraz sonra tekrar dene.',
    request_expired: 'Bu isteğin süresi doldu.',
    request_not_found: 'İstek bulunamadı.',
    not_in_room: 'Bu masada değilsin.',
    nothing_to_block: 'Engellemek istediğin kişi masada değil.',
    message_invalid: 'Mesaj 1-200 karakter olmalı.',
    profanity_rejected: 'Mesajın uygun olmayan bir ifade içeriyor.',
    wrong_concept: 'Bu masa başka bir oyun için.',
    two_tables: 'Masana başka bir masa katıldı.',
    not_owner: 'Oyunu lobiye açan masa başlatır.',
    needs_two_tables: 'Bu oyun için ikinci masa gerekiyor.',
    game_in_progress: 'Oyun zaten sürüyor.',
    no_game: 'Şu an oyun yok.',
    not_describer: 'Bu turda anlatan siz değilsiniz.',
    turn_over: 'Tur bitti.',
    turn_not_started: 'Tur henüz başlamadı.',
    not_your_seat: 'Bu sıra masanızın değil.',
    not_enough_players: `Bu oyun için en az ${SAHTEKAR.minPlayers} oyuncu gerekiyor.`,
    no_objections_left: 'İtiraz hakkınız kalmadı.',
    no_passes_left: 'Pas hakkınız kalmadı.',
    too_soon: 'Biraz bekle.',
    no_cards: 'Kart kalmadı.',
    not_found: 'Bulunamadı.',
    reply_unavailable: 'Yanıtladığın mesaj artık yok.',
    photo_required: 'Profilinle görünmek için önce profil fotoğrafı ekle.',
    anonymous_not_allowed: 'Bu hesapla masalara yalnızca profilinle katılabilirsin.',
    gender_required: 'Devam etmek için önce cinsiyetini seçmen gerekiyor.',
    venue_chat_mode_locked:
      'Mekan sohbetinde nasıl görüneceğini bu girişte zaten seçtin. Değiştirmek için mekandan ayrılıp yeniden giriş yap.',
    wrong_side: 'Bu masaya yalnızca daha önce bulunduğun taraftan katılabilirsin.',
    not_leader: 'Bunu yalnızca masanın lideri yapabilir.',
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
