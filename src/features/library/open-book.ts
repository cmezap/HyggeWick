import { File } from 'expo-file-system';
import { router, type Href } from 'expo-router';

import { updateBookMetadata, type Book } from './book-repository';

export type BookOpenIssue = 'missing' | 'inaccessible' | null;
let openSequence = 0;

/** Opens a library book in the shared reader route after checking its local PDF. */
export function openBook(book: Book, returnTo: string, startPage?: number): BookOpenIssue {
  if (book.status !== 'available') return 'missing';
  try {
    if (!new File(book.filePath).exists) {
      void updateBookMetadata(book.id, { status: 'missing' });
      return 'missing';
    }
  } catch {
    return 'inaccessible';
  }
  const openId = `${Date.now()}-${++openSequence}`;
  const pageParam = startPage && Number.isInteger(startPage) && startPage >= 1 ? `&page=${startPage}` : '';
  router.push((`/reader?bookId=${encodeURIComponent(book.id)}&returnTo=${encodeURIComponent(returnTo)}&openId=${openId}${pageParam}`) as Href);
  return null;
}
