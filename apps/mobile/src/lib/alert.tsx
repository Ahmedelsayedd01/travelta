import { Alert, type AlertButton } from 'react-native';

/** Native: the platform alert. Same signature as Alert.alert (see alert.web.ts for Expo Web). */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  Alert.alert(title, message, buttons);
}

/** Toasts are a web-only concern; on native this renders nothing. */
export function WebToaster() {
  return null;
}
