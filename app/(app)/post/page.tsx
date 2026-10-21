import { redirect } from 'next/navigation';

// /post has no page of its own — the module's home is the Generate tab.
export default function PostIndexPage() {
  redirect('/post/generate');
}
