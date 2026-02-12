import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const { input, language, count, apiKey, model: modelName, accentMode = 'all-standard', mode = 'roleplay' } = await req.json();

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
              nullable: true
            }
          },
          required: ["A"]
        },
        script: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              speaker: { type: SchemaType.STRING, description: "Speaker identifier (A or B)" },
              text: { type: SchemaType.STRING, description: "The spoken text in target language" },
              translation: { type: SchemaType.STRING, description: "Korean translation" },

              patterns: {
                type: SchemaType.OBJECT,
                description: "Sentence patterns and structure analysis",
                properties: {
                  structure: { type: SchemaType.STRING, description: "The sentence pattern with placeholders (e.g., [A] đÃ£ [V] rồi...)" },
                  meaning: { type: SchemaType.STRING, description: "Explanation of the pattern's meaning and usage" },
                  examples: {
                    type: SchemaType.ARRAY,
                    description: "Two example sentences using this pattern",
                    items: { type: SchemaType.STRING }
                  }
                },
                required: ["structure", "meaning", "examples"]
              },

              word_analysis: {
                type: SchemaType.ARRAY,
                description: "List of word analysis objects for every word in the sentence",
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    word: { type: SchemaType.STRING, description: "The word or particle being analyzed" },
                    meaning: { type: SchemaType.STRING, description: "Korean meaning" },
                    grammar: { type: SchemaType.STRING, description: "Grammar role/part of speech in Korean" }
                  },
                  required: ["word", "meaning", "grammar"]
                }
              },
            },
            required: ["speaker", "text", "translation", "patterns", "word_analysis"],
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


    const isAnalysisMode = count === 0 && mode === 'analysis';
    const isMonologueMode = count === 0 && mode === 'roleplay'; // New Mode

    let baseInstruction = '';

    if (isAnalysisMode) {
      baseInstruction = `
          VERBATIM ANALYSIS MODE ACTIVATED:
          - DO NOT generate a roleplay or conversation.
          - DO NOT change or "fix" the input text. Use the user's "Input" EXACTLY as it is.
          - SEGMENTATION STRATEGY:
            1. Split the input text into INDIVIDUAL sentences as much as possible for granular analysis.
            2. ONLY group sentences together if they are very short or tightly connected semantic units.
            3. Prioritize detailed "word_analysis" for each segment.
          - Assign all segments to Speaker "A".
          - Provide detailed Korean translation, patterns, and word_analysis for each segment.
        `;
    } else if (isMonologueMode) {
      baseInstruction = `
          MONOLOGUE GENERATION MODE ACTIVATED (Speaker A Only):
          - **GOAL**: Generate a LONG, detailed monologue by Speaker A based on the "Input Context".
          - **LENGTH**: The user requested "as long as possible". Generate at least 8-12 sentences/segments.
          - **CONTENT**: Deeply explore the topic, expressing thoughts, feelings, and descriptions.
          - **FORMAT**:
            - ONLY Speaker "A". No Speaker "B".
            - Split the monologue into logical segments (1-2 sentences per segment) for easier reading and analysis.
          - **STYLE**: Natural, native-level speech with appropriate flow and markers.
       `;
    } else {
      baseInstruction = `
          Generate exactly ${count * 2} lines of conversation (alternating between speaker A and B).
          SCENARIO: "${promptInput}"
          
          CRITICAL INSTRUCTION - NATURALNESS PRIORITY:
          - **"Native-Level Polish"**: Fix any awkward or incorrect language. Upgrade it to real-world native expressions.
          - **Topic fidelity**: Stay very close to the specific nuances of the scenario.
          - **Realism**: Include hesitation markers (e.g., "uh", "well"), slang, or idioms where appropriate.
          
          GENDER ASSIGNMENT:
          - Assign logical genders to Speakers A and B based on the scenario.
       `;
    }

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

      1. **word_analysis** (Sequential & Detailed):
         - **Coverage**: Analyze words in the exact order they appear in the sentence. DO NOT skip any words.
         - **Redundancy**: Even if a word was explained in a previous sentence, explain it again if it's important for the current context.
         - **Compound Words (Vietnamese)**: Treat compound words (e.g., "hấp dẫn") as a SINGLE entry. Do NOT split them into "hấp" and "dẫn" separately. Explain the individual components (Sino-Vietnamese meanings) *within* the description of the compound word.
         - **Role & Dialect**: Explicitly mention the part of speech (noun, verb, etc.) and any dialectal usage (e.g., Southern vs. Northern).
         - **Meaning Blocks (Chunks)**: Group words that form a meaningful chunk (e.g., "mình còn chưa" -> "우리 아직 ~하지 못하다") if it helps understanding, rather than processing mechanically word-by-word.
         - **Fields**:
           * word: The word or chunk.
           * meaning: The Korean meaning.
           * grammar: Detailed explanation including Sino-Vietnamese roots, grammar function, and dialect notes.

      2. **patterns** (Sentence Patterns):
         - **Goal**: Extract the "skeleton" of the sentence that can be reused with other words.
         - **Structure**: Replace key variable parts with placeholders like [A], [B], [Verb], [Adj]. 
           - Example: "Hợp đồng này được ký rồi, mà mình còn chưa nhận được tiền cọc nhỉ?"
           - Pattern: "[A] được [동사] rồi, mà [B] còn chưa [동사] nhỉ?"
         - **Meaning**: Explain what this pattern means (e.g., "A는 이미 ~되었는데, B는 아직 ~하지 않았지?").
         - **Examples**: Provide 2 distinct example sentences using this pattern in the target language, with Korean translations.

      - **EXAMPLES (STRICTLY FOLLOW THIS STYLE)**:

        **Vietnamese Structure Example**:
          "patterns": {
             "structure": "[A] được [동사] rồi, mà [B] còn chưa [동사] nhỉ?",
             "meaning": "A는 이미 ~되었는데, B는 아직 ~하지 않았지? (대조적 상황)",
             "examples": [
               "Lô hàng được giao rồi, mà khách còn chưa thanh toán nhỉ? (화물은 이미 인도되었는데, 고객이 아직 결제를 안 했지?)",
               "Cơm được nấu rồi, mà anh còn chưa về nhỉ? (밥은 이미 다 됐는데, 오빠는 아직 안 왔지?)"
             ]
          },
          "word_analysis": [
            { "word": "Hợp đồng này", "meaning": "이 계약서", "grammar": "명사구. Hợp (合 합) + đồng (同 동) = 계약. này(이)가 붙어 특정 계약을 지칭." },
            { "word": "được ký rồi", "meaning": "이미 체결되었다", "grammar": "수동태 동사구. được(~되다) + ký(서명하다) + rồi(이미). 서명이 완료된 상태를 의미." },
            { "word": "khách", "meaning": "고객/손님", "grammar": "명사. services를 이용하는 사람을 지칭." }
          ]

      DIALECT INSTRUCTIONS (Vietnamese):
      - Use standard vocabulary that works for both regions if possible.
      
      Ensure the analysis is detailed, sequential, and visually structured for learning.
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
