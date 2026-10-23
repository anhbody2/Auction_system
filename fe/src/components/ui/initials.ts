/** ui-0.1: avatar initials. First letters of the first two words of the full name, else the first two of the username. */
export function initials(fullName: string | null | undefined, username: string): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length >= 2
      ? [firstChar(words[0]), firstChar(words[1])]
      : words.length === 1
        ? Array.from(words[0]).slice(0, 2)
        : Array.from(username.trim()).slice(0, 2);
  return letters.join('').toLocaleUpperCase();
}

const firstChar = (word: string) => Array.from(word)[0] ?? '';
