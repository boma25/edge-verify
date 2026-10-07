import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, radius, spacing } from './tokens';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.label, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary ? s.buttonPrimary : s.buttonSecondary,
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={[s.buttonText, !primary && { color: colors.brandSoft }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.chipRow}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[s.chip, on && s.chipOn]}
          >
            <Text style={[s.chipText, on && { color: colors.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
  return (
    <View style={s.stepper}>
      <Pressable accessibilityLabel="decrease" onPress={() => onChange(clamp(value - step))} style={s.stepBtn}>
        <Text style={s.stepGlyph}>−</Text>
      </Pressable>
      <Text style={s.stepValue}>{format(value)}</Text>
      <Pressable accessibilityLabel="increase" onPress={() => onChange(clamp(value + step))} style={s.stepBtn}>
        <Text style={s.stepGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

/** Horizontal meter with a tick at the approve threshold. */
export function ConfidenceMeter({
  value,
  threshold,
  color,
}: {
  value: number;
  threshold: number;
  color: string;
}) {
  return (
    <View>
      <View style={s.meterTrack}>
        <View style={[s.meterFill, { width: `${Math.round(value * 100)}%`, backgroundColor: color }]} />
        <View style={[s.meterTick, { left: `${Math.round(threshold * 100)}%` }]} />
      </View>
      <View style={s.meterLegend}>
        <Text style={s.meterText}>confidence {value.toFixed(2)}</Text>
        <Text style={s.meterText}>threshold {threshold.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  label: {
    color: colors.brandSoft,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: { backgroundColor: colors.brand },
  buttonSecondary: { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.textMuted, fontSize: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { color: colors.text, fontSize: 22 },
  stepValue: { color: colors.text, fontFamily: fonts.mono, fontSize: 18, minWidth: 64, textAlign: 'center' },
  meterTrack: {
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    overflow: 'visible',
    justifyContent: 'center',
  },
  meterFill: { height: 14, borderRadius: radius.pill },
  meterTick: {
    position: 'absolute',
    top: -4,
    width: 2,
    height: 22,
    backgroundColor: colors.text,
  },
  meterLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  meterText: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 12 },
});
