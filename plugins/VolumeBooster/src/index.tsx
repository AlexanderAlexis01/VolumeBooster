/*
 * VolumeBooster for Kettu/Revenge/Vendetta
 * Port of Vencord's VolumeBooster (Nuckyz, sadan) - GPLv3
 *
 * Desktop Vencord patches webpack modules; mobile has no webpack and no Web Audio,
 * so this raises the slider max at render time and lets the native engine
 * receive the higher value. Whether the native engine honours >200 has to be
 * verified on-device (enable "Debug logging" in settings and watch the logs).
 */

import { findByProps } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import Settings from "./Settings";

const TAG = "VolumeBooster:";
const BASE_MAX = 200; // default max of the user/stream volume slider
const MAX_KEYS = ["maximumValue", "maxValue"];

storage.multiplier ??= 2;
storage.debug ??= false;

const patches: (() => void)[] = [];
const seen = new Set<string>();

function getMultiplier(): number {
    const m = Number(storage.multiplier);
    return Number.isFinite(m) ? Math.min(5, Math.max(1, m)) : 2;
}

function patchProps(props: any) {
    if (!props || typeof props !== "object") return;

    for (const key of MAX_KEYS) {
        if (props[key] !== BASE_MAX) continue;

        // Only touch sliders that look like value-changing controls
        const interactive = "onValueChange" in props || "onSlidingComplete" in props || "onChange" in props;
        if (!interactive) continue;

        if (storage.debug) {
            const sig = `${key}:${Object.keys(props).sort().join(",")}`;
            if (!seen.has(sig)) {
                seen.add(sig);
                logger.log(TAG, "candidate slider", key, Object.keys(props));
            }
        }

        props[key] = BASE_MAX * getMultiplier();
    }
}

export default {
    onLoad() {
        // Classic runtime
        patches.push(before("createElement", React, args => patchProps(args[1])));

        // Automatic JSX runtime, if the bundle uses it
        const jsxRuntime = findByProps("jsx", "jsxs");
        if (jsxRuntime) {
            patches.push(before("jsx", jsxRuntime, args => patchProps(args[1])));
            patches.push(before("jsxs", jsxRuntime, args => patchProps(args[1])));
        }

        // Debug: see what value actually reaches the engine
        const actions = findByProps("setLocalVolume");
        if (actions) {
            patches.push(before("setLocalVolume", actions, args => {
                if (storage.debug) logger.log(TAG, "setLocalVolume", ...args);
            }));
        } else {
            logger.warn(TAG, "setLocalVolume not found");
        }
    },

    onUnload() {
        for (const unpatch of patches) unpatch();
        patches.length = 0;
        seen.clear();
    },

    settings: Settings
};
