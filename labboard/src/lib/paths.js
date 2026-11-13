// The app is served from a sub-path (/update/). BASE_URL always ends with a slash.
export const BASE = import.meta.env.BASE_URL;
export const asset = (path) => BASE + path.replace(/^\//, '');
