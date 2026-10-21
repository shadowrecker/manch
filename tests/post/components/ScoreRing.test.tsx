import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreRing } from '@/components/post/ScoreRing';

// EXEMPLAR — component test pattern (jsdom env via tests/components/** glob).

describe('<ScoreRing>', () => {
  it('renders the score and default label with an accessible name', () => {
    render(<ScoreRing value={62} />);
    expect(screen.getByText('62')).toBeInTheDocument();
    expect(screen.getByText('Manch Score')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Manch Score: 62 out of 100');
  });

  it('clamps and rounds out-of-range values', () => {
    const { rerender } = render(<ScoreRing value={150} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    rerender(<ScoreRing value={-10} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    rerender(<ScoreRing value={61.6} />);
    expect(screen.getByText('62')).toBeInTheDocument();
  });

  it('accepts a custom label', () => {
    render(<ScoreRing value={50} label="Your Score" />);
    expect(screen.getByText('Your Score')).toBeInTheDocument();
  });
});
