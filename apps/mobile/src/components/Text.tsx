import { upperTr } from '@shared/trText.ts';
import type { ReactNode } from 'react';
import { Text as RNText, type TextProps } from 'react-native';

import { typeStyle, useTheme } from '@/theme/ThemeProvider';
import type { PaletteKey, TypeVariant } from '@/theme/tokens';

type Props = Omit<TextProps, 'style'> & {
  variant?: TypeVariant;
  tone?: PaletteKey;
  // A colour already resolved from the theme (a button's label on its fill).
  color?: string;
  align?: 'left' | 'center' | 'right';
  // Equal-width digits for clocks and counters.
  tabular?: boolean;
  // Struck through: a closed letter on the Harf Kapmaca board.
  strike?: boolean;
  className?: string;
  children: ReactNode;
};

// Every piece of text in the app: the type scale and the font come from the active theme.
export function Text({
  variant = 'body',
  tone,
  color,
  align,
  tabular,
  strike,
  className,
  children,
  ...rest
}: Props) {
  const theme = useTheme();
  // Uppercase variants (overline): Turkish case rules in JS ("KATEGORİ"), not textTransform,
  // which turns "i" into "I" on Android.
  const upper = theme.typography[variant].uppercase === true;
  const content = upper ? toUpper(children) : children;
  const defaultTone: PaletteKey =
    variant === 'subtitle' || variant === 'eyebrow' || variant === 'label' || variant === 'fine'
      ? 'muted'
      : variant === 'overline'
        ? 'danger'
        : 'text';
  return (
    <RNText
      {...rest}
      className={className}
      style={[
        typeStyle(theme, variant),
        { color: color ?? theme.colors[tone ?? defaultTone] },
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        strike ? { textDecorationLine: 'line-through' } : null,
      ]}
    >
      {content}
    </RNText>
  );
}

function toUpper(node: ReactNode): ReactNode {
  if (typeof node === 'string') return upperTr(node);
  if (Array.isArray(node))
    return node.map((n: ReactNode) => (typeof n === 'string' ? upperTr(n) : n));
  return node;
}
