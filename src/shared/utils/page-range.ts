export interface PageRange {
  startPage: number;
  endPage: number;
}

export function parsePageRange(input: string | undefined, fallbackEnd: number): PageRange {
  if (!input) {
    return {
      startPage: 1,
      endPage: fallbackEnd,
    };
  }

  const match = input.match(/^(\d+)-(\d+)$/);
  if (!match) {
    throw new Error(`Invalid page range: ${input}. Expected format like 1-20.`);
  }

  const startPage = Number(match[1]);
  const endPage = Number(match[2]);

  if (startPage < 1 || endPage < 1 || endPage < startPage) {
    throw new Error(`Invalid page range: ${input}.`);
  }

  return { startPage, endPage };
}

