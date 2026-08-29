import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  title?: string;
  action?: ReactNode;
}

export function Panel({ eyebrow, title, action, className = '', children, ...props }: Props) {
  return (
    <section className={`panel ${className}`} {...props}>
      {(eyebrow || title || action) && (
        <header className="panel__header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <h2>{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
