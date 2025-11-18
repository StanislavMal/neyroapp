// 📄 src/ssr.tsx (Финальная исправленная версия)

import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { getRouterManifest } from '@tanstack/react-start/router-manifest'
import * as Sentry from '@sentry/react'
import i18next from 'i18next'
import { parse } from 'cookie'

import { createRouter } from './router'
import { initSentry } from './sentry'
import './i18n'; 

type Handler = Parameters<ReturnType<typeof createStartHandler>>[0];
type HandlerOptions = Parameters<Handler>[0];

initSentry()

let baseStreamHandler: Handler = defaultStreamHandler;

if (process.env.SENTRY_DSN) {
  const originalHandler = defaultStreamHandler;
  
  baseStreamHandler = async (options: HandlerOptions) => {
    try {
      return await originalHandler(options);
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  };
}

const finalStreamHandler: Handler = async (options: HandlerOptions) => {
  const cookies = parse(options.request.headers.get('cookie') || '');
  const lang = cookies.i18next_lang || 'ru';

  if (i18next.language !== lang) {
    await i18next.changeLanguage(lang);
  }
  
  return baseStreamHandler(options);
};


export default createStartHandler({
  createRouter,
  getRouterManifest,
})(finalStreamHandler)