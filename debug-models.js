const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Try to load .env from the parent directory (roleplay-gen)
const envPath = path.resolve(__dirname, ".env");
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("GEMINI_API_KEY not found in .env");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    try {
        // Unfortunately, the JS SDK doesn't have a direct listModels method.
        // But we can check if gemini-2.0-flash works by trying a simple generation.
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent("test");
        console.log("gemini-2.0-flash is available and working.");
        console.log("Response:", result.response.text());
    } catch (e) {
        console.error("gemini-2.0-flash failed:", e.message);
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("test");
        console.log("gemini-1.5-flash is available and working.");
    } catch (e) {
        console.error("gemini-1.5-flash failed:", e.message);
    }
}

listModels();
