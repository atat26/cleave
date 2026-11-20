// A reply that reaches the most the app lets a model write in one reply (MAX_REPLY_TOKENS in
// chatRunner.ts) is cut off by the provider. Say so after what was written, in words from the app, so
// it is not taken for a finished answer. Pure code, so it is tested.

// The note to add after the reply, or null when the reply ended on its own. `finish` is the reason the
// last request ended ("length" is the limit); `answer` is the text of that last request.
export function lengthNote(
  finish: string | null,
  answer: string,
  limit: number,
): string | null {
  if (finish !== 'length') return null;
  const amount = limit.toLocaleString('en-US');
  return answer.trim() === ''
    ? `_Note from the app: the reply was cut off before it had any words, because it reached the length limit (${amount} tokens) while it was working._`
    : `\n\n_Note from the app: this reply was cut off because it reached the length limit (${amount} tokens)._`;
}
