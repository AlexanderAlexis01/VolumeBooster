/*
 * VolumeBooster for Kettu/Revenge/Vendetta
 * Port of Vencord's VolumeBooster (Nuckyz, sadan) - GPLv3
 */

import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher, React } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import Settings from "./Settings";
import { push } from "./logs";

const TAG = "VolumeBooster:";
const BASE_MAX = 200;
const MAX_KEYS = ["maximumValue", "maxValue"];
const CALLBACKS = ["onValueChange", "onSlidingComplete", "onChange"];
const WINDOW_MS = 3000;

storage.multiplier ??= 2;
storage.debug ??= false;
storage.guardZero ??= true;

const patches: (() => void)[] = [];
const seen = new Set<string>();
const lastWrite = new Map<string, number>();

const log = (...a: any[]) => {
    if (!storage.debug) return;
    logger.log(TAG, ...a);
    push(...a);
};
const warn = (...a: any[]) => {
    logger.warn(TAG, ...a);
    push("WARN", ...a);
};

function getMultiplier(): number {
    const m = Number(storage.multiplier);
    return Number.isFinite(m) ? Math.min(5, Math.max(1, m)) : 2;
}

function patchProps(props: any) {
    if (!props || typeof props !== "object") return;

    for (const key of MAX_KEYS) {
        if (props[key] !== BASE_MAX) continue;
        if (!CALLBACKS.some(c => c in props)) continue;

        const sig = `${key}:${Object.keys(props).sort().join(",")}`;
        if (!seen.has(sig)) {
            seen.add(sig);
            log("candidate slider", key, Object.keys(props));
        }

        props[key] = BASE_MAX * getMultiplier();
    }
}

function currentVolume(userId: any, context: any): number | undefined {
    try {
        const store = findByStoreName("MediaEngineStore");
        const v = store?.getLocalVolume?.(userId, context);
        return typeof v === "number" ? v : undefined;
    } catch {
        return undefined;
    }
}

// If something writes 0 on its own (no recent write for this user) while the
// stored volume is boosted, return the stored volume so it can be restored.
function strayFix(userId: any, volume: any, context: any): number | undefined {
    if (!storage.guardZero || volume !== 0) return;
    const last = lastWrite.get(String(userId)) ?? 0;
    if (Date.now() - last <= WINDOW_MS) return;
    const cur = currentVolume(userId, context);
    if (cur !== undefined && cur > BASE_MAX) return cur;
}

export default {
    onLoad() {
        patches.push(before("createElement", React, args => { patchProps(args[1]); }));

        const jsxRuntime = findByProps("jsx", "jsxs");
        if (jsxRuntime) {
            patches.push(before("jsx", jsxRuntime, args => { patchProps(args[1]); }));
            patches.push(before("jsxs", jsxRuntime, args => { patchProps(args[1]); }));
        }

        const actions = findByProps("setLocalVolume");
        if (actions) {
            patches.push(before("setLocalVolume", actions, (args: any[]) => {
                try {
                    const [userId, volume, context] = args;
                    log("setLocalVolume", ...args);
                    const fix = strayFix(userId, volume, context);
                    if (fix !== undefined) {
                        warn("restored stray setLocalVolume(0) ->", fix, String(new Error().stack).split("\n").slice(0, 8).join(" | "));
                        args[1] = fix;
                    } else {
                        lastWrite.set(String(userId), Date.now());
                    }
                } catch (e) {
                    warn("setLocalVolume hook error", String(e));
                }
                return args;
            }));
        } else {
            warn("setLocalVolume not found");
        }

        patches.push(before("dispatch", FluxDispatcher, (args: any[]) => {
            try {
                const ev = args[0];
                const type = ev?.type;
                if (typeof type === "string" && /AUDIO|VOLUME|USER_SETTINGS_PROTO/.test(type)) {
                    log("flux", type, JSON.stringify(ev).slice(0, 300));
                    if (type === "AUDIO_SET_LOCAL_VOLUME") {
                        const fix = strayFix(ev.userId, ev.volume, ev.context);
                        if (fix !== undefined) {
                            warn("restored stray AUDIO_SET_LOCAL_VOLUME 0 ->", fix, JSON.stringify(ev));
                            ev.volume = fix;
                        } else if (ev.volume > 0) {
                            lastWrite.set(String(ev.userId), Date.now());
                        }
                    }
                }
            } catch (e) {
                warn("dispatch hook error", String(e));
            }
            return args;
        }));
    },

    onUnload() {
        for (const unpatch of patches) unpatch();
        patches.length = 0;
        seen.clear();
        lastWrite.clear();
    },

    settings: Settings
};
