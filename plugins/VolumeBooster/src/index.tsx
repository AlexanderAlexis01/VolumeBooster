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
const MAX_FIXES = 20;

storage.multiplier ??= 2;
storage.debug ??= false;
storage.guardZero ??= true;

type Boost = { volume: number; context: any; fixes: number; lastFix: number };

const patches: (() => void)[] = [];
const seen = new Set<string>();
const lastWrite = new Map<string, number>();
const boosted = new Map<string, Boost>();
let actions: any;
let timer: any;
let internal = false;
let lastVolLog = 0;

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

// A 0 written with no recent write for that user while the stored volume is boosted
function strayFix(userId: any, volume: any, context: any): number | undefined {
    if (!storage.guardZero || volume !== 0) return;
    const last = lastWrite.get(String(userId)) ?? 0;
    if (Date.now() - last <= WINDOW_MS) return;
    const cur = currentVolume(userId, context);
    if (cur !== undefined && cur > BASE_MAX) return cur;
}

function track(userId: any, volume: any, context: any) {
    const id = String(userId);
    if (typeof volume === "number" && volume > BASE_MAX) {
        boosted.set(id, { volume, context, fixes: 0, lastFix: 0 });
    } else {
        boosted.delete(id);
    }
}

// Compare the store with the volume the user set; put it back if something changed it
function check(reason: string, quiet = false) {
    if (!storage.guardZero || !actions) return;
    const now = Date.now();
    boosted.forEach((b, id) => {
        const cur = currentVolume(id, b.context);
        if (cur === undefined) return;
        if (Math.abs(cur - b.volume) <= 0.5) {
            if (!quiet) log("check ok", reason, id, cur);
            return;
        }
        if (b.fixes >= MAX_FIXES || now - b.lastFix < 1000) return;
        warn("store volume drifted", reason, id, "store=", cur, "want=", b.volume, "-> re-asserting");
        b.fixes++;
        b.lastFix = now;
        internal = true;
        try {
            actions.setLocalVolume(id, b.volume, b.context);
        } catch (e) {
            warn("re-assert failed", String(e));
        } finally {
            internal = false;
        }
    });
}

export default {
    onLoad() {
        patches.push(before("createElement", React, args => { patchProps(args[1]); }));

        const jsxRuntime = findByProps("jsx", "jsxs");
        if (jsxRuntime) {
            patches.push(before("jsx", jsxRuntime, args => { patchProps(args[1]); }));
            patches.push(before("jsxs", jsxRuntime, args => { patchProps(args[1]); }));
        }

        actions = findByProps("setLocalVolume");
        if (actions) {
            patches.push(before("setLocalVolume", actions, (args: any[]) => {
                if (internal) return args;
                try {
                    const [userId, volume, context] = args;
                    const now = Date.now();
                    if (now - lastVolLog > 500) {
                        lastVolLog = now;
                        log("setLocalVolume", ...args);
                    }
                    const fix = strayFix(userId, volume, context);
                    if (fix !== undefined) {
                        warn("restored stray setLocalVolume(0) ->", fix, String(new Error().stack).split("\n").slice(0, 8).join(" | "));
                        args[1] = fix;
                    } else {
                        lastWrite.set(String(userId), now);
                        track(userId, volume, context);
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
                if (typeof type !== "string") return args;

                if (type === "AUDIO_SET_LOCAL_VOLUME") {
                    if (!internal) {
                        const fix = strayFix(ev.userId, ev.volume, ev.context);
                        if (fix !== undefined) {
                            warn("restored stray AUDIO_SET_LOCAL_VOLUME 0 ->", fix, JSON.stringify(ev));
                            ev.volume = fix;
                        } else if (ev.volume > 0) {
                            lastWrite.set(String(ev.userId), Date.now());
                        }
                    }
                } else if (type.startsWith("USER_SETTINGS_PROTO_UPDATE")) {
                    const users =
                        ev?.settings?.proto?.audioContextSettings?.user ??
                        ev?.settings?.changes?.protoToSave?.audioContextSettings?.user;
                    if (users) boosted.forEach((_, id) => log("proto", type, id, "volume=", users[id]?.volume));
                    if (boosted.size) setTimeout(() => check(type), 150);
                } else if (/AUDIO|VOLUME/.test(type)) {
                    log("flux", type, JSON.stringify(ev).slice(0, 200));
                    if (boosted.size) setTimeout(() => check(type), 150);
                }
            } catch (e) {
                warn("dispatch hook error", String(e));
            }
            return args;
        }));

        timer = setInterval(() => check("interval", true), 1000);
    },

    onUnload() {
        clearInterval(timer);
        for (const unpatch of patches) unpatch();
        patches.length = 0;
        seen.clear();
        lastWrite.clear();
        boosted.clear();
    },

    settings: Settings
};
