// Runs once when the Next.js server starts (not during `next build`).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // With AI_CALL_LOG=mongo, restore today's AI call count so a restart does not reset the daily cap.
  const { restoreAiBudgetWithRetry } = await import("./src/lib/ai/budgetRestore");
  await restoreAiBudgetWithRetry();
}
