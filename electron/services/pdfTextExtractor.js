import { inflateSync } from 'zlib'

function unescapePdfString(value) {
  return value.replace(/\\([nrtbf()\\])/g, (_match, escaped) => ({
    n: '\n', r: '\r', t: '\t', b: '\b', f: '\f',
    '(': '(', ')': ')', '\\': '\\',
  })[escaped] ?? escaped).replace(/\\([0-7]{1,3})/g, (_match, octal) =>
    String.fromCharCode(parseInt(octal, 8)))
}

function decodeHex(hex) {
  const bytes = Buffer.from(hex.replace(/\s/g, ''), 'hex')
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = ''
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      text += String.fromCharCode(bytes.readUInt16BE(index))
    }
    return text
  }
  return bytes.toString('latin1')
}

function collectTextOperators(stream) {
  const output = []
  const arrays = stream.matchAll(/\[((?:[^\]]|\\.)*)\]\s*TJ/g)
  for (const array of arrays) {
    for (const match of array[1].matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9a-f\s]+)>/gi)) {
      output.push(match[1] != null ? unescapePdfString(match[1]) : decodeHex(match[2]))
    }
  }
  for (const match of stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g)) {
    output.push(unescapePdfString(match[1]))
  }
  for (const match of stream.matchAll(/<([0-9a-f\s]+)>\s*Tj/gi)) {
    output.push(decodeHex(match[1]))
  }
  return output
}

/** Best-effort local extraction for ordinary PDF text streams; empty means use the vision/PDF provider path. */
export function extractSelectablePdfText(pdfBytes, maxCharacters = 30000) {
  const source = Buffer.from(pdfBytes).toString('latin1')
  const extracted = []
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let streamMatch
  while ((streamMatch = streamPattern.exec(source))) {
    let stream = Buffer.from(streamMatch[1], 'latin1')
    const dictionary = source.slice(Math.max(0, streamMatch.index - 500), streamMatch.index)
    if (/\/FlateDecode\b/.test(dictionary)) {
      try {
        stream = inflateSync(stream)
      } catch {
        continue
      }
    } else if (/\/Filter\b/.test(dictionary)) {
      continue
    }
    const text = stream.toString('latin1')
    if (!/\bBT\b/.test(text) || !/(?:Tj|TJ|['"])/.test(text)) continue
    extracted.push(...collectTextOperators(text))
    if (extracted.join(' ').length >= maxCharacters) break
  }
  return extracted.join(' ').replace(/\s+/g, ' ').trim().slice(0, maxCharacters)
}
