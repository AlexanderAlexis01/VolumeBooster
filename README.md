# VolumeBooster (ready for Kettu / Revenge)

Single-file hostable version. No TypeScript build step needed.

## Install (GitHub Pages)

1. Put **both** files in the root of your repo (or a folder):
   - `manifest.json`
   - `index.js`

2. Enable GitHub Pages:
   - Repo → Settings → Pages
   - Source: Deploy from a branch
   - Branch: `main` / folder: `/ (root)`
   - Save, wait ~1 minute

3. In Discord (Kettu/Revenge):
   - Settings → Plugins → +
   - Paste:
     ```
     https://YOUR_USERNAME.github.io/YOUR_REPO/
     ```
     (trailing slash recommended)

4. Enable the plugin, set multiplier in settings, reload Discord.

## Example

If your repo is `https://github.com/AlexanderAlexis01/VolumeBooster`  
install URL is:

```
https://alexanderalexis01.github.io/VolumeBooster/
```

## Notes

- Experimental. Mobile Discord may still clamp volume natively.
- Check client logs for lines starting with `VolumeBooster:`.
