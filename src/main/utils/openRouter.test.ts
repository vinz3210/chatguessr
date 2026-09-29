import { describe, it, expect, vi } from 'vitest'
import axios from 'axios'
import { AxiosError, AxiosHeaders } from 'axios'
import * as OpenRouter from './openRouter'

describe('normalizeHeading', () => {
  it('wraps panned headings into 0–359', () => {
    expect(OpenRouter.normalizeHeading(0)).toBe(0)
    expect(OpenRouter.normalizeHeading(-90)).toBe(270)
    expect(OpenRouter.normalizeHeading(725)).toBe(5)
    expect(OpenRouter.normalizeHeading(359.6)).toBe(0)
  })
})

describe('headingToCompassPoint', () => {
  it('rounds to the nearest of eight points', () => {
    expect(OpenRouter.headingToCompassPoint(0)).toBe('north')
    expect(OpenRouter.headingToCompassPoint(22)).toBe('north')
    expect(OpenRouter.headingToCompassPoint(23)).toBe('north-east')
    expect(OpenRouter.headingToCompassPoint(180)).toBe('south')
    expect(OpenRouter.headingToCompassPoint(-45)).toBe('north-west')
    expect(OpenRouter.headingToCompassPoint(350)).toBe('north')
  })
})

describe('describeView', () => {
  it('mentions the tilt only when it is noticeable', () => {
    expect(OpenRouter.describeView(47.4, 3)).toBe('The camera faces 47° (north-east).')
    expect(OpenRouter.describeView(-90, -20)).toBe(
      'The camera faces 270° (west). It is tilted 20° down.'
    )
    expect(OpenRouter.describeView(180, 15)).toBe(
      'The camera faces 180° (south). It is tilted 15° up.'
    )
  })
})

describe('parseCompletion', () => {
  it('returns the message text without markdown', () => {
    const data = {
      choices: [{ message: { content: '## Road\n**Yellow** centre line.\n\n\n\nRed soil.' } }]
    }
    expect(OpenRouter.parseCompletion(data)).toBe('Road\nYellow centre line.\n\nRed soil.')
  })

  it('joins content given as parts', () => {
    const data = {
      choices: [
        { message: { content: [{ type: 'text', text: 'Left-hand ' }, { text: 'traffic.' }] } }
      ]
    }
    expect(OpenRouter.parseCompletion(data)).toBe('Left-hand traffic.')
  })

  it('surfaces errors reported inside a 200 response', () => {
    expect(() => OpenRouter.parseCompletion({ error: { message: 'Model is down' } })).toThrow(
      'OpenRouter: Model is down'
    )
    expect(() =>
      OpenRouter.parseCompletion({ choices: [{ error: { message: 'Provider timed out' } }] })
    ).toThrow('OpenRouter: Provider timed out')
  })

  it('rejects an empty answer', () => {
    expect(() => OpenRouter.parseCompletion({ choices: [{ message: { content: '  ' } }] })).toThrow(
      'empty description'
    )
    expect(() => OpenRouter.parseCompletion({})).toThrow('no answer')
  })
})

describe('describePanorama', () => {
  it('sends the first description through a second text-only formatting request', async () => {
    const post = vi.spyOn(axios, 'post')
    post
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'A paved road and red soil.' } }] } })
      .mockResolvedValueOnce({
        data: { choices: [{ message: { content: '- Paved road\n- Red soil' } }] }
      })

    try {
      const result = await OpenRouter.describePanorama('test-key', 'test-model', {
        image: 'data:image/jpeg;base64,AAAA',
        heading: 90,
        pitch: 0
      })

      expect(result.text).toBe('A paved road and red soil.')
      expect(result.summary).toBe('- Paved road\n- Red soil')
      expect(post).toHaveBeenCalledTimes(2)
      const secondMessages = (post.mock.calls[1][1] as { messages: { content: string }[] }).messages
      expect(secondMessages[0].content).toContain('bullet points')
      expect(secondMessages[1]).toEqual({ role: 'user', content: result.text })
    } finally {
      post.mockRestore()
    }
  })
})

describe('describeRequestError', () => {
  const httpError = (status: number, data: unknown) =>
    new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
      status,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data
    })

  it('explains the common failures', () => {
    expect(OpenRouter.describeRequestError(httpError(401, {}))).toBe(
      'OpenRouter rejected the API key.'
    )
    expect(OpenRouter.describeRequestError(httpError(402, {}))).toBe(
      'Your OpenRouter account is out of credits.'
    )
    expect(
      OpenRouter.describeRequestError(
        httpError(400, { error: { message: 'foo is not a valid model ID' } })
      )
    ).toBe('OpenRouter: foo is not a valid model ID')
    expect(OpenRouter.describeRequestError(httpError(503, 'Service Unavailable'))).toBe(
      'OpenRouter answered with HTTP 503.'
    )
    expect(OpenRouter.describeRequestError(new AxiosError('timeout', 'ECONNABORTED'))).toBe(
      'OpenRouter took too long to answer.'
    )
  })
})

describe('pickVisionModels', () => {
  it('keeps models that read images and answer in text', () => {
    const models = [
      {
        id: 'google/gemini-3.8-flash',
        name: 'Google: Gemini 3.8 Flash',
        architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }
      },
      {
        id: 'google/gemini-3.8-flash:batch',
        name: 'Google: Gemini 3.8 Flash (batch)',
        architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }
      },
      {
        id: 'some/text-only',
        name: 'Text only',
        architecture: { input_modalities: ['text'], output_modalities: ['text'] }
      },
      {
        id: 'some/image-generator',
        name: 'Image generator',
        architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] }
      },
      { id: 'some/unknown' }
    ]
    expect(OpenRouter.pickVisionModels(models)).toEqual([
      { id: 'google/gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash' }
    ])
  })
})

describe('splitForSpeech', () => {
  it('starts with the first sentence alone, then groups the rest', () => {
    const text =
      'Facing north-east. A road runs ahead. It has a yellow line.\n\nPoles stand on the right!'
    expect(OpenRouter.splitForSpeech(text)).toEqual([
      'Facing north-east.',
      'A road runs ahead. It has a yellow line. Poles stand on the right!'
    ])
  })

  it('keeps groups short enough to come back quickly', () => {
    const sentence = 'This sentence is about sixty characters long, give or take a few.'
    const segments = OpenRouter.splitForSpeech(Array(12).fill(sentence).join(' '))
    expect(segments[0]).toBe(sentence)
    expect(segments.length).toBeGreaterThan(3)
    for (const segment of segments) expect(segment.length).toBeLessThanOrEqual(280)
    expect(segments.join(' ')).toBe(Array(12).fill(sentence).join(' '))
  })

  it('has nothing to say for empty text', () => {
    expect(OpenRouter.splitForSpeech('  \n ')).toEqual([])
  })
})

describe('pickSpeechModels', () => {
  it('keeps speech models with their voices', () => {
    const speech = { input_modalities: ['text'], output_modalities: ['speech'] }
    expect(
      OpenRouter.pickSpeechModels([
        {
          id: 'hexgrad/kokoro-82m',
          name: 'Kokoro',
          architecture: speech,
          supported_voices: ['af_heart']
        },
        { id: 'fish-audio/s1', name: 'Fish', architecture: speech, supported_voices: null },
        { id: 'google/gemini-3.8-flash', architecture: { output_modalities: ['text'] } }
      ])
    ).toEqual([
      { id: 'hexgrad/kokoro-82m', name: 'Kokoro', voices: ['af_heart'] },
      { id: 'fish-audio/s1', name: 'Fish', voices: [] }
    ])
  })
})

describe('describeRequestError on audio requests', () => {
  it('reads the error message out of a raw byte body', () => {
    const body = Buffer.from(JSON.stringify({ error: { message: 'Voice not found' } }))
    const err = new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 400,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: body
    })
    expect(OpenRouter.describeRequestError(err)).toBe('OpenRouter: Voice not found')
  })
})

describe('splitForSpeech group sizes', () => {
  it('grows each group so it is ready before the shorter one ahead finishes playing', () => {
    const sentence = 'This sentence is about sixty characters long, give or take a few.' // 65
    const lengths = OpenRouter.splitForSpeech(Array(12).fill(sentence).join(' ')).map(
      (segment) => segment.length
    )
    // Alone, then up to 100, 150, 225 and 280 characters.
    expect(lengths).toEqual([65, 65, 131, 197, 263, 65])
  })
})

describe('OpenRouter speech formats', () => {
  it('requests PCM for Gemini TTS and MP3 for other speech models', () => {
    expect(OpenRouter.speechResponseFormat('google/gemini-3.8-flash-tts')).toBe('pcm')
    expect(OpenRouter.speechResponseFormat('google/gemini-3.1-flash-tts-preview')).toBe('pcm')
    expect(OpenRouter.speechResponseFormat('openai/gpt-4o-mini-tts')).toBe('mp3')
  })

  it('converts signed 16-bit little-endian PCM into playable samples', () => {
    expect(Array.from(OpenRouter.decodePcm16(Uint8Array.from([0, 128, 0, 0, 255, 127])))).toEqual([
      -1,
      0,
      32767 / 32768
    ])
    expect(() => OpenRouter.decodePcm16(Uint8Array.from([1]))).toThrow('incomplete PCM')
  })

  it('returns a PCM chunk for Gemini speech', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: Uint8Array.from([0, 0, 255, 127]).buffer,
      headers: { 'content-type': 'audio/pcm' }
    })
    try {
      const chunk = await OpenRouter.synthesizeSpeech(
        'test-key',
        'google/gemini-3.8-flash-tts',
        'Kore',
        'Hello'
      )
      expect((post.mock.calls[0][1] as { response_format: string }).response_format).toBe('pcm')
      expect(chunk).toEqual({
        kind: 'pcm',
        samples: Float32Array.from([0, 32767 / 32768]),
        sampleRate: 24_000
      })
    } finally {
      post.mockRestore()
    }
  })
})

describe('chatMessages', () => {
  const view = { image: 'data:image/jpeg;base64,AAAA', heading: 47, pitch: 0 }

  it('shows the image again, then the description, the chat so far and the question', () => {
    const messages = OpenRouter.chatMessages(
      view,
      'A road runs north-east.',
      [
        { role: 'user', content: 'What colour is the line?' },
        { role: 'assistant', content: 'Yellow.' }
      ],
      'Any bollards?'
    ) as any[]
    expect(messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      'assistant',
      'user'
    ])
    expect(messages[0].content).toContain('Never name, guess or hint at the country')
    expect(messages[1].content[0].text).toBe('The camera faces 47° (north-east).')
    expect(messages[1].content[1].image_url.url).toBe(view.image)
    expect(messages[2].content).toBe('A road runs north-east.')
    // The question goes out with a short reminder of the rules; history keeps it clean.
    expect(messages.at(-1).content).toMatch(/^Any bollards\?\n\n\(Answer from the image only/)
  })

  it('keeps only the latest turns of a long chat, starting with a question', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i}`
    }))
    const messages = OpenRouter.chatMessages(view, 'Description.', history, 'Last?') as any[]
    const kept = messages.slice(3, -1)
    expect(kept).toHaveLength(20)
    expect(kept[0]).toEqual({ role: 'user', content: 'message 10' })
  })
})
