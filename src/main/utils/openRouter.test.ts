import { describe, it, expect } from 'vitest'
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
