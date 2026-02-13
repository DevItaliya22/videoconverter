import "dotenv/config";
import { readdirSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { execSync, spawn } from "node:child_process";

// ── Config ──────────────────────────────────────────────
const VIDEOS_ROOT = join("/app", "videos");
const DIR_NAME = process.env.DIR_NAME?.trim();

if (!DIR_NAME) {
  console.error("❌  DIR_NAME is not set in .env file.");
  console.error("   Example: DIR_NAME=video2");
  process.exit(1);
}

const TARGET_DIR = join(VIDEOS_ROOT, DIR_NAME);

// ── Helpers ─────────────────────────────────────────────
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const AUDIO_EXTENSIONS = [".mp3", ".opus"];
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".webm"];

function findFileByExtensions(
  dir: string,
  extensions: string[],
): string | null {
  const files = readdirSync(dir);
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (extensions.includes(ext)) {
      return join(dir, file);
    }
  }
  return null;
}

function hasVideoFile(dir: string): boolean {
  const files = readdirSync(dir);
  return files.some((file) =>
    VIDEO_EXTENSIONS.includes(extname(file).toLowerCase()),
  );
}

/** Get audio duration in seconds using ffprobe */
function getAudioDuration(audioPath: string): number {
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_format ${JSON.stringify(audioPath)}`,
      { encoding: "utf-8" },
    );
    const parsed = JSON.parse(result);
    return parseFloat(parsed.format?.duration ?? "0");
  } catch {
    return 0;
  }
}

/** Format seconds as HH:MM:SS */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Run FFmpeg with real-time progress bar */
function runFFmpegWithProgress(
  args: string[],
  totalDuration: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args);

    let stderrBuffer = "";

    ffmpeg.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      stderrBuffer += text;

      // Parse "time=HH:MM:SS.ms" from FFmpeg stderr
      const timeMatch = text.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]!, 10);
        const mins = parseInt(timeMatch[2]!, 10);
        const secs = parseInt(timeMatch[3]!, 10);
        const currentTime = hours * 3600 + mins * 60 + secs;

        if (totalDuration > 0) {
          const percent = Math.min(100, (currentTime / totalDuration) * 100);
          const barLen = 30;
          const filled = Math.round((percent / 100) * barLen);
          const bar = "█".repeat(filled) + "░".repeat(barLen - filled);

          process.stdout.write(
            `\r  [${bar}] ${percent.toFixed(1)}%  ${formatTime(currentTime)} / ${formatTime(totalDuration)}  `,
          );
        }
      }
    });

    ffmpeg.on("close", (code) => {
      // Clear the progress line and move to next line
      process.stdout.write("\r" + " ".repeat(80) + "\r");

      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg exited with code ${code}\n${stderrBuffer.slice(-500)}`,
          ),
        );
      }
    });

    ffmpeg.on("error", (err) => {
      reject(err);
    });
  });
}

// ── Main ────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("===========================================");
  console.log("  Video Processor — Image + Audio → Video");
  console.log("===========================================");
  console.log(`  Target folder: ${DIR_NAME}`);
  console.log(`  Full path:     ${TARGET_DIR}`);
  console.log("-------------------------------------------\n");

  // 1. Check videos root exists
  if (!existsSync(VIDEOS_ROOT)) {
    console.error(`❌  Videos root not found: ${VIDEOS_ROOT}`);
    process.exit(1);
  }

  // 2. Check target folder exists
  if (!existsSync(TARGET_DIR)) {
    console.error(`❌  Folder not found: ${TARGET_DIR}`);
    console.error(`   Make sure "./videos/${DIR_NAME}" exists.`);
    process.exit(1);
  }

  // 3. Skip if video already exists
  if (hasVideoFile(TARGET_DIR)) {
    console.log(`⏭  Skipping — a video file already exists in "${DIR_NAME}".`);
    process.exit(0);
  }

  // 4. Find image (any name, .jpg/.jpeg/.png)
  const imagePath = findFileByExtensions(TARGET_DIR, IMAGE_EXTENSIONS);
  if (!imagePath) {
    console.error(
      `❌  No image file (.jpg/.jpeg/.png) found in "${DIR_NAME}".`,
    );
    process.exit(1);
  }
  console.log(`🖼  Image found: ${basename(imagePath)}`);

  // 5. Find audio (any name, .mp3 or .opus)
  const audioPath = findFileByExtensions(TARGET_DIR, AUDIO_EXTENSIONS);
  if (!audioPath) {
    console.error(`❌  No audio file (.mp3/.opus) found in "${DIR_NAME}".`);
    process.exit(1);
  }
  console.log(`🔊  Audio found: ${basename(audioPath)}`);

  // 6. Get audio duration for progress tracking
  const duration = getAudioDuration(audioPath);
  if (duration > 0) {
    console.log(`⏱  Audio duration: ${formatTime(duration)}`);
  }

  // 7. Output path — named after the folder
  const outputPath = join(TARGET_DIR, `${DIR_NAME}.mp4`);
  console.log(`🎬  Output will be: ${DIR_NAME}.mp4`);

  // 8. Build FFmpeg args
  //   -loop 1              → loop the single image
  //   -i <image>           → input image
  //   -i <audio>           → input audio
  //   -c:v libx264         → H.264 video codec
  //   -preset veryfast     → MUCH faster encoding (still good quality)
  //   -tune stillimage     → optimize for still image
  //   -c:a aac             → AAC audio codec
  //   -b:a 192k            → audio bitrate
  //   -vf scale=...        → scale down to max 1920px wide (faster + smaller file)
  //   -pix_fmt yuv420p     → pixel format for max compatibility
  //   -shortest            → stop when the audio ends
  //   -y                   → overwrite without asking
  const ffmpegArgs = [
    "-loop",
    "1",
    "-i",
    imagePath,
    "-i",
    audioPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "stillimage",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-vf",
    "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    "-y",
    outputPath,
  ];

  console.log(`\n▶  Encoding started...\n`);

  try {
    await runFFmpegWithProgress(ffmpegArgs, duration);
    console.log(
      `✅  Done! Video saved to: ./videos/${DIR_NAME}/${DIR_NAME}.mp4`,
    );
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`\n❌  FFmpeg failed:`);
    console.error(err.message);
    process.exit(1);
  }
}

main();
