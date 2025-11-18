// 📄 src/i18n.ts

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationEN from './locales/en/translation.json';
import translationRU from './locales/ru/translation.json';

const resources = {
  en: {
    translation: translationEN,
  },
  ru: {
    translation: translationRU,
  },
};

const i18nInstance = i18n.use(initReactI18next);

if (!import.meta.env.SSR) {
  i18nInstance.use(LanguageDetector);
}

i18nInstance.init({
  resources,
  lng: 'ru', 
  fallbackLng: 'ru',
  supportedLngs: ['en', 'ru'],
  debug: import.meta.env.DEV,

  detection: {
    order: ['cookie', 'localStorage', 'navigator'],
    caches: ['cookie', 'localStorage'],
    lookupCookie: 'i18next_lang', // Название нашего cookie
    cookieMinutes: 60 * 24 * 30, // Срок жизни cookie - 30 дней
    cookieOptions: { path: '/' },
  },
  
  interpolation: {
    escapeValue: false,
  },

  react: {
    useSuspense: false,
  },

  partialBundledLanguages: true,
});

export default i18n;