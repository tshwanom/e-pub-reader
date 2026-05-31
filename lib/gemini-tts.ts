import { GoogleGenAI } from "@google/genai";

const DEFAULT_GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_GEMINI_TTS_VOICE = "Algenib";
const DEFAULT_PCM_SAMPLE_RATE = 24000;
const DEFAULT_PCM_CHANNELS = 1;
const DEFAULT_PCM_BITS_PER_SAMPLE = 16;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1500;

export const GEMINI_TTS_MODELS = [
  {
    id: "gemini-3.1-flash-tts-preview",
    label: "Gemini 3.1 Flash TTS Preview",
    description: "Best default balance for audiobook-style generation.",
  },
  {
    id: "gemini-2.5-flash-preview-tts",
    label: "Gemini 2.5 Flash Preview TTS",
    description: "Fast preview model for quicker generation passes.",
  },
  {
    id: "gemini-2.5-pro-preview-tts",
    label: "Gemini 2.5 Pro Preview TTS",
    description: "Highest-end preview option when you want more expressive output.",
  },
] as const;

export const GEMINI_TTS_VOICES = [
  { name: "Zephyr", description: "Bright" },
  { name: "Puck", description: "Upbeat" },
  { name: "Charon", description: "Informative" },
  { name: "Kore", description: "Firm" },
  { name: "Fenrir", description: "Excitable" },
  { name: "Leda", description: "Youthful" },
  { name: "Orus", description: "Firm" },
  { name: "Aoede", description: "Breezy" },
  { name: "Callirrhoe", description: "Easy-going" },
  { name: "Autonoe", description: "Bright" },
  { name: "Enceladus", description: "Breathy" },
  { name: "Iapetus", description: "Clear" },
  { name: "Umbriel", description: "Easy-going" },
  { name: "Algieba", description: "Smooth" },
  { name: "Despina", description: "Smooth" },
  { name: "Erinome", description: "Clear" },
  { name: "Algenib", description: "Gravelly" },
  { name: "Rasalgethi", description: "Informative" },
  { name: "Laomedeia", description: "Upbeat" },
  { name: "Achernar", description: "Soft" },
  { name: "Alnilam", description: "Firm" },
  { name: "Schedar", description: "Even" },
  { name: "Gacrux", description: "Mature" },
  { name: "Pulcherrima", description: "Forward" },
  { name: "Achird", description: "Friendly" },
  { name: "Zubenelgenubi", description: "Casual" },
  { name: "Vindemiatrix", description: "Gentle" },
  { name: "Sadachbia", description: "Lively" },
  { name: "Sadaltager", description: "Knowledgeable" },
  { name: "Sulafat", description: "Warm" },
] as const;

export type GeminiTtsModelId = (typeof GEMINI_TTS_MODELS)[number]["id"];
export type GeminiTtsVoiceName = (typeof GEMINI_TTS_VOICES)[number]["name"];

export interface GeminiPcmAudio {
  pcmBuffer: Buffer;
  wavBuffer: Buffer;
  audioMimeType: string;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationMs: number;
}

export interface GeminiSpeechSynthesisOptions {
  transcript: string;
  voiceName: string;
  model?: string | null;
  stylePrompt?: string | null;
  languageCode?: string | null;
  retryAttempts?: number;
  retryDelayMs?: number;
}

const globalTtsState = globalThis as typeof globalThis & {
  __omrTtsApiKeyIndex?: number;
  __omrTtsClientsCache?: Map<string, GoogleGenAI>;
};

const ttsClientsCache =
  globalTtsState.__omrTtsClientsCache
  ?? (globalTtsState.__omrTtsClientsCache = new Map<string, GoogleGenAI>());

export function getGeminiApiKeys(): string[] {
  const keys: string[] = [];

  function addRawKeys(raw: string | undefined) {
    if (!raw) {
      return;
    }
    // Strip leading/trailing double or single quotes
    const cleaned = raw.trim().replace(/^["']|["']$/g, "").trim();
    if (!cleaned) {
      return;
    }

    // Split on commas
    cleaned.split(",").forEach((key) => {
      const trimmed = key.trim().replace(/^["']|["']$/g, "").trim();
      if (trimmed && !keys.includes(trimmed)) {
        keys.push(trimmed);
      }
    });
  }

  // Parse from GEMINI_API_KEYS (plural)
  addRawKeys(process.env.GEMINI_API_KEYS);

  // Parse from GEMINI_API_KEY (singular)
  addRawKeys(process.env.GEMINI_API_KEY);

  // Parse from GOOGLE_API_KEY
  addRawKeys(process.env.GOOGLE_API_KEY);

  return keys;
}

export function getGeminiApiKey(): string | null {
  const keys = getGeminiApiKeys();
  return keys[0] || null;
}

export function isGeminiTtsConfigured() {
  return getGeminiApiKeys().length > 0;
}

export function getDefaultGeminiTtsModel() {
  const configuredModel = process.env.GEMINI_TTS_MODEL?.trim();

  if (configuredModel) {
    return configuredModel;
  }

  return DEFAULT_GEMINI_TTS_MODEL;
}

export function getDefaultGeminiTtsVoice() {
  const configuredVoice = process.env.GEMINI_TTS_DEFAULT_VOICE?.trim();

  if (configuredVoice && isKnownGeminiTtsVoice(configuredVoice)) {
    return configuredVoice;
  }

  return DEFAULT_GEMINI_TTS_VOICE;
}

export function isKnownGeminiTtsVoice(voiceName: string) {
  return GEMINI_TTS_VOICES.some((voice) => voice.name === voiceName);
}

export function getGeminiVoiceOptionName(voiceName: string) {
  return String(voiceName || "")
    .replace(/^Gemini\s+/i, "")
    .trim();
}

export function slugifyGeminiVoiceName(value: string) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function buildGeminiNarrationVoiceSlug(input: {
  voiceName: string;
  model?: string | null;
  languageCode?: string | null;
}) {
  const model = input.model?.trim() || getDefaultGeminiTtsModel();
  const languageCode = input.languageCode?.trim() || "en";
  const voiceName = getGeminiVoiceOptionName(input.voiceName);

  return slugifyGeminiVoiceName(`gemini-${voiceName}-${model}-${languageCode.toLowerCase()}`);
}

export function buildGeminiVoiceProvider(model?: string | null) {
  return `gemini-tts:${model?.trim() || getDefaultGeminiTtsModel()}`;
}

export function getGeminiModelFromProvider(provider?: string | null) {
  const normalizedProvider = provider?.trim() || "";

  if (!normalizedProvider.startsWith("gemini-tts:")) {
    return null;
  }

  return normalizedProvider.slice("gemini-tts:".length) || null;
}

function getGeminiClient(): GoogleGenAI {
  const keys = getGeminiApiKeys();

  if (keys.length === 0) {
    throw new Error(
      "Gemini TTS is not configured. Add GEMINI_API_KEYS, GEMINI_API_KEY, or GOOGLE_API_KEY to the server environment."
    );
  }

  let currentIndex = globalTtsState.__omrTtsApiKeyIndex ?? 0;
  currentIndex = currentIndex % keys.length;
  const activeKey = keys[currentIndex];

  globalTtsState.__omrTtsApiKeyIndex = (currentIndex + 1) % keys.length;

  let client = ttsClientsCache.get(activeKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey: activeKey });
    ttsClientsCache.set(activeKey, client);
  }

  console.log(
    `[gemini-tts] Rotating API Key: Using index ${currentIndex}/${keys.length} (Prefix: ${activeKey.slice(0, 6)}...)`
  );

  return client;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = DEFAULT_RETRY_ATTEMPTS,
  delayMs = DEFAULT_RETRY_DELAY_MS
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`${label} attempt ${attempt} failed: ${message}. Retrying...`);
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}

function buildGeminiAudiobookPrompt(transcript: string, stylePrompt?: string | null) {
  const safeTranscript = transcript.trim();

  if (!safeTranscript) {
    throw new Error("Cannot synthesize Gemini speech from an empty transcript.");
  }

  const directorNotes = stylePrompt?.trim()
    || [
      "Style: Flat affect, minimal pitch variation, dry delivery.",
      "Pace: Natural conversational pace.",
      "Accent: Neutral."
    ].join("\n");

  return [
    "# TASK",
    "Synthesize speech for the transcript below.",
    "Speak only the transcript itself.",
    "Do not read section headings, notes, metadata, or instructions aloud.",
    "",
    "# AUDIO PROFILE: Professional narrator",
    "Professional narrator with Deep, Calm, Intelligent, Certain, Reflective",
    "",
    "# THE SCENE:",
    "A quiet, highly insulated recording studio with close-mic intimacy. The voice is up-close, warm, and clear, with no background noise or artificial echo.",
    "",
    "# DIRECTOR'S NOTES",
    directorNotes,
    "",
    "# TRANSCRIPT",
    safeTranscript,
  ].join("\n");
}

function parseAudioMimeType(mimeType?: string | null) {
  const normalized = mimeType?.trim() || "audio/L16;rate=24000";
  const [typePart, ...parameterParts] = normalized.split(";");
  const parameters = Object.fromEntries(
    parameterParts
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...valueParts] = part.split("=");
        return [key.trim().toLowerCase(), valueParts.join("=").trim()];
      })
  );

  return {
    raw: normalized,
    baseType: typePart.trim().toLowerCase(),
    parameters,
  };
}

function getAudioDurationMs(bufferLength: number, sampleRate: number, channels: number, bitsPerSample: number) {
  const bytesPerFrame = channels * (bitsPerSample / 8);
  const bytesPerSecond = sampleRate * bytesPerFrame;
  return Math.round((bufferLength / bytesPerSecond) * 1000);
}

function createWavBufferFromPcm(
  pcmBuffer: Buffer,
  options: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
  }
) {
  const { sampleRate, channels, bitsPerSample } = options;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function parseWavBuffer(buffer: Buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Invalid WAV data returned by Gemini TTS.");
  }

  let offset = 12;
  let channels = DEFAULT_PCM_CHANNELS;
  let sampleRate = DEFAULT_PCM_SAMPLE_RATE;
  let bitsPerSample = DEFAULT_PCM_BITS_PER_SAMPLE;
  let pcmBuffer: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > buffer.length) {
      break;
    }

    if (chunkId === "fmt ") {
      const audioFormat = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);

      if (audioFormat !== 1) {
        throw new Error(`Unsupported WAV format ${audioFormat}. Only PCM WAV is supported.`);
      }
    }

    if (chunkId === "data") {
      pcmBuffer = buffer.subarray(chunkStart, chunkEnd);
      break;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!pcmBuffer) {
    throw new Error("Gemini WAV payload did not include a data chunk.");
  }

  return {
    pcmBuffer,
    sampleRate,
    channels,
    bitsPerSample,
  };
}

function normalizeGeminiAudioPayload(buffer: Buffer, mimeType?: string | null): GeminiPcmAudio {
  const parsedMimeType = parseAudioMimeType(mimeType);

  if (parsedMimeType.baseType === "audio/wav" || parsedMimeType.baseType === "audio/x-wav") {
    const parsedWav = parseWavBuffer(buffer);

    return {
      pcmBuffer: parsedWav.pcmBuffer,
      wavBuffer: buffer,
      audioMimeType: "audio/wav",
      sampleRate: parsedWav.sampleRate,
      channels: parsedWav.channels,
      bitsPerSample: parsedWav.bitsPerSample,
      durationMs: getAudioDurationMs(
        parsedWav.pcmBuffer.length,
        parsedWav.sampleRate,
        parsedWav.channels,
        parsedWav.bitsPerSample
      ),
    };
  }

  const sampleRate = Number(parsedMimeType.parameters.rate || parsedMimeType.parameters.samplerate)
    || DEFAULT_PCM_SAMPLE_RATE;
  const channels = Number(parsedMimeType.parameters.channels) || DEFAULT_PCM_CHANNELS;
  const bitsPerSample = Number(parsedMimeType.parameters.bits) || DEFAULT_PCM_BITS_PER_SAMPLE;
  const wavBuffer = createWavBufferFromPcm(buffer, {
    sampleRate,
    channels,
    bitsPerSample,
  });

  return {
    pcmBuffer: buffer,
    wavBuffer,
    audioMimeType: "audio/wav",
    sampleRate,
    channels,
    bitsPerSample,
    durationMs: getAudioDurationMs(buffer.length, sampleRate, channels, bitsPerSample),
  };
}

export function mergeGeminiPcmAudio(segments: GeminiPcmAudio[]) {
  if (segments.length === 0) {
    throw new Error("Cannot merge zero Gemini audio segments.");
  }

  const [firstSegment, ...restSegments] = segments;

  for (const segment of restSegments) {
    if (
      segment.sampleRate !== firstSegment.sampleRate
      || segment.channels !== firstSegment.channels
      || segment.bitsPerSample !== firstSegment.bitsPerSample
    ) {
      throw new Error("Gemini audio segments cannot be merged because their PCM formats do not match.");
    }
  }

  const pcmBuffer = Buffer.concat(segments.map((segment) => segment.pcmBuffer));
  const wavBuffer = createWavBufferFromPcm(pcmBuffer, {
    sampleRate: firstSegment.sampleRate,
    channels: firstSegment.channels,
    bitsPerSample: firstSegment.bitsPerSample,
  });

  return {
    pcmBuffer,
    wavBuffer,
    audioMimeType: "audio/wav",
    sampleRate: firstSegment.sampleRate,
    channels: firstSegment.channels,
    bitsPerSample: firstSegment.bitsPerSample,
    durationMs: getAudioDurationMs(
      pcmBuffer.length,
      firstSegment.sampleRate,
      firstSegment.channels,
      firstSegment.bitsPerSample
    ),
  } satisfies GeminiPcmAudio;
}

export async function synthesizeGeminiSpeech(
  options: GeminiSpeechSynthesisOptions
): Promise<GeminiPcmAudio> {
  const prompt = buildGeminiAudiobookPrompt(options.transcript, options.stylePrompt);
  const model = options.model?.trim() || getDefaultGeminiTtsModel();
  const voiceName = options.voiceName?.trim() || getDefaultGeminiTtsVoice();
  const retryAttempts = options.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  return withRetry(
    `Gemini TTS (${voiceName})`,
    async () => {
      const rawLanguage = options.languageCode?.trim();
      const normalizedLanguage = rawLanguage === "en" ? "en-US" : rawLanguage;

      const response = await getGeminiClient().models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            ...(normalizedLanguage ? { languageCode: normalizedLanguage } : {}),
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find(
        (part) => typeof part.inlineData?.data === "string"
      );

      if (!audioPart?.inlineData?.data) {
        throw new Error("Gemini TTS returned no audio payload.");
      }

      return normalizeGeminiAudioPayload(
        Buffer.from(audioPart.inlineData.data, "base64"),
        audioPart.inlineData.mimeType
      );
    },
    retryAttempts,
    retryDelayMs
  );
}