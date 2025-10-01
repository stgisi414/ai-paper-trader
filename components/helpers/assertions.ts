// components/helpers/assertions.ts
export function ensureDefined<T>(value: T | undefined | null): T {
    if (value === undefined || value === null) {
        throw new Error(`Value is not defined`);
    }
    return value;
}