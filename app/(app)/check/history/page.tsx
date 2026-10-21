import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getRecentChecksForUser } from '@/lib/modules/check/queries';

export const dynamic = 'force-dynamic';

// /check/history — the signed-in user's fact-checks (via linked WhatsApp bot users).
export default async function CheckHistoryPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const checks = await getRecentChecksForUser(user.id, 50);

  return (
    <div className="card">
      <h1 style={{ margin: 0 }}>Check history</h1>
      <p className="sub" style={{ margin: '4px 0 0' }}>Your recent fact-checks. Most happen on WhatsApp.</p>
      {checks.length === 0 ? (
        <p className="empty">No checks yet. Forward a message, photo or video to Manch on WhatsApp.</p>
      ) : (
        <div style={{ marginTop: 12 }}>
          {checks.map((c) => (
            <div key={c.id} className="verdict-card" style={{ marginBottom: 10 }}>
              <div className="vhead">
                <span className={`vlabel ${c.verdict_label ?? 'unverified'}`}>{c.verdict_label ?? 'pending'}</span>
                <span className="hint">{c.trust_score != null ? `Trust ${c.trust_score}/10` : ''} · {c.input_type} · {c.language}</span>
              </div>
              {c.verdict_text && <div className="vtext">{c.verdict_text}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
