import { useEffect, useRef, useState } from 'react';
import { galleryTiles, step } from './galleryTiles';

/**
 * ui-1b.1: hero image with a row of thumbnails (selected one outlined in navy). With more than five images the
 * last tile is '+N' and opens a lightbox (arrow keys, Escape) at the first hidden image.
 */
export function Gallery({ images, name }: { images: string[]; name: string }) {
  const [selected, setSelected] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  useEffect(() => setSelected(0), [images]);

  if (images.length === 0) {
    return (
      <div className="gallery-hero gallery-empty" data-testid="gallery-placeholder">
        No image
      </div>
    );
  }
  return (
    <div className="gallery">
      <button type="button" className="gallery-hero-button" onClick={() => setLightbox(selected)} aria-label="Open image viewer">
        <img className="gallery-hero" src={images[selected]} alt={name} data-testid="gallery-hero" />
      </button>
      {galleryTiles(images.length).length > 0 && (
        <div className="gallery-thumbs" data-testid="gallery-thumbs">
          {galleryTiles(images.length).map((t) =>
            t.kind === 'image' ? (
              <button
                key={t.index}
                type="button"
                className={`gallery-thumb ${t.index === selected ? 'is-selected' : ''}`}
                aria-label={`Show image ${t.index + 1}`}
                aria-pressed={t.index === selected}
                onClick={() => setSelected(t.index)}
              >
                <img src={images[t.index]} alt="" />
              </button>
            ) : (
              <button key="more" type="button" className="gallery-thumb gallery-more" aria-label={`Show ${t.more} more images`} onClick={() => setLightbox(t.index)}>
                <img src={images[t.index]} alt="" />
                <span>+{t.more}</span>
              </button>
            ),
          )}
        </div>
      )}
      {lightbox !== null && <Lightbox images={images} name={name} start={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function Lightbox({ images, name, start, onClose }: { images: string[]; name: string; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setIndex((i) => step(i, 1, images.length));
      else if (e.key === 'ArrowLeft') setIndex((i) => step(i, -1, images.length));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);
  return (
    <div className="idle-backdrop lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`${name} images`} className="lightbox-panel" data-testid="lightbox">
        <img src={images[index]} alt={`${name} image ${index + 1}`} />
        <div className="lightbox-bar">
          <button type="button" className="btn btn-ghost" onClick={() => setIndex(step(index, -1, images.length))} aria-label="Previous image">
            ‹
          </button>
          <span data-testid="lightbox-position">
            {index + 1} / {images.length}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => setIndex(step(index, 1, images.length))} aria-label="Next image">
            ›
          </button>
          <button type="button" ref={close} className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
