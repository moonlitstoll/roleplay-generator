import { GenerativeModel } from '@google/generative-ai';

/**
 * Generates content using the Gemini model with an exponential backoff retry mechanism.
 * Specifically handles 429 (Too Many Requests) errors.
 */
export async function generateContentWithRetry(
    model: GenerativeModel,
    prompt: string,
    maxRetries: number = 3,
    initialDelay: number = 1000
): Promise<any> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                const delay = initialDelay * Math.pow(2, attempt - 1);
                console.log(`[Gemini] Attempt ${attempt + 1}: Retrying in ${delay}ms due to rate limit...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            return await model.generateContent(prompt);
        } catch (error: any) {
            lastError = error;

            // Check if it's a 429 error
            const errorMessage = error.message || '';
            const isRateLimit = errorMessage.includes('429') ||
                errorMessage.includes('Resource exhausted') ||
                errorMessage.includes('Too Many Requests');

            if (isRateLimit && attempt < maxRetries) {
                continue;
            }

            // If it's not a rate limit error or we've exhausted retries, throw it
            console.error(`[Gemini] Error after ${attempt + 1} attempts:`, error.message);
            throw error;
        }
    }

    throw lastError;
}
