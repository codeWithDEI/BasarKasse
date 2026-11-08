export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const basarPath = (path: string) => `${basePath}${path}`;
