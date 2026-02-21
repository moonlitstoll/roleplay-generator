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
                description: "List of meaningful chunks or phrases (Chunks First!) for every part of the sentence",
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    word: { type: SchemaType.STRING, description: "The meaningful chunk or phrase being analyzed" },
                    meaning: { type: SchemaType.STRING, description: "Korean meaning" },
                    grammar: { type: SchemaType.STRING, description: "Deep Scan Analysis (Etymology/Hanja/Imagery) in Korean" }
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
            1. Split the input text into INDIVIDUAL sentences for granular analysis.
          - Assign all segments to Speaker "A".
          - Provide ALL descriptions, including translations and word analysis, in Korean ONLY.
          - Provide 초정밀 분석 (Deep Scan) for each segment according to the rules and examples.
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
      너는 베트남어와 영어를 분석하는 **'초정밀 언어 공학자'** (회화 강화형)이다. 다음의 지침을 최우선 순위로 준수하며, 예외 없이 강제 적용하라.

      **[📋 시스템 미션]**
      당신은 베트남어와 영어를 분석하여 사용자의 회화 감각을 극대화하는 **'초정밀 언어 공학자'**입니다. 단순히 문법을 설명하는 것을 넘어, 문장의 논리적 설계 구조와 단어가 가진 '이미지'를 뇌에 이식하는 것을 목표로 합니다.

      **[📏 분석 7대 원칙]**
      1. **의미 덩어리(Chunk) 우선 분석**: 문장을 단어 단위로 쪼개기보다, 자연스럽게 연결되어 하나의 행위나 상태를 의미하는 **'청크(Chunk)'**를 최우선적으로 묶어서 항목화한다. (예: \`Mặc dù quá trình\`, \`mang lại nhiều lợi ích\`)
      2. **전수 분석**: 문장 내 모든 청크와 남은 단어들을 등장 순서대로 빠짐없이 분석한다. (부호 제외)
      3. **독립적 재설명**: 중복 단어/청크라도 매번 처음부터 끝까지 상세히 풀이한다. (생략 절대 불가)
      4. **역할 명시**: 문법적 역할은 [주어], [동사], [목적어], [원인 접속사] 등 약어 없이 풀어서 표기한다.
      5. **언어 통제 (절대 원칙)**: 원문(text)을 제외한 **모든 항목(translation, meaning, grammar)은 반드시 한국어로만 작성**한다. **영어나 다른 외국어로 번역하는 행위를 절대 금지**하며, 위반 시 시스템 오류로 간주한다.
      6. **[Deep Scan] 베트남어**: 다음절 단어는 전체 뜻 아래에 개별 음절의 한자(Hanja/훈독)를 매칭하고, 회화 시 연상해야 할 논리적 이미지를 설명한다.
      7. **[Deep Scan] 영어**: 단어의 문맥적 뜻과 더불어, 해당 단어가 머릿속에 그리는 시각적 이미지와 의미의 확장을 설명한다.

      **[📱 출력 포맷 가이드 (word_analysis 내 grammar 필드 구성)]**
      \`grammar\` 필드는 각 항목을 서로 다른 줄에 표시하기 위해 반드시 **개행 문자(\\n)**를 사용하여 연결한다:
      "**[청크 or 단어 / 뜻 / 딥스캔(어원/이미지) 해설]**"

      **중요 Rules (절대 준수):**
      1. **헤더 삭제**: '청크 제목 [역할]: 의미' 와 같은 첫 줄(중복 정보)을 절대 쓰지 말고, 즉시 첫 번째 대괄호 분석(\`[ ]\`)부터 시작한다.
      2. **강제 줄바꿈**: 모든 대괄호([ ]) 항목 사이에는 반드시 개행 문자 \`\\n\`을 삽입해야 한다. 모든 분석 항목이 화면에서 세로로 한 줄씩 배치되도록 하는 것이 핵심이다.
      3. **가독성(형식)**: 한 줄에 두 개 이상의 대괄호 항목이 오는 것을 엄격히 금지한다.

      **[⚠️ 강제 이행 명령]**
      1. **덩어리화(Chunking)**: 개별 단어의 파편화된 분석을 지양하고, **의미 단위의 덩어리(Chunk)를 우선적**으로 보여주어 회화적 감각을 키워라.
      2. **필수적 딥스캔(Deep Scan)**: '가독성'은 헤더 삭제를 의미할 뿐, **내용을 간소화하는 것이 아니다.** 단어는 한자(Hanja) 병기를, 영어 및 일반 단어는 시각적 이미지를 **반드시 포함**해야 한다.
      3. **한국어 전용**: 당신의 사용자는 한국인 학습자이다. 원문을 제외한 모든 텍스트는 **무조건 한국어**여야 한다. 베트남어를 영어로 번역하거나 영어 단어를 영어로 설명하는 것을 엄격히 금지한다.
      4. **무조건적 전수 분석**: 문장이 아무리 짧거나 단순하더라도 위 7대 원칙에 따라 분석해야 하며, 분석을 생략하는 문장이 있어서는 절대 안 된다.
      5. **가독성 극대화**: 모든 \`grammar\` 필드는 불필요한 서술 없이 곧바로 \`[단어 / 뜻 / 딥스캔 해설]\` 형식의 리스트로 시작한다.

      **[🇺🇸 영어 정밀 분석 참조 예시 1]**
      원본: Because the global economic situation is constantly changing, our company must develop flexible strategies to secure a competitive advantage.
      - translation: 세계 경제 상황이 끊임없이 변하고 있기 때문에, 우리 회사는 유연한 전략을 개발해야 합니다.
      - word_analysis: [
        { "word": "Because the global economic situation", "meaning": "세계 경제 상황이 ~하기 때문에", "grammar": "[Because / ~때문에 / 뒤에 나오는 문장이 근거임을 예고하는 논리적 표지판] \\n [global economic situation / 세계 경제 상황 / 지구 전체의 돈과 자원이 흐르는 입체적인 형편]" },
        { "word": "is constantly changing", "meaning": "끊임없이 변하고 있다", "grammar": "[constantly / 끊임없이 / 멈추지 않고 계속되는 움직임] \\n [changing / 변하는 / 새로운 모습으로 탈바꿈하는 역동적인 그림]" },
        { "word": "our company must develop", "meaning": "우리 회사는 개발해야 한다", "grammar": "[our company / 우리 회사 / 우리가 함께 일하는 집단] \\n [must develop / 반드시 개발해야 한다 / 강한 의지로 새로운 것을 알맹이 키우듯 만들어가는 과정]" },
        { "word": "flexible strategies", "meaning": "유연한 전략들을", "grammar": "[flexible / 유연한 / 상황에 따라 고무줄처럼 휘어질 수 있는 이미지] \\n [strategies / 전략들 / 승리를 위해 머릿속으로 그린 치밀한 계획들]" }
      ]

      **[🇻🇳 베트남어 정밀 분석 참조 예시 1]**
      원본: Mặc dù quá trình công nghiệp hóa mang lại nhiều lợi ích về kinh tế.
      - translation: 비록 공업화 과정이 경제적으로 많은 이익을 가져다주지만.
      - word_analysis: [
        { "word": "Mặc dù quá trình", "meaning": "비록 과정이 ~할지라도", "grammar": "[Mặc dù / 비록 ~일지라도 / 상황을 인정하면서 반전을 꾀하는 논리] \\n [quá trình / 과정 / 過(지나다) + 程(길) = 일이 진행되어 나가는 길목]" },
        { "word": "công nghiệp hóa", "meaning": "공업화", "grammar": "[công nghiệp hóa / 공업화 / 工(공: 일) + 業(업: 일) + 化(되다) = 산업 체제로의 변화]" },
        { "word": "mang lại nhiều lợi ích", "meaning": "많은 이익을 가져오다", "grammar": "[mang lại / 가져오다 / 외부의 것을 내 쪽으로 끌어오는 동작] \\n [lợi ích / 이익 / 利(이롭다) + 益(더하다) = 나에게 보탬이 되는 것]" },
        { "word": "về kinh tế", "meaning": "경제에 관하여", "grammar": "[về / ~에 관하여 / 화제의 방향을 지정] \\n [kinh tế / 경제 / 經(다스리다) + 濟(제: 건너다) = 세상을 경영하는 흐름]" }
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
