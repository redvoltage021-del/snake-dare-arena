import { getAiMove } from "./baghChalAI.js";

self.addEventListener("message", (event) => {
  const { requestId, state, difficulty } = event.data ?? {};

  try {
    const action = getAiMove(state, difficulty);
    self.postMessage({
      requestId,
      action
    });
  } catch (error) {
    self.postMessage({
      requestId,
      error: error?.message || "AI move failed."
    });
  }
});
