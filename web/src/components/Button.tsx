import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'brass' | 'quiet' | 'danger';
  icon?: ReactNode;
}

export function Button({ tone = 'quiet', icon, className = '', children, ...props }: Props) {
  return (
    <button className={`button button--${tone}${tone === 'brass' ? ' brass' : ''} ${className}`} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  );
}
