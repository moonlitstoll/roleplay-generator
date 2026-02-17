
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const path = require('path');
const fs = require('fs');

// Simple .env parser to avoid complex dependencies
const envPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

// Mock input for testing "Strict Adherence"
const inputScenario = "두 사람이 화성에서 농사를 짓다가 물이 부족해서 싸우는 상황";
const language = "Vietnamese";
const count = 3;
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("Error: GEMINI_API_KEY is missing in .env.local");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
                script: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            text: { type: SchemaType.STRING },
                            translation: { type: SchemaType.STRING },
                        }
                    }
                }
            }
        }
    }
});

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
  
  Input Context: "${inputScenario}"
  Target Language: ${language}
  Reference Language: Korean
  
  Generate exactly ${count * 2} lines of conversation.
`;

async function runTest() {
    console.log(`Testing Scenario: "${inputScenario}"`);
    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const data = JSON.parse(responseText);

        console.log("\n--- Generated Script ---");
        data.script.forEach((line, index) => {
            console.log(`[${index + 1}] ${line.translation} (${line.text})`);
        });

        // Simple validation logic
        const scriptText = JSON.stringify(data.script);
        // Use loose check because "Mars" in Vietnamese might vary or be implied in context
        // Hỏa tinh, Sao Hỏa, Mars
        const hasMarsRelated = /hỏa tinh|sao hỏa|mars|화성/i.test(scriptText);
        // Nước, Thủy, Water, 물
        const hasWaterRelated = /nước|thủy|water|물/i.test(scriptText);

        if (hasMarsRelated && hasWaterRelated) {
            console.log("\n✅ SUCCESS: The generated script contains references to Mars and Water/Shortage.");
        } else {
            console.log("\n❌ FAILURE: The script might be missing key details (Mars/Water). Check output manually.");
            console.log(scriptText);
        }

    } catch (error) {
        console.error("Error running test:", error);
    }
}

runTest();
