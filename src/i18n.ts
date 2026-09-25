import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import vi from './locales/vi.json';

const savedLang = localStorage.getItem('lang');
let defaultLang = 'en';

if (savedLang && (savedLang === 'en' || savedLang === 'vi')) {
  defaultLang = savedLang;
} else if (navigator.language && navigator.language.startsWith('vi')) {
  defaultLang = 'vi';
}

const i18n = createI18n({
  legacy: false, // Use Composition API
  locale: defaultLang,
  fallbackLocale: 'en',
  messages: {
    en,
    vi,
  },
});

export default i18n;

