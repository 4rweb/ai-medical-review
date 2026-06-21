import { useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { namespaces } from './i18n'
import { errorsEn, queueEn, triageEn, uiEn } from './locales/catalogs'

const ATTRIBUTES = ['placeholder', 'title', 'aria-label'] as const
const EN_TO_PT = new Map<string, string>(
  Object.entries({ ...uiEn, ...triageEn, ...queueEn, ...errorsEn }).map(
    ([pt, en]) => [en, pt]
  )
)

function preserveWhitespace(original: string, translated: string): string {
  const leading = original.match(/^\s*/)?.[0] || ''
  const trailing = original.match(/\s*$/)?.[0] || ''
  return `${leading}${translated}${trailing}`
}

export function useLocalizedDom(language: 'pt-BR' | 'en' | null): void {
  const { t } = useTranslation(namespaces)

  useLayoutEffect(() => {
    if (!language) return
    const translate = (value: string): string => {
      const key = value.trim().replace(/\s+/g, ' ')
      if (!key) return value
      if (language === 'pt-BR') {
        const portuguese = EN_TO_PT.get(key)
        return portuguese ? preserveWhitespace(value, portuguese) : value
      }
      for (const ns of namespaces) {
        const translated = t(key, {
          ns,
          defaultValue: key,
          keySeparator: false
        })
        if (translated !== key) return preserveWhitespace(value, translated)
      }
      return value
    }

    const localizeNode = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE && root.textContent) {
        const translated = translate(root.textContent)
        if (translated !== root.textContent) root.textContent = translated
        return
      }
      if (!(root instanceof Element)) return

      for (const attribute of ATTRIBUTES) {
        const value = root.getAttribute(attribute)
        if (value) root.setAttribute(attribute, translate(value))
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        if (node.textContent) {
          const translated = translate(node.textContent)
          if (translated !== node.textContent) node.textContent = translated
        }
        node = walker.nextNode()
      }
      root.querySelectorAll('*').forEach(element => {
        for (const attribute of ATTRIBUTES) {
          const value = element.getAttribute(attribute)
          if (value) element.setAttribute(attribute, translate(value))
        }
      })
    }

    localizeNode(document.body)
    const observer = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(localizeNode)
      }
    })
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    })
    return () => observer.disconnect()
  }, [language, t])
}
