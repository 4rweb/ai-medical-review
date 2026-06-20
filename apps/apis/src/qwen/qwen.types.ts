import type { z } from 'zod'

export type QwenTool = {
  name: string
  description: string
  inputSchema: z.ZodType
  execute: (input: unknown) => unknown | Promise<unknown>
}

export type QwenToolExecution = {
  name: string
  arguments: unknown
  result: unknown
}
