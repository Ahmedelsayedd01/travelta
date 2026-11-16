import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/lib/theme';

/**
 * 6-digit one-time code: one real TextInput (keyboard, SMS/email autofill via `oneTimeCode`, paste, screen readers)
 * drawn as six boxes. Digits always read left-to-right, also in Arabic.
 */
export function OtpField({ value, onChange, label, error, length = 6, testID = 'm-otp' }: { value: string; onChange: (v: string) => void; label: string; error?: string; length?: number; testID?: string }) {
  const { c } = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text size="sm" weight="medium">{label}</Text>
      <Pressable onPress={() => input.current?.focus()} accessible={false} style={{ flexDirection: 'row', gap: 8, direction: 'ltr' }}>
        {Array.from({ length }, (_, i) => {
          const active = focused && (i === value.length || (i === length - 1 && value.length === length));
          return (
            <View key={i} style={{ flex: 1, height: 52, borderRadius: 10, borderWidth: active ? 2 : 1, borderColor: error ? c.danger : active ? c.primary : c['border-strong'], backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Text size="xl" weight="bold" numeric>{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput ref={input} value={value} onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, length))} keyboardType="number-pad" textContentType="oneTimeCode"
        autoComplete="one-time-code" maxLength={length} accessibilityLabel={label} accessibilityHint={error} testID={testID}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ position: 'absolute', opacity: 0.01, height: 1, width: 1 }} caretHidden />
      {error ? <Text size="xs" weight="medium" tone="danger" accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}
