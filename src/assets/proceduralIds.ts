// Ids drawn procedurally (§19.2.3): no image files, not in the manifest.
export const PROCEDURAL = { ukrasi: ['prevrtljivo'], fore: ['briskula'] } as const;
export function isProceduralUkras(id: string): boolean { return (PROCEDURAL.ukrasi as readonly string[]).includes(id); }
export function isProceduralFora(id: string): boolean { return (PROCEDURAL.fore as readonly string[]).includes(id); }
