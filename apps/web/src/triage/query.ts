import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import type {
  AnalisarRelatoRequest,
  ClassificarRequest,
  QueueResponse,
  TranscreverRequest,
  TriagemFilaSubmitRequest
} from '@medical/contracts'
import { triageApi } from './api'

export const TRIAGE_QUEUE_POLL_INTERVAL_MS = 5_000

export const triageQueryKeys = {
  all: ['triage'] as const,
  queue: () => [...triageQueryKeys.all, 'queue'] as const
}

export function triageQueueQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: triageQueryKeys.queue(),
    queryFn: triageApi.queue,
    enabled,
    refetchInterval: enabled ? TRIAGE_QUEUE_POLL_INTERVAL_MS : false,
    retry: false
  })
}

export function useTriageQueue(enabled: boolean) {
  return useQuery(triageQueueQueryOptions(enabled))
}

export function useTranscribeMutation() {
  return useMutation({
    mutationFn: (payload: TranscreverRequest) => triageApi.transcribe(payload),
    retry: false
  })
}

export function useAnalyzeTriageMutation() {
  return useMutation({
    mutationFn: (payload: AnalisarRelatoRequest) => triageApi.analyze(payload),
    retry: false
  })
}

export function useClassifyTriageMutation() {
  return useMutation({
    mutationFn: (payload: ClassificarRequest) => triageApi.classify(payload),
    retry: false
  })
}

export function useSubmitTriageQueueMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: TriagemFilaSubmitRequest) =>
      triageApi.submitQueue(payload),
    retry: false,
    onSuccess: (data: QueueResponse) => {
      queryClient.setQueryData(triageQueryKeys.queue(), data)
    }
  })
}
