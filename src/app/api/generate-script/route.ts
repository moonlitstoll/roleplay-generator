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
                    description: "One single short example sentence using this pattern",
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
      너는 베트남어와 영어를 가르치는 전문 튜터야. 아래의 8가지 규칙을 엄격하게 적용하여 "${language}"로 대화를 생성하고 각 문장을 분석해 줘.

      **[9가지 분석 및 생성 규칙 (엄격 준수)]**
      1. **순차 및 전수 분석**: 문장 내 모든 단어와 덩어리를 등장 순서대로 하나도 빠짐없이 분석한다. 단, 문장의 의미에 결정적인 영향을 주지 않는 단순 문장 부호(쉼표, 마침표 등)는 분석 목록(word_analysis)에서 제외한다.
      2. **중복 설명 허용**: 앞선 문장에서 나온 단어라도 현재 문장에 있다면 다시 설명한다.
      3. **의미 덩어리(Chunk) 분석 (핵심)**: 단어를 기계적으로 쪼개지 마라. sửa chữa(수리), máy tính(컴퓨터), keeping an eye on(주시하다)처럼 의미가 연결되는 단어들은 하나의 항목으로 묶어서 분석한다.
      4. **어원 및 의미 결합 분석 (Etymology & Literal Breakdown)**: 
         - **[절대 금지]**: 설명 부분에 **대상 언어(베트남어/영어) 단어를 그대로 다시 쓰지 마라.** 무조건 **한국어 뜻**으로만 풀이해야 한다.
            *   (X) \`treo tường\` -> \`[treo(treo) + tường(tường)]\` (의미 없음)
            *   (O) \`treo tường\` -> \`[treo(걸다) + tường(벽)]\` (올바른 한국어 풀이)
         - **한자어 (베트남어)**: 각 음절의 **한자음과 뜻**을 명시할 것. 예: thông tin -> [thông (通 통할 통) + tin (信 믿을 신)]
         - **순수 고유어 (베트남어)**: 한자가 없더라도 각 단어의 원래 뜻을 한국어로 분리해서 결합할 것. 예: nụ cười -> [nụ (꽃봉오리) + cười (웃다)]
         - **영어 (유래/어원)**: 접두사/어근(Root)을 풀이할 것. 예: submit -> [sub (아래로) + mit (보내다)]
         - **영어 (숙어/확장)**: 개별 단어의 직역 의미를 먼저 적고 어떻게 의미가 확장되었는지 설명할 것. 예: keeping an eye on -> keep (유지하다) + eye (눈) + on (위에 붙여서) = 눈을 떼지 않고 계속 지켜보는 이미지.
      5. **최소한의 뼈대 공식**: 구체적인 명사나 수식어는 걷어내고 어디든 갈아 끼울 수 있는 **최소한의 공식**만 추출한다. 변수에 대한 부연 설명(예: [A]는 상황이다 등)은 생략한다.
         - **[핵심 원칙]**: 패턴이 의미를 가지려면 문장의 뼈대가 되는 **문법적 키워드(예: đã, đang, sẽ, if, because, want to, not 등)는 원어 그대로 유지**하고, 가변적인 명사/동사/주어 등만 한국어 태그(\`[주어]\`, \`[동사]\` 등)로 치환한다.
         - **[작성 예시]**:
            * (X) \`[주어] đang muốn tìm [명사] để [동사], có [명사] hay không?\` (너무 김, 나쁜 예)
            * (O) \`[주어] muốn [동사]... có [명사]...\` (핵심 틀만 유지, 좋은 예)
            * (O) \`À [감탄사], [주어] muốn [동사] không?\` (문법 구조가 보임)
      6. **실전 예문 및 해석**: 추출한 뼈대 공식을 그대로 활용한 **단 하나의 짧은 '실전 예문'**과 그 **'예문 해석'**을 반드시 포함한다. (예: "Vì chưa nhận được nên muốn kiểm tra lại.")
      7. **역할 명시**: 품사, 문법적 기능(주어, 동사구, 전치사구 등)을 상세히 기록한다.
      8. **한국어 전용 설명**: 모든 설명은 한국어로 진행하며, 대상 언어로 설명을 작성하지 않는다. (설명 필드에 베트남어/영어 복사 금지)
      9. **한국어 번역 필수**: \`translation\` 필드는 원문을 절대 복사하지 말고 자연스러운 한국어 구어체로 번역한다.

      **[참조 예시 (베트남어)]**
      문장: "Vì nhân viên giao hàng đã cập nhật trạng thái đơn hàng thành thành công mà mình vẫn chưa nhận được kiện hàng, nên mình muốn yêu cầu bộ phận chăm sóc khách hàng kiểm tra lại ngay lập tức."
      - patterns: { structure: "Vì [상황A], nên [주어] muốn [동사1]", meaning: "([상황A] 때문에, [주어]는 [동사1]하고 싶다)", examples: ["실전 예문: Vì chưa nhận được nên muốn kiểm tra lại. (못 받았기 때문에 다시 확인하고 싶어요.)"] }
      - word_analysis: [ { word: "Vì", meaning: "~때문에", grammar: "(접속사) [Vì (원인 접속사)]" }, { word: "nhân viên giao hàng", meaning: "배달원", grammar: "(명사구) [nhân viên (人員 인원) + giao hàng (인도 물건)]" } ... ]

      **[참조 예시 (영어)]**
      문장: "I am looking for a reliable car rental service that provides insurance coverage while planning to explore the rural areas."
      - patterns: { structure: "Looking for [대상] while [동사]-ing", meaning: "(~하면서 [대상]을 찾는 중이다)", examples: ["실전 예문: Looking for a hotel while traveling alone. (혼자 여행하면서 호텔을 찾는 중이에요.)"] }
      - word_analysis: [ { word: "I am looking for", meaning: "나는 ~를 찾는 중이다", grammar: "(동사구) [look (보다) + for (찾아서)]" }, { word: "reliable", meaning: "믿을 만한", grammar: "(형용사) [re (다시) + li (묶다) + able (가능한)]" } ... ]

      **[사용자 입력 상황]**
      상황: "${promptInput}"
      대상 언어: ${language}
      
      ${baseInstruction}
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
