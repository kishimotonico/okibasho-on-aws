import { Link } from '@tanstack/react-router';

import { messages } from '~/lib/messages';

export function NotFoundPage() {
  return (
    <div className="page">
      <h1>{messages.notFoundTitle}</h1>
      <p>{messages.notFoundDescription}</p>
      <p>
        <Link to="/" className="button-link button-link--secondary">
          {messages.backToTop}
        </Link>
      </p>
    </div>
  );
}
