import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'brass' | 'quiet' | 'danger';
  icon?: ReactNode;
}

export function Button({ tone = 'quiet', icon, className = '', children, ...props }: Props) {
  return (
    <button className={`button button--${tone} ${className}`} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  );
}
