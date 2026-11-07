// Page templates for "New page from template". {{title}} and {{date}} are filled in.

export interface PageTemplate {
  id: string
  name: string
  description: string
  /** Suggested page name (blank = ask). */
  defaultName?: () => string
  body: string
}

const today = () => new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
const isoDay = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const TEMPLATES: PageTemplate[] = [
  { id: 'blank', name: 'Blank page', description: 'Just a title.', body: '# {{title}}\n\n' },
  {
    id: 'meeting',
    name: 'Meeting notes',
    description: 'Attendees, agenda, notes and action items.',
    body: '# {{title}}\n\n**Date:** {{date}}\n\n**Attendees:** \n\n## Agenda\n\n- \n\n## Notes\n\n\n\n## Action items\n\n- [ ] \n'
  },
  {
    id: 'journal',
    name: 'Daily journal',
    description: "Today's date, highlights, to-dos and reflections.",
    defaultName: isoDay,
    body: '# {{title}}\n\n*{{date}}*\n\n## Today I want to\n\n- [ ] \n\n## What happened\n\n\n\n## Grateful for\n\n- \n'
  },
  { id: 'todo', name: 'To-do list', description: 'A checklist with priorities.', body: '# {{title}}\n\n## Must do\n\n- [ ] \n\n## Should do\n\n- [ ] \n\n## Could do\n\n- [ ] \n' },
  {
    id: 'project',
    name: 'Project plan',
    description: 'Goal, milestones, tasks and open questions.',
    body: '# {{title}}\n\n## Goal\n\n\n\n## Milestones\n\n| Milestone | Due | Done |\n| --- | --- | --- |\n|  |  |  |\n\n## Tasks\n\n- [ ] \n\n## Open questions\n\n- \n'
  },
  {
    id: 'cornell',
    name: 'Study notes (Cornell)',
    description: 'Key questions, notes and a summary.',
    body: '# {{title}}\n\n*{{date}}*\n\n## Key questions\n\n- \n\n## Notes\n\n\n\n## Summary\n\n\n'
  }
]

export function fillTemplate(t: PageTemplate, title: string): string {
  return t.body.replace(/\{\{title\}\}/g, title).replace(/\{\{date\}\}/g, today())
}
