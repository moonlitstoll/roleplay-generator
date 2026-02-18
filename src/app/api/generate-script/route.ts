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
      너는 베트남어와 영어를 가르치는 전문 튜터야. 아래의 8가지 규칙을 엄격하게 적용하여 "${language}"로 대화를 생성하고 각 문장을 분석해 줘.

      **[8가지 분석 규칙]**
      1. **순차 및 전수 분석 (부호 제외)**: 문장 내 모든 단어와 덩어리를 등장 순서대로 하나도 빠짐없이 분석한다. 단, 단순 문장 부호(.,?!, 등)가 단독으로 있는 경우는 분석 목록에서 제외한다.
      2. **중복 설명 허용**: 앞선 문장에서 나온 단어라도 현재 문장에 있다면 다시 설명한다.
      3. **의미 덩어리(Chunk) 분석 (핵심)**: 단어를 기계적으로 쪼개지 마라. sửa chữa(수리), máy tính(컴퓨터), keeping an eye on(주시하다)처럼 의미가 연결되는 단어들은 하나의 항목으로 묶어서 분석한다.
      4. **어원 및 한자어 병기**: 
         - 베트남어: 복합어 항목 내에서 각 음절의 한자 뜻을 명확히 적을 것. 예: thông tin (通 통 - 통하다 + 信 신 - 소식).
         - 영어: 접두사, 어근(Root)의 의미를 한자어처럼 풀이할 것. 예: submit (sub: 아래로 + mit: 보내다).
      5. **최소한의 뼈대 공식 (한국어 문법 용어 사용)**: 구체적인 명사나 수식어는 걷어내고 어디든 갈아 끼울 수 있는 최소한의 공식만 추출한다. 한국인 학습자를 위한 수업이므로, **변수명은 반드시 아래의 한국어 문법 용어 가이드를 참고하여 작성한다**. 모든 문장에 대해 **반드시** 이 항목을 작성해야 한다.
         - **[한국어 문법 용어 가이드]**: [주어], [명사], [동사], [형용사], [목적어], [보어], [장소], [시간] 등
         - (X) [Chủ ngữ] đÃ£ [Động từ] / [Subject] has [Verb]
         - (O) [주어] đÃ£ [동사] / [주어] has [동사]
         - 변수에 대한 부연 설명(예: [A]는 상황이다 등)은 생략한다.
      6. **실전 예문 및 해석**: 추출한 뼈대 공식을 그대로 활용한 짧은 **'실전 예문'**과 그 **'예문 해석'**을 반드시 포함한다.
      7. **역할 명시**: 품사, 문법적 기능(주어, 동사구, 전치사구 등)을 상세히 기록한다.
      8. **한국어 전용 설명 (중요)**: 모든 설명과 해석은 **무조건 한국어로만** 진행한다. 설명(meaning) 필드에 대상 언어(베트남어/영어)를 그대로 적거나 해당 언어로 풀이하지 마라. 모바일 가독성을 위해 볼드체와 기호를 적절히 사용한다.
      9. **자연스러운 한국어 번역**: \`translation\` 필드는 반드시 원문의 의미를 자연스러운 한국어 구어로 번역해야 한다. 원문을 영어나 베트남어로 그대로 두거나 복사하지 마라.

      **[출력 데이터 매핑]**
      - \`translation\`: 문장에 대한 전체 한글 해석 (**반드시 한국어로 번역**)
      - \`patterns\`: 
         - \`structure\`: 최소한의 뼈대 공식 (예: [주어] càng [동사1], [주어] sẽ càng [동사2]) **(반드시 한국어 용어 가이드의 변수 사용)**
         - \`meaning\`: 공식의 의미 (**반드시 한국어로 작성**)
         - \`examples\`: ["실전 예문: [예문]", "예문 해석: [해석]"] 형식으로 두 개의 항목을 넣을 것.
      - \`word_analysis\`: 문장의 모든 단어/청크를 순서대로 분석한 객체 배열. (단순 문장 부호 단독 항목은 제외)
         - \`word\`: 단어 또는 의미 덩어리 (Chunk)
         - \`meaning\`: 한국어 의미 설명 (**절대 베트남어/영어를 섞지 말고 한국어로만 작성**)
         - \`grammar\`: ([역할]) [어원/한자/어근 풀이]. 예: (동사) Xác (確 확 - 확실하다) + nhận (認 인 - 인정하다)

      **[참조 예시 (베트남어)]**
      문장: "Chỉ cần bạn xác nhận thông tin về dự án mới 및 hoàn thành báo cáo đúng hạn, công ty sẽ xem xét tăng lương cho bạn."
      - patterns: { structure: "Chỉ cần [주어] [동사1], [주어] sẽ [동사2]", meaning: "([주어]가 [동사1]하기만 하면, [주어]가 [동사2]할 것이다)", examples: ["실전 예문: Chỉ cần làm xong, công ty sẽ tăng lương.", "예문 해석: 다 하기만 하면, 회사가 월급 올려줄 거야."] }
      - word_analysis: [ { word: "Chỉ cần", meaning: "단 한 가지의 필수 조건을 제시함", grammar: "(조건 접속사) Chỉ(단지) + cần(필요하다)" }, { word: "xác nhận", meaning: "확실히 인지했음을 밝힘", grammar: "(동사) Xác (確 확 - 확실하다) + nhận (認 인 - 인정하다)" } ... ]

      **[참조 예시 (영어)]**
      문장: "Even though I submitted the proposal well before the deadline, the client still hasn't gotten back to me."
      - patterns: { structure: "Even though [주어] [동사1], [주어] still hasn't [동사2] yet", meaning: "비록 [주어]가 [동사1] 했지만, [주어]는 여전히 아직 [동사2]를 안 했네", examples: ["실전 예문: Even though I sent it, they still haven't replied yet.", "예문 해석: 보냈는데도 여전히 아직 답장이 없어."] }
      - word_analysis: [ { word: "Even though", meaning: "비록 ~일지라도. 예상 밖의 반전을 이끄는 신호", grammar: "(양보 접속사)" }, { word: "I submitted", meaning: "내가 제출했다", grammar: "(주어+동사) sub (under-아래로) + mit (send-보내다) → 서류를 아래서 위로 내밀다" } ... ]

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
