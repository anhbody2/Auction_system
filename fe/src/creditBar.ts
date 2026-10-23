/** ui-2a.1: width (percent) of one part of the available / locked bar; 0 when there is no credit. */
export const share = (part: number, total: number) => (total > 0 ? Math.min(100, Math.max(0, (part / total) * 100)) : 0);
