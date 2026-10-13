import { apiClient } from './client'

export type FreedubOption = { id: string; label: string }

export type FreedubOptions = {
  voices: FreedubOption[]
  styles: FreedubOption[]
}

export type FreedubSynthResult = {
  audio_url: string
  role: string | null
  style: string | null
}

export const freedubApi = {
  options: () => apiClient.get('/freedub/options') as Promise<FreedubOptions>,
  synthesize: (body: { text: string; role?: string; style?: string }) =>
    apiClient.post('/freedub/synthesize', body) as Promise<FreedubSynthResult>,
}
