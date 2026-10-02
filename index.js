(function (plugin, metro, patcher, pluginApi, ui, utils, common) {
  "use strict";

  var findByProps = metro.findByProps;
  var findByStoreName = metro.findByStoreName;
  var instead = patcher.instead;
  var storage = pluginApi.storage;
  var logger = utils.logger;
  var React = common.React;
  var ReactNative = common.ReactNative;
  var Forms = ui.components.Forms;
  var FormSection = Forms.FormSection;
  var FormRow = Forms.FormRow;
  var FormSliderRow = Forms.FormSliderRow;
  var FormSwitchRow = Forms.FormSwitchRow;
  var FormDivider = Forms.FormDivider;
  var ScrollView = ReactNative.ScrollView;

  if (storage.multiplier == null) storage.multiplier = 2;
  if (storage.enabled == null) storage.enabled = true;

  var patches = [];

  function getMultiplier() {
    var m = Number(storage.multiplier);
    return isNaN(m) || m < 1 ? 2 : Math.min(m, 10);
  }

  function Settings() {
    var tick = React.useState(0);
    var setTick = tick[1];
    function bump() {
      setTick(function (t) { return t + 1; });
    }

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
          onValueChange: function (v) {
            storage.enabled = v;
            bump();
          }
        }),
        React.createElement(FormDivider, null),
        React.createElement(FormSliderRow, {
          label: "Volume Multiplier: x" + Number(storage.multiplier).toFixed(1),
          value: Number(storage.multiplier) || 2,
          min: 1,
          max: 5,
          step: 0.5,
          onValueChange: function (v) {
            storage.multiplier = v;
            bump();
          }
        }),
        React.createElement(FormRow, {
          label: "Note",
          subLabel: "Experimental port. After changing settings, toggle the plugin or reload Discord."
        })
      ),
      React.createElement(
        FormSection,
        { title: "How to test" },
        React.createElement(FormRow, {
          label: "1. Join a voice channel",
          subLabel: "Open any user volume slider"
        }),
        React.createElement(FormRow, {
          label: "2. Try dragging past the old maximum",
          subLabel: "If it still stops at 100/200 the maxValue patch did not apply"
        }),
        React.createElement(FormRow, {
          label: "3. Check logs",
          subLabel: "Look for VolumeBooster: lines in the client logger"
        })
      )
    );
  }

  function onLoad() {
    if (!storage.enabled) {
      logger.log("VolumeBooster: disabled in settings");
      return;
    }

    var multiplier = getMultiplier();
    logger.log("VolumeBooster: loading with multiplier x" + multiplier);

    try {
      var MediaEngineActions = findByProps("setLocalVolume", "getLocalVolume");
      if (MediaEngineActions && MediaEngineActions.setLocalVolume) {
        patches.push(
          instead("setLocalVolume", MediaEngineActions, function (args, orig) {
            return orig.apply(this, args);
          })
        );
        logger.log("VolumeBooster: patched setLocalVolume");
      } else {
        logger.log("VolumeBooster: setLocalVolume not found");
      }

      var MediaEngineStore = findByStoreName("MediaEngineStore");
      if (MediaEngineStore) {
        logger.log("VolumeBooster: MediaEngineStore found");
      }
    } catch (e) {
      logger.error("VolumeBooster: MediaEngine patch failed", e);
    }

    try {
      var volumeModule =
        findByProps("MAX_VOLUME", "DEFAULT_VOLUME") ||
        findByProps("maxVolume") ||
        findByProps("VOLUME_MAX");

      if (volumeModule && typeof volumeModule.MAX_VOLUME === "number") {
        var original = volumeModule.MAX_VOLUME;
        Object.defineProperty(volumeModule, "MAX_VOLUME", {
          get: function () {
            return original * multiplier;
          },
          configurable: true
        });
        logger.log("VolumeBooster: raised MAX_VOLUME from " + original);
      }
    } catch (e) {}

    try {
      var userVolume = findByProps("useUserVolumeItem") || findByProps("UserVolumeItem");
      if (userVolume) {
        logger.log("VolumeBooster: found user volume UI module (experimental)");
      }
    } catch (e) {}

    logger.log("VolumeBooster: loaded (experimental)");
  }

  function onUnload() {
    for (var i = 0; i < patches.length; i++) {
      try {
        if (patches[i]) patches[i]();
      } catch (e) {}
    }
    patches.length = 0;
    logger.log("VolumeBooster: unloaded");
  }

  plugin.onLoad = onLoad;
  plugin.onUnload = onUnload;
  plugin.settings = Settings;
  return plugin;
})(
  {},
  vendetta.metro,
  vendetta.patcher,
  vendetta.plugin,
  vendetta.ui,
  vendetta.utils,
  vendetta.metro.common
);
