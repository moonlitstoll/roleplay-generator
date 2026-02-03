import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const { input, language, count, apiKey, model: modelName, accentMode = 'all-standard' } = await req.json();

    console.log('[API] Request received:', { input, language, count, modelName });

    const finalApiKey = apiKey || process.env.GEMINI_API_KEY;

    if (!finalApiKey || finalApiKey === 'YOUR_GEMINI_API_KEY') {
      return NextResponse.json({
        error: 'Gemini API Key is currently missing.',
        details: 'Please enter a valid API Key in the settings panel.'
      }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(finalApiKey);
    const selectedModel = modelName || 'gemini-2.5-flash';

    const schema: any = {
      description: "Conversation script with speaker info",
      type: SchemaType.OBJECT,
      properties: {
        speakers: {
          type: SchemaType.OBJECT,
          properties: {
            A: {
              type: SchemaType.OBJECT,
              properties: {
                gender: { type: SchemaType.STRING, enum: ["male", "female"], description: "Gender of speaker A" }
              },
              required: ["gender"]
            },
            B: {
              type: SchemaType.OBJECT,
              properties: {
                gender: { type: SchemaType.STRING, enum: ["male", "female"], description: "Gender of speaker B" }
              },
              required: ["gender"]
            }
          },
          required: ["A", "B"]
        },
        script: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              speaker: { type: SchemaType.STRING, description: "Speaker identifier (A or B)" },
              text: { type: SchemaType.STRING, description: "The spoken text in target language" },
              translation: { type: SchemaType.STRING, description: "Korean translation" },
              grammar_patterns: {
                type: SchemaType.STRING,
                description: "Key grammar/patterns used (in Korean only). No English."
              },
              word_analysis: {
                type: SchemaType.STRING,
                description: "Sequential breakdown of words with Korean meanings only. No English. Format: 'word: meaning, word: meaning...'"
              },
            },
            required: ["speaker", "text", "translation", "grammar_patterns", "word_analysis"],
          }
        }
      },
      required: ["speakers", "script"]
    };

    const model = genAI.getGenerativeModel({
      model: selectedModel,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const isInputEmpty = !input || input.trim() === '';
    const promptInput = isInputEmpty ? "Any interesting daily life or professional roleplay scenario" : input;


    const isSingleReaderMode = count === 0;

    const baseInstruction = isSingleReaderMode
      ? `
          VERBATIM ANALYSIS MODE ACTIVATED:
          - DO NOT generate a roleplay or conversation.
          - DO NOT change or "fix" the input text. Use the user's "Input" EXACTLY as it is.
          - SEGMENTATION STRATEGY:
            1. Split the input text into INDIVIDUAL sentences as much as possible for granular analysis.
            2. ONLY group sentences together if they are very short or tightly connected semantic units (e.g., "Oh really? I didn't know that.").
            3. Prioritize detailed "word_analysis" for each segment.
          - Assign all segments to Speaker "A".
          - Provide detailed Korean translation, grammar_patterns, and word_analysis for each segment.
          - If the input is empty, generate a 1-line self-introduction as Speaker A.
        `
      : `
          Generate exactly ${count * 2} lines of conversation (alternating between speaker A and B).
          RANDOM GENERATION:
          ${isInputEmpty ? "Since the input is empty, pick a random and engaging scenario (e.g., ordering food, job interview, checking into a hotel, meeting a friend, asking for directions)." : "Focus on the provided input."}
          
          INPUT HANDLING STRATEGY:
          1. **If Input is a Topic (e.g. 'Coffee Shop')**: Create a vivid, realistic situational drama.
          2. **If Input is Vocabulary/Sentence**: Create a coherent dialogue that NATURALLY uses these words.
          
          CRITICAL INSTRUCTION - NATURALNESS PRIORITY:
          - **"Native-Level Polish"**: Even if the user's input contains awkward or grammatically incorrect target language, YOU MUST FIX IT.
          - **Upgrade** the expressions to what a real native speaker would say in that situation.
          - Usage of the input words must be natural, not forced.
          
          GENDER ASSIGNMENT:
          - Assign logical genders to Speakers A and B based on the scenario.
      `;

    const prompt = `
      You are an expert language conversation generator.
      Create a roleplay script based on the following:
      Input (Topic/Word/Scenario): "${promptInput}"
      Target Language: ${language}
      Accent/Dialect: General
      Reference Language: Korean
      
      ${baseInstruction}
      
      KOREAN-ONLY EXPLANATIONS:
      - All grammar explanations [grammar_patterns] MUST be in Korean.
      - All word analyses [word_analysis] MUST be in Korean.
      - DO NOT use English explanations at all.

      FORMATTING RULES (STRICT):
      
      1. [grammar_patterns]:
         - Format: "Pattern | Definition and nuance"
         - Example: "be worth -ing | ~할 가치가 있다. 노력이나 시간을 들일 만한 가치가 있는 일을 추천할 때 사용."
         - Use NEWLINES between patterns.
         
      2. [word_analysis]:
         - Format: "Word/Phrase | Meaning and explanation"
         - STRICT REQUIREMENT: Output EACH item on a NEW LINE.
         - Do NOT put multiple items on the same line.
         - Example Layout:
           Word1 | Definition1
           Word2 | Definition2
           Word3 | Definition3
         - Analyze meaningful chunks, NOT just single words.
         - GROUP idioms and phrases (e.g., "get up", "in front of").
         - Explain functional words (like 'it' as placeholder, 'because' as conjunction) clearly.

      DIALECT INSTRUCTIONS (Vietnamese):
      - Use standard vocabulary that works for both regions if possible.
      
      Ensure the analysis is detailed yet concise, following exactly the structure provided above.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const data = JSON.parse(text);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[API] Error generating script:', error);
    return NextResponse.json({
      error: 'Failed to generate script',
      details: error.message
    }, { status: 500 });
  }
}
