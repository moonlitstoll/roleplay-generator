import { generateContentWithRetry } from './gemini';

async function testRetry() {
    console.log("--- Starting Gemini Retry Logic Test ---");

    let callCount = 0;
    const mockModel: any = {
        generateContent: async (prompt: string) => {
            callCount++;
            console.log(`[Mock] generateContent called (Attempt ${callCount})`);

            if (callCount < 3) {
                console.log(`[Mock] Simulating 429 Error`);
                throw new Error("429 Too Many Requests: Resource exhausted");
            }

            console.log(`[Mock] Success on attempt ${callCount}`);
            return {
                response: {
                    text: () => JSON.stringify({ success: true, attempt: callCount })
                }
            };
        }
    };

    try {
        const result = await generateContentWithRetry(mockModel, "test prompt", 3, 500);
        console.log("Test Result:", result.response.text());
        if (callCount === 3) {
            console.log("✅ SUCCESS: Retried 2 times and succeeded on the 3rd attempt.");
        } else {
            console.log("❌ FAILED: Unexpected call count:", callCount);
        }
    } catch (error: any) {
        console.error("❌ FAILED: Test threw error:", error.message);
    }
}

testRetry();
