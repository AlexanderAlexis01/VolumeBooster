# VolumeBooster (Kettu / Revenge / Vendetta)

Experimental mobile port of Vencord's VolumeBooster.

Allows attempting to set user/stream volume above the normal maximum.

## Important

This is **not** a perfect 1:1 port.  
Discord mobile (React Native) uses a different audio pipeline than the desktop client.  
The plugin tries the most common module names (`MediaEngineStore`, `setLocalVolume`, etc.).

It may need adjustments for your specific Discord version.

## Install

1. Host the plugin folder (or zip the contents) on a web server / GitHub Pages / raw link.
2. In Discord (with Kettu/Revenge):  
   Settings → Plugins → + → paste the plugin URL (the folder that contains `manifest.json`).
3. Enable the plugin and open its settings to set the multiplier.
4. Reload Discord or toggle the plugin after changing the multiplier.

## Files

- `manifest.json` – plugin metadata
- `src/index.ts` – main logic + patches
- `src/ui/Settings.tsx` – settings UI

## Troubleshooting

- Check the client logs for lines starting with `VolumeBooster:`.
- If the volume slider still hard-stops at 100 or 200, the maxValue patch did not hit the right module. You will need to reverse-engineer the current volume slider component on your Discord version.
- Native audio gain may still clamp the value even if the JS side accepts higher numbers.

## Credits

Original idea & desktop implementation: Vencord (Nuckyz, sadan).
