export type HtmlPictureReconstruction = { readonly kind: "nearest" };

export function assertHtmlPictureReconstruction(value: HtmlPictureReconstruction): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.kind !== "nearest" || Object.keys(value).length !== 1) {
    throw new Error("HTML Picture reconstruction is invalid.");
  }
}
