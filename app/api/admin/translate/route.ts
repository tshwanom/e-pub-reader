import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGeminiClient } from '@/lib/gemini-tts';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text, targetLanguage, type } = await req.json();

    if (!text || !targetLanguage) {
      return NextResponse.json({ error: 'Missing text or targetLanguage' }, { status: 400 });
    }

    const client = getGeminiClient();
    
    let systemInstruction = `You are a professional literary translator for "One Man Revolution", a calm, thoughtful platform dedicated to deep truth, philosophy, and poetry.
Translate the text to the target language code: "${targetLanguage}".
- Preserve the exact tone, style, and literary quality of the original text.
- Preserve all line breaks, paragraphs, and markdown styling (like bold, italics, lists, links).
- Do NOT translate code blocks, HTML tags, or place names unless necessary.
- Return ONLY the translation, without any comments, preambles, or explanations.`;

    if (type === 'title') {
      systemInstruction += '\n- This is a title. Keep it concise, punchy, and impactful, matching literary norms in the target language.';
    } else if (type === 'summary') {
      systemInstruction += '\n- This is a summary. Keep it engaging and concise.';
    } else if (type === 'poem') {
      systemInstruction += '\n- This is poetry. Maintain the rhythm, flow, structure, and artistic essence of the lines.';
    }

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: text,
      config: {
        systemInstruction,
        temperature: 0.3,
      }
    });

    const translatedText = response.text?.trim() || '';

    return NextResponse.json({ translation: translatedText });
  } catch (error: any) {
    console.error('[Translate API] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
