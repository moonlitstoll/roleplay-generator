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
         - **CRITICAL**: Return an ARRAY of objects. ONE object for EVERY word/particle in the sentence.
         - **Coverage**: Do not skip any words. Analyze the sentence completely from start to finish.
         - fields:
           * word: The specific word or particle from the text.
           * meaning: The core Korean meaning.
           * grammar: Detailed grammar role, part of speech, contextual explanation (nuance, dialect info, usage).
         - **MANDATORY RULES**:
           1. **Sequential Analysis**: Analyze words in the order they appear.
           2. **Redundancy**: Re-explain repeated words if contextually important.
           3. **Vietnamese Compounds**: If a 1-syllable word is part of a compound/phrase, explain its component meaning *inside* the compound's entry. DO NOT split it into separate entries if it breaks the compound's meaning, but explain the parts in the description.
           4. **Role/Dialect**: Explicitly note dialect usage (e.g., Central Vietnamese).
           5. **Language**: Use ONLY Korean for meaning and grammar.
           6. **Vietnamse Specialization**: 1음절 단어가 다음절 단어(복합어/구)에 포함된 경우, 따로 떼지 않고 구성 성분을 다음절 단어의 설명란에서 설명을 할것

         - **EXAMPLES (STRICTLY FOLLOW THIS STYLE)**:

           **Vietnamese Example 1 (Standard)**:
            { "word": "Nghe", "meaning": "듣다", "grammar": "동사로, 귀로 소리를 '듣다'는 의미입니다." },
            { "word": "hấp dẫn", "meaning": "매력적이다, 흥미를 끈다", "grammar": "hấp (吸引 흡) 은 당기다를 dẫn (導 도) 은 이끌다 를 뜻합니다" },
            { "word": "ghê", "meaning": "끔찍이, 대단히, 정말", "grammar": "부사 또는 감탄사로, 주로 강한 감정이나 놀라움을 나타내며, 구어체에서 동사나 형용사를 강조하는 역할을 합니다. '정말 ~하다'는 의미입니다." },
            { "word": "Mà", "meaning": "그런데, ~인데", "grammar": "접속사 또는 조사로, 여기서는 화제의 전환이나 반전을 나타냅니다." },
            { "word": "mình", "meaning": "나, 우리", "grammar": "대명사로, 상황에 따라 '나' 또는 화자와 청자를 포함하는 '우리'를 의미합니다. 여기서는 '우리'로 해석됩니다." },
            { "word": "còn", "meaning": "아직, 여전히", "grammar": "부사로, 어떤 상태나 행동이 '아직' 계속되거나 '남아있다'는 것을 나타냅니다." },
            { "word": "bao nhiêu", "meaning": "얼마나 많은", "grammar": "의문 대명사. bao(包/포) 는 싸다, 포함하다, 얼마나를 nhiêu (饒/요) 는 많다, 넉넉하다를 뜻합니다" },
            { "word": "việc", "meaning": "일", "grammar": "명사로, '일' 또는 '업무'를 의미합니다." },
            { "word": "phải", "meaning": "~해야 한다", "grammar": "조동사로, 의무나 필요성을 나타내어 '~해야 한다'는 의미를 가집니다." },
            { "word": "làm", "meaning": "하다", "grammar": "동사로, 어떤 행동이나 작업을 '하다'는 의미입니다." },
            { "word": "nhỉ", "meaning": "~죠?, ~을까요?", "grammar": "조사로, 문장 끝에 붙어 부드러운 의문이나 추측, 또는 상대방의 동의를 구하는 뉘앙스를 줍니다. 한국어의 '~죠?', '~을까요?'와 유사합니다." }

           **Vietnamese Example 2 (Dialect)**:
            { "word": "Sân", "meaning": "무엇(의문대명사)", "grammar": "중부 방언에서 표준어 'gì' (무엇)에 해당합니다." },
            { "word": "chả", "meaning": "~하지 않다(부사)", "grammar": "중부 방언에서 표준어 'chẳng' 과 유사하게 사용되지만, 이 문맥에서는 '무엇이 너를 ~하게 하는가'의 구문 일부로 해석될 수 있습니다." },
            { "word": "mi", "meaning": "너(대명사)", "grammar": "중부 방언에서 표준어 'mày' (너)에 해당합니다." },
            { "word": "nhớ", "meaning": "짜증나게 하다, 귀찮게 하다(동사)", "grammar": "중부 방언에서 '짜증나게 하다 귀찮게 하다'의 의미로 사용됩니다. 표준어 'nhớ'는 '기억하다' 또는 '그리워하다'를 의미합니다." },
            { "word": "rữa", "meaning": "~니?(종결어미)", "grammar": "중부 방언에서 질문을 나타내는 어미로, 표준어 'vậy' 또는 'à'와 유사합니다." }

           **English Example**:
            { "word": "BE", "meaning": "~이다, ~되다", "grammar": "존재 동사입니다." },
            { "word": "SOMETHING GREATER", "meaning": "더 위대한 무언가", "grammar": "'greater'는 'great'의 비교급 형용사로 '더 위대한'을 의미합니다." },
            { "word": "GO MAKE", "meaning": "가서 만들다", "grammar": "동사 'go' 뒤에 동사 원형이 와서 '가서 ~하다'라는 의미의 명령문을 이룹니다." },
            { "word": "LEGACY", "meaning": "유산, 유물", "grammar": "명사로, 후대에 남기는 업적이나 재산을 의미합니다." }

      DIALECT INSTRUCTIONS (Vietnamese):
      - Use standard vocabulary that works for both regions if possible.
      
      Ensure the analysis is detailed yet concise.
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
