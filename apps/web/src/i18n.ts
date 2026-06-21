import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  errorsEn,
  portugueseCatalog,
  queueEn,
  triageEn,
  uiEn
} from './locales/catalogs'

export const namespaces = ['ui', 'triage', 'queue', 'errors'] as const

void i18n.use(initReactI18next).init({
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  supportedLngs: ['pt-BR', 'en'],
  ns: namespaces,
  defaultNS: 'ui',
  keySeparator: false,
  showSupportNotice: false,
  interpolation: { escapeValue: false },
  resources: {
    'pt-BR': {
      ui: portugueseCatalog(uiEn),
      triage: portugueseCatalog(triageEn),
      queue: portugueseCatalog(queueEn),
      errors: portugueseCatalog(errorsEn)
    },
    en: {
      ui: uiEn,
      triage: triageEn,
      queue: queueEn,
      errors: errorsEn
    }
  }
})

export default i18n
