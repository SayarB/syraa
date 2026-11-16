import { describe, expect, it, vi } from "vitest";
import {
  fetchPublicImage,
  type ImageRequester,
  type ImageResponse,
  MAX_IMAGE_BYTES,
} from "../src/web/image-proxy.js";
import { BlockedUrlError } from "../src/web/url-guard.js";

function respond(init: Partial<ImageResponse> & { chunks?: Uint8Array[] } = {}): ImageResponse {
  const chunks = init.chunks ?? [new Uint8Array([1, 2, 3])];
  return {
    status: 200,
    contentType: "image/png",
    body: (async function* () {
      yield* chunks;
    })(),
    destroy: vi.fn(),
    ...init,
  };
}

describe("fetchPublicImage", () => {
  it("returns the bytes and media type of a public image", async () => {
    const request: ImageRequester = vi.fn(async () => respond({ contentType: "IMAGE/PNG; q=1" }));
    const image = await fetchPublicImage("http://93.184.216.34/a.png", request);
    expect(image.contentType).toBe("image/png");
    expect([...image.body]).toEqual([1, 2, 3]);
  });

  it("refuses private and loopback addresses before any request", async () => {
    const request = vi.fn();
    for (const url of [
      "http://127.0.0.1/a.png",
      "http://10.0.0.5/a.png",
      "http://169.254.169.254/latest/meta-data",
      "http://localhost/a.png",
      "file:///etc/passwd",
    ]) {
      await expect(fetchPublicImage(url, request)).rejects.toBeInstanceOf(BlockedUrlError);
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("re-checks every redirect hop", async () => {
    const request: ImageRequester = vi.fn(async () =>
      respond({ status: 302, location: "http://169.254.169.254/latest/meta-data" }),
    );
    await expect(fetchPublicImage("http://93.184.216.34/a.png", request)).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("follows a public redirect", async () => {
    const request: ImageRequester = vi
      .fn<ImageRequester>()
      .mockResolvedValueOnce(respond({ status: 301, location: "http://93.184.216.35/b.png" }))
      .mockResolvedValueOnce(respond({ contentType: "image/webp" }));
    const image = await fetchPublicImage("http://93.184.216.34/a.png", request);
    expect(image.contentType).toBe("image/webp");
  });

  it("gives up on a redirect loop", async () => {
    const request: ImageRequester = vi.fn(async () =>
      respond({ status: 302, location: "http://93.184.216.34/again.png" }),
    );
    await expect(fetchPublicImage("http://93.184.216.34/a.png", request)).rejects.toMatchObject({
      status: 502,
    });
  });

  it("rejects anything that isn't a raster image, SVG included", async () => {
    for (const contentType of [
      "text/html",
      "image/svg+xml",
      "application/octet-stream",
      undefined,
    ]) {
      const request: ImageRequester = vi.fn(async () => respond({ contentType }));
      await expect(fetchPublicImage("http://93.184.216.34/a", request)).rejects.toMatchObject({
        status: 415,
      });
    }
  });

  it("rejects upstream errors", async () => {
    const request: ImageRequester = vi.fn(async () => respond({ status: 404 }));
    await expect(fetchPublicImage("http://93.184.216.34/a.png", request)).rejects.toMatchObject({
      status: 502,
    });
  });

  it("rejects a declared size over the cap without reading the body", async () => {
    const response = respond({ contentLength: MAX_IMAGE_BYTES + 1 });
    await expect(
      fetchPublicImage("http://93.184.216.34/a.png", async () => response),
    ).rejects.toMatchObject({ status: 413 });
    expect(response.destroy).toHaveBeenCalled();
  });

  it("stops reading a body that outgrows the cap", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES / 2 + 1);
    const response = respond({ chunks: [big, big] });
    await expect(
      fetchPublicImage("http://93.184.216.34/a.png", async () => response),
    ).rejects.toMatchObject({ status: 413 });
    expect(response.destroy).toHaveBeenCalled();
  });

  it("maps a connection failure to 502", async () => {
    const request: ImageRequester = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(fetchPublicImage("http://93.184.216.34/a.png", request)).rejects.toMatchObject({
      status: 502,
    });
  });
});
