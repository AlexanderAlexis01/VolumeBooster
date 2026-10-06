import { React } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { lines, clear } from "./logs";
import { boosted, clearAll } from "./state";

const { FormSection, FormInput, FormSwitchRow, FormText, FormRow } = Forms;

export default function Settings() {
    useProxy(storage);
    const [, force] = React.useReducer((x: number) => x + 1, 0);

    const users = findByStoreName("UserStore");
    const nameOf = (id: string) => {
        try { const u = users?.getUser?.(id); return u?.globalName || u?.username || id; } catch { return id; }
    };
    const list = Array.from(boosted.values());

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
                label="Keep boosts"
                subLabel="Restores boosted volumes if Discord resets them"
                value={storage.guardZero}
                onValueChange={(v: boolean) => (storage.guardZero = v)}
            />
            <FormSwitchRow
                label="Debug logging"
                subLabel="Records volume, sync and audio events below"
                value={storage.debug}
                onValueChange={(v: boolean) => (storage.debug = v)}
            />
            <FormText style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                {list.length ? "Boosted right now:" : "No boosted volumes right now."}
            </FormText>
            {list.map(b => (
                <FormRow
                    key={b.context + b.id}
                    label={nameOf(b.id)}
                    subLabel={`${Math.round(b.volume)}% (${b.context})`}
                />
            ))}
            <FormRow label="Forget all boosts" onPress={() => { clearAll(); force(); }} />
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
