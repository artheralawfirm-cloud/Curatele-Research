"""Rebuild the tutorial video with the Gemini TTS narration.

Each segment of the original video (see narasi.json) gets its narration clip.
When a clip is longer than its segment, the segment's last frame is held
until the narration finishes, so picture and voice stay in sync. Optional
per-segment keys: "keep" (max seconds of the original to use; the cut into
the next segment becomes a dissolve) and "lead" (seconds before the voice).

Usage: python3 tutorial/build.py <original.mp4> <tts_dir> <out.mp4> [--no-music]
Needs ffmpeg on PATH (or FFMPEG env var).
"""
import json, os, subprocess, sys, wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
LEAD, TAIL, INTRO_LEAD = 0.6, 0.7, 0.9  # seconds of silence around each clip
XFADE = 0.5  # card transitions start ~0.5s before the detected boundary
FADE = 0.6  # dissolve length where a segment tail is trimmed ("keep")
SR = 44100


def wav_seconds(path):
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


def pad_music(seconds, path):
    """Soft ambient pad + gentle plucks (Cmaj7 - G6 - Am7 - Fmaj7), 64 BPM."""
    t = np.arange(int(seconds * SR)) / SR
    chords = [[48, 52, 55, 59], [43, 50, 55, 59], [45, 52, 55, 60], [41, 48, 52, 57]]
    bar = 60 / 64 * 4
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    out = np.zeros_like(t)
    n_bars = int(seconds / bar) + 2
    for b in range(n_bars):
        notes = chords[b % 4]
        start = b * bar
        # pad: overlapping bars with a smooth raised-cosine envelope
        seg = (t >= start - bar * 0.25) & (t < start + bar * 1.25)
        tt = t[seg] - (start - bar * 0.25)
        env = np.sin(np.pi * np.clip(tt / (bar * 1.5), 0, 1)) ** 2
        for m in notes:
            for detune in (-0.12, 0.12):
                f = hz(m + 12) * 2 ** (detune / 12)
                out[seg] += env * (np.sin(2 * np.pi * f * t[seg]) + 0.25 * np.sin(4 * np.pi * f * t[seg])) * 0.05
        # plucks: rolling eighth-note arpeggio, very soft
        arp = notes + [notes[1] + 12, notes[2] + 12, notes[3] + 12, notes[2] + 12]
        for i, m in enumerate(arp):
            s = start + i * bar / 8
            seg = (t >= s) & (t < s + 1.5)
            tt = t[seg] - s
            f = hz(m + 24)
            out[seg] += np.exp(-tt * 4) * np.sin(2 * np.pi * f * t[seg]) * (1 - np.exp(-tt * 200)) * 0.06
    out /= np.abs(out).max() + 1e-9
    fade = int(3 * SR)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    raw = path.with_suffix(".raw.wav")
    with wave.open(str(raw), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((out * 0.8 * 32767).astype(np.int16).tobytes())
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-i", str(raw), "-af",
         "lowpass=f=5000,aecho=0.8:0.6:120|260:0.35|0.25,volume=0.9", "-ac", "2", str(path)],
        check=True,
    )
    raw.unlink()


def main(src, tts_dir, out, music=True):
    cfg = json.loads((ROOT / "narasi.json").read_text())
    segs = cfg["segments"]
    tts = Path(tts_dir)
    work = Path(out).parent / "build_tmp"
    work.mkdir(parents=True, exist_ok=True)

    # cut points shifted so each card transition belongs to the next segment
    cuts = [0.0] + [s["start"] - XFADE for s in segs[1:]] + [segs[-1]["end"]]
    vf_parts, timeline = [], []
    chain, cursor = None, 0.0
    for k, seg in enumerate(segs):
        a, b = cuts[k], cuts[k + 1]
        if "keep" in seg:  # drop the idle tail of a long segment
            b = min(b, a + seg["keep"])
        clip = wav_seconds(tts / f"{seg['id']}.wav")
        lead = seg.get("lead", INTRO_LEAD if k == 0 else LEAD + XFADE)
        hold = max(0.0, lead + clip + TAIL - (b - a))
        length = (b - a) + hold
        is_last = k == len(segs) - 1
        vf_parts.append(
            f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS,fps=30,settb=AVTB"
            + (f",tpad=stop_mode=clone:stop_duration={hold:.3f}" if hold else "")
            + (f",fade=t=out:st={length - 1:.3f}:d=1" if is_last else "")
            + f"[v{k}]"
        )
        if chain is None:
            chain, start = "v0", 0.0
        elif "keep" in segs[k - 1]:  # trimmed cut: dissolve instead of a jump cut
            start = cursor - FADE
            vf_parts.append(f"[{chain}][v{k}]xfade=transition=fade:duration={FADE}:offset={start:.3f}[j{k}]")
            chain = f"j{k}"
        else:
            start = cursor
            vf_parts.append(f"[{chain}][v{k}]concat=n=2:v=1:a=0[j{k}]")
            chain = f"j{k}"
        cursor = start + length
        timeline.append((seg["id"], start + lead, clip, hold))
    total = cursor
    vf_parts.append(f"[{chain}]format=yuv420p[vout]")

    for sid, at, clip, hold in timeline:
        print(f"{sid:12s} voice @ {at:6.2f}s  len {clip:5.2f}s  hold {hold:4.2f}s")
    print(f"total {total:.2f}s")

    inputs = ["-i", src]
    afilters = []
    for i, (sid, at, _, _) in enumerate(timeline):
        inputs += ["-i", str(tts / f"{sid}.wav")]
        ms = int(at * 1000)
        afilters.append(f"[{i + 1}:a]aresample={SR},adelay={ms}|{ms},apad[n{i}]")
    n = len(timeline)
    afilters.append(
        "".join(f"[n{i}]" for i in range(n))
        + f"amix=inputs={n}:normalize=0:duration=longest,atrim=0:{total:.3f},"
        "highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,"
        "pan=stereo|c0=c0|c1=c0[voice]"
    )
    if music:
        mpath = work / "music.wav"
        pad_music(total, mpath)
        inputs += ["-i", str(mpath)]
        afilters.append("[voice]asplit=2[vmix][vkey]")
        afilters.append(f"[{n + 1}:a]volume=0.16[mus]")
        afilters.append("[mus][vkey]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=600[duck]")
        afilters.append("[vmix][duck]amix=inputs=2:normalize=0:duration=first[mixed]")
        last = "mixed"
    else:
        last = "voice"
    afilters.append(f"[{last}]afade=t=out:st={total - 1.5:.3f}:d=1.5,loudnorm=I=-16:TP=-1.5:LRA=11[aout]")

    fc = ";".join(
        vf_parts
        + afilters
    )
    subprocess.run(
        [FFMPEG, "-v", "error", "-stats", "-y", *inputs, "-filter_complex", fc,
         "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-r", "30", "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-movflags", "+faststart", out],
        check=True,
    )


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(*args, music="--no-music" not in sys.argv)
