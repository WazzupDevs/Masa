import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { GameIcon } from '@/components/Glyph';
import { useDepth } from '@/components/Depth';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import type { PaletteKey } from '@/theme/tokens';
import { SPACING, TOUCH } from '@/theme/tokens';

// İbre's visual parts (docs/SPEC_V3.md §20.5; canvas: Aşama 6 · Oyunlar → İbre): the two-ended
// scale as a half dial, the target seen while held, the needle dragged in JS (the view's own touch
// responder; no native module) or moved with − / +, "Daha sol / Daha sağ", and the reveal with the target zone and
// the 4 / 3 / 2 bands. Drawn with views only: the bands are triangles clipped by the round dial.
// Values run 0 (left) to 100 (right). Props only; the game screen wires them.

export const NEEDLE_MIN = 0;
export const NEEDLE_MAX = 100;
// Band edges around the target, half a step past the scoring distances 4, 11 and 19 (§20.5).
const BANDS: readonly { reach: number; points: number; tone: [PaletteKey, PaletteKey] }[] = [
  { reach: 19.5, points: 2, tone: ['calm', 'onCalm'] },
  { reach: 11.5, points: 3, tone: ['signal', 'onSignal'] },
  { reach: 4.5, points: 4, tone: ['buzz', 'onBuzz'] },
];
const NEEDLE_WIDTH = SPACING[1.5];
const HUB = SPACING[7];
const KNOB = SPACING[10];
// The band numbers sit on a ring this far in from the rim (their box: SPACING[6], centred
// SPACING[6] in); its inner edge.
const LABEL_RING = SPACING[6] + SPACING[6] / 2;

const clamp = (v: number) => Math.max(NEEDLE_MIN, Math.min(NEEDLE_MAX, Math.round(v)));
// 0 → pointing left, 50 → up, 100 → right; degrees clockwise from up for RN's rotate.
const turn = (value: number) => (value - 50) * 1.8;

type DialProps = {
  // The dial's width; the height is half of it.
  width: number;
  left: string;
  right: string;
  target?: number | null;
  // The band labels (4, 3, 2) on the reveal.
  labels?: boolean;
  needle?: number | null;
  // The draggable knob at the needle's tip.
  knob?: boolean;
  // Under the dial (the − / + row).
  children?: ReactNode;
  // Over the dial (the hold-to-see cover).
  cover?: ReactNode;
  // The touch layer (drag).
  touch?: ReactNode;
  accessibilityLabel: string;
};

// The half dial with its two ends.
export function Dial({
  width,
  left,
  right,
  target,
  labels,
  needle,
  knob,
  children,
  cover,
  touch,
  accessibilityLabel,
}: DialProps) {
  const { colors, shape } = useTheme();
  const r = width / 2;
  // With the band numbers shown (the reveal), the needle stops short of their ring so it never
  // covers the number it points at; otherwise it reaches the rim.
  const needleTop = labels ? LABEL_RING + SPACING[2] : SPACING[3];
  return (
    <View className="gap-2 self-center" style={{ width }}>
      <View
        accessible={!touch}
        accessibilityLabel={touch ? undefined : accessibilityLabel}
        style={{ width, height: r + HUB / 2, overflow: 'hidden' }}
      >
        <View
          style={{
            width,
            height: width,
            borderRadius: r,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            borderWidth: Math.max(shape.stroke.control, 2),
            borderColor: colors.border,
          }}
        >
          {target !== null && target !== undefined
            ? BANDS.map((b) => (
                <Wedge
                  key={b.points}
                  r={r}
                  value={target}
                  reach={b.reach}
                  color={colors[b.tone[0]]}
                />
              ))
            : null}
        </View>
        {target !== null && target !== undefined && labels
          ? BANDS.flatMap((b) => {
              const inner = BANDS.find((x) => x.reach < b.reach)?.reach ?? 0;
              const mid =
                b.points === 4
                  ? [target]
                  : [target - (b.reach + inner) / 2, target + (b.reach + inner) / 2];
              return mid
                .filter((v) => v >= NEEDLE_MIN && v <= NEEDLE_MAX)
                .map((v) => (
                  <BandLabel
                    key={`${b.points}-${v}`}
                    r={r}
                    value={v}
                    text={String(b.points)}
                    color={colors[b.tone[1]]}
                  />
                ));
            })
          : null}
        {needle !== null && needle !== undefined ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width,
              height: width,
              transform: [{ rotate: `${turn(needle)}deg` }],
            }}
          >
            <View
              style={{
                position: 'absolute',
                left: r - NEEDLE_WIDTH / 2,
                top: needleTop,
                width: NEEDLE_WIDTH,
                height: r - needleTop,
                borderRadius: shape.radius.pill,
                backgroundColor: colors.text,
              }}
            />
            {knob ? (
              <View
                style={{
                  position: 'absolute',
                  left: r - KNOB / 2,
                  top: SPACING[3] - KNOB / 4,
                  width: KNOB,
                  height: KNOB,
                  borderRadius: shape.radius.pill,
                  backgroundColor: colors.accent,
                  borderWidth: Math.max(shape.stroke.control, 2),
                  borderColor: colors.border,
                }}
              />
            ) : null}
          </View>
        ) : null}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: r - HUB / 2,
            top: r - HUB / 2,
            width: HUB,
            height: HUB,
            borderRadius: shape.radius.pill,
            backgroundColor: colors.text,
          }}
        />
        {cover}
        {touch}
      </View>
      {/* Each end has half the row and wraps: long ends ran into each other at 320 dp. */}
      <View className="flex-row gap-3">
        <Text variant="bodyStrong" className="flex-1">
          {left}
        </Text>
        <Text variant="bodyStrong" align="right" className="flex-1">
          {right}
        </Text>
      </View>
      {children}
    </View>
  );
}

// One band: a triangle from the dial's centre, as wide as the band, clipped round by the dial.
function Wedge({
  r,
  value,
  reach,
  color,
}: {
  r: number;
  value: number;
  reach: number;
  color: string;
}) {
  const half = (reach * 1.8 * Math.PI) / 180;
  const h = r * 1.5;
  const w = h * Math.tan(half);
  return (
    <View
      style={{
        position: 'absolute',
        left: r - h,
        top: r - h,
        width: h * 2,
        height: h * 2,
        transform: [{ rotate: `${turn(value)}deg` }],
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: h - w,
          top: 0,
          width: 0,
          height: 0,
          borderLeftWidth: w,
          borderRightWidth: w,
          borderTopWidth: h,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: color,
        }}
      />
    </View>
  );
}

function BandLabel({
  r,
  value,
  text,
  color,
}: {
  r: number;
  value: number;
  text: string;
  color: string;
}) {
  const a = (turn(value) * Math.PI) / 180;
  const size = SPACING[6];
  const d = r - (LABEL_RING - size / 2);
  return (
    <View
      pointerEvents="none"
      className="items-center justify-center"
      style={{
        position: 'absolute',
        left: r + d * Math.sin(a) - size / 2,
        top: r - d * Math.cos(a) - size / 2,
        width: size,
        height: size,
      }}
    >
      <Text variant="heading" color={color}>
        {text}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ the target, held

// The describing table's target, seen only while held (Tabu's covered card): a cover over the dial,
// the bands under a finger. `onHoldStart` asks for the target (ibre/target); `onHoldEnd` drops it.
export function TargetHold({
  width,
  left,
  right,
  target,
  onHoldStart,
  onHoldEnd,
}: {
  width: number;
  left: string;
  right: string;
  // Null until the server answers.
  target: number | null;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}) {
  const { colors, shape } = useTheme();
  const [holding, setHolding] = useState(false);
  const shown = holding && target !== null;
  const r = width / 2;
  return (
    <Pressable
      testID="ibre-hold"
      accessibilityRole="button"
      accessibilityLabel={shown ? tr.ibre.targetLabel(target ?? 0, left, right) : tr.ibre.holdLabel}
      accessibilityHint={tr.ibre.holdHint}
      onPressIn={() => {
        setHolding(true);
        onHoldStart();
      }}
      onPressOut={() => {
        setHolding(false);
        onHoldEnd();
      }}
    >
      <Dial
        width={width}
        left={left}
        right={right}
        target={shown ? target : null}
        labels={shown}
        accessibilityLabel={tr.ibre.scale(left, right)}
        cover={
          shown ? null : (
            <View
              testID="ibre-cover"
              className="absolute items-center justify-center gap-1.5"
              style={{
                left: 0,
                top: 0,
                width,
                height: r + HUB / 2,
                borderTopLeftRadius: r,
                borderTopRightRadius: r,
                backgroundColor: colors.violet,
                borderWidth: Math.max(shape.stroke.control, 2),
                borderColor: colors.border,
              }}
            >
              <GameIcon name="needle" color={colors.onViolet} size={SPACING[11]} />
              <Text variant="bodyStrong" tone="onViolet" align="center">
                {holding ? tr.ibre.loading : tr.ibre.hold}
              </Text>
            </View>
          )
        }
      />
      {shown ? (
        <View className="mt-2 items-center" testID="ibre-target">
          <Text variant="title">{tr.ibre.target(target ?? 0)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ------------------------------------------------------------------ the needle

// The needle the describing table moves: drag anywhere on the dial (JS only), or − / + (and the
// screen reader's adjust gestures) one step at a time.
export function NeedleDial({
  width,
  left,
  right,
  value,
  onChange,
  disabled,
}: {
  width: number;
  left: string;
  right: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const r = width / 2;
  const fromTouch = (x: number, y: number) => {
    const dx = x - r;
    const dy = Math.min(r - y, r);
    const deg = (Math.atan2(dx, Math.max(dy, 0.0001)) * 180) / Math.PI;
    onChange(clamp(deg / 1.8 + 50));
  };

  const step = (d: number) => onChange(clamp(value + d));
  return (
    <Dial
      width={width}
      left={left}
      right={right}
      needle={value}
      knob={!disabled}
      accessibilityLabel={tr.ibre.needleLabel(value, left, right)}
      touch={
        <View
          testID="ibre-drag"
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={tr.ibre.needleLabel(value, left, right)}
          accessibilityValue={{ min: NEEDLE_MIN, max: NEEDLE_MAX, now: value }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          style={{ position: 'absolute', left: 0, top: 0, width, height: r + HUB / 2 }}
          onStartShouldSetResponder={() => !disabled}
          onMoveShouldSetResponder={() => !disabled}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => fromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          onResponderMove={(e) => fromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        />
      }
    >
      <View className="flex-row items-center justify-center gap-4">
        <StepButton
          testID="ibre-minus"
          label={tr.ibre.left}
          text="−"
          onPress={() => step(-1)}
          disabled={disabled || value <= NEEDLE_MIN}
        />
        <Text variant="title" tabular>
          {String(value)}
        </Text>
        <StepButton
          testID="ibre-plus"
          label={tr.ibre.right}
          text="+"
          onPress={() => step(1)}
          disabled={disabled || value >= NEEDLE_MAX}
        />
      </View>
    </Dial>
  );
}

function StepButton({
  testID,
  label,
  text,
  onPress,
  disabled,
}: {
  testID: string;
  label: string;
  text: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors, shape } = useTheme();
  const depth = useDepth();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      {({ pressed }) => (
        <View
          style={[
            {
              alignItems: 'center',
              justifyContent: 'center',
              width: TOUCH.button,
              height: TOUCH.button,
              borderRadius: shape.radius.pill,
              backgroundColor: disabled ? colors.surface2 : colors.raised,
            },
            depth({ pressed, inactive: disabled }),
          ]}
        >
          <Text variant="title" tone={disabled ? 'muted' : 'text'}>
            {text}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------------ the other table's side

export type Side = 'left' | 'right';

// "Daha sol / Daha sağ": the other table's guess of where the target is from the locked needle.
export function SideChoice({
  selected,
  onSelect,
  disabled,
}: {
  selected: Side | null;
  onSelect: (side: Side) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row gap-2.5" testID="ibre-side">
      {(['left', 'right'] as const).map((side) => (
        <View key={side} className="flex-1">
          <Button
            variant={selected === side ? 'primary' : 'neutral'}
            size="lg"
            testID={`ibre-side-${side}`}
            label={side === 'left' ? tr.ibre.moreLeft : tr.ibre.moreRight}
            onPress={() => onSelect(side)}
            disabled={disabled}
          />
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ the reveal

// The reveal (a shareable moment, canvas: İbrenin açılışı): the target zone with its 4 / 3 / 2
// bands, the needle, the points in big type and the side guess's result.
export function NeedleReveal({
  width,
  left,
  right,
  clue,
  target,
  needle,
  points,
  detail,
  brand,
}: {
  width: number;
  left: string;
  right: string;
  // The clue is spoken; a screen may show it if the table typed nothing (§20.1: no free text).
  clue?: string;
  target: number;
  // Null: never locked (the clock ran out); no needle is drawn.
  needle: number | null;
  points: number;
  // "Hedef 34 · ibre 41 · Sakin Martı "Daha sol" dedi: +1".
  detail: string;
  brand?: string;
}) {
  return (
    <View testID="ibre-reveal" accessibilityLiveRegion="polite" className="items-center gap-4">
      {clue ? (
        <Text variant="display" align="center">
          {clue}
        </Text>
      ) : null}
      <Dial
        width={width}
        left={left}
        right={right}
        target={target}
        labels
        needle={needle}
        accessibilityLabel={tr.ibre.revealLabel(target, needle)}
      />
      <View className="flex-row items-end gap-2">
        <Text variant="hero">{tr.ibre.points(points)}</Text>
        <Text variant="title" className="mb-1.5">
          {tr.ibre.pointsWord}
        </Text>
      </View>
      <Text variant="bodyStrong" tone="muted" align="center">
        {detail}
      </Text>
      {brand ? <Text variant="label">{brand}</Text> : null}
    </View>
  );
}
