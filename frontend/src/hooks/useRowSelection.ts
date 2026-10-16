import { useCallback, useState } from 'react';

/**
 * Selection state for a list, keyed by record ID (never row position).
 *
 * Keeping the key as the record id — rather than "the checkbox on row 3" — is
 * what makes the selection survive pagination, filtering and a data refresh: a
 * row that moves position keeps its selection, and a row that disappears simply
 * stops being rendered while its id stays selected until it is explicitly
 * cleared or removed.
 *
 * The hook is deliberately storage-agnostic; callers decide when to
 * `clear()` (e.g. when the filter changes) and when to `addMany()` (e.g. an
 * account-wide "Select All").
 */
export interface RowSelection {
  /** The currently selected record ids. */
  selected: Set<string>;
  /** Number of selected records. */
  count: number;
  /** Is this specific id selected? */
  has: (id: string) => boolean;
  /** Toggle a single record. */
  toggle: (id: string) => void;
  /** Add the given ids to the selection (no-op for ids already present). */
  addMany: (ids: string[]) => void;
  /** Remove the given ids from the selection. */
  removeMany: (ids: string[]) => void;
  /** Replace the whole selection with the given ids. */
  replaceWith: (ids: string[]) => void;
  /** Clear every selection. */
  clear: () => void;
  /** True when every id in `ids` is selected (and `ids` is non-empty). */
  isAllSelected: (ids: string[]) => boolean;
  /** True when some, but not all, of `ids` are selected (drives the dash state). */
  isPartiallySelected: (ids: string[]) => boolean;
}

export function useRowSelection(): RowSelection {
  const [selected, setSelected] = useState<Set<string>>(() => new Set<string>());

  const has = useCallback((id: string) => selected.has(id), [selected]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addMany = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const removeMany = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const replaceWith = useCallback((ids: string[]) => {
    setSelected(new Set(ids));
  }, []);

  const clear = useCallback(() => setSelected(new Set<string>()), []);

  const isAllSelected = useCallback(
    (ids: string[]) => ids.length > 0 && ids.every((id) => selected.has(id)),
    [selected]
  );

  const isPartiallySelected = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return false;
      let some = false;
      for (const id of ids) {
        if (selected.has(id)) {
          some = true;
          break;
        }
      }
      return some && !ids.every((id) => selected.has(id));
    },
    [selected]
  );

  return {
    selected,
    count: selected.size,
    has,
    toggle,
    addMany,
    removeMany,
    replaceWith,
    clear,
    isAllSelected,
    isPartiallySelected,
  };
}
