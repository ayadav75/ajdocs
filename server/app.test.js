import { beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { initDb, query } from './db.js';
import { app } from './app.js';

const ALICE = 1, BOB = 2, CAROL = 3; // seeded in schema.sql

beforeAll(() => initDb('memory://'));

async function signIn(userId) {
  const agent = request.agent(app);
  await agent.post('/api/login').send({ userId }).expect(200);
  return agent;
}

describe('sharing and access control', () => {
  test('a document is private until shared, then the recipient can read and edit it', async () => {
    const alice = await signIn(ALICE), bob = await signIn(BOB), carol = await signIn(CAROL);
    const { body: doc } = await alice.post('/api/documents').send({ title: 'Plan' }).expect(201);

    await bob.get(`/api/documents/${doc.id}`).expect(404);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'BOB@ajaia.test' }).expect(201);

    const { body: seen } = await bob.get(`/api/documents/${doc.id}`).expect(200);
    expect(seen.role).toBe('editor');
    await bob.patch(`/api/documents/${doc.id}`).send({ content_html: '<p><strong>hi</strong></p>' }).expect(200);
    const { body: reloaded } = await alice.get(`/api/documents/${doc.id}`).expect(200);
    expect(reloaded.content_html).toBe('<p><strong>hi</strong></p>');

    const { body: bobList } = await bob.get('/api/documents').expect(200);
    expect(bobList.shared.map((d) => d.id)).toContain(doc.id);
    expect(bobList.owned.map((d) => d.id)).not.toContain(doc.id);

    await carol.get(`/api/documents/${doc.id}`).expect(404);
  });

  test('only the owner can share or delete', async () => {
    const alice = await signIn(ALICE), bob = await signIn(BOB);
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);

    await bob.delete(`/api/documents/${doc.id}`).expect(404); // can't even see it
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test' }).expect(201);
    await bob.post(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.test' }).expect(403);
    await bob.delete(`/api/documents/${doc.id}`).expect(403);
    await alice.delete(`/api/documents/${doc.id}`).expect(204);
  });

  test('requests without a session are rejected', async () => {
    await request(app).get('/api/documents').expect(401);
  });
});

describe('validation and import', () => {
  test('empty titles and unknown share targets are rejected', async () => {
    const alice = await signIn(ALICE);
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    expect((await alice.patch(`/api/documents/${doc.id}`).send({ title: '   ' }).expect(400)).body.error).toMatch(/Title/);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'nobody@x.test' }).expect(400);
    await alice.get('/api/documents/abc').expect(404);
  });

  test('markdown imports keep their structure; unsupported types are refused', async () => {
    const alice = await signIn(ALICE);
    const { body: doc } = await alice.post('/api/documents/import')
      .attach('file', Buffer.from('# Notes\n\n- one\n- two\n'), 'meeting notes.md').expect(201);
    expect(doc.title).toBe('meeting notes');
    expect(doc.content_html).toContain('<h1>Notes</h1>');
    expect(doc.content_html).toContain('<li>one</li>');

    const { body: err } = await alice.post('/api/documents/import')
      .attach('file', Buffer.from('%PDF'), 'x.pdf').expect(400);
    expect(err.error).toMatch(/Unsupported/);
  });

  test('plain text is escaped, not interpreted as HTML', async () => {
    const alice = await signIn(ALICE);
    const { body: doc } = await alice.post('/api/documents/import')
      .attach('file', Buffer.from('<script>x</script>'), 'a.txt').expect(201);
    expect(doc.content_html).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>');
  });
});

describe('inserting files and images into a document', () => {
  const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'); // 1x1 gif

  test('a file is converted for insertion; viewers cannot use it', async () => {
    const alice = await signIn(ALICE), bob = await signIn(BOB);
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    const { body } = await alice.post(`/api/documents/${doc.id}/import`)
      .attach('file', Buffer.from('# Hi'), 'a.md').expect(200);
    expect(body.html).toContain('<h1>Hi</h1>');
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'viewer' }).expect(201);
    await bob.post(`/api/documents/${doc.id}/import`).attach('file', Buffer.from('x'), 'a.txt').expect(403);
  });

  test('images are stored, served only to people with access, and checked by content', async () => {
    const alice = await signIn(ALICE), bob = await signIn(BOB), carol = await signIn(CAROL);
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    const { body: { url } } = await alice.post(`/api/documents/${doc.id}/images`)
      .attach('file', GIF, 'cat.gif').expect(201);

    const got = await alice.get(url).expect(200);
    expect(got.headers['content-type']).toBe('image/gif');
    expect(Buffer.compare(got.body, GIF)).toBe(0);
    await carol.get(url).expect(404);

    // An SVG named .png is still refused: the bytes decide.
    const { body: err } = await alice.post(`/api/documents/${doc.id}/images`)
      .attach('file', Buffer.from('<svg onload="alert(1)"/>'), 'evil.png').expect(400);
    expect(err.error).toMatch(/Unsupported image/);

    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'viewer' }).expect(201);
    await bob.get(url).expect(200);
    await bob.post(`/api/documents/${doc.id}/images`).attach('file', GIF, 'x.gif').expect(403);
  });

  test('an image removed from the text is deleted after the grace period, unless a saved version uses it', async () => {
    const alice = await signIn(ALICE);
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    const upload = async () => (await alice.post(`/api/documents/${doc.id}/images`).attach('file', GIF, 'a.gif').expect(201)).body.url;
    const save = (html) => alice.patch(`/api/documents/${doc.id}`).send({ content_html: html }).expect(200);
    const age = () => query("UPDATE images SET unreferenced_since = now() - interval '2 days' WHERE unreferenced_since IS NOT NULL");

    // First edit snapshots the doc *before* the image, and later edits within 10 min don't snapshot again,
    // so `gone` never lands in a version.
    await save('<p>a</p>');
    const gone = await upload();
    await save(`<p>a</p><img src="${gone}">`);
    await save('<p>b</p>');
    await alice.get(gone).expect(200); // still there for undo
    await age();
    await save('<p>c</p>');
    await alice.get(gone).expect(404);

    // Removed from the text but kept in history: restoring that version must still show it.
    const { body: doc2 } = await alice.post('/api/documents').send({}).expect(201);
    const kept = (await alice.post(`/api/documents/${doc2.id}/images`).attach('file', GIF, 'b.gif').expect(201)).body.url;
    await alice.patch(`/api/documents/${doc2.id}`).send({ content_html: `<img src="${kept}">` }).expect(200);
    await alice.patch(`/api/documents/${doc2.id}`).send({ content_html: '<p>x</p>' }).expect(200); // snapshots the img version
    await age();
    await alice.patch(`/api/documents/${doc2.id}`).send({ content_html: '<p>y</p>' }).expect(200);
    await alice.get(kept).expect(200);
  });
});

describe('stretch: roles, versions, comments, presence', () => {
  test('a viewer can read and comment but not edit or restore', async () => {
    const alice = await signIn(ALICE), bob = await signIn(BOB);
    const { body: doc } = await alice.post('/api/documents').send({ title: 'Spec' }).expect(201);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'viewer' }).expect(201);

    expect((await bob.get(`/api/documents/${doc.id}`).expect(200)).body.role).toBe('viewer');
    await bob.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>x</p>' }).expect(403);
    await bob.post(`/api/documents/${doc.id}/versions/1/restore`).expect(403); // role is checked before the version lookup
    await bob.post(`/api/documents/${doc.id}/comments`).send({ body: 'Looks good', quote: 'Spec' }).expect(201);
    const { body: comments } = await alice.get(`/api/documents/${doc.id}/comments`).expect(200);
    expect(comments).toMatchObject([{ body: 'Looks good', quote: 'Spec', author: 'Bob' }]);

    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'admin' }).expect(400);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'editor' }).expect(201);
    await bob.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>x</p>' }).expect(200);
  });

  test('edits snapshot the previous content, and restore brings it back', async () => {
    const alice = await signIn(ALICE);
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    await alice.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>v1</p>' }).expect(200); // empty doc: no snapshot
    await alice.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>v2</p>' }).expect(200); // snapshots v1
    await alice.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>v3</p>' }).expect(200); // within 10 min: none

    const { body: versions } = await alice.get(`/api/documents/${doc.id}/versions`).expect(200);
    expect(versions.map((v) => v.content_html)).toEqual(['<p>v1</p>']);

    const { body: restored } = await alice.post(`/api/documents/${doc.id}/versions/${versions[0].id}/restore`).expect(200);
    expect(restored.content_html).toBe('<p>v1</p>');
    const { body: after } = await alice.get(`/api/documents/${doc.id}/versions`).expect(200);
    expect(after[0].content_html).toBe('<p>v3</p>'); // the restore is itself undoable
  });

  test('presence shows other viewers and flags edits by someone else; outsiders get 404', async () => {
    const alice = await signIn(ALICE), bob = await signIn(BOB), carol = await signIn(CAROL);
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test' }).expect(201);

    await alice.post(`/api/documents/${doc.id}/presence`).expect(200);
    await bob.patch(`/api/documents/${doc.id}`).send({ content_html: '<p>bob</p>' }).expect(200);
    const { body: p } = await alice.post(`/api/documents/${doc.id}/presence`).expect(200);
    expect(p.updated_by_other).toBe(true);
    const { body: pb } = await bob.post(`/api/documents/${doc.id}/presence`).expect(200);
    expect(pb).toMatchObject({ others: ['Alice'], updated_by_other: false });

    await carol.post(`/api/documents/${doc.id}/presence`).expect(404);
  });
});
