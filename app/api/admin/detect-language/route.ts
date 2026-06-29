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

    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid text' }, { status: 400 });
    }

    const client = getGeminiClient();

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze the following text and detect its primary language. Return one of these exact codes: 'en', 'es', 'fr', or 'ar'.
Text to analyze:
"""
${text.slice(0, 1500)}
"""`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            language: {
              type: 'STRING',
              description: "The 2-letter language code. Must be one of: 'en', 'es', 'fr', 'ar'.",
            },
          },
          required: ["language"],
        },
      },
    });

    const responseText = response.text || '{}';
    const result = JSON.parse(responseText);
    const language = result.language?.trim().toLowerCase() || 'en';

    // Validate against our supported set
    const supported = ['en', 'es', 'fr', 'ar'];
    const finalLanguage = supported.includes(language) ? language : 'en';

    return NextResponse.json({ language: finalLanguage });
  } catch (error: any) {
    console.error('[Detect Language API] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
