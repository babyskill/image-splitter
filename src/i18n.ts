import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import vi from './locales/vi.json';

const savedLang = localStorage.getItem('lang');
let defaultLang = 'en';

if (savedLang) {
  defaultLang = savedLang;
} else if (navigator.language) {
  if (navigator.language.startsWith('vi')) defaultLang = 'vi';
  else if (navigator.language.startsWith('zh')) defaultLang = 'zh-CN';
}

const i18n = createI18n({
  legacy: false, // Use Composition API
  locale: defaultLang,
  fallbackLocale: 'en',
  messages: {
    en,
    'zh-CN': zhCN,
    vi,
  },
});

export default i18n;
