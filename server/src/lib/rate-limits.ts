export const GLOBAL_RATE_LIMIT = {
  max: 240,
  timeWindow: '1 minute',
} as const

export const SUBMIT_REQUEST_RATE_LIMIT = {
  max: 20,
  timeWindow: '10 minutes',
} as const

export const STREAM_RATE_LIMIT = {
  max: 120,
  timeWindow: '1 minute',
} as const

export const SONG_DOWNLOAD_RATE_LIMIT = {
  max: 60,
  timeWindow: '5 minutes',
} as const

export const DAY_DOWNLOAD_RATE_LIMIT = {
  max: 10,
  timeWindow: '5 minutes',
} as const

export const LOGIN_RATE_LIMIT = {
  max: 10,
  timeWindow: '10 minutes',
} as const

export const IP_DAILY_LIMIT = 10
export const IDENTITY_DAILY_LIMIT = 2
