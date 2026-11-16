"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  ImageIcon,
  ImageOffIcon,
  RefreshCwIcon,
} from "lucide-react";
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

/** Grid classes for 1 to MAX_TILES tiles, picked so no cell is left empty. */
function galleryLayout(count: number): { grid: string; first?: string } {
  const large = "col-span-2 row-span-2";
  switch (count) {
    case 1:
      return { grid: "max-w-md grid-cols-1 grid-rows-[15rem]" };
    case 2:
      return { grid: "max-w-md grid-cols-2 grid-rows-[10rem]" };
    case 3:
      return {
        grid: "max-w-xl grid-cols-3 grid-rows-[6.5rem_6.5rem] sm:grid-rows-[8rem_8rem]",
        first: large,
      };
    case 4:
      return { grid: "max-w-md grid-cols-2 grid-rows-[7rem_7rem] sm:grid-rows-[8rem_8rem]" };
    default:
      return {
        grid: "max-w-xl grid-cols-4 grid-rows-[6.5rem_6.5rem] sm:grid-rows-[8rem_8rem]",
        first: large,
      };
  }
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

type LoadState = "loading" | "loaded" | "failed";

/**
 * The picture area of the lightbox. It has a fixed height so the dialog doesn't resize as the
 * image arrives: a skeleton shows while loading, and a failure shows a blurred copy of the
 * thumbnail (already cached by the grid) behind a short message and a retry.
 */
function LightboxStage({ image }: { image: WebImage }) {
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [thumbFailed, setThumbFailed] = useState(false);

  // A cached image can finish before React attaches handlers, so read the element's own state.
  const settle = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete) setState(el.naturalWidth > 0 ? "loaded" : "failed");
  }, []);

  return (
    <div className="relative flex h-[60vh] min-h-64 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
      {state === "loading" ? (
        <div
          role="status"
          aria-label="Loading image"
          className="absolute inset-0 grid animate-pulse place-items-center bg-foreground/8"
        >
          <ImageIcon className="size-8 text-muted-foreground/50" />
        </div>
      ) : null}
      {state === "failed" ? (
        <>
          {thumbFailed ? null : (
            <img
              src={proxiedImageUrl(image.thumbUrl)}
              alt=""
              aria-hidden
              referrerPolicy="no-referrer"
              onError={() => setThumbFailed(true)}
              className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl"
            />
          )}
          <div
            role="alert"
            className="relative flex max-w-xs flex-col items-center gap-3 rounded-xl border bg-background/75 px-5 py-4 text-center shadow-lg backdrop-blur-md"
          >
            <ImageOffIcon className="size-6 text-muted-foreground" />
            <div className="space-y-0.5">
              <p className="font-medium text-sm">Couldn't load this image</p>
              <p className="text-muted-foreground text-xs">
                The source didn't respond or blocked the request.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setState("loading");
                setAttempt((n) => n + 1);
              }}
            >
              <RefreshCwIcon />
              Retry
            </Button>
          </div>
        </>
      ) : (
        <img
          // A new key per retry remounts the element so the browser really refetches.
          key={attempt}
          ref={settle}
          // The proxy ignores `r`; it only gives a retry a fresh URL past any cached failure.
          src={`${proxiedImageUrl(image.imageUrl)}${attempt > 0 ? `&r=${attempt}` : ""}`}
          alt={image.title}
          referrerPolicy="no-referrer"
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className={cn(
            "max-h-full max-w-full object-contain transition-opacity duration-200",
            state === "loaded" ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
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
  const step = useCallback(
    (delta: number) => onIndexChange((index + delta + images.length) % images.length),
    [index, images.length, onIndexChange],
  );
  if (!image) return null;

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
        <div className="relative">
          {/* Keyed by image so each one starts in its own loading state. */}
          <LightboxStage key={image.imageUrl} image={image} />
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
  const layout = galleryLayout(shown.length);

  return (
    <>
      <div className={cn("grid gap-1.5", layout.grid, className)}>
        {shown.map((image, index) => (
          <Tile
            key={image.imageUrl}
            image={image}
            className={index === 0 ? layout.first : undefined}
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
  // Remember which URL failed: while a reply streams, a half-typed URL can fail and then complete.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!/^https?:\/\//i.test(url)) return null;

  const image: WebImage = {
    title: alt?.trim() || "Image",
    imageUrl: url,
    thumbUrl: url,
    sourceUrl: url,
  };
  if (failedUrl === url) {
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
          onError={() => setFailedUrl(url)}
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
