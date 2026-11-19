LOCKARD FAMILY — RECIPE VAULT PHOTO UPDATE

WHAT THIS UPDATE DOES
- Keeps the existing recipe vault, search, filters, recipe editing, and purple styling.
- Uses a manually entered Photo link first, whenever one is provided.
- Otherwise, tries to use the featured/Open Graph image from that recipe's own recipe webpage.
- Does NOT use generic stock food photos or unrelated fallback images.
- If no usable image is found, the photo area stays blank (no "Photo unavailable" message).
- Recipe-page image results are cached in each visitor's browser to reduce repeat lookups.

IMPORTANT LIMITATION
Automatic image lookup is best-effort. Some recipe websites block metadata services, omit a featured image, or expose an image that is not the finished dish. In those cases the photo area may remain blank. A manually entered direct image URL in the Photo link field is the reliable override.

HOW TO UPDATE GITHUB PAGES
1. Download and unzip this folder.
2. Open the folder named lockard-family-recipe-vault-photo-update.
3. In your GitHub repository, upload/replace index.html, styles.css, and app.js at the repository ROOT (not inside another folder).
4. If GitHub asks, confirm that you want to replace the files.
5. Wait a minute, then refresh your recipe website. If the old version still appears, hard-refresh the page (Cmd+Shift+R on Mac).

Do not upload this README or the SQL migration unless you are specifically updating your database setup.
