export type FeedbackScreen = {
  key: string;
  label: string;
};

/** Canonical map of app routes to feedbackable screens/functions. */
const SCREEN_BY_PATH: Record<string, FeedbackScreen> = {
  '/': { key: 'dashboard', label: 'Resumen financiero' },
  '/light': { key: 'light', label: 'Mi mes' },
  '/transactions': { key: 'transactions', label: 'Movimientos' },
  '/import': { key: 'import', label: 'Importar movimientos' },
  '/accounts': { key: 'accounts', label: 'Pagos fijos' },
  '/settings': { key: 'settings', label: 'Ajustes' },
  '/admin': { key: 'admin', label: 'Administración' },
  '/login': { key: 'login', label: 'Login / registro' },
  '/reset-password': { key: 'reset_password', label: 'Restablecer contraseña' },
};

const PREFIX_SCREENS: Array<{ prefix: string; screen: FeedbackScreen }> = [
  { prefix: '/transactions', screen: { key: 'transactions', label: 'Movimientos' } },
  { prefix: '/import', screen: { key: 'import', label: 'Importar movimientos' } },
  { prefix: '/accounts', screen: { key: 'accounts', label: 'Pagos fijos' } },
  { prefix: '/settings', screen: { key: 'settings', label: 'Ajustes' } },
  { prefix: '/admin', screen: { key: 'admin', label: 'Administración' } },
];

export function resolveFeedbackScreen(pathname: string): FeedbackScreen {
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  if (SCREEN_BY_PATH[clean]) return SCREEN_BY_PATH[clean];

  const match = PREFIX_SCREENS.find(({ prefix }) => clean.startsWith(prefix));
  if (match) return match.screen;

  return { key: 'unknown', label: 'Otra pantalla' };
}

export const FEEDBACK_CATEGORIES = [
  { id: 'bug' as const, label: 'Error / bug', hint: 'Algo no funciona como debería' },
  { id: 'confusion' as const, label: 'Confuso', hint: 'No entendí o me costó usarlo' },
  { id: 'idea' as const, label: 'Idea', hint: 'Mejoraría o agregaría algo' },
  { id: 'praise' as const, label: 'Me gustó', hint: 'Funciona bien, quiero destacarlo' },
  { id: 'other' as const, label: 'Otro', hint: 'Cualquier otro comentario' },
];

export type FeedbackCategoryId = (typeof FEEDBACK_CATEGORIES)[number]['id'];
