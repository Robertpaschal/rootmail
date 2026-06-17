// The customer dashboard is a separate app/origin. Marketing only links to it.
// Override per environment with NEXT_PUBLIC_DASHBOARD_URL (e.g. http://localhost:3001
// in local dev); defaults to the intended production origin.
const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://app.rootmail.io";

export const signupUrl = `${DASHBOARD_URL}/signup`;
export const loginUrl = `${DASHBOARD_URL}/login`;
