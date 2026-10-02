(() => {
  const { findByProps, findByStoreName } = vendetta.metro;
  const { instead, after, before } = vendetta.patcher;
  const { storage } = vendetta.plugin;
  const { logger } = vendetta.utils;
  const { React, ReactNative } = vendetta.metro.common;
  const { Forms } = vendetta.ui.components;

  const { FormSection, FormRow, FormSliderRow, FormSwitchRow, FormDivider } = Forms;
  const { ScrollView } = ReactNative;

  // defaults
  if (storage.multiplier == null) storage.multiplier = 2;
  if (storage.enabled == null) storage.enabled = true;

  const patches = [];

  function getMultiplier() {
    const m = Number(storage.multiplier);
    return isNaN(m) || m < 1 ? 2 : Math.min(m, 10);
  }

  function Settings() {
    // force re-render when storage changes (simple)
    const [, setTick] = React.useState(0);
    const bump = () => setTick((t) => t + 1);

    return React.createElement(
      ScrollView,
      { style: { flex: 1 } },
      React.createElement(
        FormSection,
        { title: "Volume Booster", titleStyleType: "no_border" },
        React.createElement(FormSwitchRow, {
          label: "Enable Volume Booster",
          subLabel: "Turn the plugin on/off",
          value: !!storage.enabled,
          onValueChange: (v) => {
            storage.enabled = v;
            bump();
          },
        }),
        React.createElement(FormDivider, null),
        React.createElement(FormSliderRow, {
          label: "Volume Multiplier: x" + Number(storage.multiplier).toFixed(1),
          value: Number(storage.multiplier) || 2,
          min: 1,
          max: 5,
          step: 0.5,
          onValueChange: (v) => {
            storage.multiplier = v;
            bump();
          },
        }),
        React.createElement(FormRow, {
          label: "Note",
          subLabel:
            "Experimental port. After changing settings, toggle the plugin or reload Discord. Check logs for VolumeBooster: messages.",
        })
      ),
      React.createElement(
        FormSection,
        { title: "How to test" },
        React.createElement(FormRow, {
          label: "1. Join a voice channel",
          subLabel: "Open any user volume slider",
        }),
        React.createElement(FormRow, {
          label: "2. Try dragging past the old maximum",
          subLabel: "If it still stops at 100/200 the maxValue patch did not apply",
        }),
        React.createElement(FormRow, {
          label: "3. Check logs",
          subLabel: "Look for VolumeBooster: lines in the client logger",
        })
      )
    );
  }

  return {
    onLoad() {
      if (!storage.enabled) {
        logger.log("VolumeBooster: disabled in settings");
        return;
      }

      const multiplier = getMultiplier();
      logger.log("VolumeBooster: loading with multiplier x" + multiplier);

      // 1. MediaEngine / setLocalVolume
      try {
        const MediaEngineActions = findByProps("setLocalVolume", "getLocalVolume");
        if (MediaEngineActions && MediaEngineActions.setLocalVolume) {
          patches.push(
            instead("setLocalVolume", MediaEngineActions, (args, orig) => {
              // let higher values through; UI scaling is the main goal
              return orig(...args);
            })
          );
          logger.log("VolumeBooster: patched setLocalVolume");
        } else {
          logger.log("VolumeBooster: setLocalVolume not found");
        }

        const MediaEngineStore = findByStoreName("MediaEngineStore");
        if (MediaEngineStore) {
          logger.log("VolumeBooster: MediaEngineStore found");
        }
      } catch (e) {
        logger.error("VolumeBooster: MediaEngine patch failed", e);
      }

      // 2. Try raise exposed MAX_VOLUME constants
      try {
        const volumeModule =
          findByProps("MAX_VOLUME", "DEFAULT_VOLUME") ||
          findByProps("maxVolume") ||
          findByProps("VOLUME_MAX");

        if (volumeModule && typeof volumeModule.MAX_VOLUME === "number") {
          const original = volumeModule.MAX_VOLUME;
          Object.defineProperty(volumeModule, "MAX_VOLUME", {
            get: () => original * multiplier,
            configurable: true,
          });
          logger.log("VolumeBooster: raised MAX_VOLUME from " + original);
        }
      } catch (e) {
        // ignore
      }

      // 3. Best-effort UI module probe
      try {
        const userVolume = findByProps("useUserVolumeItem") || findByProps("UserVolumeItem");
        if (userVolume) {
          logger.log("VolumeBooster: found user volume UI module (experimental)");
        }
      } catch (e) {
        // ignore
      }

      logger.log("VolumeBooster: loaded (experimental – test volume sliders in VC)");
    },

    onUnload() {
      for (const unpatch of patches) {
        try {
          unpatch && unpatch();
        } catch (_) {}
      }
      patches.length = 0;
      logger.log("VolumeBooster: unloaded");
    },

    settings: Settings,
  };
})()
