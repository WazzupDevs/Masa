import type { ReactNode } from 'react';
import { Text as RNText, type TextProps } from 'react-native';

import { typeStyle, useTheme } from '@/theme/ThemeProvider';
import type { PaletteKey, TypeVariant } from '@/theme/tokens';

type Props = Omit<TextProps, 'style'> & {
  variant?: TypeVariant;
  tone?: PaletteKey;
  // A colour that is not a theme token: only the reveal signal's server colour.
  color?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
  children: ReactNode;
};

// Every piece of text in the app: the type scale and the font come from the active theme.
export function Text({
  variant = 'body',
  tone,
  color,
  align,
  className,
  children,
  ...rest
}: Props) {
  const theme = useTheme();
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
      ]}
    >
      {children}
    </RNText>
  );
}
