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

              word_analysis: {
                type: SchemaType.STRING,
                description: "Sequential word-by-word analysis. Format per line: '• word | meaning | grammar_role'. All in Korean. No English."
              },
            },
            required: ["speaker", "text", "translation", "word_analysis"],
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

    // ------------------------------------------------------------------
    // DIVERSE TOPIC GENERATION (Native Contexts)
    // ------------------------------------------------------------------
    const getRandomTopic = () => {
      const topics = [
        // daily life
        "Returning a defective item at a store. Real native expressions for complaints.",
        "Complaining about noise to a neighbor politely but firmly.",
        "Asking for a refund for a late delivery from customer service.",
        "Negotiating rent with a landlord using logical arguments.",
        "Calling a plumber for a leak and describing the situation precisely.",
        "Explaining a complex coffee order with many customizations.",
        "Asking for a different table at a restaurant because of a draft.",
        "Finding a lost item at a hotel front desk.",
        "Asking for directions in a complex subway station to a specific exit.",
        "Recovering a towed car from the impound lot.",

        // work / professional
        "Negotiating a salary increase during an annual review.",
        "Explaining a mistake to a boss without making excuses.",
        "Leading a project meeting kickoff and setting expectations.",
        "Giving constructive feedback to a colleague about their performance.",
        "Asking for time off for a family emergency.",
        "Pitching a new idea to a skeptical client using data.",
        "Handling an angry customer on the phone professionally.",
        "Networking at a professional conference and starting conversations.",
        "Quitting a job respectfully and discussing the transition.",
        "Explaining a gap in a resume during a job interview.",

        // relationships / emotional
        "Confessing feelings to a crush in a natural way.",
        "Breaking up with someone gently and clearly.",
        "Apologizing to a friend for forgetting a major event.",
        "Setting boundaries with a pushy friend or family member.",
        "Comforting a friend who is going through a hard time.",
        "Discussing future plans and goals with a partner.",
        "Confronting a partner about spending habits calmly.",
        "Asking a friend to pay back money they borrowed.",
        "Declining an invitation without sounding rude.",
        "Reconnecting with an old friend after a long time.",

        // travel / emergencies
        "Reporting a theft to the local police in a foreign country.",
        "Explaining symptoms to a doctor or pharmacist.",
        "Missing a connecting flight and negotiating a voucher.",
        "Dealing with a lost passport at the embassy.",
        "Trying to check in early at a hotel when exhausted.",
        "Asking locals for hidden gem recommendations (not touristy).",
        "Renting a car and understanding the insurance terms.",
        "Disputing a taxi fare that seems too high.",
        "Buying specific medicine at a pharmacy for an allergy.",
        "Ordering street food with specific dietary needs (allergy/vegan)."
      ];
      return topics[Math.floor(Math.random() * topics.length)];
    };

    const promptInput = isInputEmpty ? getRandomTopic() : input;


    const isSingleReaderMode = count === 0;

    const baseInstruction = isSingleReaderMode
      ? `
          VERBATIM ANALYSIS MODE ACTIVATED:
          - DO NOT generate a roleplay or conversation.
          - DO NOT change or "fix" the input text. Use the user's "Input" EXACTLY as it is.
          - SEGMENTATION STRATEGY:
            1. Split the input text into INDIVIDUAL sentences as much as possible for granular analysis.
            2. ONLY group sentences together if they are very short or tightly connected semantic units.
            3. Prioritize detailed "word_analysis" for each segment.
          - Assign all segments to Speaker "A".
          - Provide detailed Korean translation and word_analysis for each segment.
        `
      : `
          Generate exactly ${count * 2} lines of conversation (alternating between speaker A and B).
          SCENARIO: "${promptInput}"
          
          CRITICAL INSTRUCTION - NATURALNESS PRIORITY:
          - **"Native-Level Polish"**: Fix any awkward or incorrect language. Upgrade it to real-world native expressions.
          - **Topic fidelity**: Stay very close to the specific nuances of the scenario.
          - **Realism**: Include hesitation markers (e.g., "uh", "well"), slang, or idioms where appropriate.
          
          GENDER ASSIGNMENT:
          - Assign logical genders to Speakers A and B based on the scenario.
      `;

    const prompt = `
      You are an expert language conversation generator.
      Create a roleplay script based on the following:
      Input Context: "${promptInput}"
      Target Language: ${language}
      Accent/Dialect: General
      Reference Language: Korean
      
      ${baseInstruction}
      
      KOREAN-ONLY EXPLANATIONS (STRICT):
      - All word analyses [word_analysis] MUST be in Korean.
      - **DO NOT use any English words, grammar terms (like Noun, Verb, etc.), or explanations.**
      - Use ONLY Korean grammar terms (e.g., 명사, 동사, 형용사, 조사, 어미 등).

      FORMATTING RULES (STRICT):

      [word_analysis]:
         - **CRITICAL FORMATTING RULE**: This MUST be a VERTICAL LIST with each item on a SEPARATE LINE.
         - **MANDATORY**: Start EVERY item with a bullet point (•) followed by a space.
         - Format for each line: "• Word | Meaning (Korean translation/definition) | Grammar role and contextual note"
         - The SECOND field (after first |) = The core Korean meaning of the word. Be concise but clear.
         - The THIRD field (after second |) = Part of speech (품사) and how the word functions in THIS sentence. Include grammar notes like particles, conjugation, or usage context when relevant.
         - **FOCUS ON OVERALL MEANING AND GRAMMAR STRUCTURE** over syllable-level decomposition.
           * Syllable breakdown is ONLY needed for complex compound words where it genuinely aids understanding.
           * For simple, common words, just give the meaning and grammar role directly.
         - **STRICT REQUIREMENT**: 
           * NEVER put multiple items on the same line
           * ALWAYS use a newline character (\\n) between items
           * EVERY line must start with "•"
           * Analyze the sentence SEQUENTIALLY from start to finish.
           * Explain every single word/particle in Korean.
           * **DO NOT analyze punctuation marks** (periods, commas, question marks, exclamation marks, ellipsis, colons, semicolons, etc.). Only analyze actual words and particles.
         - Example format:
           • Dăm ba | 겨우 몇 개의, 그까짓 몇 개의 | 수량 앞에 붙어 하찮거나 소량임을 나타내는 표현
           • chai | 병 | 명사 (물건을 세는 단위)
           • sao | 어떻게, 왜 | 의문 부사
           • được | ~할 수 있다 / (가능성, 허용) | 동사 뒤에 붙어 가능이나 허락을 나타내며, 부정문이나 의문문에서 쓰일 때 '할 수 없다/할 수 있겠는가'의 의미를 강화

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
