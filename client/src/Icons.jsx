// A handful of lucide icon paths, inlined so we don't add a dependency for a few glyphs.
const icon = (paths) => () => <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths}</svg>;

export const Back = icon(<><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>);
export const More = icon(<><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>);
export const Undo = icon(<><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>);
export const Redo = icon(<><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>);
export const Comment = icon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />);
export const List = icon(<><path d="M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13" /></>);
export const ListOrdered = icon(<><path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></>);
export const Image = icon(<><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>);
export const FileIn = icon(<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M12 12v6M9 15l3 3 3-3" /></>);
