# Daybook Planner

A daily planner and to-do list in a single HTML file. It opens on **tomorrow** so you can plan the next day quickly.

## Features
- **Plan the day**: add tasks with time slots, deadlines and length; set your order by dragging or with the arrow buttons.
- **Quick add**: type `Draft proposal 9-10:30 !high #work by 17:00` and the time, priority, category and deadline are filled in.
- **Notes & comments**: attach notes, instructions and progress updates to any task.
- **Priorities**: High / Medium / Low. **Progress**: Not started / In progress / Completed (click the circle to cycle).
- **Categories**: Work, Personal, Learning, Other, with filters.
- **Reschedule**: move a task to another day; its notes come with it and a "Moved from…" entry is logged.
- **Views**: Checklist or Timeline (overlaps are flagged; a "now" line shows on today).
- **Auto-schedule**: puts untimed tasks into the open gaps of the day, in your order.
- **Review**: completed, pending and carried-forward tasks for any day, plus one-click "move unfinished to the next day".
- Unfinished tasks from past days get a banner so nothing slips.

## Use it
Open `index.html` in a browser. Tasks are saved in that browser (localStorage).
When opened as a claude.ai artifact, tasks are saved privately to your account instead.

Keyboard: `N` new task, `←`/`→` change day, `T` today, `Esc` close details, `Ctrl/⌘+Enter` add a note.

`daybook.html` is the source; `index.html` is the same page wrapped in a full HTML document.
