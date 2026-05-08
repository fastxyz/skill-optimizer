import React from 'react';

type Props = {
  name: string;
  description: string;
  imageUrl: string;
  onAddToCart: () => void;
  onToggleWishlist: () => void;
  onQtyChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function ProductCard({ name, description, imageUrl, onAddToCart, onToggleWishlist, onQtyChange }: Props) {
  return (
    <article className="product-card">
      <img src={imageUrl} className="product-card__image" />
      <h3>{name}</h3>
      <p>{description}</p>
      <div onClick={onAddToCart} className="product-card__add">
        Add to Cart
      </div>
      <button onClick={onToggleWishlist} className="product-card__wishlist">
        <HeartIcon />
      </button>
      <input
        type="text"
        placeholder="Quantity"
        onChange={onQtyChange}
        className="product-card__qty"
      />
      <button className="product-card__buy outline-none">
        Buy Now
      </button>
    </article>
  );
}

function HeartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" />;
}
