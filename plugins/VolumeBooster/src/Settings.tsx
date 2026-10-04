import { React } from "@vendetta/metro/common";
import { findByProps } from "@vendetta/metro";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { lines, clear } from "./logs";

const { FormSection, FormInput, FormSwitchRow, FormText, FormRow } = Forms;

export default function Settings() {
    useProxy(storage);
    const [, force] = React.useReducer((x: number) => x + 1, 0);

    const text = lines.length ? lines.slice(-80).join("\n") : "(no logs yet)";

    return (
        <FormSection title="VolumeBooster" android_noDivider>
            <FormInput
                title="Volume multiplier (1 - 5)"
                placeholder="2"
                keyboardType="decimal-pad"
                value={String(storage.multiplier)}
                onChange={(t: string) => {
                    const n = parseFloat(t.replace(",", "."));
                    if (Number.isFinite(n)) storage.multiplier = Math.min(5, Math.max(1, n));
                }}
            />
            <FormText style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                Slider max becomes 200% x multiplier. Reopen the volume sheet after changing it.
            </FormText>
            <FormSwitchRow
                label="Restore volume if reset to 0"
                subLabel="Restores a boosted volume if something resets it to 0 by itself"
                value={storage.guardZero}
                onValueChange={(v: boolean) => (storage.guardZero = v)}
            />
            <FormSwitchRow
                label="Debug logging"
                subLabel="Records sliders, setLocalVolume and audio Flux events below"
                value={storage.debug}
                onValueChange={(v: boolean) => (storage.debug = v)}
            />
            <FormRow label="Refresh logs" onPress={() => force()} />
            <FormRow
                label="Copy logs"
                onPress={() => {
                    const cb = findByProps("setString");
                    cb?.setString(lines.join("\n"));
                    showToast(cb ? "Logs copied" : "Clipboard not found");
                }}
            />
            <FormRow label="Clear logs" onPress={() => { clear(); force(); }} />
            <FormText selectable style={{ paddingHorizontal: 16, paddingTop: 8, fontSize: 11 }}>
                {text}
            </FormText>
        </FormSection>
    );
}
