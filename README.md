# Roleplay & Language Learning Audio Generator

A Next.js-based AI application that generates roleplay scripts and realistic audio for language learners. Features native-level dialogue generation, hybrid TTS (Google & Edge), and detailed sentence analysis.

## Key Features

- **AI Script Generation**: Powered by Gemini 2.5 Flash, generating situation-appropriate dialogues for learning.
- **Hybrid TTS Engine**:
  - **Vietnamese**: Uses **Edge TTS** (Natural/Neural) for both Northern and Southern accents, ensuring high-quality, region-specific audio.
  - **English**: Uses **Edge TTS** for natural native pronunciation.
  - **Dual Accent Priority**: For Vietnamese, Saigon (South) accent is generated first by default.
- **Interactive Player**:
  - **Auto-Scroll**: Active sentences scroll to the top of the viewing area.
  - **Analysis Mode**: Toggle to show/hide Korean translations and detailed word/grammar breakdowns.
  - **Playback Controls**: Play/Pause, Next/Prev Sentence, Repeat Sentence (1-Loop), Repeat Session (S-Loop), Playback Speed (0.5x - 2.0x).
- **Export**: Download the entire session as a standalone HTML file for offline practice.

## Prerequisites

- **Node.js** (v18 or higher recommended)
- **Gemini API Key**: Required for generating scripts.

## Installation

1.  Clone the repository:
    ```bash
    git clone [repository-url]
    cd roleplay-gen
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Set up Environment Variables (Optional but recommended):
    - Copy `.env.example` to `.env`:
      ```bash
      cp .env.example .env
      ```
    - Add your Gemini API Key to `GEMINI_API_KEY` (or input it directly in the UI settings).

4.  **Important Note on FFmpeg**:
    This project uses `ffmpeg-static` and `ffprobe-static`.
    - The API route (`src/app/api/generate-audio/route.ts`) handles path resolution automatically for most environments (Windows/Linux/Mac).
    - If you encounter "ENOENT" errors regarding FFmpeg, ensure your `node_modules` are fully installed and the paths in `route.ts` align with your system.

## Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **AI Model**: Google Gemini 2.5 Flash
- **Audio Processing**: Fluent-ffmpeg, node-edge-tts, google-tts-api
- **Icons**: Lucide React
