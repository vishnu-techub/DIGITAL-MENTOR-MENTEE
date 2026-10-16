import React from 'react';
import { CheckSquare, Download, Loader2, Trash2, X } from 'lucide-react';

export type BulkBusyAction = 'select-all' | 'delete' | 'download' | null;

interface BulkActionBarProps {
  /** How many records are currently selected. */
  count: number;
  /** Total eligible for "Select All" (null while unknown / not applicable). */
  totalEligible?: number | null;
  /** Whether the whole eligible set is already selected. */
  allSelected?: boolean;
  /** Noun for the record type, e.g. "student" / "faculty member". */
  itemNoun: string;
  onSelectAll: () => void;
  onClear: () => void;
  onDelete: () => void;
  onDownload: () => void;
  /** Which action (if any) is in flight — disables the whole bar. */
  busy?: BulkBusyAction;
}

/**
 * The sticky action bar shown above a management table as soon as at least one
 * row is selected. Buttons are disabled while an action is in flight so a
 * double-click can never submit a bulk delete or start two downloads.
 */
export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  count,
  totalEligible,
  allSelected = false,
  itemNoun,
  onSelectAll,
  onClear,
  onDelete,
  onDownload,
  busy = null,
}) => {
  if (count === 0) return null;

  const disabled = busy !== null;
  const plural = count === 1 ? itemNoun : `${itemNoun}s`;

  return (
    <div className="bulk-action-bar" role="region" aria-label={`Bulk actions for ${count} selected ${plural}`}>
      <div className="bulk-action-bar__count">
        <CheckSquare size={18} aria-hidden="true" />
        <span>
          <strong>{count}</strong> {plural} selected
        </span>
      </div>

      <div className="bulk-action-bar__actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onSelectAll}
          disabled={disabled || allSelected}
          title={
            totalEligible === null || totalEligible === undefined
              ? 'Select every eligible record'
              : `Select all ${totalEligible} eligible record${totalEligible === 1 ? '' : 's'}`
          }
        >
          {busy === 'select-all' ? <Loader2 size={15} className="spin" /> : <CheckSquare size={15} />}
          {allSelected ? 'All selected' : 'Select all'}
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClear}
          disabled={disabled}
        >
          <X size={15} /> Clear
        </button>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onDownload}
          disabled={disabled}
        >
          {busy === 'download' ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
          Download documents
        </button>

        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={onDelete}
          disabled={disabled}
        >
          {busy === 'delete' ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
          Delete selected
        </button>
      </div>
    </div>
  );
};
