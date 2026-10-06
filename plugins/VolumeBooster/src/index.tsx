/*
 * VolumeBooster for Kettu/Revenge/Vendetta
 * Port of Vencord's VolumeBooster (Nuckyz, sadan) - GPLv3
 *
 * How it works on mobile:
 *  - the volume slider max is raised (200% x multiplier)
 *  - Discord syncs per-user volumes to the server (limit 200) ~2s after you stop
 *    dragging and applies the server's copy back. To stop that from wiping boosts:
 *      1. volumes above 200 are clamped to 200 in what gets uploaded
 *      2. in server updates coming back, boosted users get their boosted volume
 *      3. boosts are persisted and a watchdog re-asserts them if the store drifts
 *
 * Performance rules:
 *  - the render hooks (every element creation) only exist while in a voice channel
 *  - one Flux hook, exact-type Set lookup, everything else returns immediately
 *  - modules/stores are looked up once and cached
 *  - the watchdog only runs while in voice, every 3s, and only if something is boosted
 *  - every patch/timer is removed on unload
 */

import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher, React } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import Settings from "./Settings";
import { push } from "./logs";
import { BASE_MAX, boosted, keyOf, load, persist } from "./state";

const TAG = "VolumeBooster:";
const MAX_KEYS = ["maximumValue", "maxValue"];
const CALLBACKS = ["onValueChange", "onSlidingComplete", "onChange"];
const WINDOW_MS = 3000;
const MAX_FIXES = 30;
const WATCHDOG_MS = 3000;
const FIELDS: [string, string][] = [["user", "default"], ["stream", "stream"]];
const WATCHED = new Set([
    "AUDIO_SET_LOCAL_VOLUME",
    "USER_SETTINGS_PROTO_UPDATE",
    "USER_SETTINGS_PROTO_UPDATE_EDIT_INFO",
    "NATIVE_AUDIO_SET_OUTPUT_DEVICE",
    "VOICE_CHANNEL_SELECT",
    "RTC_CONNECTION_STATE"
]);

storage.multiplier ??= 2;
storage.debug ??= false;
storage.guardZero ??= true;

const patches: (() => void)[] = [];
let uiPatches: (() => void)[] = [];
const seen = new Set<string>();
const lastWrite = new Map<string, number>();
const fixes = new Map<string, number>();
const lastFix = new Map<string, number>();
let actions: any;
let mediaStore: any;
let channelStore: any;
let jsxRuntime: any;
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
    if (!props) return;

    for (const key of MAX_KEYS) {
        if (props[key] !== BASE_MAX) continue;
        if (!CALLBACKS.some(c => c in props)) continue;

        if (storage.debug) {
            const sig = `${key}:${Object.keys(props).sort().join(",")}`;
            if (!seen.has(sig)) {
                seen.add(sig);
                log("candidate slider", key, Object.keys(props));
            }
        }

        props[key] = BASE_MAX * getMultiplier();
    }
}

// ---- voice-gated render hooks ------------------------------------------------

function inVoice(): boolean {
    try {
        channelStore ??= findByStoreName("SelectedChannelStore");
        if (typeof channelStore?.getVoiceChannelId !== "function") return true; // can't tell: stay on
        return !!channelStore.getVoiceChannelId();
    } catch {
        return true;
    }
}

function setUiHooks(on: boolean) {
    if (on === uiPatches.length > 0) return;
    if (!on) {
        uiPatches.forEach(u => u());
        uiPatches = [];
        log("render hooks off");
        return;
    }
    const hook = (args: any[]) => { patchProps(args[1]); };
    uiPatches.push(before("createElement", React, hook));
    jsxRuntime ??= findByProps("jsx", "jsxs");
    if (jsxRuntime) {
        uiPatches.push(before("jsx", jsxRuntime, hook));
        uiPatches.push(before("jsxs", jsxRuntime, hook));
    }
    log("render hooks on");
}

function syncVoiceState() {
    const on = inVoice();
    setUiHooks(on);
    if (on && !timer) {
        timer = setInterval(() => {
            if (boosted.size) check("interval", true);
        }, WATCHDOG_MS);
    } else if (!on && timer) {
        clearInterval(timer);
        timer = undefined;
    }
}

// ---- volume / sync handling --------------------------------------------------

function currentVolume(userId: any, context: any): number | undefined {
    try {
        mediaStore ??= findByStoreName("MediaEngineStore");
        const v = mediaStore?.getLocalVolume?.(userId, context);
        return typeof v === "number" ? v : undefined;
    } catch {
        return undefined;
    }
}

// A 0 written with no recent write while the stored volume is boosted -> keep the boost
function strayFix(userId: any, volume: any, context: any): number | undefined {
    if (!storage.guardZero || volume !== 0) return;
    const k = keyOf(context, userId);
    if (Date.now() - (lastWrite.get(k) ?? 0) <= WINDOW_MS) return;
    const b = boosted.get(k);
    return b ? b.volume : undefined;
}

// Outgoing: never let the server see a volume above 200
function clampForSave(audio: any) {
    for (const [field] of FIELDS) {
        const map = audio?.[field];
        if (!map) continue;
        for (const id of Object.keys(map)) {
            const e = map[id];
            if (e && typeof e.volume === "number" && e.volume > BASE_MAX) {
                log("save: clamp", field, id, e.volume, "->", BASE_MAX);
                e.volume = BASE_MAX;
            }
        }
    }
}

// Incoming (server copy): put boosted volumes back so the store keeps them
function restoreBoosted(audio: any) {
    boosted.forEach(b => {
        const field = FIELDS.find(f => f[1] === b.context)?.[0];
        const map = field && audio?.[field];
        if (!map) return;
        const e = map[b.id];
        const was = e?.volume;
        if (e) e.volume = b.volume;
        else map[b.id] = { volume: b.volume };
        log("sync: server copy", b.context, b.id, "volume=", was, "-> restored", b.volume);
    });
}

function onUserWrite(ev: any) {
    const k = keyOf(ev.context, ev.userId);
    lastWrite.set(k, Date.now());
    fixes.delete(k);
    if (typeof ev.volume === "number" && ev.volume > BASE_MAX) {
        boosted.set(k, { id: String(ev.userId), context: String(ev.context ?? "default"), volume: ev.volume });
    } else {
        boosted.delete(k);
    }
    persist();
}

// Watchdog: if the store drifted away from a boosted volume, put it back
function check(reason: string, quiet = false) {
    if (!actions || !storage.guardZero) return;
    const now = Date.now();
    boosted.forEach((b, k) => {
        if (now - (lastWrite.get(k) ?? 0) < 1500) return; // user is dragging
        const cur = currentVolume(b.id, b.context);
        if (cur === undefined) return;
        if (Math.abs(cur - b.volume) <= 0.5) {
            if (!quiet) log("check ok", reason, b.id, cur);
            return;
        }
        const n = fixes.get(k) ?? 0;
        if (n >= MAX_FIXES || now - (lastFix.get(k) ?? 0) < 1000) return;
        warn("store drifted", reason, b.id, "store=", cur, "want=", b.volume, "-> re-asserting");
        fixes.set(k, n + 1);
        lastFix.set(k, now);
        internal = true;
        try {
            actions.setLocalVolume(b.id, b.volume, b.context);
        } catch (e) {
            warn("re-assert failed", String(e));
        } finally {
            internal = false;
        }
    });
}

function onFlux(args: any[]) {
    const ev = args[0];
    const type = ev?.type;
    if (!WATCHED.has(type)) return; // hot path: everything else exits here

    try {
        switch (type) {
            case "AUDIO_SET_LOCAL_VOLUME": {
                if (internal) return;
                const fix = strayFix(ev.userId, ev.volume, ev.context);
                if (fix !== undefined) {
                    warn("kept boost, ignored stray 0 ->", fix, String(new Error().stack).split("\n").slice(0, 8).join(" | "));
                    ev.volume = fix;
                }
                onUserWrite(ev);
                const now = Date.now();
                if (now - lastVolLog > 500) {
                    lastVolLog = now;
                    log("volume", ev.userId, ev.context, ev.volume);
                }
                break;
            }
            case "USER_SETTINGS_PROTO_UPDATE": {
                const proto = ev?.settings?.proto;
                const audio = proto?.audioContextSettings;
                if (!audio) break;
                if (proto.versions) restoreBoosted(audio); // full copy from the server
                else log("proto: local audio update");
                if (boosted.size) setTimeout(() => check(type), 150);
                break;
            }
            case "USER_SETTINGS_PROTO_UPDATE_EDIT_INFO": {
                const audio = ev?.settings?.changes?.protoToSave?.audioContextSettings;
                if (audio) clampForSave(audio);
                break;
            }
            case "NATIVE_AUDIO_SET_OUTPUT_DEVICE":
                log("flux", type);
                if (boosted.size) setTimeout(() => check(type), 150);
                break;
            case "VOICE_CHANNEL_SELECT":
            case "RTC_CONNECTION_STATE":
                setTimeout(syncVoiceState, 0); // after the stores have handled it
                break;
        }
    } catch (e) {
        warn("flux hook error", String(e));
    }
}

export default {
    onLoad() {
        load();
        log("loaded boosts", boosted.size);

        actions = findByProps("setLocalVolume");
        if (!actions) warn("setLocalVolume not found");

        patches.push(before("dispatch", FluxDispatcher, onFlux));
        syncVoiceState();
    },

    onUnload() {
        clearInterval(timer);
        timer = undefined;
        uiPatches.forEach(u => u());
        uiPatches = [];
        patches.forEach(u => u());
        patches.length = 0;
        seen.clear();
        lastWrite.clear();
        fixes.clear();
        lastFix.clear();
    },

    settings: Settings
};
