import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';

interface Message {
  id: number;
  content: string;
  createdAt: string;
  author: { id: number; username: string };
}

export function Messages({ auctionId, sellerId }: { auctionId: number; sellerId: number }) {
  const { user } = useAuth();
  const location = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ messages: Message[] }>(`/auctions/${auctionId}/messages`).then((r) => setMessages(r.messages));
  }, [auctionId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!content.trim()) {
      setError('Message cannot be empty');
      return;
    }
    setBusy(true);
    try {
      const { message } = await api<{ message: Message }>(`/auctions/${auctionId}/messages`, { body: { content } });
      setMessages((m) => [...m, message]);
      setContent('');
    } catch (err) {
      if (err instanceof ApiError) setError(err.fields.content ?? err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>Messages</h2>
      {messages.length === 0 ? (
        <p className="muted">No messages yet. Ask the seller a question.</p>
      ) : (
        <ul className="messages" data-testid="messages">
          {messages.map((m) => (
            <li key={m.id}>
              <div className="row small">
                <strong>{m.author.username}</strong>
                {m.author.id === sellerId && <span className="badge badge-upcoming">seller</span>}
                <span className="muted">{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              <p>{m.content}</p>
            </li>
          ))}
        </ul>
      )}
      {user ? (
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="message">Write a message</label>
            <textarea id="message" rows={2} maxLength={1000} value={content} onChange={(e) => setContent(e.target.value)} aria-invalid={!!error || undefined} />
            {error && (
              <span className="field-error" role="alert">
                {error}
              </span>
            )}
          </div>
          <div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Post message
            </button>
          </div>
        </form>
      ) : (
        <p className="small">
          <Link to="/login" state={{ from: location.pathname }}>
            Log in
          </Link>{' '}
          to post a message.
        </p>
      )}
    </section>
  );
}
