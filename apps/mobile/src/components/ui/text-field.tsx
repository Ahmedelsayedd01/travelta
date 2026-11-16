import { useState, type ComponentRef, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View, type TextInputProps } from 'react-native';
import { controlHeight } from '@travelta/design-tokens';
import { useTheme } from '@/lib/theme';
import { Text } from './text';

interface TextFieldProps extends TextInputProps {
  label: string;
  /** i18n key from @travelta/schemas (e.g. `validation.required`) or plain text. */
  error?: string;
  help?: string;
  required?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

export function TextField({ label, error, help, required, style, onFocus, onBlur, ref, ...props }: TextFieldProps) {
  const { c, radii, font, rtl } = useTheme();
  const { t, i18n } = useTranslation();
  const [focused, setFocused] = useState(false);
  const message = error ? (i18n.exists(error) ? t(error) : error) : undefined;
  return (
    <View style={{ gap: 6 }}>
      <Text size="sm" weight="medium">
        {label}
        {required ? <Text tone="danger"> *</Text> : null}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={message ?? help}
        placeholderTextColor={c['fg-subtle']}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[
          font('base'),
          {
            minHeight: Math.max(controlHeight.md, controlHeight.touchMin),
            paddingHorizontal: 12,
            borderWidth: focused ? 2 : 1,
            borderColor: message ? c.danger : focused ? c.primary : c['border-strong'],
            borderRadius: radii.md,
            backgroundColor: c.surface,
            color: c.fg,
            textAlign: rtl ? 'right' : 'left',
          },
          style,
        ]}
        {...props}
      />
      {message ? (
        <Text size="xs" weight="medium" tone="danger" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : help ? (
        <Text size="xs" tone="muted">{help}</Text>
      ) : null}
    </View>
  );
}
