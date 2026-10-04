export const lines: string[] = [];

export function push(...args: any[]) {
    const text = args
        .map(a => {
            if (typeof a === "string") return a;
            try { return JSON.stringify(a); } catch { return String(a); }
        })
        .join(" ");
    lines.push(`${new Date().toISOString().slice(11, 23)} ${text}`);
    if (lines.length > 300) lines.shift();
}

export function clear() {
    lines.length = 0;
}
