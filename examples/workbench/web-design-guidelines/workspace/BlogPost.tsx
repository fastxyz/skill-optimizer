import React from 'react';

type Props = {
  title: string;
  body: string;
  toastMessage?: string;
};

export function BlogPost({ title, body, toastMessage }: Props) {
  return (
    <article className="blog-post">
      <h1>{title}</h1>
      <h3>Background</h3>
      <p>{body}</p>

      <div className="share-row">
        <svg viewBox="0 0 24 24" className="share-icon">
          <path d="M12 2v20" />
        </svg>
        <span>Share this post</span>
      </div>

      <button className="cta focus:ring-2">Continue</button>

      {toastMessage && (
        <div className="toast">
          {toastMessage}
        </div>
      )}
    </article>
  );
}
