import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ChatBubble, type ChatQuote, type ChatReaction } from '@/components/ChatBubble';
import { ChatScroll } from '@/components/ChatScreen';
import { ChoiceChip } from '@/components/ChoiceChip';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { GameDisc, type GameGlyph } from '@/components/Glyph';
import { Composer } from '@/components/Composer';
import { Text } from '@/components/Text';
import { FirstGameIntro } from '@/features/games/FirstGameIntro';
import { ClockPill, TeamScore } from '@/features/games/GameBits';
import {
  NeedleDial,
  NeedleReveal,
  type Side,
  SideChoice,
  TargetHold,
} from '@/features/games/ibre/Ibre';
import { RematchButton } from '@/features/games/RematchButton';
import {
  BOARD_LETTERS,
  LetterBoard,
  ObjectButton,
  ObjectionResult,
  ObjectionWindow,
  PromptCard,
  SaidButton,
} from '@/features/games/say/Say';
import {
  ClueOrder,
  GuessOptions,
  GuessWaiting,
  HoldCard,
  ImposterReveal,
  PassPhone,
  SeatCardFace,
  SeatList,
  VoteGrid,
} from '@/features/games/sahtekar/Sahtekar';
import { TimeUpOverlay } from '@/features/games/TimeUpOverlay';
import { tabuStats, TurnReady } from '@/features/games/TurnReady';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

// Sample data for the component preview (Ayarlar → Tasarım (test) → Bileşen önizleme): the game
// components that screens wire later, shown with made-up props so E2E can photograph them in both
// schemes. Test builds only.
export type PreviewSet = { key: string; label: string; render: () => ReactNode };

const STAGE = 560;
const GAMES: GameGlyph[] = ['tabu', 'sohbet', 'impostor', 'letters', 'song', 'needle'];

// A labelled block of the preview.
export function PreviewBlock({ title, children }: { title: string; children: ReactNode }) {
  const { colors, shape } = useTheme();
  return (
    <View
      className="gap-3"
      style={{
        padding: SPACING[3],
        borderRadius: shape.radius.lg,
        borderWidth: shape.stroke.hairline,
        borderColor: colors.divider,
      }}
    >
      <Text variant="overline" tone="muted">
        {title}
      </Text>
      {children}
    </View>
  );
}

// Aşama 8 · Saha: the button roles with the 3D depth, a disabled one, the small header size and
// the choice chips (the chosen one stays pressed in).
function ButtonsBlock() {
  const [chip, setChip] = useState(1);
  return (
    <PreviewBlock title="Button · 3D">
      <View className="gap-3" testID="preview-buttons">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button tight label="Oda kur" onPress={() => undefined} />
          </View>
          <View className="flex-1">
            <Button tight variant="secondary" label="Masanla oyna" onPress={() => undefined} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button tight variant="positive" label="Arkadaşlar" onPress={() => undefined} />
          </View>
          <View className="flex-1">
            <Button tight variant="danger" label="Odayı bitir" onPress={() => undefined} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button tight variant="neutral" label="Vazgeç" onPress={() => undefined} />
          </View>
          <View className="flex-1">
            <Button tight label="Oda kur" disabled onPress={() => undefined} />
          </View>
        </View>
        <View className="flex-row flex-wrap items-center gap-3">
          <Button size="sm" variant="danger" label="Mekandan ayrıl" onPress={() => undefined} />
          <Button size="sm" variant="neutral" label="Değiştir" onPress={() => undefined} />
        </View>
        <View className="flex-row gap-3">
          {['1', '2', '3', '4+'].map((label, i) => (
            <ChoiceChip
              key={label}
              label={label}
              selected={chip === i}
              onPress={() => setChip(i)}
            />
          ))}
        </View>
      </View>
    </PreviewBlock>
  );
}

function GamesSet() {
  const [score, setScore] = useState(8);
  const [intro, setIntro] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <View className="gap-4">
      <ButtonsBlock />
      <PreviewBlock title="GameDisc">
        <View className="flex-row flex-wrap gap-3">
          {GAMES.map((g) => (
            <GameDisc key={g} name={g} size={SPACING[14]} />
          ))}
        </View>
      </PreviewBlock>
      <PreviewBlock title="ClockPill · TeamScore">
        <View className="flex-row gap-3">
          <ClockPill seconds={42} />
          <ClockPill seconds={7} />
        </View>
        <View className="flex-row gap-2.5">
          <TeamScore name="Sakin Martı" note="siz" score={9} active={false} />
          <TeamScore name="Yaratıcı Lokma" note="anlatıyor" score={score} active />
        </View>
        <Button
          variant="neutral"
          testID="preview-score"
          label="+1"
          onPress={() => setScore((s) => s + 1)}
        />
      </PreviewBlock>
      <PreviewBlock title="TurnReady · anlatan">
        <View style={{ height: STAGE }}>
          <TurnReady
            summary={{
              eyebrow: tr.games.turnDone(2),
              alias: 'Sakin Martı',
              title: 'Sakin Martı anlattı',
              points: '+4',
              stats: tabuStats(5, 1, 2),
            }}
            describing
            describingAlias="Yaratıcı Lokma"
            secondsLeft={12}
            totalSeconds={15}
            onStart={() => undefined}
          />
        </View>
      </PreviewBlock>
      <PreviewBlock title="TurnReady · diğer masa">
        <View style={{ height: STAGE }}>
          <TurnReady
            describing={false}
            describingAlias="Yaratıcı Lokma"
            secondsLeft={12}
            totalSeconds={15}
          />
        </View>
      </PreviewBlock>
      <PreviewBlock title="TimeUpOverlay">
        <View style={{ height: STAGE / 1.4 }}>
          <TimeUpOverlay visible detail="Yaratıcı Lokma bu turda +5" brand="Kabuk · Sesli Tabu" />
        </View>
      </PreviewBlock>
      <PreviewBlock title="RematchButton · ConfirmSheet · FirstGameIntro">
        <RematchButton onPress={() => undefined} />
        <Button
          variant="neutral"
          testID="preview-confirm"
          label={tr.games.endGame}
          onPress={() => setConfirm(true)}
        />
        <Button
          variant="neutral"
          testID="preview-intro"
          label={tr.games.introTitle}
          onPress={() => setIntro(true)}
        />
      </PreviewBlock>
      <ConfirmSheet
        visible={confirm}
        testID="preview-confirm-ok"
        title={tr.games.endGameConfirmTitle}
        body={tr.games.endGameConfirmBody}
        confirmLabel={tr.games.endGameConfirm}
        cancelLabel={tr.games.keepPlaying}
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => setConfirm(false)}
      />
      <FirstGameIntro visible={intro} onClose={() => setIntro(false)} />
    </View>
  );
}

function SahtekarSet() {
  const [vote, setVote] = useState<string | null>('B2');
  const [guess, setGuess] = useState<string | null>('Poğaça');
  const [held, setHeld] = useState(false);
  const seats = (
    <View className="gap-3">
      <SeatList
        title="Yaratıcı Lokma · bu telefon"
        seats={[
          { seat: 'A1', viewed: true },
          { seat: 'A2', viewed: false },
          { seat: 'A3', viewed: false },
        ]}
        current="A2"
      />
      <SeatList
        title="Sakin Martı · kendi telefonunda"
        seats={[
          { seat: 'B1', viewed: true },
          { seat: 'B2', viewed: false },
        ]}
      />
    </View>
  );
  return (
    <View className="gap-4">
      <PreviewBlock title="PassPhone · SeatList">
        <View style={{ height: STAGE + SPACING[16] }}>
          <PassPhone seat="A2" seats={seats} onReady={() => undefined} />
        </View>
      </PreviewBlock>
      <PreviewBlock title="HoldCard (basılı tut)">
        <View style={{ height: STAGE }}>
          <HoldCard
            seat="A2"
            card={held ? { category: 'Yiyecek', word: 'Simit' } : null}
            onHoldStart={() => setHeld(true)}
            onHoldEnd={() => setHeld(false)}
            onDone={() => undefined}
          />
        </View>
      </PreviewBlock>
      <PreviewBlock title="SeatCardFace · kelime">
        <View style={{ height: STAGE - SPACING[16] }} testID="preview-card-word">
          <SeatCardFace card={{ category: 'Yiyecek', word: 'Simit' }} />
        </View>
      </PreviewBlock>
      <PreviewBlock title="SeatCardFace · sahtekar">
        <View style={{ height: STAGE - SPACING[16] }} testID="preview-card-imposter">
          <SeatCardFace card={{ category: 'Yiyecek', imposter: true }} />
        </View>
      </PreviewBlock>
      <PreviewBlock title="ClueOrder">
        <View style={{ height: STAGE }}>
          <ClueOrder
            round={1}
            totalRounds={2}
            order={['A1', 'B1', 'A2', 'B2', 'A3']}
            currentIndex={2}
            secondsLeft={9}
            canSay
            onSaid={() => undefined}
          />
        </View>
      </PreviewBlock>
      <PreviewBlock title="VoteGrid">
        <View style={{ height: STAGE }}>
          <VoteGrid
            voter="A2"
            seats={['A1', 'A2', 'A3', 'B1', 'B2']}
            selected={vote}
            onSelect={setVote}
            onSubmit={() => undefined}
            secondsLeft={41}
            votesCast={2}
            totalVoters={5}
          />
        </View>
      </PreviewBlock>
      <PreviewBlock title="GuessOptions">
        <View style={{ height: STAGE }}>
          <GuessOptions
            seat="B2"
            category="Yiyecek"
            options={['Simit', 'Poğaça', 'Börek', 'Gözleme', 'Açma', 'Pide']}
            selected={guess}
            onSelect={setGuess}
            onSubmit={() => undefined}
            secondsLeft={24}
          />
        </View>
      </PreviewBlock>
      <PreviewBlock title="GuessWaiting">
        <View style={{ height: STAGE - SPACING[16] }}>
          <GuessWaiting seat="B2" secondsLeft={24} />
        </View>
      </PreviewBlock>
      <PreviewBlock title="ImposterReveal">
        <View style={{ height: STAGE + SPACING[16] }}>
          <ImposterReveal
            imposter="B2"
            word="Simit"
            guess="Poğaça"
            outcome="tables"
            votes={[
              { voter: 'A1', target: 'B2' },
              { voter: 'A2', target: 'A1' },
              { voter: 'A3', target: 'B2' },
              { voter: 'B1', target: 'B2' },
              { voter: 'B2', target: 'A2' },
            ]}
            brand="Kabuk · Sahtekar"
          />
        </View>
      </PreviewBlock>
    </View>
  );
}

const CLOSED = ['A', 'K', 'M', 'T', 'Z', 'Ş'];

function SaySet() {
  const [picked, setPicked] = useState<string | null>('F');
  return (
    <View className="gap-4">
      <PreviewBlock title="Harf Kapmaca · PromptCard · LetterBoard">
        <View className="gap-3" testID="preview-letters">
          <PromptCard kind="category" prompt="Bir hayvan" compact />
          <LetterBoard
            letters={BOARD_LETTERS.map((letter) => ({ letter, closed: CLOSED.includes(letter) }))}
            selected={picked}
            onPick={setPicked}
          />
        </View>
      </PreviewBlock>
      <PreviewBlock title="Karşı masa · ObjectionWindow · ObjectButton">
        <View className="gap-3" testID="preview-object">
          <LetterBoard
            letters={BOARD_LETTERS.map((letter) => ({
              letter,
              closed: [...CLOSED, 'F'].includes(letter),
            }))}
          />
          <ObjectionWindow remainingMs={2000} left={2} />
          <ObjectButton left={2} onPress={() => undefined} />
        </View>
      </PreviewBlock>
      <PreviewBlock title="ObjectionResult">
        <ObjectionResult detail="F açıldı · Yaratıcı Lokma +1" />
      </PreviewBlock>
      <PreviewBlock title="Şarkıda Geçsin · PromptCard · SaidButton">
        <View style={{ height: STAGE }} className="gap-3" testID="preview-song">
          <PromptCard kind="word" prompt="Yağmur" line={tr.say.sayLine} />
          <SaidButton onPress={() => undefined} />
        </View>
      </PreviewBlock>
      <PreviewBlock title="Şarkıda Geçsin · karşı masa">
        <View className="gap-3" testID="preview-song-object">
          <PromptCard kind="word" prompt="Yağmur" compact />
          <ObjectionWindow remainingMs={1000} left={0} />
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <ObjectButton left={0} onPress={() => undefined} />
            </View>
            <View className="flex-1">
              <SaidButton onPress={() => undefined} />
            </View>
          </View>
        </View>
      </PreviewBlock>
    </View>
  );
}

const DIAL = 320;

// The dials take a width; in the preview it is the block's own (a phone at 320 dp leaves less).
function FitWidth({ children }: { children: (width: number) => ReactNode }) {
  const [width, setWidth] = useState(0);
  return (
    <View onLayout={(e) => setWidth(Math.min(DIAL, Math.floor(e.nativeEvent.layout.width)))}>
      {width > 0 ? children(width) : null}
    </View>
  );
}

function IbreSet() {
  const [held, setHeld] = useState(false);
  const [needle, setNeedle] = useState(41);
  const [side, setSide] = useState<Side | null>('left');
  return (
    <View className="gap-4">
      <PreviewBlock title="TargetHold (basılı tut)">
        <FitWidth>
          {(w) => (
            <TargetHold
              width={w}
              left="Ucuz"
              right="Pahalı"
              target={held ? 34 : null}
              onHoldStart={() => setHeld(true)}
              onHoldEnd={() => setHeld(false)}
            />
          )}
        </FitWidth>
      </PreviewBlock>
      <PreviewBlock title="NeedleDial · sürükle, − / +">
        <View testID="preview-needle">
          <FitWidth>
            {(w) => (
              <NeedleDial
                width={w}
                left="Ucuz"
                right="Pahalı"
                value={needle}
                onChange={setNeedle}
              />
            )}
          </FitWidth>
        </View>
      </PreviewBlock>
      <PreviewBlock title="SideChoice">
        <View className="gap-3" testID="preview-side">
          <FitWidth>
            {(w) => (
              <NeedleDial
                width={w}
                left="Ucuz"
                right="Pahalı"
                value={41}
                onChange={() => undefined}
                disabled
              />
            )}
          </FitWidth>
          <SideChoice selected={side} onSelect={setSide} />
        </View>
      </PreviewBlock>
      <PreviewBlock title="NeedleReveal">
        <FitWidth>
          {(w) => (
            <NeedleReveal
              width={w}
              left="Ucuz"
              right="Pahalı"
              target={34}
              needle={41}
              points={3}
              detail='Hedef 34 · ibre 41 · Sakin Martı "Daha sol" dedi: +1'
              brand="Kabuk · İbre"
            />
          )}
        </FitWidth>
      </PreviewBlock>
    </View>
  );
}

// Aşama 8 · Saha → Sohbet: a sender's run under one photo and name, a reply with its quote, the
// reactions under a message (the bar opens on a long press), the reply strip over the message bar,
// and "Yeni mesaj" when a message comes in while the reader is up the stream.
function ChatSet() {
  const [reactions, setReactions] = useState<ChatReaction[]>([
    { emoji: '😂', count: 2, mine: true },
    { emoji: '🔥', count: 1, mine: false },
  ]);
  const [replyTo, setReplyTo] = useState<ChatQuote | undefined>({
    name: 'Deniz',
    text: 'Yarın aynı yerde mi?',
  });
  const [incoming, setIncoming] = useState(0);
  const toggle = (emoji: string) =>
    setReactions((list) => {
      const found = list.find((r) => r.emoji === emoji);
      if (!found) return [...list, { emoji, count: 1, mine: true }];
      const count = found.count + (found.mine ? -1 : 1);
      return count === 0
        ? list.filter((r) => r.emoji !== emoji)
        : list.map((r) => (r.emoji === emoji ? { ...r, count, mine: !r.mine } : r));
    });
  const deniz = <Avatar kind="profile" name="Deniz Kaya" size="sm" />;
  const stream = Array.from({ length: 8 + incoming }, (_, i) => i);
  return (
    <View className="gap-4">
      <PreviewBlock title="ChatBubble">
        <View className="gap-2" testID="preview-chat">
          <ChatBubble
            text="Harika oyundu!"
            mine={false}
            avatar={deniz}
            name="Deniz Kaya"
            onPressSender={() => undefined}
            last={false}
          />
          <ChatBubble
            text="Yarın aynı yerde mi?"
            mine={false}
            first={false}
            time="21:42"
            reactions={reactions}
            onToggleReaction={toggle}
            onReply={() => setReplyTo({ name: 'Deniz', text: 'Yarın aynı yerde mi?' })}
            onReact={toggle}
            testID="preview-bubble"
          />
          <ChatBubble
            text="Olur, 8 gibi oradayız"
            mine
            quote={{ name: 'Deniz', text: 'Yarın aynı yerde mi?' }}
            time="21:44"
            delivery="read"
            onReply={() => setReplyTo({ name: 'Sen', text: 'Olur, 8 gibi oradayız' })}
            onReact={toggle}
          />
        </View>
      </PreviewBlock>
      <PreviewBlock title="Composer · replyTo">
        <Composer
          value=""
          onChangeText={() => undefined}
          placeholder={tr.dm.placeholder}
          maxLength={200}
          onSend={() => undefined}
          sendLabel={tr.dm.send}
          sendDisabled
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(undefined)}
        />
      </PreviewBlock>
      <PreviewBlock title="ChatScroll · Yeni mesaj">
        <View style={{ height: STAGE / 2 }} testID="preview-stream">
          <ChatScroll
            newestKey={String(stream.length)}
            contentContainerStyle={{ gap: SPACING[2], padding: SPACING[2] }}
          >
            {stream.map((i) => (
              <ChatBubble key={i} text={`Mesaj ${i + 1}`} mine={i % 3 === 0} />
            ))}
          </ChatScroll>
        </View>
        <Button
          variant="neutral"
          size="sm"
          label={tr.design.previewIncoming}
          testID="preview-incoming"
          onPress={() => setIncoming((n) => n + 1)}
        />
      </PreviewBlock>
    </View>
  );
}

export const PREVIEW_SETS: PreviewSet[] = [
  { key: 'games', label: 'Oyun', render: () => <GamesSet /> },
  { key: 'sahtekar', label: 'Sahtekar', render: () => <SahtekarSet /> },
  { key: 'say', label: 'Harf · Şarkı', render: () => <SaySet /> },
  { key: 'ibre', label: 'İbre', render: () => <IbreSet /> },
  { key: 'chat', label: 'Sohbet', render: () => <ChatSet /> },
];
