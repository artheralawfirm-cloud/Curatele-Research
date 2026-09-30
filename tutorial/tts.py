"""Generate Indonesian narration with Gemini TTS and split it per segment.

The whole script is spoken in one request (consistent voice, one quota hit),
then cut at the longest pauses between paragraphs.

Usage: python3 tutorial/tts.py <out_dir>
Reads GEMINI_API_KEY from the environment or from .env.local.
"""
import json, os, re, sys, time, wave
from pathlib import Path

import numpy as np
from google import genai
from google.genai import types

ROOT = Path(__file__).resolve().parent.parent
RATE = 24000


def api_key():
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]
    env = (ROOT / ".env.local").read_text()
    return re.search(r'GEMINI_API_KEY="?([^"\n]+)', env).group(1)


def synthesize(cfg):
    transcript = "\n\n".join(s["text"] for s in cfg["segments"])
    prompt = (
        f"# AUDIO PROFILE\n{cfg['profile']}\n\n"
        f"# DIRECTOR'S NOTES\n{cfg['style']}\n\n"
        f"# TRANSCRIPT\n{transcript}"
    )
    client = genai.Client(api_key=api_key())
    for attempt in range(5):
        try:
            r = client.models.generate_content(
                model=cfg["model"],
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=cfg["voice"])
                        )
                    ),
                ),
            )
            return r.candidates[0].content.parts[0].inline_data.data
        except Exception as e:
            print(f"retry {attempt + 1}: {str(e)[:120]}")
            time.sleep(15 * (attempt + 1))
    sys.exit("TTS failed")


def write_wav(path, samples):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(samples.astype(np.int16).tobytes())


def split(samples, texts):
    """Return one (start, end) sample range per text.

    Cuts are chosen among pauses by dynamic programming: prefer long pauses
    that sit where the cumulative text length says a paragraph should end.
    """
    n = len(texts)
    hop = RATE // 100
    frames = samples[: len(samples) // hop * hop].astype(float).reshape(-1, hop)
    loud = 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-9) > 40  # ~-50 dBFS
    idx = np.flatnonzero(loud)
    first, last = idx[0], idx[-1]
    gaps = []  # (length, gap_start, gap_end) in frames
    run = None
    for i in range(first, last + 1):
        if not loud[i]:
            run = run if run is not None else i
        elif run is not None:
            gaps.append((i - run, run, i))
            run = None
    gaps = [g for g in gaps if g[0] >= 25]
    lens = np.array([len(t) for t in texts], float)
    spoken = (last - first) - sum(sorted((g[0] for g in gaps), reverse=True)[: n - 1])
    rate = spoken / lens.sum()  # frames per character
    # dp[k][j]: best cost with cut k placed at gap j
    INF = float("inf")
    m = len(gaps)
    dp = np.full((n - 1, m), INF)
    back = np.zeros((n - 1, m), int)

    def seg_cost(k, a_end, b_start, gap_len):
        dur = b_start - a_end  # speech frames of segment k
        return ((dur - lens[k] * rate) / 150) ** 2 - gap_len / 60

    for j, (gl, a, b) in enumerate(gaps):
        dp[0][j] = seg_cost(0, first, a, gl)
    for k in range(1, n - 1):
        for j, (gl, a, b) in enumerate(gaps):
            for i in range(j):
                if dp[k - 1][i] < INF:
                    c = dp[k - 1][i] + seg_cost(k, gaps[i][2], a, gl)
                    if c < dp[k][j]:
                        dp[k][j], back[k][j] = c, i
    final = [dp[n - 2][j] + seg_cost(n - 1, gaps[j][2], last + 1, 0) for j in range(m)]
    j = int(np.argmin(final))
    picks = []
    for k in range(n - 2, -1, -1):
        picks.append(j)
        j = back[k][j]
    cuts = [gaps[j] for j in reversed(picks)]
    bounds = [first] + [x for _, a, b in cuts for x in (a, b)] + [last + 1]
    pad = 5  # keep 50 ms around speech
    return [
        (max(0, (bounds[2 * k] - pad)) * hop, min(len(samples), (bounds[2 * k + 1] + pad) * hop))
        for k in range(n)
    ], [g[0] for g in cuts]


def main(out_dir):
    cfg = json.loads((ROOT / "tutorial" / "narasi.json").read_text())
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    full = out / "narasi_full.wav"
    if not full.exists():
        write_wav(full, np.frombuffer(synthesize(cfg), np.int16))
    with wave.open(str(full)) as w:
        samples = np.frombuffer(w.readframes(w.getnframes()), np.int16)
    segs = cfg["segments"]
    ranges, cut_gaps = split(samples, [s["text"] for s in segs])
    print(f"full: {len(samples) / RATE:.1f}s, pauses cut (10ms): {cut_gaps}")
    for seg, (a, b) in zip(segs, ranges):
        write_wav(out / f"{seg['id']}.wav", samples[a:b])
        chars = len(seg["text"])
        print(f"{seg['id']}: {(b - a) / RATE:5.1f}s  ({chars} chars, {chars / ((b - a) / RATE):.0f} ch/s)")


if __name__ == "__main__":
    main(sys.argv[1])
