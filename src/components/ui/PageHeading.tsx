import type { ReactNode } from "react";

interface PageHeadingProps {
  title: string;
  description?: ReactNode;
  titleAdornment?: ReactNode;
  children?: ReactNode;
}

/** Shared V3 page hierarchy; the Heart landing retains its own brand composition. */
export function PageHeading({ title, description, titleAdornment, children }: PageHeadingProps) {
  return (
    <header data-lh-v3-heading data-lh-page-heading>
      <div data-lh-v3-heading-copy>
        <div data-lh-v3-heading-title>
          <h1>{title}</h1>
          {titleAdornment}
        </div>
        {description && <div data-lh-v3-heading-description>{description}</div>}
      </div>
      {children && <div data-lh-v3-heading-actions>{children}</div>}
    </header>
  );
}
