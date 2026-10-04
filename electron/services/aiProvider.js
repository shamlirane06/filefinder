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
  async function answerFileQuestion({ question, candidates }) {
    if (!config.apiKey) throw new Error('AI file assistant is not configured.')
    const boundedCandidates = (Array.isArray(candidates) ? candidates : []).slice(0, 8).map((candidate) => ({
      sourceId: candidate.sourceId,
      filename: String(candidate.filename || '').slice(0, 240),
      extension: String(candidate.extension || '').slice(0, 20),
      location: String(candidate.location || '').slice(0, 300),
      fileType: String(candidate.fileType || '').slice(0, 80),
      size: Number.isFinite(candidate.size) ? candidate.size : null,
      modifiedAt: String(candidate.modifiedAt || '').slice(0, 40),
      documentType: String(candidate.documentType || '').slice(0, 120),
      title: String(candidate.title || '').slice(0, 240),
      description: String(candidate.description || '').slice(0, 600),
      keywords: Array.isArray(candidate.keywords) ? candidate.keywords.slice(0, 20).map((item) => String(item).slice(0, 80)) : [],
      extractedText: String(candidate.extractedText || '').slice(0, 1600),
    }))
    const prompt = `Answer the user's question using only the candidate file records below. Do not guess, infer personal facts, or claim facts absent from the records. If the records do not answer the question, use an empty answer. Cite only sourceId values provided below. Return JSON exactly as {"answer":"...","sourceIds":[number]}. Keep the answer concise. Question: ${JSON.stringify(String(question || '').slice(0, 600))}\nCandidate records: ${JSON.stringify(boundedCandidates)}`
    let response
    try {
      response = await fetchImpl(config.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(7000),
        body: JSON.stringify({
          model: config.model,
          store: false,
          max_output_tokens: 500,
          input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
          text: { format: { type: 'json_object' } },
        }),
      })
    } catch {
      throw new Error('The assistant could not reach the AI provider.')
    }
    if (!response.ok) throw new Error(`The AI provider returned HTTP ${response.status}.`)
    return parseOutput(await response.json())
  }

  async function suggestOrganization(metadata) {
    if (!config.apiKey) throw new Error('AI organization suggestions are not configured.')
    const prompt = `Suggest a folder category for this file using only the supplied metadata. Return JSON exactly as {"category":"...","subcategory":"...","reason":"..."}. Use short folder names without slashes in either category field and a concise reason. Do not suggest moving or renaming the file. Metadata: ${JSON.stringify({
      filename: String(metadata.filename || '').slice(0, 240),
      extension: String(metadata.extension || '').slice(0, 20),
      fileType: String(metadata.fileType || '').slice(0, 80),
      currentFolder: String(metadata.currentFolder || '').slice(0, 240),
      documentType: String(metadata.documentType || '').slice(0, 120),
      title: String(metadata.title || '').slice(0, 240),
      description: String(metadata.description || '').slice(0, 600),
      keywords: Array.isArray(metadata.keywords) ? metadata.keywords.slice(0, 30).map((item) => String(item).slice(0, 80)) : [],
    })}`
    let response
    try {
      response = await fetchImpl(config.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          model: config.model,
          store: false,
          max_output_tokens: 250,
          input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
          text: { format: { type: 'json_object' } },
        }),
      })
    } catch {
      throw new Error('AI organization suggestion request failed or timed out.')
    }
    if (!response.ok) throw new Error(`AI organization suggestion failed (HTTP ${response.status}).`)
    return parseOutput(await response.json())
  }

  async function interpretQuery(query) {
    if (!config.apiKey) throw new Error('AI query understanding is not configured.')
    const prompt = `Convert the user's file search query into concise JSON with exactly these fields: {"keywords": string[], "fileTypes": string[], "dateFilter": string, "folder": string|null}. Keep useful subject/content words as keywords. fileTypes may contain only PDF, Image, Video, Word Document, Text, Markdown, PowerPoint, Excel, CSV, or Rich Text. dateFilter may be any, today, last_week, last_month, last_year, or YYYY-MM. Use an empty string for no date filter and null for no folder. Do not infer a folder name that the user did not state. Do not answer the request; interpret it only. Query: ${JSON.stringify(String(query).slice(0, 500))}`
    let response
    try {
      response = await fetchImpl(config.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          model: config.model,
          store: false,
          max_output_tokens: 300,
          input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
          text: { format: { type: 'json_object' } },
        }),
      })
    } catch {
      throw new Error('AI query understanding request failed or timed out.')
    }
    if (!response.ok) throw new Error(`AI query understanding failed (HTTP ${response.status}).`)
    return parseOutput(await response.json())
  }

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
    answerFileQuestion,
    suggestOrganization,
    interpretQuery,
    analyzeImage: (input) => analyze({ ...input, kind: 'image' }),
    analyzeDocument: (input) => analyze({ ...input, kind: 'document' }),
  }
}
