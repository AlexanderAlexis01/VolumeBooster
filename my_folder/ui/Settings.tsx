import { React, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

const { FormSection, FormRow, FormSliderRow, FormSwitchRow, FormDivider } = Forms;
const { ScrollView, Text, View } = ReactNative;

export default () => {
  useProxy(storage);

  // Ensure defaults
  if (storage.multiplier == null) storage.multiplier = 2;
  if (storage.enabled == null) storage.enabled = true;

  return (
    <ScrollView style={{ flex: 1 }}>
      <FormSection title="Volume Booster" titleStyleType="no_border">
        <FormSwitchRow
          label="Enable Volume Booster"
          subLabel="Turn the plugin on/off"
          leading={<FormRow.Icon source={ReactNative.Image.resolveAssetSource({ uri: "ic_volume_up_24px" })?.uri || undefined} />}
          value={!!storage.enabled}
          onValueChange={(v: boolean) => {
            storage.enabled = v;
          }}
        />

        <FormDivider />

        <FormSliderRow
          label={`Volume Multiplier: x${Number(storage.multiplier).toFixed(1)}`}
          value={Number(storage.multiplier) || 2}
          min={1}
          max={5}
          step={0.5}
          onValueChange={(v: number) => {
            storage.multiplier = v;
          }}
        />

        <FormRow
          label="Note"
          subLabel="This is an experimental port. Raising the multiplier only helps if the underlying maxValue / clamp is patched successfully. After changing settings, toggle the plugin or reload Discord."
        />
      </FormSection>

      <FormSection title="How to test">
        <FormRow
          label="1. Join a voice channel"
          subLabel="Open any user volume slider"
        />
        <FormRow
          label="2. Try dragging past the old maximum"
          subLabel="If the slider still stops at 100/200 the maxValue patch did not apply"
        />
        <FormRow
          label="3. Check logs"
          subLabel="Look for 'VolumeBooster:' messages in the client logger / console"
        />
      </FormSection>
    </ScrollView>
  );
};
