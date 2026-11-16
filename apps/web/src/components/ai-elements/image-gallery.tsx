"use client";

import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, ImageOffIcon } from "lucide-react";
import { type ComponentProps, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apiUrl } from "@/lib/api";
import { hostnameOf, type WebImage } from "@/lib/tool-activity";
import { cn } from "@/lib/utils";

/** Tiles shown in the grid; the rest collapse into a "+N" on the last tile. */
const MAX_TILES = 5;

/**
 * Third-party images are never loaded by the browser directly: they go through the harness proxy,
 * which only fetches public raster images and strips cookies and referrer.
 */
export function proxiedImageUrl(url: string): string {
  return apiUrl(`/api/image-proxy?url=${encodeURIComponent(url)}`);
}

function Tile({
  image,
  className,
  overlay,
  onOpen,
}: {
  image: WebImage;
  className?: string;
  overlay?: string;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open image: ${image.title}`}
      className={cn(
        "group relative block min-h-0 cursor-zoom-in overflow-hidden rounded-lg bg-muted outline-none ring-1 ring-foreground/10 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {failed ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground text-xs">
          <ImageOffIcon className="size-5" />
          {hostnameOf(image.sourceUrl)}
        </span>
      ) : (
        <img
          src={proxiedImageUrl(image.thumbUrl)}
          alt={image.title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-left text-white text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
        <span className="line-clamp-1">{image.title}</span>
      </span>
      {overlay ? (
        <span className="absolute inset-0 grid place-items-center bg-black/55 font-semibold text-lg text-white">
          {overlay}
        </span>
      ) : null}
    </button>
  );
}

function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: WebImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const image = images[index];
  const [failedFull, setFailedFull] = useState<string | null>(null);
  const step = useCallback(
    (delta: number) => onIndexChange((index + delta + images.length) % images.length),
    [index, images.length, onIndexChange],
  );
  if (!image) return null;

  // If the full-size file won't load, fall back to the thumbnail the grid already showed.
  const src = failedFull === image.imageUrl ? image.thumbUrl : image.imageUrl;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton
        className="flex max-h-[92vh] flex-col gap-3 sm:max-w-4xl"
        onKeyDown={(event) => {
          if (images.length < 2) return;
          if (event.key === "ArrowLeft") step(-1);
          if (event.key === "ArrowRight") step(1);
        }}
      >
        <DialogTitle className="pr-8 text-sm leading-snug">{image.title}</DialogTitle>
        <DialogDescription className="sr-only">
          Image {index + 1} of {images.length} from {hostnameOf(image.sourceUrl)}
        </DialogDescription>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-muted">
          <img
            key={src}
            src={proxiedImageUrl(src)}
            alt={image.title}
            referrerPolicy="no-referrer"
            onError={() => setFailedFull(image.imageUrl)}
            className="max-h-[68vh] w-auto max-w-full object-contain"
          />
          {images.length > 1 ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="-translate-y-1/2 absolute top-1/2 left-2 opacity-80"
                onClick={() => step(-1)}
              >
                <ChevronLeftIcon />
                <span className="sr-only">Previous image</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="-translate-y-1/2 absolute top-1/2 right-2 opacity-80"
                onClick={() => step(1)}
              >
                <ChevronRightIcon />
                <span className="sr-only">Next image</span>
              </Button>
            </>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
          <span>
            {index + 1} / {images.length}
          </span>
          <a
            href={image.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            {hostnameOf(image.sourceUrl)}
            <ExternalLinkIcon className="size-3" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type ImageGalleryProps = { images: WebImage[]; className?: string };

/**
 * Images found for a reply: one large tile plus up to four small ones, then "+N". The box has a
 * fixed height so the transcript doesn't jump while thumbnails load. Click opens a lightbox.
 */
export function ImageGallery({ images, className }: ImageGalleryProps) {
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;

  const shown = images.slice(0, MAX_TILES);
  const hidden = images.length - shown.length;
  const layout =
    shown.length === 1
      ? "max-w-md grid-cols-1 grid-rows-[15rem]"
      : shown.length === 2
        ? "max-w-md grid-cols-2 grid-rows-[10rem]"
        : "max-w-xl grid-cols-4 grid-rows-[6.5rem_6.5rem] sm:grid-rows-[8rem_8rem]";

  return (
    <>
      <div className={cn("grid gap-1.5", layout, className)}>
        {shown.map((image, index) => (
          <Tile
            key={image.imageUrl}
            image={image}
            className={cn(shown.length >= 3 && index === 0 && "col-span-2 row-span-2")}
            overlay={hidden > 0 && index === shown.length - 1 ? `+${hidden}` : undefined}
            onOpen={() => setOpen(index)}
          />
        ))}
      </div>
      {open !== null ? (
        <Lightbox
          images={images}
          index={open}
          onIndexChange={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Replacement for markdown `![alt](url)` in replies: same proxy and lightbox as the gallery, so a
 * model that writes an image inline doesn't make the browser contact the image's host.
 */
export function MarkdownImage({ src, alt }: ComponentProps<"img">) {
  const url = typeof src === "string" ? src : "";
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!/^https?:\/\//i.test(url)) return null;

  const image: WebImage = {
    title: alt?.trim() || "Image",
    imageUrl: url,
    thumbUrl: url,
    sourceUrl: url,
  };
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
        <ImageOffIcon className="size-4" />
        {image.title}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open image: ${image.title}`}
        className="my-1 block max-w-md cursor-zoom-in overflow-hidden rounded-lg ring-1 ring-foreground/10"
      >
        <img
          src={proxiedImageUrl(url)}
          alt={image.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="max-h-72 w-auto object-cover"
        />
      </button>
      {open ? (
        <Lightbox
          images={[image]}
          index={0}
          onIndexChange={() => {}}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
