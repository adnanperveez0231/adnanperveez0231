# Book Studio

A personal, distraction-free workspace for writing a book: organise ideas, structure chapters, keep drafts and research, and track progress.

**There is no AI in this app.** It has no text generation, rewriting, autocomplete, suggestions or chatbot, and it makes no network requests. Every word in the manuscript is yours; the app only stores, organises and exports it. (The only text help is your browser's built-in spell-check underline, which you can turn off in the browser.)

## Running it

You don't need to install or build anything. Open `index.html` in a modern browser (Chrome, Edge, Firefox or Safari):

```bash
open book-studio/index.html          # macOS
xdg-open book-studio/index.html      # Linux
```

You can also serve the folder with any static file server, for example `python3 -m http.server` run from inside `book-studio/`.

Your writing is saved in the browser's IndexedDB as you type. It stays on your computer and is tied to that browser profile, so **download a backup file regularly** from *Export & Backup*.

## What's inside

| Area | What it does |
|---|---|
| **Your Books** | Create and switch between multiple books. Each has a title, subtitle, author, description, central theme and target length. |
| **Dashboard** | Continue Writing (returns to the paragraph you last edited), word totals, how much of the manuscript is complete, chapter count, writing streak, daily/weekly/monthly targets, recently edited sections, and items that need attention. |
| **Outline** | Chapters → sections → subsections. Rename them inline. Drag to reorder chapters, or to move sections within or between chapters; buttons and menus do the same thing. Removed items go to a trash you can restore from. |
| **Chapter page** | Description, objective, private chapter notes, status (Draft / In Review / Finalized), target length, revision checklist, "what needs improvement" comments, and per-chapter export. |
| **Editor** | Body text, heading, subheading, bold, italic, quotation, bulleted and numbered lists, highlights. It autosaves with a visible status and shows word and character counts (and counts for the current selection). It also has comments, bookmarks and revision flags attached to paragraphs, revision mode, reading mode, full-screen distraction-free mode, adjustable text size and line width, and version history with a word-level draft comparison. |
| **Notes & Research** | Quick capture, plus thoughts, research, quotes, observations, "to include", future-chapter ideas and reflections. Each note can have a source and a reference link, and can be linked to a chapter or section. You can search, filter, pin notes, and mark them as incorporated. Linked notes also appear beside the editor. |
| **Progress** | Rings for your targets, current and longest streaks, days written, average and best day, a monthly heat-map calendar, daily/weekly/monthly history charts (each with a table view), chapter-by-chapter progress, and Completed / Pending / Unfinished counts. |
| **Review** | A Draft → In Review → Finalized board, every open checklist item, comment and flagged passage in one list, and manuscript versions you can compare with the current text or restore. There is also a reading mode for the whole manuscript. |
| **Export & Backup** | DOCX (built in the browser, with real Word styles, lists and page numbers), PDF (via the print dialog, with page numbers and chapter page breaks), and HTML, for the whole book or a single chapter. There are "Book" and "Submission" layouts and A4 / Letter sizes. Backups: a JSON backup file to download and restore, a daily automatic backup (14 kept), and safety backups taken before any delete or restore. |

Comments, bookmarks, flags, highlights (unless you choose to keep them) and notes are private and never exported.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl/⌘ + S | Save now |
| Ctrl/⌘ + B / I | Bold / italic |
| Ctrl/⌘ + Alt + 0 / 1 / 2 | Body text / heading / subheading |
| Ctrl/⌘ + Shift + H | Highlight |
| Ctrl/⌘ + Shift + M | Comment on the current paragraph |
| Ctrl/⌘ + Shift + N | Capture a note from anywhere |
| Esc | Leave distraction-free mode |

## How your work is protected

- The editor saves about a second after you stop typing. Unsaved text is also mirrored to `localStorage` on every pause, so it can be recovered if the tab closes mid-save.
- Before the first edit of each day, a version of the section is saved automatically.
- Deleting a chapter, section or note moves it to the trash. Restoring a manuscript version first saves the current manuscript as a version. Restoring a backup or deleting a book first takes a safety backup.
- The app asks the browser for persistent storage so the library isn't cleared to free disk space.

## Project layout

```
index.html
css/styles.css         design tokens (type, spacing, radii, colour) + all components, light & dark
js/util.js             helpers (word count, dates, formatting)
js/db.js               IndexedDB wrapper
js/store.js            data model, persistence, versions, snapshots, backups, statistics
js/sanitize.js         keeps manuscript HTML to a small, safe vocabulary
js/diff.js             paragraph + word-level draft comparison
js/docx.js             dependency-free DOCX writer
js/export.js           manuscript assembly, PDF/HTML export
js/ui.js, js/app.js    dialogs, toasts, menus, routing, shell
js/views/*.js          one file per screen
```
