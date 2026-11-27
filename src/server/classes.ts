import { Hono, type Context } from "hono";
import { getServerByName } from "partyserver";
import type { Env } from "./env";
import { currentUser, type User } from "./auth";
import { clientIp, hit } from "./db";
import { makeCode, normalizeCode } from "../shared/code";
import { cleanProject, type ProjectSettings, type Receipt, type Report } from "../shared/protocol";
import { templateById } from "../shared/templates";
import type { TimeRequest } from "../shared/schedule";
import {
  CLASS_LIMITS,
  gradeTotal,
  isPending,
  makeGroups,
  PENDING,
  placeLateJoiner,
  rubricMax,
  toCsv,
  type Assignment,
  type AssignmentMode,
  type WorksheetInfo,
  type WorksheetRequest,
  type ClassInfo,
  type ClassStudent,
  type ClassView,
  type GradeData,
  type GradingView,
  type GroupInfo,
  type GroupStatus,
  type StudentClassView,
  type TodayView,
  type ClassAccess,
  type WaitingStudent,
  parseEmails,
  type MyClasses,
} from "../shared/classes";
import { claimRole, signInRequired } from "./auth";
import { isHuman, NOT_HUMAN } from "./turnstile";

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
    // Added in Build 9: solo or groups, the group size for late joiners, and who hosts the rooms
    // made later. Older assignments have NULLs here and count as groups.
    .then(() =>
      Promise.all(
        [`ALTER TABLE assignments ADD COLUMN mode TEXT`, `ALTER TABLE assignments ADD COLUMN group_size INTEGER`, `ALTER TABLE assignments ADD COLUMN teacher_uid TEXT`].map((q) =>
          db.prepare(q).run().catch(() => {}),
        ),
      ),
    )
    // Added in Build 13: class lists by email, a waiting list, and who may join.
    .then(() =>
      db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS class_roster (class_id TEXT, email TEXT, added_at INTEGER, PRIMARY KEY (class_id, email))`),
        db.prepare(`CREATE TABLE IF NOT EXISTS class_waiting (class_id TEXT, uid TEXT, name TEXT, email TEXT, at INTEGER, denied INTEGER, PRIMARY KEY (class_id, uid))`),
      ]),
    )
    .then(() =>
      Promise.all([`ALTER TABLE classes ADD COLUMN access TEXT`, `ALTER TABLE class_students ADD COLUMN email TEXT`].map((q) => db.prepare(q).run().catch(() => {}))),
    )
    // Added in Build 14: the worksheet room (starter files and answer key) for an assignment.
    .then(() => db.prepare(`ALTER TABLE assignments ADD COLUMN worksheet TEXT`).run().catch(() => {}))
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
  access?: string | null;
}
/** New and older classes default to the class list; "code" lets anyone with the code in. */
const accessOf = (r: ClassRow): ClassAccess => (r.access === "code" ? "code" : "list");
interface AssignmentRow {
  id: string;
  class_id: string;
  title: string;
  project: string;
  template: string | null;
  created_at: number;
  mode: string | null;
  group_size: number | null;
  teacher_uid: string | null;
  worksheet?: string | null;
}
const toInfo = (r: ClassRow): ClassInfo => ({ id: r.id, code: r.code, name: r.name, createdAt: r.created_at });

/** The signed-in teacher who owns this class, or an error response. */
/** Teacher tools are for teacher accounts: a student account gets a clear "no". */
const STUDENT_NO = { error: "Teacher tools are for teacher accounts. This is a student account.", student: true };

async function teacherClass(c: C): Promise<{ user: User; cls: ClassRow } | Response> {
  const user = await currentUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "Sign in to manage classes." }, 401);
  if (user.role === "student") return c.json(STUDENT_NO, 403);
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

const toAssignment = (a: AssignmentRow, groups: GroupInfo[]): Assignment => ({
  id: a.id,
  title: a.title,
  project: JSON.parse(a.project),
  ...(a.template ? { template: a.template } : {}),
  createdAt: a.created_at,
  mode: a.mode === "solo" ? "solo" : "groups",
  groupSize: a.group_size ?? 3,
  groups,
  ...(a.worksheet ? { worksheet: { room: a.worksheet } } : {}),
});

async function loadAssignments(c: C, classId: string, withStatus: boolean): Promise<Assignment[]> {
  const { results } = await c.env.DB!.prepare(`SELECT * FROM assignments WHERE class_id = ? ORDER BY created_at DESC`).bind(classId).all<AssignmentRow>();
  return Promise.all(
    results.map(async (a) => {
      const groups = await loadGroups(c.env.DB!, a.id);
      const out = toAssignment(a, groups);
      if (withStatus && out.worksheet) {
        const info = await (await getServerByName(c.env.Room, out.worksheet.room)).worksheetInfo().catch(() => null);
        if (info) out.worksheet = { ...out.worksheet, ...(info as Omit<WorksheetInfo, "room">) };
      }
      if (withStatus)
        await Promise.all(
          groups.map(async (g) => {
            // A group whose room isn't made yet hasn't started.
            if (isPending(g.roomCode)) return;
            const room = await getServerByName(c.env.Room, g.roomCode);
            g.status = ((await room.groupStatus(g.members).catch(() => null)) as GroupStatus | null) ?? undefined;
            g.grade = await loadGrade(c.env.DB!, a.id, g.roomCode);
          }),
        );
      return out;
    }),
  );
}

/** Makes one project room for an assignment, hosted by the teacher and linked to the class. */
async function createRoom(
  c: C,
  hostUid: string,
  title: string,
  project: ProjectSettings,
  template: string | undefined,
  link: { classId: string; assignmentId: string; group: string; classCode?: string },
  worksheet?: string | null,
) {
  for (let tries = 0; tries < 5; tries++) {
    const code = makeCode();
    const room = await getServerByName(c.env.Room, code);
    const res = await room.init(hostUid, title.slice(0, 80), project, template);
    if (!res.ok) continue;
    await room.setClassLink(link);
    // The worksheet's starter files, as their own copy (credited to nobody: it's not their work).
    if (worksheet) await room.copyStarter(worksheet).catch(() => null);
    return code;
  }
  return null;
}

/** Makes an assignment's worksheet room: the teacher's alone, holding the starter and the answer key. */
async function makeWorksheet(c: C, hostUid: string, link: { classId: string; assignmentId: string }, title: string, req: WorksheetRequest) {
  const starter = req.starter === "doc" || req.starter === "slides" ? req.starter : null;
  for (let tries = 0; tries < 5; tries++) {
    const code = makeCode();
    const room = await getServerByName(c.env.Room, code);
    const res = await room.init(hostUid, `Worksheet · ${title}`.slice(0, 80));
    if (!res.ok) continue;
    const made = await room.setupWorksheet(link, starter, !!req.key, title);
    await c.env.DB!.prepare(`UPDATE assignments SET worksheet = ? WHERE id = ?`).bind(code, link.assignmentId).run();
    return { room: code, ...(made?.starterId ? { starterId: made.starterId } : {}), ...(made?.keyId ? { keyId: made.keyId } : {}) };
  }
  return null;
}

export const classes = new Hono<{ Bindings: Env }>();

// Classes live in D1; without it (some local setups) the feature is off.
classes.use("*", async (c, next) => (c.env.DB ? next() : c.json({ error: "Classes need the database, which isn't set up here." }, 503)));

// ---------- teacher ----------

classes.get("/", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "Sign in to manage classes." }, 401);
  if (user.role === "student") return c.json(STUDENT_NO, 403);
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
  // Making a class makes this a teacher account (unless it's already a student one).
  if ((await claimRole(c.env, user, "teacher")) === "student") return c.json(STUDENT_NO, 403);
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

/**
 * The Today screen: everything that needs the teacher right now, across all their classes.
 * Grading first, then answers (time requests, reports), then what's due soon.
 */
/** For the sidebar on every page: your classes (teacher) or the classes you're in (student). */
classes.get("/mine", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "Sign in first." }, 401);
  await ensureClassTables(c.env.DB!);
  const out: MyClasses = { role: user.role ?? null, classes: [] };
  if (user.role === "teacher") {
    const { results } = await c.env.DB!.prepare(
      `SELECT c.id, c.code, c.name, (SELECT COUNT(*) FROM class_students s WHERE s.class_id = c.id) AS students
       FROM classes c WHERE teacher_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(user.id)
      .all<{ id: string; code: string; name: string; students: number }>();
    out.classes = results.map((r) => ({ name: r.name, code: r.code, href: `/classes/${r.id}`, sub: `${r.students} student${r.students === 1 ? "" : "s"}` }));
  } else {
    const { results } = await c.env.DB!.prepare(
      `SELECT c.code, c.name, u.name AS teacher FROM class_students s JOIN classes c ON c.id = s.class_id
       LEFT JOIN users u ON u.id = c.teacher_id WHERE s.uid = ? ORDER BY s.joined_at DESC LIMIT 100`,
    )
      .bind(user.uid)
      .all<{ code: string; name: string; teacher: string | null }>();
    out.classes = results.map((r) => ({ name: r.name, code: r.code, href: `/c/${r.code}`, sub: r.teacher ?? "" }));
  }
  return c.json(out);
});

classes.get("/today", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "Sign in to see your classes." }, 401);
  if (user.role === "student") return c.json(STUDENT_NO, 403);
  await ensureClassTables(c.env.DB!);
  const db = c.env.DB!;
  const { results: list } = await db.prepare(`SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC`).bind(user.id).all<ClassRow>();
  const view: TodayView = { toGrade: [], answers: [], dueSoon: [], setup: { hasClass: list.length > 0, hasStudents: false, hasAssignment: false, hasGraded: false, ...(list[0] ? { firstClassId: list[0].id } : {}) } };
  const now = Date.now();
  // Only the 20 newest classes, to keep this quick.
  for (const cls of list.slice(0, 20)) {
    const { results: roster } = await db.prepare(`SELECT uid FROM class_students WHERE class_id = ?`).bind(cls.id).all<{ uid: string }>();
    if (roster.length) view.setup.hasStudents = true;
    const assignments = await loadAssignments(c, cls.id, true);
    if (assignments.length) view.setup.hasAssignment = true;
    let timeRequests = 0;
    let reports = 0;
    for (const a of assignments) {
      const real = a.groups.filter((g) => !isPending(g.roomCode));
      if (real.some((g) => g.grade)) view.setup.hasGraded = true;
      const waiting = real.filter((g) => g.status?.turnedInAt && !g.grade);
      if (waiting.length) view.toGrade.push({ classId: cls.id, className: cls.name, assignmentId: a.id, title: a.title, mode: a.mode, count: waiting.length, first: waiting[0].roomCode });
      for (const g of real) {
        timeRequests += g.status?.timeRequests ?? 0;
        const r = (await (await getServerByName(c.env.Room, g.roomCode)).reports().catch(() => [])) as Report[];
        reports += r.length;
      }
      const due = a.project.dueAt;
      if (due && due > now && due - now < 2 * 86_400_000) {
        // Solo: students who haven't opened it, or opened it but haven't turned it in and done nothing.
        // Groups: groups where nobody has opened the room.
        const started = (g: GroupInfo) => !isPending(g.roomCode) && ((g.status?.joined ?? 0) > 0 || !!g.status?.turnedInAt);
        const total = a.mode === "solo" ? roster.length : a.groups.length;
        const begun = a.mode === "solo" ? a.groups.filter((g) => started(g) && g.members.some((m) => roster.some((r) => r.uid === m))).length : a.groups.filter(started).length;
        const notStarted = Math.max(0, total - begun);
        if (notStarted) view.dueSoon.push({ classId: cls.id, className: cls.name, assignmentId: a.id, title: a.title, dueAt: due, notStarted, total });
      }
    }
    const waitingRow = await db.prepare(`SELECT COUNT(*) AS n FROM class_waiting WHERE class_id = ? AND (denied IS NULL OR denied = 0)`).bind(cls.id).first<{ n: number }>();
    const waiting = waitingRow?.n ?? 0;
    if (timeRequests || reports || waiting) view.answers.push({ classId: cls.id, className: cls.name, timeRequests, reports, waiting });
  }
  view.dueSoon.sort((x, y) => x.dueAt - y.dueAt);
  return c.json(view);
});

classes.get("/:id", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const db = c.env.DB!;
  const { results: students } = await db.prepare(`SELECT uid, name, joined_at, email FROM class_students WHERE class_id = ? ORDER BY name`)
    .bind(t.cls.id)
    .all<{ uid: string; name: string; joined_at: number; email: string | null }>();
  const { results: roster } = await db.prepare(`SELECT email FROM class_roster WHERE class_id = ? ORDER BY email`).bind(t.cls.id).all<{ email: string }>();
  const { results: waiting } = await db
    .prepare(`SELECT uid, name, email, at FROM class_waiting WHERE class_id = ? AND (denied IS NULL OR denied = 0) ORDER BY at`)
    .bind(t.cls.id)
    .all<WaitingStudent>();
  const joinedEmails = new Set(students.map((s) => s.email).filter(Boolean));
  const view: ClassView = {
    class: toInfo(t.cls),
    students: students.map((s): ClassStudent => ({ uid: s.uid, name: s.name, joinedAt: s.joined_at, ...(s.email ? { email: s.email } : {}) })),
    assignments: await loadAssignments(c, t.cls.id, true),
    access: accessOf(t.cls),
    roster: roster.map((r) => ({ email: r.email, joined: joinedEmails.has(r.email) })),
    waiting,
  };
  return c.json(view);
});

/** Remove a student: off the roster, out of every group, and blocked from the group rooms. */
classes.delete("/:id/students/:uid", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const uid = c.req.param("uid");
  const gone = await c.env.DB!.prepare(`SELECT email FROM class_students WHERE class_id = ? AND uid = ?`).bind(t.cls.id, uid).first<{ email: string | null }>();
  await c.env.DB!.batch([
    c.env.DB!.prepare(`DELETE FROM class_students WHERE class_id = ? AND uid = ?`).bind(t.cls.id, uid),
    c.env.DB!.prepare(`DELETE FROM class_roster WHERE class_id = ? AND email = ?`).bind(t.cls.id, gone?.email ?? ""),
  ]);
  for (const a of await loadAssignments(c, t.cls.id, false))
    for (const g of a.groups) {
      if (!g.members.includes(uid)) continue;
      await c.env.DB!.prepare(`UPDATE class_groups SET members = ? WHERE assignment_id = ? AND room_code = ?`)
        .bind(JSON.stringify(g.members.filter((u) => u !== uid)), a.id, g.roomCode)
        .run();
      if (!isPending(g.roomCode)) await (await getServerByName(c.env.Room, g.roomCode)).removeStudent(t.user.uid, uid).catch(() => {});
    }
  return c.json({ ok: true });
});

/** Erase a class for good: every group room (chat, files, uploads) and every record of it. */
classes.delete("/:id", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const assignments = await loadAssignments(c, t.cls.id, false);
  for (const a of assignments)
    for (const g of a.groups) if (!isPending(g.roomCode)) await (await getServerByName(c.env.Room, g.roomCode)).destroy(t.user.uid).catch(() => false);
  const ids = assignments.map((a) => a.id);
  const db = c.env.DB!;
  await db.batch([
    ...ids.flatMap((id) => [
      db.prepare(`DELETE FROM class_groups WHERE assignment_id = ?`).bind(id),
      db.prepare(`DELETE FROM grades WHERE assignment_id = ?`).bind(id),
    ]),
    db.prepare(`DELETE FROM assignments WHERE class_id = ?`).bind(t.cls.id),
    db.prepare(`DELETE FROM class_students WHERE class_id = ?`).bind(t.cls.id),
    db.prepare(`DELETE FROM class_roster WHERE class_id = ?`).bind(t.cls.id),
    db.prepare(`DELETE FROM class_waiting WHERE class_id = ?`).bind(t.cls.id),
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
      if (isPending(g.roomCode)) continue;
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
  if (!inClass || isPending(room)) return c.json({ error: "Not found." }, 404);
  return c.json(await (await getServerByName(c.env.Room, room)).dismissReport(c.req.param("rid")));
});

/**
 * A new assignment. Solo: nothing is made until a student opens it. Groups: the groups are
 * planned from the roster now, and each group's room is made when its first member opens it.
 */
classes.post("/:id/assignments", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const body = await c.req
    .json<{ title?: string; project?: Record<string, unknown>; template?: string; mode?: string; groupSize?: number; groups?: string[][]; worksheet?: WorksheetRequest }>()
    .catch(() => ({}) as Record<string, never>);
  const title = String(body.title ?? "").trim().slice(0, 80);
  if (!title) return c.json({ error: "Give the assignment a title." }, 400);
  const mode: AssignmentMode = body.mode === "groups" ? "groups" : "solo";
  const groupSize = Math.min(CLASS_LIMITS.groupSize, Math.max(1, Number(body.groupSize) || 3));
  const project = cleanProject(body.project ?? {})!;
  const id = newId();
  const planned: GroupInfo[] = [];
  if (mode === "groups") {
    const { results: roster } = await c.env.DB!.prepare(`SELECT uid FROM class_students WHERE class_id = ?`).bind(t.cls.id).all<{ uid: string }>();
    const inClass = new Set(roster.map((r) => r.uid));
    let groups: string[][] = Array.isArray(body.groups)
      ? body.groups.map((g) => (Array.isArray(g) ? g.map(String).filter((u) => inClass.has(u)) : []))
      : makeGroups([...inClass], groupSize);
    groups = groups.filter((g, i) => g.length || i === 0);
    if (!groups.length) groups = [[]];
    if (groups.length > 40) return c.json({ error: "That's too many groups." }, 400);
    groups.forEach((members, i) => planned.push({ roomCode: `${PENDING}${newId()}`, name: `Group ${i + 1}`, members }));
  }
  await c.env.DB!.batch([
    c.env.DB!.prepare(
      `INSERT INTO assignments (id, class_id, title, project, template, created_at, mode, group_size, teacher_uid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      t.cls.id,
      title,
      JSON.stringify({
        instructions: project.instructions,
        rubric: project.rubric,
        ai: project.ai,
        dueAt: project.dueAt,
        pasteGuard: project.pasteGuard,
        ...(project.reflection ? { reflection: project.reflection } : {}),
        ...(project.schedule ? { schedule: project.schedule } : {}),
      }),
      templateById(body.template)?.id ?? null,
      Date.now(),
      mode,
      groupSize,
      t.user.uid,
    ),
    ...planned.map((g) =>
      c.env.DB!.prepare(`INSERT INTO class_groups (assignment_id, room_code, name, members) VALUES (?, ?, ?, ?)`).bind(id, g.roomCode, g.name, JSON.stringify(g.members)),
    ),
  ]);
  const wants = body.worksheet && (body.worksheet.starter || body.worksheet.key);
  const worksheet = wants ? await makeWorksheet(c, t.user.uid, { classId: t.cls.id, assignmentId: id }, title, body.worksheet!) : null;
  return c.json({ id, mode, groups: planned, ...(worksheet ? { worksheet } : {}) });
});

/**
 * Add a worksheet to an assignment (a starter file and/or an answer key), or add an answer key
 * to the one it has. Students who already opened the assignment keep the copy they have.
 */
classes.post("/:id/assignments/:aid/worksheet", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const a = await c.env.DB!.prepare(`SELECT * FROM assignments WHERE id = ? AND class_id = ?`).bind(c.req.param("aid"), t.cls.id).first<AssignmentRow>();
  if (!a) return c.json({ error: "Assignment not found." }, 404);
  const body = await c.req.json<WorksheetRequest>().catch(() => ({}) as WorksheetRequest);
  if (a.worksheet) {
    const room = await getServerByName(c.env.Room, a.worksheet);
    const keyId = body.key ? await room.addAnswerKey() : undefined;
    return c.json({ room: a.worksheet, ...(keyId ? { keyId } : {}) });
  }
  const made = await makeWorksheet(c, t.user.uid, { classId: t.cls.id, assignmentId: a.id }, a.title, { starter: body.starter ?? "doc", key: !!body.key });
  return made ? c.json(made) : c.json({ error: "Couldn't make the worksheet. Try again." }, 500);
});

/** Put a student in a group (or take them out with room: null). Group assignments only. */
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
  if (body.room && !isPending(body.room) && groups.some((g) => g.roomCode === body.room))
    await (await getServerByName(c.env.Room, body.room)).allowStudent(uid).catch(() => null);
  return c.json({ ok: true });
});

/** Who may join: "list" (only the class list; others wait for you) or "code" (anyone with the code). */
classes.patch("/:id", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const body = await c.req.json<{ access?: string }>().catch(() => ({}) as { access?: string });
  const access: ClassAccess = body.access === "code" ? "code" : "list";
  await c.env.DB!.prepare(`UPDATE classes SET access = ? WHERE id = ?`).bind(access, t.cls.id).run();
  return c.json({ ok: true, access });
});

/** Add emails to the class list (pasted: one per line, or separated by commas or spaces). */
classes.post("/:id/roster", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const body = await c.req.json<{ emails?: string }>().catch(() => ({}) as { emails?: string });
  const emails = parseEmails(body.emails ?? "");
  if (!emails.length) return c.json({ error: "Paste at least one school email, like student@school.org." }, 400);
  const db = c.env.DB!;
  const count = await db.prepare(`SELECT COUNT(*) AS n FROM class_roster WHERE class_id = ?`).bind(t.cls.id).first<{ n: number }>();
  if ((count?.n ?? 0) + emails.length > 400) return c.json({ error: "A class list can have up to 400 emails." }, 400);
  const now = Date.now();
  await db.batch(emails.map((e) => db.prepare(`INSERT OR IGNORE INTO class_roster (class_id, email, added_at) VALUES (?, ?, ?)`).bind(t.cls.id, e, now)));
  // Anyone already waiting with one of these emails is let in right away.
  const { results: waiting } = await db.prepare(`SELECT uid, name, email FROM class_waiting WHERE class_id = ?`).bind(t.cls.id).all<{ uid: string; name: string; email: string | null }>();
  for (const w of waiting) if (w.email && emails.includes(w.email)) await admit(db, t.cls.id, w);
  return c.json({ ok: true, added: emails.length });
});

classes.delete("/:id/roster/:email", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  await c.env.DB!.prepare(`DELETE FROM class_roster WHERE class_id = ? AND email = ?`).bind(t.cls.id, decodeURIComponent(c.req.param("email")).toLowerCase()).run();
  return c.json({ ok: true });
});

/** Let a waiting student in (they're added to the class list too), or turn them away. */
classes.post("/:id/waiting/:uid", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const db = c.env.DB!;
  const w = await db.prepare(`SELECT uid, name, email FROM class_waiting WHERE class_id = ? AND uid = ?`).bind(t.cls.id, c.req.param("uid")).first<{ uid: string; name: string; email: string | null }>();
  if (!w) return c.json({ error: "That request is gone." }, 404);
  const body = await c.req.json<{ admit?: boolean }>().catch(() => ({}) as { admit?: boolean });
  if (body.admit === true) {
    if (w.email) await db.prepare(`INSERT OR IGNORE INTO class_roster (class_id, email, added_at) VALUES (?, ?, ?)`).bind(t.cls.id, w.email, Date.now()).run();
    await admit(db, t.cls.id, w);
  } else await db.prepare(`UPDATE class_waiting SET denied = 1 WHERE class_id = ? AND uid = ?`).bind(t.cls.id, w.uid).run();
  return c.json({ ok: true });
});

/** Puts someone in the class and clears their waiting request. */
async function admit(db: D1Database, classId: string, p: { uid: string; name: string; email: string | null }) {
  await db.batch([
    db
      .prepare(`INSERT INTO class_students (class_id, uid, name, joined_at, email) VALUES (?, ?, ?, ?, ?) ON CONFLICT (class_id, uid) DO UPDATE SET name = excluded.name, email = excluded.email`)
      .bind(classId, p.uid, p.name, Date.now(), p.email),
    db.prepare(`DELETE FROM class_waiting WHERE class_id = ? AND uid = ?`).bind(classId, p.uid),
  ]);
}

async function gradingContext(c: C) {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const assignments = await loadAssignments(c, t.cls.id, false);
  const assignment = assignments.find((a) => a.id === c.req.param("aid"));
  const group = assignment?.groups.find((g) => g.roomCode === c.req.param("room"));
  if (!assignment || !group || isPending(group.roomCode)) return c.json({ error: "Group not found." }, 404);
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
    order: g.assignment.groups.filter((x) => !isPending(x.roomCode)).map((x) => x.roomCode),
    answerKey: g.assignment.worksheet ? ((await (await getServerByName(c.env.Room, g.assignment.worksheet.room)).answerKey().catch(() => null)) as GradingView["answerKey"]) : null,
  };
  return c.json(view);
});

/** The next turned-in, ungraded student or group after `after` (for Save & next), or null when all are graded. */
classes.get("/:id/assignments/:aid/next-to-grade", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const assignment = (await loadAssignments(c, t.cls.id, true)).find((a) => a.id === c.req.param("aid"));
  if (!assignment) return c.json({ error: "Assignment not found." }, 404);
  const waiting = assignment.groups.filter((g) => !isPending(g.roomCode) && g.status?.turnedInAt && !g.grade).map((g) => g.roomCode);
  const after = c.req.query("after") ?? "";
  const order = assignment.groups.map((g) => g.roomCode);
  const from = order.indexOf(after);
  // Prefer the next one after the current group, then wrap around to any that are still waiting.
  const next = [...order.slice(from + 1), ...order.slice(0, Math.max(0, from))].find((code) => waiting.includes(code) && code !== after) ?? null;
  return c.json({ next, waiting: waiting.filter((code) => code !== after).length });
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
  // Graded work can't be unsubmitted by the students any more.
  await (await getServerByName(c.env.Room, g.group.roomCode)).setGraded(Date.now()).catch(() => null);
  return c.json({ ok: true, total: gradeTotal(data), max });
});

classes.post("/:id/assignments/:aid/groups/:room/reopen", async (c) => {
  const g = await gradingContext(c);
  if (g instanceof Response) return g;
  const room = await getServerByName(c.env.Room, g.group.roomCode);
  return c.json(await room.teacherReopen("Your teacher"));
});

/** Change the due date or the set times for everyone (every room that exists now, and rooms made later). */
classes.patch("/:id/assignments/:aid", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const row = await c.env.DB!.prepare(`SELECT * FROM assignments WHERE id = ? AND class_id = ?`).bind(c.req.param("aid"), t.cls.id).first<AssignmentRow>();
  if (!row) return c.json({ error: "Assignment not found." }, 404);
  const body = await c.req.json<{ dueAt?: number | null; schedule?: unknown }>().catch(() => ({}) as { dueAt?: number | null; schedule?: unknown });
  const patch: { dueAt?: number | null; schedule?: unknown } = {};
  if ("dueAt" in body) patch.dueAt = body.dueAt;
  if ("schedule" in body) patch.schedule = body.schedule;
  const next = cleanProject(patch, cleanProject(JSON.parse(row.project))!)!;
  const stored = { ...JSON.parse(row.project) };
  if (next.dueAt) stored.dueAt = next.dueAt;
  else delete stored.dueAt;
  if (next.schedule) stored.schedule = next.schedule;
  else delete stored.schedule;
  await c.env.DB!.prepare(`UPDATE assignments SET project = ? WHERE id = ?`).bind(JSON.stringify(stored), row.id).run();
  for (const g of await loadGroups(c.env.DB!, row.id))
    if (!isPending(g.roomCode)) await (await getServerByName(c.env.Room, g.roomCode)).setTiming(patch).catch(() => null);
  return c.json({ ok: true });
});

/**
 * Change an assignment you just made (the wizard's Back button): title, the project rules,
 * and solo or groups. Only before any student has a room, so nobody's work is affected.
 */
classes.put("/:id/assignments/:aid", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const row = await c.env.DB!.prepare(`SELECT * FROM assignments WHERE id = ? AND class_id = ?`).bind(c.req.param("aid"), t.cls.id).first<AssignmentRow>();
  if (!row) return c.json({ error: "Assignment not found." }, 404);
  const groups = await loadGroups(c.env.DB!, row.id);
  if (groups.some((g) => !isPending(g.roomCode)))
    return c.json({ error: "Students have already opened this assignment, so it can't be changed here. Use Edit times, or each room's settings." }, 409);
  const body = await c.req.json<{ title?: string; project?: Record<string, unknown>; mode?: string; groupSize?: number }>().catch(() => ({}) as Record<string, never>);
  const title = String(body.title ?? row.title).trim().slice(0, 80);
  if (!title) return c.json({ error: "Give the assignment a title." }, 400);
  const mode: AssignmentMode = body.mode === "groups" ? "groups" : body.mode === "solo" ? "solo" : ((row.mode as AssignmentMode) ?? "solo");
  const groupSize = Math.min(CLASS_LIMITS.groupSize, Math.max(1, Number(body.groupSize ?? row.group_size) || 3));
  const project = cleanProject(body.project ?? JSON.parse(row.project))!;
  const stored = {
    instructions: project.instructions,
    rubric: project.rubric,
    ai: project.ai,
    dueAt: project.dueAt,
    pasteGuard: project.pasteGuard,
    ...(project.reflection ? { reflection: project.reflection } : {}),
    ...(project.schedule ? { schedule: project.schedule } : {}),
  };
  const stmts = [c.env.DB!.prepare(`UPDATE assignments SET title = ?, project = ?, mode = ?, group_size = ? WHERE id = ?`).bind(title, JSON.stringify(stored), mode, groupSize, row.id)];
  // Solo or groups (or the group size) changed: plan the groups again.
  if (mode !== row.mode || groupSize !== row.group_size) {
    stmts.push(c.env.DB!.prepare(`DELETE FROM class_groups WHERE assignment_id = ?`).bind(row.id));
    if (mode === "groups") {
      const { results: roster } = await c.env.DB!.prepare(`SELECT uid FROM class_students WHERE class_id = ?`).bind(t.cls.id).all<{ uid: string }>();
      let planned = makeGroups(roster.map((r) => r.uid), groupSize).filter((g, i) => g.length || i === 0);
      if (!planned.length) planned = [[]];
      planned.forEach((members, i) =>
        stmts.push(c.env.DB!.prepare(`INSERT INTO class_groups (assignment_id, room_code, name, members) VALUES (?, ?, ?, ?)`).bind(row.id, `${PENDING}${newId()}`, `Group ${i + 1}`, JSON.stringify(members))),
      );
    }
  }
  await c.env.DB!.batch(stmts);
  return c.json({ ok: true });
});

/**
 * Copy an assignment to the teacher's other classes (same lesson, another period): its rules,
 * solo or groups, and its worksheet and answer key. Each class gets its own link and rooms.
 */
classes.post("/:id/assignments/:aid/copy", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const src = await c.env.DB!.prepare(`SELECT * FROM assignments WHERE id = ? AND class_id = ?`).bind(c.req.param("aid"), t.cls.id).first<AssignmentRow>();
  if (!src) return c.json({ error: "Assignment not found." }, 404);
  const body = await c.req.json<{ classIds?: unknown }>().catch(() => ({}) as { classIds?: unknown });
  const ids = (Array.isArray(body.classIds) ? body.classIds : []).map(String).filter((x) => x && x !== t.cls.id).slice(0, 20);
  if (!ids.length) return c.json({ error: "Pick at least one class." }, 400);
  const copied: string[] = [];
  for (const classId of ids) {
    const target = await c.env.DB!.prepare(`SELECT * FROM classes WHERE id = ? AND teacher_id = ?`).bind(classId, t.user.id).first<ClassRow>();
    if (!target) continue;
    const id = newId();
    const mode: AssignmentMode = src.mode === "groups" ? "groups" : "solo";
    const size = src.group_size ?? 3;
    const stmts = [
      c.env.DB!.prepare(
        `INSERT INTO assignments (id, class_id, title, project, template, created_at, mode, group_size, teacher_uid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, target.id, src.title, src.project, src.template, Date.now(), mode, size, t.user.uid),
    ];
    if (mode === "groups") {
      const { results: roster } = await c.env.DB!.prepare(`SELECT uid FROM class_students WHERE class_id = ?`).bind(target.id).all<{ uid: string }>();
      let planned = makeGroups(roster.map((r) => r.uid), size).filter((g, i) => g.length || i === 0);
      if (!planned.length) planned = [[]];
      planned.forEach((members, i) =>
        stmts.push(c.env.DB!.prepare(`INSERT INTO class_groups (assignment_id, room_code, name, members) VALUES (?, ?, ?, ?)`).bind(id, `${PENDING}${newId()}`, `Group ${i + 1}`, JSON.stringify(members))),
      );
    }
    await c.env.DB!.batch(stmts);
    // Its own worksheet: a copy of every starter file, and of the answer key.
    if (src.worksheet) {
      const made = await makeWorksheet(c, t.user.uid, { classId: target.id, assignmentId: id }, src.title, { starter: null, key: false });
      if (made) {
        const ws = await getServerByName(c.env.Room, made.room);
        await ws.copyStarter(src.worksheet).catch(() => null);
        await ws.copyAnswerKeyFrom(src.worksheet).catch(() => null);
      }
    }
    copied.push(target.name);
  }
  return c.json({ copied });
});

/** Give one student or group extra time: open it now for a while, extend their due date, or set it. */
classes.post("/:id/assignments/:aid/groups/:room/time", async (c) => {
  const g = await gradingContext(c);
  if (g instanceof Response) return g;
  const body = await c.req.json<{ openMinutes?: number; extendDays?: number; dueAt?: number | null }>().catch(() => ({}) as Record<string, never>);
  return c.json(await (await getServerByName(c.env.Room, g.group.roomCode)).grantTime(body));
});

/** Requests for more time waiting across the class. */
classes.get("/:id/time-requests", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const out: (TimeRequest & { assignment: string; assignmentId: string; group: string; room: string })[] = [];
  for (const a of await loadAssignments(c, t.cls.id, false))
    for (const g of a.groups) {
      if (isPending(g.roomCode)) continue;
      const list = (await (await getServerByName(c.env.Room, g.roomCode)).timeRequests().catch(() => [])) as TimeRequest[];
      for (const r of list) out.push({ ...r, assignment: a.title, assignmentId: a.id, group: g.name, room: g.roomCode });
    }
  out.sort((x, y) => x.at - y.at);
  return c.json({ requests: out });
});

classes.post("/:id/assignments/:aid/groups/:room/time-requests/:rid", async (c) => {
  const g = await gradingContext(c);
  if (g instanceof Response) return g;
  const body = await c.req.json<{ approve?: boolean }>().catch(() => ({}) as { approve?: boolean });
  return c.json(await (await getServerByName(c.env.Room, g.group.roomCode)).answerTimeRequest(c.req.param("rid"), body.approve === true));
});

classes.get("/:id/assignments/:aid/grades.csv", async (c) => {
  const t = await teacherClass(c);
  if (t instanceof Response) return t;
  const assignment = (await loadAssignments(c, t.cls.id, false)).find((a) => a.id === c.req.param("aid"));
  if (!assignment) return c.json({ error: "Assignment not found." }, 404);
  const { results } = await c.env.DB!.prepare(`SELECT uid, name FROM class_students WHERE class_id = ? ORDER BY name`).bind(t.cls.id).all<{ uid: string; name: string }>();
  const solo = assignment.mode === "solo";
  const rows: unknown[][] = [["Student", solo ? "Work" : "Group", solo ? "Grade" : "Group grade", "Student grade", "Out of", "Comment"]];
  for (const s of results) {
    const group = assignment.groups.find((g) => g.members.includes(s.uid));
    const grade = group && !isPending(group.roomCode) ? await loadGrade(c.env.DB!, assignment.id, group.roomCode) : undefined;
    const total = grade ? gradeTotal(grade) : null;
    const where = solo ? (group ? "Started" : "Not started") : (group?.name ?? "No group");
    rows.push([s.name, where, total ?? "", grade?.students[s.uid] ?? total ?? "", grade ? rubricMax(grade.rows) : "", grade?.comment ?? ""]);
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
  const who = await studentIdentity(c, { uid: c.req.query("uid") });
  if (who instanceof Response) return who;
  const uid = who.uid;
  const me = uid ? await c.env.DB!.prepare(`SELECT name FROM class_students WHERE class_id = ? AND uid = ?`).bind(cls.id, uid).first<{ name: string }>() : null;
  const asked = !me && uid ? await c.env.DB!.prepare(`SELECT denied FROM class_waiting WHERE class_id = ? AND uid = ?`).bind(cls.id, uid).first<{ denied: number | null }>() : null;
  const view: StudentClassView = { name: cls.name, joined: !!me, status: me ? "joined" : asked ? (asked.denied ? "denied" : "waiting") : "new", assignments: [] };
  if (me) {
    const t = await c.env.DB!.prepare(`SELECT name FROM users WHERE id = ?`).bind(cls.teacher_id).first<{ name: string }>().catch(() => null);
    if (t?.name) view.teacher = t.name;
    for (const a of await loadAssignments(c, cls.id, false)) {
      const group = a.groups.find((g) => g.members.includes(uid));
      const ready = group && !isPending(group.roomCode) ? group : undefined;
      let turnedIn = false;
      if (ready) {
        const status = (await (await getServerByName(c.env.Room, ready.roomCode)).groupStatus([]).catch(() => null)) as GroupStatus | null;
        turnedIn = !!status?.turnedInAt;
      }
      view.assignments.push({
        id: a.id,
        title: a.title,
        mode: a.mode,
        ...(a.project.dueAt ? { dueAt: a.project.dueAt } : {}),
        ...(group && a.mode === "groups" ? { groupName: group.name } : {}),
        ...(ready ? { roomCode: ready.roomCode, turnedIn } : {}),
      });
    }
  }
  return c.json(view);
});

classes.post("/join/:code", async (c) => {
  const cls = await classByCode(c);
  if (!cls) return c.json({ error: "That code doesn't match a class." }, 404);
  if (!(await hit(c.env.DB!, `classjoin:${clientIp(c.req.raw)}`, 60, 3600))) return c.json({ error: "Too many tries. Wait a bit." }, 429);
  const body = await c.req
    .json<{ uid?: string; name?: string; age13?: boolean; human?: string }>()
    .catch(() => ({}) as { uid?: string; name?: string; age13?: boolean; human?: string });
  const who = await studentIdentity(c, body);
  if (who instanceof Response) return who;
  const { uid, name, email } = who;
  if (!uid || !name) return c.json({ error: "Type your name to join." }, 400);
  if (body.age13 !== true) return c.json({ error: "Cairn is for ages 13 and up." }, 400);
  // A teacher can't join their own class as a student.
  if (who.user && cls.teacher_id === who.user.id) return c.json({ error: "This is your class. You manage it from your Today page." }, 400);
  if (!(await isHuman(c.env, body.human, clientIp(c.req.raw)))) return c.json({ error: NOT_HUMAN }, 403);
  const db = c.env.DB!;
  const already = await db.prepare(`SELECT 1 FROM class_students WHERE class_id = ? AND uid = ?`).bind(cls.id, uid).first();
  if (!already) {
    const count = await db.prepare(`SELECT COUNT(*) AS n FROM class_students WHERE class_id = ?`).bind(cls.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= CLASS_LIMITS.students) return c.json({ error: "This class is full." }, 400);
    // The class list decides: on it (or an open class) = straight in; otherwise wait for the teacher.
    const listed = email ? await db.prepare(`SELECT 1 FROM class_roster WHERE class_id = ? AND email = ?`).bind(cls.id, email).first() : null;
    const open = accessOf(cls) === "code" || !signInRequired(c.env);
    if (!open && !listed) {
      const prev = await db.prepare(`SELECT denied FROM class_waiting WHERE class_id = ? AND uid = ?`).bind(cls.id, uid).first<{ denied: number | null }>();
      if (prev?.denied) return c.json({ denied: true });
      const waitingCount = await db.prepare(`SELECT COUNT(*) AS n FROM class_waiting WHERE class_id = ?`).bind(cls.id).first<{ n: number }>();
      if (!prev && (waitingCount?.n ?? 0) >= 100) return c.json({ error: "Too many people are waiting to join this class. Ask your teacher." }, 429);
      await db
        .prepare(`INSERT INTO class_waiting (class_id, uid, name, email, at, denied) VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT (class_id, uid) DO UPDATE SET name = excluded.name`)
        .bind(cls.id, uid, name, email, Date.now())
        .run();
      if (who.user) await claimRole(c.env, who.user, "student");
      return c.json({ waiting: true });
    }
  }
  await db
    .prepare(`INSERT INTO class_students (class_id, uid, name, joined_at, email) VALUES (?, ?, ?, ?, ?) ON CONFLICT (class_id, uid) DO UPDATE SET name = excluded.name, email = COALESCE(excluded.email, class_students.email)`)
    .bind(cls.id, uid, name, Date.now(), email)
    .run();
  if (who.user) await claimRole(c.env, who.user, "student");
  return c.json({ ok: true });
});

/**
 * Who a student is. With sign-in required (the normal case), it's always their account: name,
 * school email and identity. Otherwise (a demo setup) the browser's guest identity and typed name.
 */
async function studentIdentity(c: C, body: { uid?: unknown; name?: unknown }): Promise<{ uid: string; name: string; email: string | null; user?: User } | Response> {
  const user = await currentUser(c.env, c.req.raw);
  if (user) return { uid: user.uid, name: user.name.slice(0, 32), email: user.email?.toLowerCase() ?? null, user };
  if (signInRequired(c.env)) return c.json({ error: "Sign in with your school Google account to join.", signIn: true }, 401);
  return { uid: String(body.uid ?? "").slice(0, 64), name: String(body.name ?? "").trim().slice(0, 32), email: null };
}

async function assignmentByCode(c: C) {
  const cls = await classByCode(c);
  if (!cls) return null;
  const a = await c.env.DB!.prepare(`SELECT * FROM assignments WHERE id = ? AND class_id = ?`).bind(c.req.param("aid"), cls.id).first<AssignmentRow>();
  return a ? { cls, a } : null;
}

/** What the assignment link shows before a student opens it. */
classes.get("/join/:code/a/:aid", async (c) => {
  const found = await assignmentByCode(c);
  if (!found) return c.json({ error: "That assignment link doesn't work any more. Ask your teacher for a new one." }, 404);
  const a = toAssignment(found.a, []);
  return c.json({ className: found.cls.name, title: a.title, mode: a.mode, ...(a.project.dueAt ? { dueAt: a.project.dueAt } : {}) });
});

/**
 * Opening an assignment link: finds (or makes) this student's room and returns its code.
 * Solo: their own room. Groups: their group's room; a student who joined late is put in the
 * group with the most space, or a new one. Rooms are made here, on first open.
 */
classes.post("/join/:code/a/:aid/open", async (c) => {
  const found = await assignmentByCode(c);
  if (!found) return c.json({ error: "That assignment link doesn't work any more. Ask your teacher for a new one." }, 404);
  const { cls, a } = found;
  const body = await c.req.json<{ uid?: string }>().catch(() => ({}) as { uid?: string });
  const who = await studentIdentity(c, body);
  if (who instanceof Response) return who;
  const uid = who.uid;
  // The room lets this student in: class rooms only admit the students the class placed there.
  const give = async (roomCode: string) => {
    await (await getServerByName(c.env.Room, roomCode)).allowStudent(uid).catch(() => null);
    return c.json({ roomCode });
  };
  const student = uid ? await c.env.DB!.prepare(`SELECT name FROM class_students WHERE class_id = ? AND uid = ?`).bind(cls.id, uid).first<{ name: string }>() : null;
  if (!student) return c.json({ needsJoin: true });
  if (!(await hit(c.env.DB!, `assignopen:${clientIp(c.req.raw)}`, 300, 3600))) return c.json({ error: "Too many tries. Wait a bit." }, 429);
  const db = c.env.DB!;
  const assignment = toAssignment(a, []);
  const project = cleanProject(assignment.project)!;
  const host = a.teacher_uid;
  const template = a.template ?? undefined;
  const memberLike = `%"${uid.replace(/[%_"]/g, "")}"%`;

  if (assignment.mode === "solo") {
    const mine = await db.prepare(`SELECT room_code FROM class_groups WHERE assignment_id = ? AND members LIKE ?`).bind(a.id, memberLike).first<{ room_code: string }>();
    if (mine) return give(mine.room_code);
    if (!host) return c.json({ error: "This assignment can't make rooms. Ask your teacher to create it again." }, 500);
    const code = await createRoom(c, host, `${a.title} · ${student.name}`, project, template, { classId: cls.id, assignmentId: a.id, group: student.name, classCode: cls.code }, a.worksheet);
    if (!code) return c.json({ error: "Couldn't open your room. Try again." }, 500);
    // One room per student, even if they click twice at once: only the first insert wins.
    const ins = await db
      .prepare(
        `INSERT INTO class_groups (assignment_id, room_code, name, members) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM class_groups WHERE assignment_id = ? AND members LIKE ?)`,
      )
      .bind(a.id, code, student.name, JSON.stringify([uid]), a.id, memberLike)
      .run();
    if (ins.meta.changes) return give(code);
    await (await getServerByName(c.env.Room, code)).destroy(host).catch(() => false);
    const winner = await db.prepare(`SELECT room_code FROM class_groups WHERE assignment_id = ? AND members LIKE ?`).bind(a.id, memberLike).first<{ room_code: string }>();
    return winner ? give(winner.room_code) : c.json({ error: "Couldn't open your room. Try again." }, 500);
  }

  // Groups: find this student's group, or place a late joiner.
  let groups = await loadGroups(db, a.id);
  let group = groups.find((g) => g.members.includes(uid));
  if (!group) {
    const i = placeLateJoiner(groups, assignment.groupSize);
    if (i >= 0) {
      group = groups[i];
      const members = [...group.members, uid];
      // Only if nobody changed this group in the meantime.
      const upd = await db
        .prepare(`UPDATE class_groups SET members = ? WHERE assignment_id = ? AND room_code = ? AND members = ?`)
        .bind(JSON.stringify(members), a.id, group.roomCode, JSON.stringify(group.members))
        .run();
      if (!upd.meta.changes) return c.json({ error: "Your class is busy for a second. Try again." }, 409);
      group = { ...group, members };
    } else {
      group = { roomCode: `${PENDING}${newId()}`, name: `Group ${groups.length + 1}`, members: [uid] };
      await db.prepare(`INSERT INTO class_groups (assignment_id, room_code, name, members) VALUES (?, ?, ?, ?)`).bind(a.id, group.roomCode, group.name, JSON.stringify(group.members)).run();
    }
  }
  if (!isPending(group.roomCode)) return give(group.roomCode);
  if (!host) return c.json({ error: "This assignment can't make rooms. Ask your teacher to create it again." }, 500);
  const code = await createRoom(c, host, `${a.title} · ${group.name}`, project, template, { classId: cls.id, assignmentId: a.id, group: group.name, classCode: cls.code }, a.worksheet);
  if (!code) return c.json({ error: "Couldn't open your group's room. Try again." }, 500);
  // The first member to open it makes the room; anyone racing them gets that same room.
  const swap = await db.prepare(`UPDATE class_groups SET room_code = ? WHERE assignment_id = ? AND room_code = ?`).bind(code, a.id, group.roomCode).run();
  if (swap.meta.changes) return give(code);
  await (await getServerByName(c.env.Room, code)).destroy(host).catch(() => false);
  groups = await loadGroups(db, a.id);
  const now = groups.find((g) => g.members.includes(uid));
  return now && !isPending(now.roomCode) ? give(now.roomCode) : c.json({ error: "Try again in a moment." }, 409);
});
