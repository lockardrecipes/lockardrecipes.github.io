# Mom's Recipe Box

A colorful, responsive recipe browser built from the supplied Excel workbook.

## What's included

- 278 imported recipes from `Mom's Recipes Spreadsheet.xlsx`
- Search by recipe name, tag, link, ingredients, or instructions
- Dynamic filters built from the spreadsheet's existing tags: cook method, effort, favorite person, course, collection, and cuisine
- Random recipe picker that respects the current search and filters
- Grid and list views
- Add, edit, and delete recipes
- Optional Supabase database for shared live changes across visitors
- Optional ingredients and instructions fields (the source workbook did not contain these)

## Run a local preview

Because the app loads `data/recipes.json`, use a local web server rather than opening `index.html` as a file. From this folder run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

Without Supabase configured, the site is a preview: edits are saved only in that browser's local storage. The original imported recipes are loaded from `data/recipes.json`.

## Enable shared editing with Supabase

1. Create a project at https://supabase.com/.
2. In the Supabase SQL Editor, run `supabase-setup.sql`. This creates the table, public access policies, and imports all 278 spreadsheet recipes. Run the full file only once to avoid importing duplicates.
3. In Supabase, open **Project Settings → API** (or **Connect**) and copy the Project URL and anon/public key.
4. Paste those two values into `config.js` as `supabaseUrl` and `supabaseAnonKey`.
5. Commit and push the project to GitHub. Enable **Settings → Pages → Deploy from a branch**, choose your main branch and `/ (root)`.

After configuration, all visitors load the same Supabase recipe collection, and additions/edits/deletions are visible to everyone.

### Important public-editing warning

You chose to let **anyone** visiting the site edit recipes. The SQL policies therefore permit unauthenticated internet visitors to insert, update, and delete every recipe. Anyone who finds the site can change or erase the collection. This is appropriate only if you intentionally want a fully public collaborative recipe book. For safer family use, turn on Supabase Auth and restrict write policies to signed-in users (or selected accounts). Never put a Supabase `service_role` key in `config.js`; use only the anon/public key.

## Spreadsheet mapping

| Excel column | Database field |
|---|---|
| Recipe Name | `name` |
| Link | `url` |
| Cook Method | `cook_method` |
| Effort | `effort` |
| Favorites | `favorites` |
| Course | `course` |
| Collection | `collection` |
| Cuisine | `cuisine` |

Comma-separated cells are split into separate tags. Original recipe links are retained. Ingredient and instruction fields start blank because the supplied workbook contains recipe titles and links, not the full recipe text.
