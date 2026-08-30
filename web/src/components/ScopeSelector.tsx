import type { AnalysisScope } from '../lib/scope';
import type { Phrase } from '../types';

interface Props {
  phrases: Phrase[];
  value: AnalysisScope;
  onChange: (scope: AnalysisScope) => void;
}

export function ScopeSelector({ phrases, value, onChange }: Props) {
  const options: Array<{ value: AnalysisScope; label: string }> = [
    { value: 'full', label: 'Full' },
    ...phrases.map((phrase) => ({ value: phrase.number, label: `Take ${phrase.number}` })),
  ];
  return (
    <div className="scope-selector" role="group" aria-label="Analysis scope">
      {options.map((option) => (
        <button
          type="button"
          className={`scope-selector__option${value === option.value ? ' scope-selector__option--active' : ''}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          key={option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
