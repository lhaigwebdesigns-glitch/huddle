import { Hono, type Context } from "hono";
import { getServerByName } from "partyserver";
import type { Env } from "./env";
import { currentUser, type User } from "./auth";
import { clientIp, hit } from "./db";
import { makeCode, normalizeCode } from "../shared/code";
import { cleanProject, type Receipt, type Report } from "../shared/protocol";
import { templateById } from "../shared/templates";
import {
  CLASS_LIMITS,
  gradeTotal,
  makeGroups,
  rubricMax,
  toCsv,
  type Assignment,
  type ClassInfo,
  type ClassStudent,
  type ClassView,
  type GradeData,
  type GradingView,
  type GroupInfo,
  type GroupStatus,
  type StudentClassView,
} from "../shared/classes";

type C = Context<{ Bindings: Env }>;

let ready: Promise<void> | null = null;
function ensureClassTables(db: D1Database) {
  ready ??= db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, code TEXT UNIQUE, teacher_id TEXT, name TEXT, created_at INTEGER)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS class_students (class_id TEXT, uid TEXT, name TEXT, joined_at INTEGER, PRIMARY KEY (class_id, uid))`),
      db.prepare(`CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, class_id TEXT, title TEXT, project TEXT, template TEXT, created_at INTEGER)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS class_groups (assignment_id TEXT, room_code TEXT, name TEXT, members TEXT, PRIMARY KEY (assignment_id, room_code))`),
      db.prepare(`CREATE TABLE IF NOT EXISTS grades (assignment_id TEXT, room_code TEXT, data TEXT, graded_at INTEGER, PRIMARY KEY (assignment_id, room_code))`),
    ])
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

interface ClassRow {
  id: string;
  code: string;
  teacher_id: string;
  name: string;
  created_at: number;
}
const toInfo = (r: ClassRow): ClassInfo => ({ id: r.id, code: r.code, name: r.name, createdAt: r.created_at });

/** The signed-in teacher who owns this class, or an error response. */
async function teacherClass(c: C): Promise<{ user: User; cls: ClassRow } | Response> {
  const user = await currentUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "Sign in to manage classes." }, 401);
  await ensureClassTables(c.env.DB!);
  const cls = await c.env.DB!.prepare(`SELECT * FROM classes WHERE id = ?`).bind(c.req.param("id")).first<ClassRow>();
  if (!cls || cls.teacher_id !== user.id) return c.json({ error: "Class not found." }, 404);
  return { user, cls };
}

async function loadGroups(db: D1Database, assignmentId: string): Promise<GroupInfo[]> {
  const { results } = await db.prepare(`SELECT * FROM class_groups WHERE assignment_id = ? ORDER BY name`).bind(assignmentId).all<{ room_code: string; name: string; members: string }>();
  return results.map((g) => ({ roomCode: g.room_code, name: g.name, members: JSON.parse(g.members) as string[] }));
}

async function loadGrade(db: D1Database, assignmentId: string, room: string): Promise<GradeData | undefined> {
  const row = await db.prepare(`SELECT data, graded_at FROM grades WHERE assignment_id = ? AND room_code = ?`).bind(assignmentId, room).first<{ data: string; graded_at: number }>();
  return row ? { ...(JSON.parse(row.data) as GradeData), gradedAt: row.graded_at } : undefined;
}

async function loadAssignments(c: C, classId: string, withStatus: boolean): Promise<Assignment[]> {
  const { results } = await c.env.DB!.prepare(`SELECT * FROM assignments WHERE class_id = ? ORDER BY created_at DESC`).bind(classId).all<{
    id: string;
    title: string;
    project: string;
    template: string | null;
    created_at: number;
  }>();
  return Promise.all(
    results.map(async (a) => {
      const groups = await loadGroups(c.env.DB!, a.id);
      if (withStatus)
        await Promise.all(
          groups.map(async (g) => {
            const room = await getServerByName(c.env.Room, g.roomCode);
            g.status = ((await room.groupStatus(g.members).catch(() => null)) as GroupStatus | null) ?? undefined;
            g.grade = await loadGrade(c.env.DB!, a.id, g.roomCode);
          }),
        );
      return { id: a.id, title: a.title, project: JSON.parse(a.project), ...(a.template ? { template: a.template } : {}), createdAt: a.created_at, groups };
    }),
  );
}

export const classes = new Hono<{ Bindings: Env }>();

// Classes live in D1; without it (some local setups) the feature is off.
classes.use("*", async (c, next) => (c.env.DB ? next() : c.json({ error: "Classes need the database, which isn't set up here." }, 503)));

// ---------- teacher ----------

classes.get("/", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "Sign in to manage classes." }, 401);
  await ensureClassTables(c.env.DB!);
  const { results } = await c.env.DB!.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM class_students s WHERE s.class_id = c.id) AS students,
            (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id) AS assignments
     FROM classes c WHERE teacher_id = ? ORDER BY created_at DESC`,
  )
    .bind(user.id)
    .all<ClassRow & { students: number; assignments: number }>();
  return c.json({ classes: results.map((r) => ({ ...toInfo(r), students: r.students, assignments: r.assignments })) });
});

classes.post("/", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "Sign in to create a class." }, 401);
  await ensureClassTables(c.env.DB!);
  if (!(await hit(c.env.DB!, `classes:${user.id}`, 30, 3600))) return c.json({ error: "That's a lot of classes in an hour. Try again later." }, 429);
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const name = String(body.name ?? "").trim().slice(0, CLASS_LIMITS.name);
  if (!name) return c.json({ error: "Give the class a name." }, 400);
  for (let i = 0; i < 5; i++) {
    const code = makeCode();
    const id = newId();
    const ok = await c.env.DB!.prepare(`INSERT OR IGNORE INTO classes (id, code, teacher_id, name, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, code, user.id, name, Date.now())
      .run();
    if (ok.meta.changes) return c.json({ id, code });
  }
  return c.json({ error: "Couldn't make a class code. Try again." }, 500);
});

classes.get("/:id", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const { results: students } = await c.env.DB!.prepare(`SELECT uid, name, joined_at FROM class_students WHERE class_id = ? ORDER BY name`)
    .bind(t.cls.id)
    .all<{ uid: string; name: string; joined_at: number }>();
  const view: ClassView = {
    class: toInfo(t.cls),
    students: students.map((s): ClassStudent => ({ uid: s.uid, name: s.name, joinedAt: s.joined_at })),
    assignments: await loadAssignments(c, t.cls.id, true),
  };
  return c.json(view);
});

/** Remove a student: off the roster, out of every group, and blocked from the group rooms. */
classes.delete("/:id/students/:uid", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const uid = c.req.param("uid");
  await c.env.DB!.prepare(`DELETE FROM class_students WHERE class_id = ? AND uid = ?`).bind(t.cls.id, uid).run();
  for (const a of await loadAssignments(c, t.cls.id, false))
    for (const g of a.groups) {
      if (!g.members.includes(uid)) continue;
      await c.env.DB!.prepare(`UPDATE class_groups SET members = ? WHERE assignment_id = ? AND room_code = ?`)
        .bind(JSON.stringify(g.members.filter((u) => u !== uid)), a.id, g.roomCode)
        .run();
      await (await getServerByName(c.env.Room, g.roomCode)).removeStudent(t.user.uid, uid).catch(() => {});
    }
  return c.json({ ok: true });
});

/** Erase a class for good: every group room (chat, files, uploads) and every record of it. */
classes.delete("/:id", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const assignments = await loadAssignments(c, t.cls.id, false);
  for (const a of assignments)
    for (const g of a.groups) await (await getServerByName(c.env.Room, g.roomCode)).destroy(t.user.uid).catch(() => false);
  const ids = assignments.map((a) => a.id);
  const db = c.env.DB!;
  await db.batch([
    ...ids.flatMap((id) => [
      db.prepare(`DELETE FROM class_groups WHERE assignment_id = ?`).bind(id),
      db.prepare(`DELETE FROM grades WHERE assignment_id = ?`).bind(id),
    ]),
    db.prepare(`DELETE FROM assignments WHERE class_id = ?`).bind(t.cls.id),
    db.prepare(`DELETE FROM class_students WHERE class_id = ?`).bind(t.cls.id),
    db.prepare(`DELETE FROM classes WHERE id = ?`).bind(t.cls.id),
  ]);
  return c.json({ ok: true });
});

/** Messages students reported, across every group in the class. */
classes.get("/:id/reports", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const out: (Report & { assignment: string; group: string; room: string; assignmentId: string })[] = [];
  for (const a of await loadAssignments(c, t.cls.id, false))
    for (const g of a.groups) {
      const reports = (await (await getServerByName(c.env.Room, g.roomCode)).reports().catch(() => [])) as Report[];
      for (const r of reports) out.push({ ...r, assignment: a.title, assignmentId: a.id, group: g.name, room: g.roomCode });
    }
  out.sort((x, y) => y.at - x.at);
  return c.json({ reports: out });
});

classes.post("/:id/reports/:room/:rid/dismiss", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const room = c.req.param("room");
  const inClass = (await loadAssignments(c, t.cls.id, false)).some((a) => a.groups.some((g) => g.roomCode === room));
  if (!inClass) return c.json({ error: "Not found." }, 404);
  return c.json(await (await getServerByName(c.env.Room, room)).dismissReport(c.req.param("rid")));
});

classes.post("/:id/assignments", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const body = await c.req
    .json<{ title?: string; project?: Record<string, unknown>; template?: string; groupSize?: number; groups?: string[][] }>()
    .catch(() => ({}) as Record<string, never>);
  const title = String(body.title ?? "").trim().slice(0, 80);
  if (!title) return c.json({ error: "Give the assignment a title." }, 400);
  const project = cleanProject(body.project ?? {})!;
  const { results: roster } = await c.env.DB!.prepare(`SELECT uid FROM class_students WHERE class_id = ?`).bind(t.cls.id).all<{ uid: string }>();
  const inClass = new Set(roster.map((r) => r.uid));
  let groups: string[][] = Array.isArray(body.groups)
    ? body.groups.map((g) => (Array.isArray(g) ? g.map(String).filter((u) => inClass.has(u)) : []))
    : makeGroups([...inClass], Math.min(CLASS_LIMITS.groupSize, Math.max(1, Number(body.groupSize) || 3)));
  groups = groups.filter((g, i) => g.length || i === 0);
  if (!groups.length) groups = [[]];
  if (groups.length > 40) return c.json({ error: "That's too many groups." }, 400);
  const template = templateById(body.template)?.id;
  const id = newId();
  const created: GroupInfo[] = [];
  for (const [i, members] of groups.entries()) {
    const name = `Group ${i + 1}`;
    let code = "";
    for (let tries = 0; tries < 5 && !code; tries++) {
      const candidate = makeCode();
      const room = await getServerByName(c.env.Room, candidate);
      const res = await room.init(t.user.uid, `${title} · ${name}`, project, template);
      if (res.ok) {
        await room.setClassLink({ classId: t.cls.id, assignmentId: id, group: name });
        code = candidate;
      }
    }
    if (!code) return c.json({ error: "Couldn't create the group rooms. Try again." }, 500);
    created.push({ roomCode: code, name, members });
  }
  await c.env.DB!.batch([
    c.env.DB!.prepare(`INSERT INTO assignments (id, class_id, title, project, template, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
      id,
      t.cls.id,
      title,
      JSON.stringify({ instructions: project.instructions, rubric: project.rubric, ai: project.ai, dueAt: project.dueAt, pasteGuard: project.pasteGuard }),
      template ?? null,
      Date.now(),
    ),
    ...created.map((g) =>
      c.env.DB!.prepare(`INSERT INTO class_groups (assignment_id, room_code, name, members) VALUES (?, ?, ?, ?)`).bind(id, g.roomCode, g.name, JSON.stringify(g.members)),
    ),
  ]);
  return c.json({ id, groups: created });
});

/** Put a student in a group (or take them out with room: null). */
classes.post("/:id/assignments/:aid/move", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const body = await c.req.json<{ uid?: string; room?: string | null }>().catch(() => ({}) as { uid?: string; room?: string | null });
  const uid = String(body.uid ?? "");
  const groups = await loadGroups(c.env.DB!, c.req.param("aid"));
  if (!groups.length || !uid) return c.json({ error: "Not found." }, 404);
  const updates = groups
    .map((g) => {
      const had = g.members.includes(uid);
      const wants = g.roomCode === body.room;
      if (had === wants) return null;
      const members = wants ? [...g.members, uid] : g.members.filter((u) => u !== uid);
      return c.env.DB!.prepare(`UPDATE class_groups SET members = ? WHERE assignment_id = ? AND room_code = ?`).bind(JSON.stringify(members), c.req.param("aid"), g.roomCode);
    })
    .filter((s): s is D1PreparedStatement => !!s);
  if (updates.length) await c.env.DB!.batch(updates);
  return c.json({ ok: true });
});

async function gradingContext(c: C) {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const assignments = await loadAssignments(c, t.cls.id, false);
  const assignment = assignments.find((a) => a.id === c.req.param("aid"));
  const group = assignment?.groups.find((g) => g.roomCode === c.req.param("room"));
  if (!assignment || !group) return c.json({ error: "Group not found." }, 404);
  return { ...t, assignment, group };
}

classes.get("/:id/assignments/:aid/groups/:room", async (c) => {
  const g = await gradingContext(c);
  if (g instanceof Response) return g;
  const room = await getServerByName(c.env.Room, g.group.roomCode);
  const work = await room.submitted();
  g.group.status = ((await room.groupStatus(g.group.members).catch(() => null)) as GroupStatus | null) ?? undefined;
  g.group.grade = await loadGrade(c.env.DB!, g.assignment.id, g.group.roomCode);
  const { results } = await c.env.DB!.prepare(`SELECT uid, name FROM class_students WHERE class_id = ?`).bind(g.cls.id).all<{ uid: string; name: string }>();
  const view: GradingView = {
    class: toInfo(g.cls),
    assignment: g.assignment,
    group: g.group,
    names: Object.fromEntries(results.map((r) => [r.uid, r.name])),
    // Only turned-in work is shown to the teacher.
    files: work.turnedIn ? work.files : [],
    receipt: (work.receipt as Receipt | null) ?? null,
    order: g.assignment.groups.map((x) => x.roomCode),
  };
  return c.json(view);
});

classes.put("/:id/assignments/:aid/groups/:room/grade", async (c) => {
  const g = await gradingContext(c);
  if (g instanceof Response) return g;
  const body = await c.req.json<Partial<GradeData>>().catch(() => ({}) as Partial<GradeData>);
  const rows = (Array.isArray(body.rows) ? body.rows : [])
    .slice(0, 20)
    .map((r) => ({ label: String(r?.label ?? "").slice(0, 60) || "Row", max: Math.max(0, Math.min(1000, Number(r?.max) || 0)) }));
  if (!rows.length) return c.json({ error: "The rubric needs at least one row." }, 400);
  const scores = rows.map((r, i) => {
    const s = Array.isArray(body.scores) ? body.scores[i] : null;
    return typeof s === "number" && Number.isFinite(s) ? Math.max(0, Math.min(r.max, s)) : null;
  });
  const max = rubricMax(rows);
  const students: Record<string, number> = {};
  for (const [uid, v] of Object.entries(body.students ?? {}))
    if (g.group.members.includes(uid) && typeof v === "number" && Number.isFinite(v)) students[uid] = Math.max(0, Math.min(max, v));
  const data: GradeData = { rows, scores, students, comment: String(body.comment ?? "").slice(0, 2000) };
  await c.env.DB!.prepare(`INSERT OR REPLACE INTO grades (assignment_id, room_code, data, graded_at) VALUES (?, ?, ?, ?)`)
    .bind(g.assignment.id, g.group.roomCode, JSON.stringify(data), Date.now())
    .run();
  return c.json({ ok: true, total: gradeTotal(data), max });
});

classes.post("/:id/assignments/:aid/groups/:room/reopen", async (c) => {
  const g = await gradingContext(c);
  if (g instanceof Response) return g;
  const room = await getServerByName(c.env.Room, g.group.roomCode);
  return c.json(await room.teacherReopen("Your teacher"));
});

classes.get("/:id/assignments/:aid/grades.csv", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const assignment = (await loadAssignments(c, t.cls.id, false)).find((a) => a.id === c.req.param("aid"));
  if (!assignment) return c.json({ error: "Assignment not found." }, 404);
  const { results } = await c.env.DB!.prepare(`SELECT uid, name FROM class_students WHERE class_id = ? ORDER BY name`).bind(t.cls.id).all<{ uid: string; name: string }>();
  const rows: unknown[][] = [["Student", "Group", "Group grade", "Student grade", "Out of", "Comment"]];
  for (const s of results) {
    const group = assignment.groups.find((g) => g.members.includes(s.uid));
    const grade = group ? await loadGrade(c.env.DB!, assignment.id, group.roomCode) : undefined;
    const total = grade ? gradeTotal(grade) : null;
    rows.push([s.name, group?.name ?? "No group", total ?? "", grade?.students[s.uid] ?? total ?? "", grade ? rubricMax(grade.rows) : "", grade?.comment ?? ""]);
  }
  const file = `${assignment.title.replace(/[^\w\- ]+/g, "").trim() || "grades"}.csv`;
  return new Response(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${file}"` },
  });
});

// ---------- students (no account needed) ----------

async function classByCode(c: C) {
  await ensureClassTables(c.env.DB!);
  return c.env.DB!.prepare(`SELECT * FROM classes WHERE code = ?`).bind(normalizeCode(c.req.param("code") ?? "")).first<ClassRow>();
}

classes.get("/join/:code", async (c) => {
  const cls = await classByCode(c);
  if (!cls) return c.json({ error: "That code doesn't match a class." }, 404);
  const uid = (c.req.query("uid") ?? "").slice(0, 64);
  const me = uid ? await c.env.DB!.prepare(`SELECT name FROM class_students WHERE class_id = ? AND uid = ?`).bind(cls.id, uid).first<{ name: string }>() : null;
  const view: StudentClassView = { name: cls.name, joined: !!me, assignments: [] };
  if (me) {
    for (const a of await loadAssignments(c, cls.id, false)) {
      const group = a.groups.find((g) => g.members.includes(uid));
      let turnedIn = false;
      if (group) {
        const status = (await (await getServerByName(c.env.Room, group.roomCode)).groupStatus([]).catch(() => null)) as GroupStatus | null;
        turnedIn = !!status?.turnedInAt;
      }
      view.assignments.push({
        id: a.id,
        title: a.title,
        ...(a.project.dueAt ? { dueAt: a.project.dueAt } : {}),
        ...(group ? { roomCode: group.roomCode, groupName: group.name, turnedIn } : {}),
      });
    }
  }
  return c.json(view);
});

classes.post("/join/:code", async (c) => {
  const cls = await classByCode(c);
  if (!cls) return c.json({ error: "That code doesn't match a class." }, 404);
  if (!(await hit(c.env.DB!, `classjoin:${clientIp(c.req.raw)}`, 60, 3600))) return c.json({ error: "Too many tries. Wait a bit." }, 429);
  const body = await c.req.json<{ uid?: string; name?: string; age13?: boolean }>().catch(() => ({}) as { uid?: string; name?: string; age13?: boolean });
  const uid = String(body.uid ?? "").slice(0, 64);
  const name = String(body.name ?? "").trim().slice(0, 32);
  if (!uid || !name) return c.json({ error: "Type your name to join." }, 400);
  if (body.age13 !== true) return c.json({ error: "Huddle is for ages 13 and up." }, 400);
  const count = await c.env.DB!.prepare(`SELECT COUNT(*) AS n FROM class_students WHERE class_id = ?`).bind(cls.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= CLASS_LIMITS.students) return c.json({ error: "This class is full." }, 400);
  await c.env.DB!.prepare(`INSERT INTO class_students (class_id, uid, name, joined_at) VALUES (?, ?, ?, ?) ON CONFLICT (class_id, uid) DO UPDATE SET name = excluded.name`)
    .bind(cls.id, uid, name, Date.now())
    .run();
  return c.json({ ok: true });
});
