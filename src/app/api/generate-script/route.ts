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
      1. **전수 분석**: 문장 내 모든 단어와 청크를 등장 순서대로 빠짐없이 분석한다. (부호 제외)
      2. **독립적 재설명**: 중복 단어라도 매번 처음부터 끝까지 상세히 풀이한다. (생략 절대 불가)
      3. **의미 덩어리(Chunk) 분석**: 의미가 연결되는 단어군을 하나의 청크 항목으로 묶어 최우선 분석한다.
      4. **역할 명시**: 문법적 역할은 [주어], [동사], [목적어], [원인 접속사], [양보 접속사] 등 약어 없이 풀어서 표기한다.
      5. **언어 통제**: 원문(text)을 제외한 모든 해설(meaning, grammar)은 반드시 한국어로만 작성하며, 번역문(translation)에서 큰따옴표는 생략한다.
      6. **[Deep Scan] 베트남어**: 다음절 단어는 전체 뜻 아래에 개별 음절의 한자(훈독 포함) 또는 고유어 원뜻을 1:1로 매칭하고, 회화 시 연상해야 할 논리적 이미지를 설명한다.
      7. **[Deep Scan] 영어**: 개별 단어의 문맥적 뜻과 더불어, 해당 단어가 머릿속에 그리는 시각적 이미지와 의미의 확장을 설명한다.

      **[📱 출력 포맷 가이드 (word_analysis 내 grammar 필드 구성)]**
      \`grammar\` 필드는 다음 수직형 리스트 구조를 엄격히 따른다 (개행 문자 \\n 사용):
      "청크 제목 [역할]: 청크 전체 의미 \\n [단어1 / 뜻 / 상세 해설] \\n [단어2 / 뜻 / 상세 해설]"
      **중요: 모든 대괄호([ ])로 시작하는 설명 항목은 반드시 각각 새로운 줄(\\n)에서 시작해야 한다.**

      **[⚠️ 강제 이행 명령]**
      1. **무조건적 전수 분석**: 문장이 아무리 짧거나 단순하더라도 위 7대 원칙에 따라 '단어 단위'로 쪼개어 분석해야 하며, 분석을 생략하는 문장이 있어서는 절대 안 된다.
      2. **가독성 극대화**: 모든 \`grammar\` 필드 내의 개별 단어 해설([단어 / 뜻 / ...])은 반드시 개행 문자(\\n)를 삽입하여 줄바꿈 처리를 한다. 한 줄에 두 개 이상의 대괄호 항목이 오는 것을 금지한다.

      **[🇺🇸 영어 정밀 분석 참조 예시 1]**
      원본: Because the global economic situation is constantly changing, our company must develop flexible strategies to secure a competitive advantage in the international market.
      - translation: 세계 경제 상황이 끊임없이 변하고 있기 때문에, 우리 회사는 국제 시장에서 경쟁 우위를 확보하기 위해 유연한 전략을 개발해야 합니다.
      - word_analysis: [
        { "word": "Because the global economic situation", "meaning": "세계 경제 상황이 ~하기 때문에", "grammar": "Because the global economic situation [원인 접속사/주어]: 세계 경제 상황이 ~하기 때문에 \\n [Because / ~때문에 / 뒤에 나오는 문장이 이 모든 상황의 '근거'임을 미리 예고하는 논리적 표지판] \\n [the / 그 / 우리가 현재 논의하고 있는 바로 그 대상을 지칭] \\n [global / 세계적인 / 지구본 전체를 아우르는 거대한 시각적 이미지] \\n [economic / 경제의 / 돈과 자원이 흐르고 순환하는 시스템에 관련된] \\n [situation / 상황 / 특정 시점에 사람들이 처해 있는 입체적인 형편이나 모습]" },
        { "word": "is constantly changing", "meaning": "끊임없이 변하고 있다", "grammar": "is constantly changing [동사]: 끊임없이 변하고 있다 \\n [is / ~이다 / 현재의 상태를 나타내는 연결 고리] \\n [constantly / 끊임없이 / 멈추지 않고 시계추처럼 계속해서 이어지는 움직임] \\n [changing / 변하는 / 이전의 모습에서 새로운 모습으로 탈바꿈하는 역동적인 그림]" },
        { "word": "our company must develop", "meaning": "우리 회사는 개발해야 한다", "grammar": "our company must develop [주어2/동사2]: 우리 회사는 개발해야 한다 \\n [our / 우리의 / 내가 속해 있는 공동체의 소유권을 강조] \\n [company / 회사 / 사람들이 함께(com-) 빵을 먹으며(pan-) 일하는 집단] \\n [must / 반드시 ~해야 한다 / 선택의 여지가 없는 강한 의무나 필요성의 압박] \\n [develop / 개발하다 / 껍질을 벗겨내어 알맹이를 키우듯 새로운 것을 만들어가는 과정]" },
        { "word": "flexible strategies", "meaning": "유연한 전략들을", "grammar": "flexible strategies [목적어]: 유연한 전략들을 \\n [flexible / 유연한 / 고정되지 않고 상황에 따라 고무줄처럼 휘어질 수 있는 이미지] \\n [strategies / 전략들 / 승리를 위해 머릿속으로 그린 치밀하고 거대한 계획의 조각들]" },
        { "word": "to secure a competitive advantage", "meaning": "경쟁 우위를 확보하기 위해", "grammar": "to secure a competitive advantage [목적 부사구]: 경쟁 우위를 확보하기 위해 \\n [to / ~하기 위해 / 행동의 에너지가 나아가는 최종 목적지] \\n [secure / 확보하다 / 불안정한 것을 꽉 붙잡아 안전하게 내 것으로 만드는 그림] \\n [a / 하나의 / 여러 가능성 중 하나를 구체화함] \\n [competitive / 경쟁적인 / 서로 앞서려고 다투는 에너지가 느껴지는 상태] \\n [advantage / 우위/이점 / 남들보다 한 발자국 앞서 있는 유리한 위치]" },
        { "word": "in the international market", "meaning": "국제 시장에서", "grammar": "in the international market [전치사구]: 국제 시장에서 \\n [in / ~안에서 / 거대한 시장이라는 공간의 테두리 내부] \\n [the / 그 / 우리가 활동하는 바로 그 영역] \\n [international / 국제적인 / 국가(nation)와 국가 사이(inter-)를 넘나드는 넓은 범위] \\n [market / 시장 / 물건과 가치가 끊임없이 교환되는 활기찬 장소]" }
      ]

      **[🇻🇳 베트남어 정밀 분석 참조 예시 1]**
      원본: Mặc dù quá trình công nghiệp hóa mang lại nhiều lợi ích về kinh tế, nhưng chúng ta cần phải có trách nhiệm bảo vệ môi trường để đảm bảo sự phát triển bền vững.
      - translation: 비록 공업화 과정이 경제적으로 많은 이익을 가져다주지만, 우리는 지속 가능한 발전을 보장하기 위해 환경을 보호해야 할 책임이 있습니다.
      - word_analysis: [
        { "word": "Mặc dù quá trình công nghiệp hóa", "meaning": "비록 공업화 과정이", "grammar": "Mặc dù quá trình công nghiệp hóa [양보 접속사/주어]: 비록 공업화 과정이 \\n [Mặc dù / 비록 ~일지라도 / Mặc(불구하고) + dù(설령) = 어떤 상황을 인정하면서도 반전을 꾀하는 논리] \\n [quá trình / 과정 / 過(과: 지나다) + 程(정: 길/한도) = 어떤 일이 진행되어 나가는 길목] \\n [công nghiệp hóa / 공업화 / 工(공: 일) + 業(업: 일) + 化(화: 되다) = 산업적인 체제로 변화함]" },
        { "word": "mang lại nhiều lợi ích về kinh tế", "meaning": "경제에 관한 많은 이익을 가져오다", "grammar": "mang lại nhiều lợi ích về kinh tế [동사/목적어]: 경제에 관한 많은 이익을 가져오다 \\n [mang lại / 가져오다 / mang(지니다/들다) + lại(오다) = 외부의 것을 내 쪽으로 끌어오는 동작] \\n [nhiều / 많은 / 수량이나 정도가 풍부한 상태] \\n [lợi ích / 이익 / 利(리: 이롭다) + 益(익: 더하다) = 나에게 도움이 되고 보탬이 되는 것] \\n [về / ~에 관하여 / 화제가 향하는 방향을 지정] \\n [kinh tế / 경제 / 經(경: 다스리다) + 濟(제: 건너다) = 세상을 경영하고 백성을 구제하는 흐름]" },
        { "word": "nhưng chúng ta cần phải có trách nhiệm", "meaning": "하지만 우리는 책임을 가져야 한다", "grammar": "nhưng chúng ta cần phải có trách nhiệm [반전 접속사/주어2/동사2]: 하지만 우리는 책임을 가져야 한다 \\n [nhưng / 하지만 / 앞의 이익에도 불구하고 꼭 해야 할 '의무'를 강조하는 전환점] \\n [chúng ta / 우리 / 청자를 포함하여 우리 모두가 주체임을 나타냄] \\n [cần phải / ~해야 한다 / cần(필요하다) + phải(당연히 ~이다) = 반드시 이행해야 할 당위성] \\n [có / 가지다 / 존재하게 하거나 소유하는 상태] \\n [trách nhiệm / 책임 / 責(책: 꾸짖다/맡기다) + 任(임: 맡기다) = 마땅히 짊어져야 할 임무]" },
        { "word": "bảo vệ môi trường", "meaning": "환경을 보호하다", "grammar": "bảo vệ môi trường [목적어2]: 환경을 보호하다 \\n [bảo vệ / 보호 / 保(보: 지키다) + 衛(위: 지키다) = 외부의 위협으로부터 안전하게 지킴] \\n [môi trường / 환경 / 媒(매: 매개) + 境(경: 지경) = 우리를 둘러싸고 있는 주변의 모든 세계]" },
        { "word": "để đảm bảo sự phát triển bền vững", "meaning": "지속 가능한 발전을 보장하기 위해", "grammar": "để đảm bảo sự phát triển bền vững [목적 부사구]: 지속 가능한 발전을 보장하기 위해 \\n [để / ~하기 위해 / 행동의 최종 지향점을 예고] \\n [đảm bảo / 보장 / 擔(담: 메다) + 保(보: 지키다) = 어깨에 메고 끝까지 책임지고 지킴] \\n [sự phát triển / 발전 / sự(일/사건) + phát(發: 피어나다) + triển(展: 펴지다) = 에너지가 밖으로 뻗어 나가며 성장함] \\n [bền vững / 지속 가능한/공고한 / bền(단단하다) + vững(굳건하다) = 쉽게 흔들리지 않고 오래 유지되는 이미지]" }
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
