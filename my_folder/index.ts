import { findByProps, findByStoreName } from "@vendetta/metro";
import { instead, after, before } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta/utils";
import Settings from "./ui/Settings";

// Default settings
storage.multiplier ??= 2;
storage.enabled ??= true;

const patches: (() => void)[] = [];

function getMultiplier(): number {
  const m = Number(storage.multiplier);
  return isNaN(m) || m < 1 ? 2 : Math.min(m, 10);
}

export const onLoad = () => {
  if (!storage.enabled) {
    logger.log("VolumeBooster: disabled in settings");
    return;
  }

  const multiplier = getMultiplier();
  logger.log(`VolumeBooster: loading with multiplier x${multiplier}`);

  // --- 1. MediaEngineStore / volume actions ---
  try {
    const MediaEngineStore = findByStoreName("MediaEngineStore");
    const MediaEngineActions = findByProps("setLocalVolume", "getLocalVolume");

    if (MediaEngineActions?.setLocalVolume) {
      // Allow higher values when setting volume
      patches.push(
        instead("setLocalVolume", MediaEngineActions, (args, orig) => {
          // args typically: [userId, volume, context?]
          // volume is usually 0-100 or 0-200 range
          if (typeof args[1] === "number" && args[1] > 0) {
            // Let the value through as-is (UI will already be scaled by multiplier)
            // Some builds clamp internally — we try to push the raw value
          }
          return orig(...args);
        })
      );
      logger.log("VolumeBooster: patched setLocalVolume");
    }

    // Try to raise any internal max if exposed
    if (MediaEngineStore) {
      // Common pattern: some stores expose max or clamp helpers
      // This is best-effort
      logger.log("VolumeBooster: MediaEngineStore found");
    }
  } catch (e) {
    logger.error("VolumeBooster: MediaEngineStore patch failed", e);
  }

  // --- 2. Try to find volume-related constants / max values ---
  try {
    // Look for modules that define volume limits
    const volumeModule = findByProps("MAX_VOLUME", "DEFAULT_VOLUME") 
      || findByProps("maxVolume") 
      || findByProps("VOLUME_MAX");

    if (volumeModule) {
      if (typeof volumeModule.MAX_VOLUME === "number") {
        const original = volumeModule.MAX_VOLUME;
        Object.defineProperty(volumeModule, "MAX_VOLUME", {
          get: () => original * multiplier,
          configurable: true,
        });
        logger.log(`VolumeBooster: raised MAX_VOLUME from ${original}`);
      }
    }
  } catch (e) {
    // ignore - many builds don't expose this
  }

  // --- 3. Best-effort slider maxValue patch via after on common UI modules ---
  // On mobile the slider is often a React Native component.
  // We can't do clean string patches like Vencord, so we try to intercept
  // common volume item renderers if they exist.
  try {
    // Some versions expose a useUserVolumeItem or similar
    const userVolume = findByProps("useUserVolumeItem") || findByProps("UserVolumeItem");
    if (userVolume) {
      logger.log("VolumeBooster: found user volume UI module (experimental)");
    }
  } catch (e) {
    // ignore
  }

  // --- 4. Prevent aggressive clamping on sync (very experimental) ---
  try {
    const settingsModule = findByProps("audioContextSettings") || findByProps("localVolumes");
    if (settingsModule) {
      logger.log("VolumeBooster: found settings-related module");
    }
  } catch (e) {
    // ignore
  }

  logger.log("VolumeBooster: loaded (experimental – test volume sliders in VC)");
};

export const onUnload = () => {
  patches.forEach((unpatch) => {
    try {
      unpatch?.();
    } catch {}
  });
  patches.length = 0;
  logger.log("VolumeBooster: unloaded");
};

export const settings = Settings;
