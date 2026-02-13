# Video Processor — Image + Audio to Video

Combines a static image (`.jpg`/`.jpeg`/`.png`) and an audio file (`.mp3` or `.opus`) into a video (`.mp4`) using FFmpeg inside Docker.

---

## One-time setup (first time only)

```bash
docker compose build
```

This builds the Docker image with Node.js, FFmpeg, and the script baked in. You only need to do this **once**.

---

## Daily usage

### 1. Put your files in the right folder

```
videos/
  video2/
    anything.png      <-- one image (jpg/jpeg/png)
    anything.mp3      <-- one audio (mp3 or opus)
```

The image and audio files can have **any name** — the script finds them by extension.

### 2. Set `DIR_NAME` in `.env`

Open `.env` and change the folder name:

```env
DIR_NAME=video2
```

### 3. Run

```bash
docker compose run --rm video-processor
```

That's it. The output video will appear in the same folder:

```
videos/
  video2/
    anything.png
    anything.mp3
    video2.mp4         <-- generated video
```

---

## Quick reference

| What                         | Command                                   |
| ---------------------------- | ----------------------------------------- |
| Build (once)                 | `docker compose build`                    |
| Run                          | `docker compose run --rm video-processor` |
| Change target folder         | Edit `DIR_NAME` in `.env`                 |
| Rebuild (after code changes) | `docker compose build`                    |

---

## Notes

- The video is a **static image** with the audio playing over it (H.264 + AAC).
- Image is auto-scaled down to **max 1920x1080** for faster encoding and smaller file size.
- Encoding uses `-preset veryfast` for speed — still good quality for a static image.
- **Live progress bar** shows percentage, elapsed time, and total duration while encoding.
- Supports both `.mp3` and `.opus` audio formats.
- If a `.mp4` file already exists in the folder, the script **skips** it to avoid overwriting.
- The output file is named after the folder (e.g., `video2/video2.mp4`).
- File names can contain any characters (unicode, spaces, etc.) — they are handled correctly.
