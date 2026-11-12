// A way for the app to put text into the message box (for example "Add selection
// to chat" from a web page's menu), even if the chat is closed at that moment and
// the box is not on screen yet: the text waits until a message box is listening.
// (Just a queue and a listener; no Electron.)
const waiting: string[] = [];
let listener: ((text: string) => void) | null = null;

// Called with text to add to the message box.
export function pushInsert(text: string): void {
  if (listener) listener(text);
  else waiting.push(text);
}

// The message box says it is listening. Anything that was waiting is handed over
// at once. Returns a function that stops listening.
export function onInsert(callback: (text: string) => void): () => void {
  listener = callback;
  for (const text of waiting.splice(0)) callback(text);
  return () => {
    if (listener === callback) listener = null;
  };
}
