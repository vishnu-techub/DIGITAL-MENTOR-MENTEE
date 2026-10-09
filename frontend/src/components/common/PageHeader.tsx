import React from 'react';

export interface PageHeaderProps {
  /** Small uppercase label shown above the title (role / section context). */
  eyebrow?: React.ReactNode;
  /** The page or section title. Rendered as an <h1> for landmark semantics. */
  title: React.ReactNode;
  /** Optional supporting sentence shown under the title. */
  subtitle?: React.ReactNode;
  /** Optional right-aligned controls (buttons, filters, etc.). */
  actions?: React.ReactNode;
  /** Optional breadcrumb row rendered above the title block. */
  breadcrumb?: React.ReactNode;
  /** Optional id so the header can be referenced by aria-labelledby. */
  id?: string;
}

/**
 * Shared page/section header used across every role so that titles, subtitles
 * and actions line up the same way everywhere. Purely presentational - it holds
 * no state and performs no data access.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  actions,
  breadcrumb,
  id,
}) => {
  return (
    <header className="page-header" id={id}>
      <div className="page-header-main">
        {breadcrumb && <nav className="breadcrumb" aria-label="Breadcrumb">{breadcrumb}</nav>}
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
};

export default PageHeader;
