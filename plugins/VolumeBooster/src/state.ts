import { storage } from "@vendetta/plugin";

export const BASE_MAX = 200;

export type Boost = { id: string; context: string; volume: number };

export const boosted = new Map<string, Boost>();
export const keyOf = (context: any, id: any) => `${context ?? "default"}:${id}`;

let timer: any;

export function persist() {
    clearTimeout(timer);
    timer = setTimeout(() => {
        const out: Record<string, Boost> = {};
        boosted.forEach((b, k) => (out[k] = { ...b }));
        storage.boosts = out;
    }, 1000);
}

export function load() {
    boosted.clear();
    const saved = storage.boosts;
    if (!saved) return;
    for (const k of Object.keys(saved)) {
        const b = saved[k];
        if (b && typeof b.volume === "number") {
            boosted.set(k, { id: String(b.id), context: String(b.context ?? "default"), volume: b.volume });
        }
    }
}

export function clearAll() {
    clearTimeout(timer);
    boosted.clear();
    storage.boosts = {};
}
