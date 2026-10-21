import { redirect } from 'next/navigation';

// /reels → the Studio (the module's home tab).
export default function ReelsIndex() {
  redirect('/reels/studio');
}
