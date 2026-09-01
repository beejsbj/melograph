import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContourChart } from './ContourChart';

describe('Strudel playhead projection', () => {
  it('renders one playhead for each independently looping take', () => {
    const markup = renderToStaticMarkup(
      <ContourChart
        result={{ duration_seconds: 4, frames: [], phrases: [] }}
        playheadSeconds={[1, 2.5]}
      />,
    );

    expect(markup.match(/class="chart__playhead"/g)).toHaveLength(2);
  });
});
