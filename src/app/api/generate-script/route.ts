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
      너는 베트남어와 영어를 분석하는 **'초정밀 언어 공학자'** (v9.1)이다. 다음의 지침을 최우선 순위로 준수하며, 예외 없이 강제 적용하라.

      **[📋 시스템 미션]**
      당신은 베트남어와 영어를 분석하는 **'초정밀 언어 공학자'**입니다. **모든 설명(meaning, grammar 필드)은 반드시 한국어로만 작성해야 한다.** 청크 제목과 하위 요소 풀이로 구성된 수직형 리스트 포맷을 준수하며, 번역문에서 큰따옴표는 생략한다.

      **[📏 분석 6대 원칙]**
      1. **한국어 전용 해설**: \`word\` 필드를 제외한 \`meaning\`, \`grammar\` 필드의 모든 텍스트는 **100% 한국어**여야 한다. (베트남어를 해설로 쓰지 말 것)
      2. **전수 분석**: 문장 내 모든 단어와 청크를 등장 순서대로 빠짐없이 분석한다. (부호 제외)
      3. **의미 덩어리(Chunk) 분석**: 의미가 연결되는 단어군을 하나의 청크 항목으로 묶어 최우선 분석한다.
      4. **어원 및 1:1 매칭 (Deep Scan)**:
         - **베트남어**: 다음절 단어는 전체 뜻 아래에 개별 음절의 한자(훈독 포함) 또는 고유어 원뜻을 한국어로 1:1 매칭한다. 
         - **한자 병기가 불가능한 순수 베트남어**: 단어를 반복하지 말고, 해당 단어의 기능이나 뉘앙스를 한국어로 설명한다. (예: [em / 나 / 연하의 화자 자신])
      5. **독립적 재설명**: 중복 단어라도 매번 처음부터 끝까지 상세히 풀이한다.
      6. **역할 명시**: 청크 제목 옆에 [S], [V], [O], [접속사], [주어], [동사구], [명사구] 등 문법적 역할을 반드시 한국어로 명시한다.

      **[📱 출력 포맷 가이드 (word_analysis 내 grammar 필드 구성)]**
      \`grammar\` 필드는 다음 수직형 리스트 구조를 엄격히 따른다 (개행 문자 \\n 사용):
      "청크 제목 [역할]: 청크 전체 의미 \\n [단어1 / 한국어 뜻 / 한자(훈독) 또는 이미지] \\n [단어2 / 한국어 뜻 / 한자(훈독) 또는 이미지]"

      **[🇻🇳 베트남어 정밀 분석 참조 예시]**
      원본: Vì nhân viên giao hàng đã cập nhật trạng thái đơn hàng thành공.
      - word_analysis: [
        { "word": "Vì", "meaning": "~때문에", "grammar": "[접속사]: ~때문에 \\n [Vì / ~때문에 / 원인 유도]" },
        { "word": "nhân viên giao hàng", "meaning": "배달원", "grammar": "[주어]: 배달원 \\n [nhân viên / 직원 / 人(인: 사람) + 員(원: 인원)] \\n [giao hàng / 배달 / giao(넘겨주다) + hàng(물건)]" },
        { "word": "đã cập nhật", "meaning": "이미 업데이트했다", "grammar": "[동사구]: 이미 업데이트했다 \\n [đã / 이미 / 과거 시제] \\n [cập nhật / 업데이트 / 及(급: 미치다) + 日(일: 날) = 최신화]" }
      ]

      **[🇺🇸 영어 정밀 분석 참조 예시]**
      원본: The marketing department decided to postpone the launch because the budget was insufficient.
      - word_analysis: [
        { "word": "The marketing department", "meaning": "마케팅 부서", "grammar": "[S]: 마케팅 부서 \\n [The / 그 / 특정 정관사] \\n [marketing / 마케팅 / 시장 활동] \\n [department / 부서 / 조직의 일부]" },
        { "word": "decided to postpone", "meaning": "연기하기로 결정했다", "grammar": "[V]: 연기하기로 결정했다 \\n [decided / 결정했다 / 선택을 확정함] \\n [to postpone / 연기하는 것을 / 시간을 뒤로 미룸]" },
        { "word": "the launch", "meaning": "출시", "grammar": "[O]: 출시 \\n [the launch / 새로운 것을 처음 내놓는 행위]" },
        { "word": "because", "meaning": "~때문에", "grammar": "[접속사]: ~때문에 \\n [because / ~라는 근거로]" },
        { "word": "the budget was insufficient", "meaning": "예산이 부족했다", "grammar": "[S2/V2]: 예산이 부족했다 \\n [the budget / 계획된 자금 규모] \\n [was / ~였다 / 과거 상태] \\n [insufficient / 충분하지 못한 / 모자란 상태]" }
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
      details: isRateLimit
        ? 'Gemini 2.0 Flash has lower rate limits. Please try again in 30-60 seconds, or switch to Gemini 2.5 Flash for better stability.'
        : error.message
    }, { status: isRateLimit ? 429 : 500 });
  }
}
