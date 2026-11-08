/** Server-selected mode, fixed at build time and checked against the launcher. */
export const localMode = process.env.GLOSS_LOCAL === "1";
if ((process.env.GLOSS_BUILT_LOCAL === "1") !== localMode) throw new Error("Gloss build and launch modes do not match.");
if (localMode && (process.env.GLOSS_LOOPBACK !== "1" || process.env.VERCEL)) throw new Error("Gloss local mode requires its loopback launcher.");
