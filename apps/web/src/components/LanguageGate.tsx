import { Activity, Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Idioma } from '@medical/contracts'

type LanguageGateProps = {
  onSelect: (idioma: Idioma) => void
}

export function LanguageGate({ onSelect }: LanguageGateProps) {
  const { t } = useTranslation('ui')

  return (
    <main className="min-h-screen bg-base-200 text-base-content grid place-items-center px-5 py-10">
      <section className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-base-300 bg-base-100 shadow-2xl">
        <div className="bg-primary px-8 py-7 text-primary-content">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
              <Activity className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] opacity-75">
                AI Medical Review
              </p>
              <p className="text-lg font-black">
                {t('Assistente de triagem ativo')}
              </p>
            </div>
          </div>
          <Languages className="mb-3 h-8 w-8" aria-hidden="true" />
          <h1 className="text-3xl font-black tracking-tight">
            Escolha seu idioma
            <span className="mt-1 block text-xl opacity-80">
              Choose your language
            </span>
          </h1>
        </div>

        <div className="space-y-5 p-8">
          <p className="text-sm font-semibold leading-relaxed text-base-content/65">
            Selecione o idioma para iniciar uma nova pré-triagem.
            <span className="mt-1 block">
              Select a language to start a new pre-triage session.
            </span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="btn btn-primary h-16 justify-start rounded-2xl px-5 text-base font-black"
              onClick={() => onSelect('pt-BR')}
            >
              🇧🇷 Português
            </button>
            <button
              className="btn btn-outline btn-primary h-16 justify-start rounded-2xl px-5 text-base font-black"
              onClick={() => onSelect('en')}
            >
              🇺🇸 English
            </button>
          </div>
          <p className="text-center text-xs font-semibold text-base-content/45">
            Contexto brasileiro · Brazilian care context · SAMU 192
          </p>
        </div>
      </section>
    </main>
  )
}
