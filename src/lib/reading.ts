/** Reading a story is how a topic joins the bubble: the bubble after `topicId` is read, or null if nothing changes. */
export const bubbleAfterRead = (bubble: string[], topicId: string): string[] | null =>
  bubble.includes(topicId) ? null : [...bubble, topicId];
