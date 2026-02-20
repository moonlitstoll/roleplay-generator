import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { generateContentWithRetry } from '@/utils/gemini';

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

      **[7가지 분석 및 생성 규칙 (엄격 준수)]**
      1. **순차 및 전수 분석**: 문장 내 모든 의미 있는 단어와 덩어리를 분석한다.
         - **[🚨 절대 제약 사항 🚨]**: 문장 부호(., ?, !, ,, ", ' 등)는 절대로 \`word_analysis\` 목록에 포함시키지 마라. 오직 뜻이 있는 단어와 표현만 분석한다. (의미 없는 기호 분석 금지)
         - **[🚨 추가 금지 사항 🚨]**: 단어 자체가 문장 부호인 항목을 JSON 배열에 생성하는 것 자체를 금지한다. (\`?\`나 \`.\` 같은 항목 생성 금지)
         - **[🚨 문법 필드 제약 사항 🚨]**: \`grammar\` 필드에 **예문(Ví dụ/Example)**이나 **문장 패턴(Pattern)**을 절대 포함하지 마라. 오직 해당 단어의 문법적 역할(품사, 성분)만 간결하게 적는다.
            * (X) \`(지시 대명사) - 예: 이것은 무엇입니까?\` (예문 금지)
            * (O) \`(지시 대명사)\` (깔끔함)
      2. **중복 설명 허용**: 앞선 문장에서 나온 단어라도 현재 문장에 있다면 다시 설명한다.
      3. **의미 덩어리(Chunk) 분석 (핵심)**: 단어를 기계적으로 쪼개지 마라. sửa chữa(수리), máy tính(컴퓨터), keeping an eye on(주시하다)처럼 의미가 연결되는 단어들은 하나의 항목으로 묶어서 분석한다.
      4. **어원 및 의미 결합 분석 (Etymology & Literal Breakdown)**: 
         - **[🚨 절대 금지 🚨]**: 
            1. **대상 언어 반복/유의어 금지**: 설명 부분에 **베트남어/영어를 단 한 글자도 쓰지 마라.** (동의어, 유의어 포함 절대 금지)
            2. **한국어 전용**: 대괄호 \`[]\` 안에는 **무조건 한국어 뜻**이나 **한자음**만 들어가야 한다.
         - **[작성 예시 - 나쁜 예 vs 좋은 예]**:
            * (X) \`nhắc đến\` -> \`[nhắc (nhắc nhở) + đến (đến)]\` (최악의 예: 베트남어로 설명함)
            * (O) \`nhắc đến\` -> \`[nhắc (언급하다) + đến (~에 이르다)]\` (좋은 예: 한국어 뜻으로 풀이)
            * (X) \`treo tường\` -> \`[treo(treo) + tường(tường)]\`
            * (O) \`treo tường\` -> \`[treo(걸다) + tường(벽)]\`
         - **한자어 (베트남어)**: 각 음절의 **한자음과 뜻**을 명시할 것. 예: thông tin -> [thông (通 통할 통) + tin (信 믿을 신)]
         - **순수 고유어 (베트남어)**: 한자가 없더라도 각 단어의 원래 뜻을 한국어로 분리해서 결합할 것. 예: nụ cười -> [nụ (꽃봉오리) + cười (웃다)]
         - **영어 (유래/어원)**: 접두사/어근(Root)을 풀이할 것. 예: submit -> [sub (아래로) + mit (보내다)]
         - **영어 (숙어/확장)**: 개별 단어의 직역 의미를 먼저 적고 어떻게 의미가 확장되었는지 설명할 것. 예: keeping an eye on -> keep (유지하다) + eye (눈) + on (위에 붙여서) = 눈을 떼지 않고 계속 지켜보는 이미지.
      5. **역할 명시**: 품사, 문법적 기능(주어, 동사구, 전치사구 등)을 상세히 기록한다.
      6. **한국어 전용 설명**: 모든 설명은 한국어로 진행하며, 대상 언어로 설명을 작성하지 않는다. (설명 필드에 베트남어/영어 복사 금지)
      7. **한국어 번역 필수**: \`translation\` 필드는 원문을 절대 복사하지 말고 자연스러운 한국어 구어체로 번역한다.

      **[참조 예시 (베트남어)]**
      문장: "Mặc dù dự án phát triển phần mềm này đang gặp phải một số vấn đề kỹ thuật phát sinh ngoài ý muốn, nhưng chúng tôi vẫn quyết tâm hoàn thành đúng tiến độ đã đề ra."
      - word_analysis: [ 
        { "word": "Mặc dù", "meaning": "비록 ~일지라도", "grammar": "(접속사) [Mặc (~에도 불구하고) + dù (설령 ~일지라도)]" },
        { "word": "dự án phát triển phần mềm", "meaning": "소프트웨어 개발 프로젝트", "grammar": "(명사구) [dự án (豫案 예안 - 프로젝트) + phát triển (發展 발전 - 개발) + phần mềm (소프트웨어)]" },
        { "word": "này", "meaning": "이 (이것)", "grammar": "(지시형용사) [này (이것)]" },
        { "word": "đang gặp phải", "meaning": "~에 직면하고 있다", "grammar": "(동사구) [đang (~중) + gặp phải (맞닥뜨리다)]" },
        { "word": "một số vấn đề kỹ thuật", "meaning": "몇몇 기술적 문제", "grammar": "(명사구) [một số (몇몇) + vấn đề (問題 문제) + kỹ thuật (技術 기술)]" },
        { "word": "phát sinh ngoài ý muốn", "meaning": "예상 밖의(뜻밖에 발생한)", "grammar": "(형용사구) [phát sinh (發生 발생) + ngoài ý muốn (의도 밖의)]" },
        { "word": "nhưng", "meaning": "그러나, 하지만", "grammar": "(접속사) [nhưng (그러나)]" },
        { "word": "chúng tôi", "meaning": "우리(상대방 제외)", "grammar": "(주어) [chúng (복수) + tôi (나)]" },
        { "word": "vẫn quyết tâm", "meaning": "여전히 결심하다", "grammar": "(부사+동사) [vẫn (여전히) + quyết tâm (決心 결심)]" },
        { "word": "hoàn thành", "meaning": "완수하다", "grammar": "(동사) [hoàn thành (完成 완성)]" },
        { "word": "đúng tiến độ", "meaning": "일정에 맞게", "grammar": "(부사구) [đúng (맞다) + tiến độ (進度 진도)]" },
        { "word": "đã đề ra", "meaning": "제시된/내놓은", "grammar": "(형용사구) [đã (과거) + đề ra (제시하다)]" }
      ]

      **[참조 예시 (영어)]**
      문장: "The marketing department decided to postpone the launch of the new product due to some unexpected budget constraints."
      - word_analysis: [
        { "word": "the marketing department", "meaning": "마케팅 부서", "grammar": "(명사구) [marketing (시장에 내놓는 일) + department (de: 분리 + part: 부분 + ment: 명사형)]" },
        { "word": "decided to postpone", "meaning": "연기하기로 결정했다", "grammar": "(동사구) [decided (결정했다) + postpone (post: 뒤에 + pone: 놓다)]" },
        { "word": "the launch", "meaning": "출시/발사", "grammar": "(명사) [launch (출시/발사)]" },
        { "word": "of the new product", "meaning": "신제품의", "grammar": "(전치사구) [of (~의) + new product (신제품)]" },
        { "word": "due to", "meaning": "~때문에", "grammar": "(전치사구) [due to (~때문에)]" },
        { "word": "some unexpected budget constraints", "meaning": "예기치 못한 예산 제약", "grammar": "(명사구) [some (일부) + unexpected (un: 아님 + ex: 밖 + pect: 보다 - 예상 밖의) + budget (예산) + constraints (con: 함께 + strain: 묶다 - 제약)]" }
      ]

      **[사용자 입력 상황]**
      상황: "${promptInput}"
      대상 언어: ${language}
      
      ${baseInstruction}
    `;

    const result = await generateContentWithRetry(model, prompt);
    let text = result.response.text();

    // Clean up markdown code blocks if present
    if (text.includes('```')) {
      text = text.replace(/```json|```/g, '').trim();
    }

    const data = JSON.parse(text);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[API] Error generating script:', error);

    // Check if it's a rate limit error to return 429
    const isRateLimit = error.message?.includes('429') ||
      error.message?.includes('Resource exhausted') ||
      error.message?.includes('Too Many Requests');

    return NextResponse.json({
      error: isRateLimit ? 'Rate limit exceeded' : 'Failed to generate script',
      details: error.message
    }, { status: isRateLimit ? 429 : 500 });
  }
}
