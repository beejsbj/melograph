import type { Phrase } from '../types';
export function NoteLedger({ phrases }: { phrases: Phrase[] }) {
  return (
    <div className="note-ledger">
      {phrases.map((phrase) => {
        const notes = phrase.events.filter((event) => event.type === 'note');
        return (
          <article className="ledger-take" key={phrase.number}>
            <header className="ledger-take__meta">
              <span>take {String(phrase.number).padStart(2, '0')}</span>
              <small>{notes.length} notes · {phrase.duration_seconds.toFixed(2)}s</small>
            </header>
            <div className="take-row__notes">
              {notes.map((event, index) => (
                <span className="note-token" key={`${event.start_seconds}-${index}`}>
                  <strong>{event.note}</strong>
                  <small>{event.duration_seconds.toFixed(2)}</small>
                  {event.gesture && <i title={event.gesture.type}>↗</i>}
                </span>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
