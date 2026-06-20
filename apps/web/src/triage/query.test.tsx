// @vitest-environment jsdom

import type { PropsWithChildren } from 'react'
import {
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AnalisarRelatoRequest,
  AnalisarRelatoResponse,
  ClassificarRequest,
  QueueResponse,
  TriagemFilaSubmitRequest
} from '@medical/contracts'
import { triageApi } from './api'
import {
  TRIAGE_QUEUE_POLL_INTERVAL_MS,
  triageQueryKeys,
  triageQueueQueryOptions,
  useAnalyzeTriageMutation,
  useClassifyTriageMutation,
  useSubmitTriageQueueMutation
} from './query'

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TanStack Query da triagem', () => {
  it('ativa o polling da fila somente quando a consulta está habilitada', () => {
    const disabledOptions = triageQueueQueryOptions(false)
    const enabledOptions = triageQueueQueryOptions(true)

    expect(disabledOptions.enabled).toBe(false)
    expect(disabledOptions.refetchInterval).toBe(false)
    expect(enabledOptions.enabled).toBe(true)
    expect(enabledOptions.refetchInterval).toBe(
      TRIAGE_QUEUE_POLL_INTERVAL_MS
    )
  })

  it('expõe os estados pendente e sucesso na análise', async () => {
    let resolveRequest!: (value: AnalisarRelatoResponse) => void
    const response = {
      sessaoId: 'sessao-1'
    } as AnalisarRelatoResponse

    vi.spyOn(triageApi, 'analyze').mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRequest = resolve
        })
    )

    const queryClient = createQueryClient()
    const { result } = renderHook(() => useAnalyzeTriageMutation(), {
      wrapper: createWrapper(queryClient)
    })

    act(() => {
      result.current.mutate({} as AnalisarRelatoRequest)
    })

    await waitFor(() => expect(result.current.isPending).toBe(true))

    act(() => {
      resolveRequest(response)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(response)
  })

  it('expõe o estado de erro na classificação sem retry automático', async () => {
    const error = new Error('classificação indisponível')
    const classifySpy = vi
      .spyOn(triageApi, 'classify')
      .mockRejectedValue(error)

    const queryClient = createQueryClient()
    const { result } = renderHook(() => useClassifyTriageMutation(), {
      wrapper: createWrapper(queryClient)
    })

    act(() => {
      result.current.mutate({} as ClassificarRequest)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(error)
    expect(classifySpy).toHaveBeenCalledTimes(1)
  })

  it('atualiza imediatamente o cache da fila após o envio', async () => {
    const response = {
      queue: []
    } as QueueResponse

    vi.spyOn(triageApi, 'submitQueue').mockResolvedValue(response)

    const queryClient = createQueryClient()
    const { result } = renderHook(() => useSubmitTriageQueueMutation(), {
      wrapper: createWrapper(queryClient)
    })

    await act(async () => {
      await result.current.mutateAsync({} as TriagemFilaSubmitRequest)
    })

    expect(queryClient.getQueryData(triageQueryKeys.queue())).toBe(response)
  })
})
