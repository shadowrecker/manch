import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MediaKitCard } from '@/components/deals/MediaKitCard';
import type { IgMetrics, MediaKitData } from '@/lib/modules/deals/types';

const metrics: IgMetrics = { followers: 85000, engagementRate: 4.2, avgLikes: 3200, avgComments: 180, topCategories: ['food'], audience: null };
const kit: MediaKitData = {
  headline: 'Lucknow home-cooking creator',
  about: 'I cook regional recipes.',
  keyStatsNarrative: '85k followers who cook along.',
  whyBrands: 'High intent food audience.',
  pricingNote: 'Open to collaborations.',
};

describe('<MediaKitCard>', () => {
  it('renders headline, the creator name, and Indian-formatted stats', () => {
    render(<MediaKitCard kit={kit} metrics={metrics} name="Anjali Verma" />);
    expect(screen.getByText('Lucknow home-cooking creator')).toBeInTheDocument();
    expect(screen.getByText('Anjali Verma')).toBeInTheDocument();
    expect(screen.getByText('85,000')).toBeInTheDocument(); // en-IN grouping
    expect(screen.getByText('4.2%')).toBeInTheDocument();
    expect(screen.getByText('High intent food audience.')).toBeInTheDocument();
  });

  it('shows an em dash for missing engagement', () => {
    render(<MediaKitCard kit={kit} metrics={{ ...metrics, engagementRate: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
