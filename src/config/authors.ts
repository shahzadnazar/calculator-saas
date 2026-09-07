/**
 * Guide authors. Attribution and author bios are EEAT signals — search engines
 * and readers want to know who stands behind the content. Referenced by key
 * from guide frontmatter.
 */
import { SITE } from '@config/site';

export interface Author {
  name: string;
  role: string;
  bio: string;
}

export const AUTHORS: Record<string, Author> = {
  editorial: {
    name: `${SITE.name} Editorial Team`,
    role: 'Reviewed by our editorial team',
    bio: 'Our editorial team researches every topic against authoritative sources and verifies the maths behind each calculator with an automated test suite. We write to help you understand the numbers, not just get an answer.',
  },
};

export const DEFAULT_AUTHOR = 'editorial';

export function getAuthor(key: string | undefined): Author {
  return AUTHORS[key ?? DEFAULT_AUTHOR] ?? AUTHORS[DEFAULT_AUTHOR];
}
