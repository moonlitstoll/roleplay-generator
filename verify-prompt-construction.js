
const getRandomTopic = () => {
    return "Random Topic Placeholder";
};

function generatePrompt(input, language, count, mode) {
    const isInputEmpty = !input || input.trim() === '';
    const promptInput = isInputEmpty ? getRandomTopic() : input;

    const isAnalysisMode = count === 0 && mode === 'analysis';
    const isMonologueMode = count === 0 && mode === 'roleplay';

    let baseInstruction = '';

    if (isAnalysisMode) {
        baseInstruction = `VERBATIM ANALYSIS MODE...`;
    } else if (isMonologueMode) {
        baseInstruction = `MONOLOGUE GENERATION MODE...`;
    } else {
        baseInstruction = `
          Generate exactly ${count * 2} lines of conversation...
          SCENARIO: "${promptInput}"
          CRITICAL INSTRUCTION - NATURALNESS PRIORITY...
        `;
    }

    const prompt = `
      You are an expert language conversation generator.
      
      **CORE OBJECTIVE:**
      Create a roleplay script based on the User's Input.
      
      **CRITICAL INSTRUCTIONS (MUST FOLLOW):**
      
      1. **STRICT ADHERENCE (The Law)**:
         - If the user provides a specific situation, setting, or constraint in the "Input Context" (especially in Korean), **YOU MUST FOLLOW IT EXACTLY.**
         - Do NOT ignore any specific detail the user asks for.
         - Do NOT change the core premise requested by the user.
      
      2. **LIMITLESS CREATIVITY (The Execution)**:
         - While following the user's constraints strictly, **do NOT be generic.**
         - Use the user's input as a seed to grow a **unique, specific, and vivid** scenario.
         - **Invent details**: Add specific reasoning, unique character backstories, or a twist that makes this specific iteration of the scenario interesting.
         - Avoid "textbook" or "cliché" dialogues. Make the interaction feel "alive" and "real".
      
      3. **NATURAL LANGUAGE**:
         - Use "Native-Level" expressions.
         - Include natural hesitation markers, slang, or idioms where strict formal grammar would be unnatural.
      
      Input Context: "${promptInput}"
      Target Language: ${language}
      Reference Language: Korean
      
      ${baseInstruction}
      
      KOREAN-ONLY EXPLANATIONS (STRICT):
      - All word analyses [word_analysis] MUST be in Korean.
      - **DO NOT use any English words, grammar terms (like Noun, Verb, etc.), or explanations.**
      - Use ONLY Korean grammar terms (e.g., 명사, 동사, 형용사, 조사, 어미 등).
    `;

    return prompt;
}

console.log("--- TEST 1: Empty Input (Random Topic) ---");
console.log(generatePrompt("", "Vietnamese", 3, "roleplay"));

console.log("\n--- TEST 2: Specific Korean Input ---");
console.log(generatePrompt("두 사람이 화성에서 물 부족으로 싸움", "Vietnamese", 3, "roleplay"));
