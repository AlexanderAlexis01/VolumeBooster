/*
 * VolumeBooster for Kettu/Revenge/Vendetta
 * Port of Vencord's VolumeBooster (Nuckyz, sadan) - GPLv3
 */

import { findByProps } from "@vendetta/metro";
import { FluxDispatcher, React } from "@vendetta/metro/common";
import { before, instead } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import Settings from "./Settings";
import { push } from "./logs";

const TAG = "VolumeBooster:";
const BASE_MAX = 200;
const MAX_KEYS = ["maximumValue", "maxValue"];
const CALLBACKS = ["onValueChange", "onSlidingComplete", "onChange"];
const SLIDE_WINDOW_MS = 3000;

storage.multiplier ??= 2;
storage.debug ??= false;
storage.guardZero ??= true;

const patches: (() => void)[] = [];
const seen = new Set<string>();
let lastSlide = 0;

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

        // remember when the user actually touches the slider
        for (const cb of CALLBACKS) {
            const fn = props[cb];
            if (typeof fn !== "function" || fn.__vb) continue;
            const wrapped: any = (...a: any[]) => {
                lastSlide = Date.now();
                return fn(...a);
            };
            wrapped.__vb = true;
            props[cb] = wrapped;
        }

        props[key] = BASE_MAX * getMultiplier();
    }
}

// A volume write of exactly 0 that is not preceded by the user touching the slider
function isStrayZero(volume: any) {
    return storage.guardZero && volume === 0 && Date.now() - lastSlide > SLIDE_WINDOW_MS;
}

export default {
    onLoad() {
        patches.push(before("createElement", React, args => patchProps(args[1])));

        const jsxRuntime = findByProps("jsx", "jsxs");
        if (jsxRuntime) {
            patches.push(before("jsx", jsxRuntime, args => patchProps(args[1])));
            patches.push(before("jsxs", jsxRuntime, args => patchProps(args[1])));
        }

        const actions = findByProps("setLocalVolume");
        if (actions) {
            patches.push(instead("setLocalVolume", actions, (args: any[], orig: any) => {
                log("setLocalVolume", ...args);
                if (isStrayZero(args[1])) {
                    warn("blocked stray setLocalVolume(0)", ...args, String(new Error().stack).split("\n").slice(0, 8).join(" | "));
                    return;
                }
                return orig(...args);
            }));
        } else {
            warn("setLocalVolume not found");
        }

        patches.push(instead("dispatch", FluxDispatcher, (args: any[], orig: any) => {
            const ev = args[0];
            const type = ev?.type;
            if (typeof type === "string" && /AUDIO|VOLUME|USER_SETTINGS_PROTO/.test(type)) {
                try { log("flux", type, JSON.stringify(ev).slice(0, 300)); } catch {}
                if (type === "AUDIO_SET_LOCAL_VOLUME" && isStrayZero(ev.volume)) {
                    warn("blocked stray AUDIO_SET_LOCAL_VOLUME 0", JSON.stringify(ev));
                    return;
                }
            }
            return orig(...args);
        }));
    },

    onUnload() {
        for (const unpatch of patches) unpatch();
        patches.length = 0;
        seen.clear();
    },

    settings: Settings
};
