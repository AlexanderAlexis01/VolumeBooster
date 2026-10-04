import { React } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { Forms } from "@vendetta/ui/components";

const { FormSection, FormInput, FormSwitchRow, FormText } = Forms;

export default function Settings() {
    useProxy(storage);

    return (
        <FormSection title="VolumeBooster" android_noDivider>
            <FormInput
                title="Volume multiplier (1 - 5)"
                placeholder="2"
                keyboardType="decimal-pad"
                value={String(storage.multiplier)}
                onChange={(text: string) => {
                    const n = parseFloat(text.replace(",", "."));
                    if (Number.isFinite(n)) storage.multiplier = Math.min(5, Math.max(1, n));
                }}
            />
            <FormText style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                Slider max becomes 200% x multiplier. Reopen the volume sheet after changing it.
            </FormText>
            <FormSwitchRow
                label="Debug logging"
                subLabel="Logs candidate sliders and setLocalVolume calls"
                value={storage.debug}
                onValueChange={(v: boolean) => (storage.debug = v)}
            />
        </FormSection>
    );
}
