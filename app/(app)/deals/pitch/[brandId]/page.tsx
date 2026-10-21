import { redirect, notFound } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getBrandById } from '@/lib/modules/deals/queries';
import { PitchClient } from '@/components/deals/PitchClient';

export const dynamic = 'force-dynamic';

export default async function PitchPage({ params }: { params: { brandId: string } }) {
  const user = await getUser();
  if (!user) redirect('/login');

  const brand = await getBrandById(params.brandId);
  if (!brand) notFound();

  return <PitchClient brandId={brand.id} brandName={brand.name} brandNiche={brand.niche ?? []} />;
}
