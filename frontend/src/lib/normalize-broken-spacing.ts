const twoLetterWords = new Set([
  'am', 'an', 'as', 'at', 'be', 'by', 'do', 'he', 'if', 'in', 'is',
  'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us',
  'we',
]);

export function normalizeBrokenSpacing(text: string) {
  const segments = text
    .replace(/(?<=\d)[ \t]+(?=[\d,])|(?<=,)[ \t]+(?=\d)/g, '')
    .split(/(\r\n|\n|\r|[ \t]{2,})/);

  return segments.map((segment, index) => {
    if (/^(?:\r\n|\n|\r)$/.test(segment)) return segment;
    if (/^[ \t]{2,}$/.test(segment)) {
      return /^(?:\r\n|\n|\r)$/.test(segments[index + 1] || '') ? segment : ' ';
    }

    return segment.replace(/\b(?:[A-Za-z][ \t]+){1,}[A-Za-z]\b/g, (spacedWord) => {
      const letters = spacedWord.match(/[A-Za-z]/g) || [];
      return letters.length >= 3 || twoLetterWords.has(letters.join('').toLowerCase())
        ? letters.join('')
        : spacedWord;
    });
  }).join('');
}
