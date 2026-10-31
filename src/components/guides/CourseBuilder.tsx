import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckSquare, ChevronDown, ChevronUp, FileText, Link2, ListChecks, Play, Plus, Save, Trash2 } from 'lucide-react';
import type { AdminProtocol } from '../../utils/protocolAdmin';
import {
  deleteGuideCourseChapter,
  deleteGuideCourseLesson,
  listGuideCourseChapters,
  listGuideCourseLessons,
  saveGuideCourseChapter,
  saveGuideCourseLesson,
  updateGuideOfferDetails,
  type GuideCourseChapter,
  type GuideCourseLesson,
  type GuideCourseLessonKind,
  type GuideOffer,
  type GuideProfile,
} from '../../utils/guidePortal';

const ink = '#F5F2EA';
const muted = '#B8B6AF';
const line = 'rgba(245,242,234,0.24)';
const panel = '#11120F';
const acid = '#C7D8A3';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const field: React.CSSProperties = { width: '100%', minHeight: 42, boxSizing: 'border-box', border: `1px solid ${line}`, background: '#090A08', color: ink, padding: '10px 12px', fontFamily: sans, fontSize: 12 };
const button: React.CSSProperties = { minHeight: 38, border: `1px solid ${line}`, background: ink, color: '#090A08', padding: '0 13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: sans, fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer' };

const lessonTypes: Array<{ value: GuideCourseLessonKind; label: string; Icon: typeof Play }> = [
  { value: 'video', label: 'Video', Icon: Play },
  { value: 'checklist', label: 'Checklist', Icon: ListChecks },
  { value: 'link', label: 'Link', Icon: Link2 },
  { value: 'document', label: 'Document', Icon: FileText },
  { value: 'pdf', label: 'PDF', Icon: BookOpen },
  { value: 'protocol', label: 'R3 Protocol', Icon: CheckSquare },
];

type LessonDraft = {
  title: string;
  kind: GuideCourseLessonKind;
  body: string;
  resource_url: string;
  protocol_id: string;
  checklist: string;
};
const blankLesson = (): LessonDraft => ({ title: '', kind: 'video', body: '', resource_url: '', protocol_id: '', checklist: '' });

export function CourseBuilder({ offer, profile, protocols, onOfferUpdated }: { offer: GuideOffer; profile: GuideProfile; protocols: AdminProtocol[]; onOfferUpdated?: (offer: GuideOffer) => void }) {
  const [open, setOpen] = useState(false);
  const [chapters, setChapters] = useState<GuideCourseChapter[]>([]);
  const [lessons, setLessons] = useState<GuideCourseLesson[]>([]);
  const [chapterTitle, setChapterTitle] = useState('');
  const [drafts, setDrafts] = useState<Record<string, LessonDraft>>({});
  const [title, setTitle] = useState(offer.title);
  const [description, setDescription] = useState(offer.description || '');
  const [access, setAccess] = useState<'free' | 'paid'>(offer.access_model);
  const [price, setPrice] = useState(offer.price_cents ? String(offer.price_cents / 100) : '');
  const [currency, setCurrency] = useState(offer.currency || 'GBP');
  const [status, setStatus] = useState<'draft' | 'published'>(offer.status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const lessonsByChapter = useMemo(() => Object.fromEntries(chapters.map((chapter) => [chapter.id, lessons.filter((lesson) => lesson.chapter_id === chapter.id)])), [chapters, lessons]);

  async function load() {
    setMessage('');
    try {
      const savedChapters = await listGuideCourseChapters(profile.user_id, offer.id);
      setChapters(savedChapters);
      setLessons(await listGuideCourseLessons(profile.user_id, savedChapters.map((chapter) => chapter.id)));
    } catch (error) { setMessage((error as Error).message || 'Could not load this course.'); }
  }
  useEffect(() => { if (open) void load(); }, [open, offer.id, profile.user_id]);

  async function saveSettings() {
    if (!title.trim()) return;
    setBusy(true); setMessage('');
    try {
      const updated = await updateGuideOfferDetails(profile.user_id, offer.id, {
        title: title.trim(), description: description.trim() || null, access_model: access,
        price_cents: access === 'free' ? 0 : Math.max(0, Math.round(Number(price || 0) * 100)), currency, status,
      });
      onOfferUpdated?.(updated); setMessage('Course settings saved.');
    } catch (error) { setMessage((error as Error).message || 'Could not save course settings.'); }
    finally { setBusy(false); }
  }

  async function addChapter() {
    if (!chapterTitle.trim()) return;
    setBusy(true); setMessage('');
    try {
      const saved = await saveGuideCourseChapter(profile.user_id, offer.id, { title: chapterTitle, sort_order: chapters.length * 10 });
      setChapters((current) => [...current, saved]); setChapterTitle('');
    } catch (error) { setMessage((error as Error).message || 'Could not add the chapter.'); }
    finally { setBusy(false); }
  }

  async function addLesson(chapter: GuideCourseChapter) {
    const draft = drafts[chapter.id] || blankLesson();
    if (!draft.title.trim()) return;
    setBusy(true); setMessage('');
    try {
      const saved = await saveGuideCourseLesson(profile.user_id, {
        chapter_id: chapter.id, title: draft.title, kind: draft.kind, body: draft.body,
        resource_url: draft.resource_url, protocol_id: draft.kind === 'protocol' ? draft.protocol_id : null,
        checklist: draft.kind === 'checklist' ? draft.checklist.split('\n').map((item) => item.trim()).filter(Boolean) : [],
        sort_order: (lessonsByChapter[chapter.id]?.length || 0) * 10,
      });
      setLessons((current) => [...current, saved]); setDrafts((current) => ({ ...current, [chapter.id]: blankLesson() }));
    } catch (error) { setMessage((error as Error).message || 'Could not add the lesson.'); }
    finally { setBusy(false); }
  }

  return <section style={{ border: `1px solid ${line}`, borderTop: 0, background: '#0D0E0C', color: ink, fontFamily: sans }}>
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} style={{ width: '100%', minHeight: 48, border: 0, background: 'transparent', color: ink, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: sans }}>
      <span><strong style={{ fontSize: 12 }}>Course builder</strong><span style={{ color: muted, fontSize: 9, marginLeft: 8 }}>{chapters.length || 'No'} chapters · {lessons.length || 'no'} lessons</span></span>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button>
    {open && <div style={{ borderTop: `1px solid ${line}`, padding: 14, display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ color: acid, fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>Course access & publishing</div>
        <input aria-label="Course title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Course title" style={field} />
        <textarea aria-label="Course description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What students will learn" style={{ ...field, minHeight: 74, resize: 'vertical' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
          <select aria-label="Course access" value={access} onChange={(event) => setAccess(event.target.value as 'free' | 'paid')} style={field}><option value="free">Free course</option><option value="paid">Paid course</option></select>
          {access === 'paid' && <><input aria-label="Course price" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Price" style={field} /><select aria-label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)} style={field}>{['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'PLN'].map((item) => <option key={item}>{item}</option>)}</select></>}
          <select aria-label="Course status" value={status} onChange={(event) => setStatus(event.target.value as 'draft' | 'published')} style={field}><option value="draft">Draft</option><option value="published">Published</option></select>
        </div>
        <button type="button" disabled={busy || !title.trim()} onClick={() => void saveSettings()} style={{ ...button, justifySelf: 'start' }}><Save size={13} /> Save course</button>
      </div>

      <div style={{ borderTop: `1px solid ${line}`, paddingTop: 16 }}>
        <div style={{ color: acid, fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 9 }}>Curriculum</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8 }}><input aria-label="New chapter title" value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addChapter(); }} placeholder="Chapter name" style={field} /><button type="button" disabled={busy || !chapterTitle.trim()} onClick={() => void addChapter()} style={button}><Plus size={13} /> Chapter</button></div>
      </div>

      {chapters.map((chapter, chapterIndex) => {
        const chapterLessons = lessonsByChapter[chapter.id] || [];
        const draft = drafts[chapter.id] || blankLesson();
        const lessonType = lessonTypes.find((item) => item.value === draft.kind)!;
        return <article key={chapter.id} style={{ border: `1px solid ${line}`, background: panel }}>
          <header style={{ padding: 13, borderBottom: `1px solid ${line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span><span style={{ color: acid, fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Chapter {chapterIndex + 1}</span><strong style={{ display: 'block', marginTop: 3 }}>{chapter.title}</strong></span><button type="button" aria-label={`Delete ${chapter.title}`} onClick={async () => { if (!window.confirm(`Delete ${chapter.title} and all its lessons?`)) return; await deleteGuideCourseChapter(profile.user_id, chapter.id); setChapters((current) => current.filter((item) => item.id !== chapter.id)); setLessons((current) => current.filter((item) => item.chapter_id !== chapter.id)); }} style={{ ...button, width: 36, padding: 0, background: 'transparent', color: muted }}><Trash2 size={13} /></button></header>
          <div>{chapterLessons.map((lesson, index) => { const type = lessonTypes.find((item) => item.value === lesson.kind)!; const Icon = type.Icon; return <div key={lesson.id} style={{ padding: '11px 13px', borderBottom: `1px solid ${line}`, display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: 9, alignItems: 'center' }}><span style={{ color: acid }}><Icon size={15} /></span><span><strong style={{ display: 'block', fontSize: 12 }}>{index + 1}. {lesson.title}</strong><span style={{ color: muted, fontSize: 9 }}>{type.label}{lesson.checklist.length ? ` · ${lesson.checklist.length} items` : ''}</span></span><button type="button" aria-label={`Delete ${lesson.title}`} onClick={async () => { await deleteGuideCourseLesson(profile.user_id, lesson.id); setLessons((current) => current.filter((item) => item.id !== lesson.id)); }} style={{ ...button, width: 32, minHeight: 32, padding: 0, background: 'transparent', color: muted }}><Trash2 size={12} /></button></div>; })}</div>
          <div style={{ padding: 13, display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 8 }}><select aria-label={`Lesson type for ${chapter.title}`} value={draft.kind} onChange={(event) => setDrafts((current) => ({ ...current, [chapter.id]: { ...draft, kind: event.target.value as GuideCourseLessonKind } }))} style={field}>{lessonTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input aria-label={`Lesson title for ${chapter.title}`} value={draft.title} onChange={(event) => setDrafts((current) => ({ ...current, [chapter.id]: { ...draft, title: event.target.value } }))} placeholder={`${lessonType.label} lesson title`} style={field} /></div>
            {draft.kind === 'checklist' ? <textarea aria-label="Checklist items" value={draft.checklist} onChange={(event) => setDrafts((current) => ({ ...current, [chapter.id]: { ...draft, checklist: event.target.value } }))} placeholder={'One checklist item per line'} style={{ ...field, minHeight: 82, resize: 'vertical' }} /> : draft.kind === 'protocol' ? <select aria-label="Linked R3 protocol" value={draft.protocol_id} onChange={(event) => setDrafts((current) => ({ ...current, [chapter.id]: { ...draft, protocol_id: event.target.value } }))} style={field}><option value="">Select an R3 Protocol</option>{protocols.map((protocol) => <option key={protocol.id} value={protocol.id}>{protocol.name}</option>)}</select> : <input aria-label={`${lessonType.label} URL`} type="url" value={draft.resource_url} onChange={(event) => setDrafts((current) => ({ ...current, [chapter.id]: { ...draft, resource_url: event.target.value } }))} placeholder={draft.kind === 'video' ? 'Video URL' : draft.kind === 'pdf' ? 'PDF URL' : draft.kind === 'document' ? 'Document URL' : 'Link URL'} style={field} />}
            <textarea aria-label="Lesson notes" value={draft.body} onChange={(event) => setDrafts((current) => ({ ...current, [chapter.id]: { ...draft, body: event.target.value } }))} placeholder="Lesson text, instructions or notes (optional)" style={{ ...field, minHeight: 66, resize: 'vertical' }} />
            <button type="button" disabled={busy || !draft.title.trim() || (draft.kind === 'protocol' && !draft.protocol_id)} onClick={() => void addLesson(chapter)} style={{ ...button, justifySelf: 'start' }}><Plus size={13} /> Add {lessonType.label}</button>
          </div>
        </article>;
      })}
      {!chapters.length && <div style={{ border: `1px dashed ${line}`, color: muted, padding: 20, textAlign: 'center', fontSize: 11 }}>Add the first chapter, then fill it with videos, checklists, links, documents, PDFs, or R3 Protocols.</div>}
      {message && <p role="status" style={{ color: message.includes('saved') ? acid : '#F0A7A7', fontSize: 10, margin: 0 }}>{message}</p>}
    </div>}
  </section>;
}
