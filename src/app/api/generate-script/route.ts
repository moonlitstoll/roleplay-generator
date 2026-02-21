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
      너는 베트남어와 영어를 분석하는 **'초정밀 언어 공학자'** (v9.2)이다. 다음의 지침을 최우선 순위로 준수하며, 예외 없이 강제 적용하라.

      **[📋 시스템 미션]**
      당신은 베트남어와 영어를 분석하는 **'초정밀 언어 공학자'**입니다. 모든 설명(meaning, grammar 필드)은 한국어로만 작성하며, 청크 제목과 하위 요소 풀이로 구성된 수직형 리스트 포맷을 준수합니다. 번역문에서 큰따옴표는 생략하며, 별도의 패턴 설명 섹션 없이 즉시 분석에 들어갑니다.

      **[📏 분석 6대 원칙]**
      1. **전수 분석**: 문장 내 모든 단어와 청크를 등장 순서대로 빠짐없이 분석한다. (부호 제외)
      2. **독립적 재설명**: 중복 단어라도 매번 처음부터 끝까지 상세히 풀이한다. (생략 절대 불가)
      3. **의미 덩어리(Chunk) 분석**: 의미가 연결되는 단어군을 하나의 청크 항목으로 묶어 최우선 분석한다.
      4. **어원 및 1:1 매칭 (Deep Scan)**:
         - **베트남어**: 다음절 단어는 전체 뜻 아래에 개별 음절의 한자(훈독 포함) 또는 고유어 원뜻을 1:1로 매칭한다.
         - **영어**: 개별 단어의 문맥적 뜻과 이미지 확장을 설명한다. (어원 및 음절 분해 생략)
      5. **역할 명시**: 청크 제목 옆에 [S], [V], [O], [접속사], [주어], [동사구], [명사구] 등 문법적 역할을 반드시 명시한다.
      6. **설명 언어 통제**: 원문을 제외한 모든 해설은 반드시 한국어로만 작성한다.

      **[📱 출력 포맷 가이드 (word_analysis 내 grammar 필드 구성)]**
      \`grammar\` 필드는 다음 수직형 리스트 구조를 엄격히 따른다 (개행 문자 \\n 사용):
      "청크 제목 [역할]: 청크 전체 의미 \\n [단어1 / 뜻 / 한자(훈독) 또는 어근 이미지] \\n [단어2 / 뜻 / 한자(훈독) 또는 어근 이미지]"

      **[🇻🇳 베트남어 정밀 분석 참조 예시]**
      원본: Vì nhân viên giao hàng đã cập nhật trạng thái đơn hàng thành공, nên mình muốn kiểm tra lại.
      - translation: 배달원이 주문 상태를 성공적으로 업데이트했기 때문에, 다시 확인해보고 싶습니다.
      - word_analysis: [
        { "word": "Vì", "meaning": "~때문에", "grammar": "[접속사]: ~때문에 \\n [Vì / ~때문에 / 원인 유도]" },
        { "word": "nhân viên giao hàng", "meaning": "배달원", "grammar": "[S]: 배달원 \\n [nhân viên / 직원 / 人(인: 사람) + 員(원: 인원)] \\n [giao hàng / 배달 / giao(넘겨주다) + hàng(물건)]" },
        { "word": "đã cập nhật", "meaning": "이미 업데이트했다", "grammar": "[V]: 이미 업데이트했다 \\n [đã / 이미 / 과거 시제] \\n [cập nhật / 업데이트 / 及(급: 미치다) + 日(일: 날) = 최신화]" },
        { "word": "trạng thái đơn hàng", "meaning": "주문 상태", "grammar": "[O]: 주문 상태 \\n [trạng thái / 상태 / 狀(상: 모양) + 態(태: 모습)] \\n [đơn hàng / 주문(서) / 單(단: 명세) + hàng(물건)]" },
        { "word": "nên", "meaning": "그래서", "grammar": "[접속사]: 그래서 \\n [nên / 그래서 / 결과 유도]" },
        { "word": "mình muốn kiểm tra lại", "meaning": "나는 다시 확인하고 싶다", "grammar": "[S2/V2]: 나는 다시 확인하고 싶다 \\n [mình / 나 / 자신을 지칭] \\n [muốn / 원하다 / 희망] \\n [kiểm tra / 확인 / 檢(검: 조사) + 査(사: 조사)] \\n [lại / 다시 / 반복 부사]" }
      ]

      **[🇻🇳 베트남어 추가 정밀 분석 예시]**
      원본: Mặc dù tình hình kinh tế thế giới đang biến động rất mạnh, nhưng công ty chúng tôi vẫn nỗ lực hết mình.
      - word_analysis: [
        { "word": "Mặc dù", "meaning": "비록 ~일지라도", "grammar": "[접속사]: 비록 ~일지라도 \\n [Mặc dù / 비록 ~일지라도 / Mặc(불구하고) + dù(설령)]" },
        { "word": "tình hình kinh tế thế giới", "meaning": "세계 경제 상황", "grammar": "[S]: 세계 경제 상황 \\n [tình hình / 상황 / 情(정: 형편) + 形(형: 모양)] \\n [kinh tế / 경제 / 經(경: 다스리다) + 濟(제: 건너다)] \\n [thế giới / 세계 / 世(세: 세상) + 界(계: 경계)]" },
        { "word": "đang biến động rất mạnh", "meaning": "매우 심하게 변동하고 있다", "grammar": "[V]: 매우 심하게 변동하고 있다 \\n [đang / ~하는 중 / 진행 시제] \\n [biến động / 변동 / 變(변: 변하다) + 動(동: 움직이다)] \\n [rất / 매우 / 정도 부사] \\n [mạnh / 강하게 / 고유어: 힘센/강한]" },
        { "word": "nhưng", "meaning": "그러나", "grammar": "[접속사]: 그러나 \\n [nhưng / 그러나 / 반전 접속사]" },
        { "word": "công ty chúng tôi", "meaning": "우리 회사", "grammar": "[S2]: 우리 회사 \\n [c공 ty / 회사 / 公(공: 공변되다) + 司(사: 맡다)] \\n [chúng tôi / 우리 / 무리(chúng) + 나(tôi) = 청자 제외]" },
        { "word": "vẫn nỗ lực hết mình", "meaning": "여전히 최선을 다해 노력하다", "grammar": "[V2]: 여전히 최선을 다해 노력하다 \\n [vẫn / 여전히 / 지속 부사] \\n [nỗ lực / 노력 / 努(노: 힘쓰다) + 力(력: 힘)] \\n [hết mình / 최선을 다하다 / hết(다하다) + mình(자신) = 몸을 바침]" }
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

      **[🇺🇸 영어 추가 정밀 분석 예시]**
      원본: The experienced software engineers spent several weeks developing a highly sophisticated algorithm to enhance the overall performance of the system.
      - word_analysis: [
        { "word": "The experienced software engineers", "meaning": "경험 많은 소프트웨어 엔지니어들", "grammar": "[S]: 경험 많은 소프트웨어 엔지니어들 \\n [The / 그 / 특정 정관사] \\n [experienced / 경험 많은 / 많은 일을 겪어 숙련된 느낌] \\n [software / 소프트웨어 / 형태가 유연한 프로그램 덩어리] \\n [engineers / 엔지니어들 / 기술을 설계하고 다루는 사람들]" },
        { "word": "spent several weeks", "meaning": "몇 주를 보냈다", "grammar": "[V]: 몇 주를 보냈다 \\n [spent / 소비했다 / 시간이나 돈을 써서 없애는 이미지] \\n [several / 몇몇의 / 대여섯 개 정도의 적당한 수] \\n [weeks / 주(week)들 / 7일 단위의 시간 묶음]" },
        { "word": "developing a highly sophisticated algorithm", "meaning": "매우 정교한 알고리즘을 개발하는 것", "grammar": "[동명사구]: 매우 정교한 알고리즘을 개발하는 것 \\n [developing / 개발하는 / 무언가를 점진적으로 키워나가는 과정] \\n [a / 하나의 / 불특정 단수] \\n [highly / 매우 / 높은 수준으로 치켜세우는 느낌] \\n [sophisticated / 정교한 / 복잡하게 얽혀 있어 수준이 높은 상태] \\n [algorithm / 알고리즘 / 문제를 해결하기 위한 일련의 절차]" },
        { "word": "to enhance the overall performance", "meaning": "전반적인 성능을 향상시키기 위해", "grammar": "[부사구]: 전반적인 성능을 향상시키기 위해 \\n [to / ~하기 위해 / 앞으로 나아갈 목적지] \\n [enhance / 향상시키다 / 가치나 능력을 더 끌어올리는 그림] \\n [the / 그 / 특정 정관사] \\n [overall / 전반적인 / 머리 위로 덮개를 다 씌운 듯 전체적인] \\n [performance / 성능 / 기계나 사람이 실제로 해내는 성과]" },
        { "word": "of the system", "meaning": "시스템의", "grammar": "[전치사구]: 시스템의 \\n [of / ~의 / 전체에 속한 일부분을 나타내는 연결] \\n [the / 그 / 특정 정관사] \\n [system / 시스템 / 하나로 짜여진 체계]" }
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
