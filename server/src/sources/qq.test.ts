import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQQSource } from './qq.js'

const noCookie = async () => null

const TRACK = {
  mid: '0004jPDk2eB2dt',
  name: '起风了',
  singer: [{ name: '买辣椒也用券' }],
  album: { mid: '003j3NMw1ZBpsv', name: '起风了 (旧版)' },
  interval: 312,
  file: { media_mid: '000VlmgY2Xlput' },
  pay: { pay_play: 1 },
}

/** QQ 的搜索、详情、取址都打同一个地址，只能按请求体里的 module 分派 */
function stubFetch(vkeyItems: Array<{ filename: string; purl: string; result: number }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: unknown, init?: { body?: string }) => {
      const payload = JSON.parse(init?.body ?? '{}') as Record<string, { module?: string }>
      const moduleName = payload.req?.module ?? payload.req_0?.module
      if (moduleName === 'music.pf_song_detail_svr') {
        return new Response(JSON.stringify({ req: { code: 0, data: { track_info: TRACK } } }))
      }
      if (moduleName === 'vkey.GetVkeyServer') {
        return new Response(
          JSON.stringify({
            req_0: {
              code: 0,
              data: { midurlinfo: vkeyItems, sip: ['http://ws.stream.qqmusic.qq.com/'] },
            },
          }),
        )
      }
      return new Response(
        JSON.stringify({
          req: { code: 0, data: { meta: { sum: 1 }, body: { song: { list: [TRACK] } } } },
        }),
      )
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('QQ 搜索归一化', () => {
  it('拼出封面地址、秒转毫秒、标出付费', async () => {
    stubFetch([])
    const page = await createQQSource(noCookie).search('起风了', 1, 20)
    expect(page.songs[0]).toMatchObject({
      source: 'qq',
      platformId: '0004jPDk2eB2dt',
      title: '起风了',
      artist: '买辣椒也用券',
      durationMs: 312_000,
      coverUrl: 'https://y.qq.com/music/photo_new/T002R300x300M000003j3NMw1ZBpsv.jpg',
      vip: true,
    })
  })
})

describe('QQ 取址的音质偏好', () => {
  it('下载优先 320k，并拼上 sip 前缀', async () => {
    stubFetch([
      { filename: 'F000000VlmgY2Xlput.flac', purl: '', result: 104_003 },
      { filename: 'M800000VlmgY2Xlput.mp3', purl: 'M800x.mp3?vkey=A', result: 0 },
      { filename: 'M500000VlmgY2Xlput.mp3', purl: 'M500x.mp3?vkey=B', result: 0 },
    ])
    const target = await createQQSource(noCookie).downloadTarget('0004jPDk2eB2dt')
    expect(target).toMatchObject({
      url: 'http://ws.stream.qqmusic.qq.com/M800x.mp3?vkey=A',
      bitrateKbps: 320,
      format: 'mp3',
      preview: false,
    })
  })

  it('试听优先低码率，不会挑到 320k', async () => {
    stubFetch([
      { filename: 'M500000VlmgY2Xlput.mp3', purl: 'M500x.mp3', result: 0 },
      { filename: 'C400000VlmgY2Xlput.m4a', purl: 'C400x.m4a', result: 0 },
    ])
    const target = await createQQSource(noCookie).streamTarget('0004jPDk2eB2dt')
    expect(target?.bitrateKbps).toBe(128)
    expect(target?.preview).toBe(false)
  })

  it('只剩 RS02 时按试听片段返回', async () => {
    stubFetch([
      { filename: 'M500000VlmgY2Xlput.mp3', purl: '', result: 104_003 },
      { filename: 'C400000VlmgY2Xlput.m4a', purl: '', result: 104_003 },
      { filename: 'RS02000VlmgY2Xlput.mp3', purl: 'RS02x.mp3', result: 0 },
    ])
    const target = await createQQSource(noCookie).streamTarget('0004jPDk2eB2dt')
    expect(target?.preview).toBe(true)
  })

  it('一个地址都拿不到时返回 null', async () => {
    stubFetch([{ filename: 'M500000VlmgY2Xlput.mp3', purl: '', result: 104_003 }])
    expect(await createQQSource(noCookie).downloadTarget('0004jPDk2eB2dt')).toBeNull()
  })
})

describe('QQ 风控识别', () => {
  it('子请求 code 非 0 时抛错，不当成没搜到', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ req: { code: 2001, data: { body: { song: { list: [] } } } } })),
      ),
    )
    await expect(createQQSource(noCookie).search('周杰伦', 1, 3)).rejects.toThrow(/code=2001/)
  })
})
