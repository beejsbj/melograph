import type { Phrase } from '../types';
import { StatusChip } from './StatusChip';

export function NoteLedger({ phrases }: { phrases: Phrase[] }) {
  return (
    <div className="note-ledger">
      {phrases.map((phrase) => {
        const notes = phrase.events.filter((event) => event.type === 'note');
        return (
          <article className="take-row" key={phrase.number}>
            <div className="take-row__meta">
              <span>take {String(phrase.number).padStart(2, '0')}</span>
              <small>{phrase.duration_seconds.toFixed(2)}s</small>
            </div>
            <div className="take-row__notes">
              {notes.map((event, index) => (
                <span className="note-token" key={`${event.start_seconds}-${index}`}>
                  <strong>{event.note}</strong>
                  <small>{event.duration_seconds.toFixed(2)}</small>
                  {event.gesture && <i title={event.gesture.type}>↗</i>}
                </span>
              ))}
            </div>
            <StatusChip tone="ready">{notes.length} notes</StatusChip>
          </article>
        );
      })}
    </div>
  );
}
