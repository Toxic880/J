# Piper TTS Setup

JARVIS uses [Piper](https://github.com/rhasspy/piper) for local, fast, human-sounding text-to-speech.

## Quick Setup

1. **Download Piper** from [GitHub Releases](https://github.com/rhasspy/piper/releases)
   - Windows: `piper_windows_amd64.zip`
   - macOS: `piper_macos_aarch64.tar.gz` (Apple Silicon) or `piper_macos_x64.tar.gz` (Intel)
   - Linux: `piper_linux_x86_64.tar.gz`

2. **Extract** and place the contents here:
   ```
   electron/tts/piper/
   ├── piper (or piper.exe on Windows)
   ├── espeak-ng-data/
   └── (voice files go here too)
   ```

3. **Download a voice model** from [Hugging Face](https://huggingface.co/rhasspy/piper-voices/tree/main)
   
   Recommended voices:
   - `en_US-lessac-medium` - Best quality, natural American voice
   - `en_GB-cori-medium` - British female voice
   - `en_US-amy-medium` - American female voice

4. **Place the voice files** (`.onnx` and `.onnx.json`) in this folder:
   ```
   electron/tts/piper/
   ├── piper.exe
   ├── espeak-ng-data/
   ├── en_US-lessac-medium.onnx
   └── en_US-lessac-medium.onnx.json
   ```

5. **Restart JARVIS** - it will automatically detect and use Piper.

## Verification

When JARVIS starts, check the console for:
```
[Main] Piper TTS available - using neural voice
```

If you see:
```
[Main] Piper TTS not available - will use browser fallback
```

Then Piper isn't set up correctly. Check that:
- The `piper` executable is in this folder
- At least one `.onnx` voice model is present
- The corresponding `.onnx.json` config file exists

## Fallback

If Piper isn't available, JARVIS will automatically fall back to:
1. ElevenLabs (if configured)
2. Browser speechSynthesis (always available)

## Notes

- Piper runs entirely locally - no internet required
- First synthesis may be slow (model loading), subsequent ones are fast
- Piper uses ~500MB RAM when active
- Voice quality is significantly better than browser TTS
