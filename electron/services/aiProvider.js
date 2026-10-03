import path from 'path'

const DEFAULT_MODEL = 'gpt-4o-mini'
const MAX_OUTPUT_TEXT = 12000

export function getAiProviderConfig(env = process.env) {
  const apiKey = env.FILEFINDER_AI_API_KEY?.trim() || ''
  const model = env.FILEFINDER_AI_MODEL?.trim() || DEFAULT_MODEL
  return {
    configured: Boolean(apiKey),
    provider: 'OpenAI Responses API',
    model,
    apiKey,
    endpoint: (env.FILEFINDER_AI_ENDPOINT?.trim() || 'https://api.openai.com/v1/responses'),
  }
}

function parseOutput(response) {
  const text = response.output_text || response.output
    ?.flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text)
    .join('\n') || ''
  if (!text || text.length > MAX_OUTPUT_TEXT) throw new Error('The AI response was empty or too large.')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('The AI provider returned an unreadable analysis.')
  }
}

function analysisPrompt(filename, kind) {
  return `Analyze this ${kind} file named "${path.basename(filename)}" for local search. Return JSON only with fields: documentType (short string), title (short string or empty), keywords (array of short strings), extractedText (only visible/selectable text useful for finding this file; do not infer unreadable text), description (one concise factual sentence), entities (array of visible names/organizations/subjects, avoid guessing), category (short category). Do not expose or repeat sensitive identifiers unless they are essential visible document text. Be accurate and use empty values when uncertain.`
}

export function createOpenAiProvider({ config = getAiProviderConfig(), fetchImpl = fetch } = {}) {
  async function analyze({ filename, kind, bytes, mimeType, extractedText }) {
    if (!config.apiKey) throw new Error('AI is not configured. Set FILEFINDER_AI_API_KEY and restart FileFinder AI.')
    const base64 = Buffer.from(bytes).toString('base64')
    const content = [{ type: 'input_text', text: analysisPrompt(filename, kind) }]
    if (kind === 'image') {
      content.push({
        type: 'input_image',
        image_url: `data:${mimeType};base64,${base64}`,
        detail: 'high',
      })
    } else if (typeof extractedText === 'string' && extractedText) {
      content.push({
        type: 'input_text',
        text: `Selectable text extracted locally from the PDF follows. Analyze it for document type, title, keywords, entities and a concise description. Extract only text actually present.\n\n${extractedText}`,
      })
    } else {
      content.push({
        type: 'input_file',
        filename: path.basename(filename),
        file_data: `data:application/pdf;base64,${base64}`,
      })
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response
      try {
        response = await fetchImpl(config.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            store: false,
            max_output_tokens: 1600,
            input: [{ role: 'user', content }],
            text: { format: { type: 'json_object' } },
          }),
        })
      } catch {
        throw new Error('Could not reach the AI provider. Check your network connection.')
      }
      if (response.ok) return parseOutput(await response.json())
      if (response.status === 429 && attempt < 2) {
        const retrySeconds = Number(response.headers?.get?.('retry-after'))
        await new Promise((resolve) => setTimeout(resolve, Math.min(Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : 1200, 5000)))
        continue
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('The AI provider rejected the API key. Check FILEFINDER_AI_API_KEY.')
      }
      if (response.status === 429) throw new Error('The AI provider is rate limiting requests. Try again later.')
      if (response.status >= 500) throw new Error('The AI provider is temporarily unavailable. Try again later.')
      throw new Error(`The AI provider rejected this file (HTTP ${response.status}).`)
    }
    throw new Error('The AI provider is rate limiting requests. Try again later.')
  }

  return {
    config: { configured: Boolean(config.apiKey), provider: config.provider, model: config.model },
    analyzeImage: (input) => analyze({ ...input, kind: 'image' }),
    analyzeDocument: (input) => analyze({ ...input, kind: 'document' }),
  }
}
