// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '../i18n'
import { LanguageGate } from './LanguageGate'

describe('LanguageGate', () => {
  it('sempre apresenta as duas opções e informa o locale escolhido', () => {
    const onSelect = vi.fn()
    render(<LanguageGate onSelect={onSelect} />)

    expect(
      screen.getByRole('heading', {
        name: 'Escolha seu idioma Choose your language'
      })
    ).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '🇺🇸 English' }))
    expect(onSelect).toHaveBeenCalledWith('en')
  })
})
