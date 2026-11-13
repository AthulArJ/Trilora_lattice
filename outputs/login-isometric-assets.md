# Isometric login assets

The login uses a light 60/40 layout with an industrial campus illustration and a white sign-in panel. The existing authentication handlers remain in place.

Both assets were created using the built-in image generation tool. Original generated outputs remain in the Codex generated-images directory.

## Brand lockup

Saved path: `apps/web/public/brand/lattice-lockup-light.png`

The supplied raster reference was adapted for a light background. The geometric wordmark, triangular A detail, purple-and-gold icon and letter spacing are preserved visually. An original font file cannot be recovered from the reference; the lockup remains an image with an accessible text alternative.

Final prompt:

> Edit the supplied LATTICE brand image into a clean production logo lockup for a LIGHT off-white website. Extract the existing icon and lettering, preserving the exact icon silhouette: rounded square with folded purple ribbon and gold L, preserve the geometric LATTICE uppercase wordmark including the triangular cutout A and its small gold triangle. Preserve the thin vertical gold divider and exact tagline OPERATIONS INTELLIGENCE with wide tracking. Remove the black background and ALL atmospheric glow, haze and outer shadows. Fully transparent background. Change only the white LATTICE lettering to deep charcoal #243238 for contrast on light backgrounds. Tagline and divider should be dark muted bronze #80633a. Keep icon purple and gold as in original, modest material shading within icon only. A single horizontal lockup cropped tightly with small even transparent margins, very crisp edges, high-resolution, exact spelling. No extra text or decorations. This is faithful logo extraction and light-background adaptation, not a new logo design.

## Campus illustration

Saved path: `apps/web/public/brand/login-isometric-campus.png`

Final prompt:

> Use case: stylized-concept. Asset type: restrained architectural isometric illustration for an enterprise operations software login page. Create a clean high-quality true isometric industrial campus, orthographic camera with parallel lines and no perspective convergence. Several interconnected modules: a small factory with roof vents, logistics warehouse with loading docks, modern office block, utility plant with two cylindrical tanks, service roads, one forklift, two small unbranded delivery vehicles, a few tiny workers and landscaped walkways. All on a thin compact floating rectangular ground plane. Palette: warm off-white #f4f6f2 background, pale concrete and sage green roofs, slate blue gray building accents, muted teal location markers; very small purple and warm brass details to relate to a purple/gold product logo. Soft ambient daylight, delicate shadows, precise tasteful miniature architectural visualization. Composition centered, entire campus fully visible from above in isometric projection, generous clean margins, wide landscape image around 4:3. Calm professional editorial product illustration with realistic proportions, no dark cinematic atmosphere, no neon or glow, no floating giant symbols, no text, lettering, logos, UI panels or watermark, no airport or aircraft.

## Verification

Production frontend build passed. Server rendering verified normal sign-in, invitation fields and password requirements, loading state, authenticated access, and unconfigured demo access. Stylesheets parse successfully; both assets are present in the production output. Browser launch failed within the environment, so desktop/mobile appearance and interactive behavior have not been visually verified.
