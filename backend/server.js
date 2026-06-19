// server.js
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import axios from "axios";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import FormData from "form-data";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import { supabase } from "./db/supabase.js";

// Map Supabase row to shape frontend expects (with _id)
function toClientStudent(row) {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    rollNumber: row.roll_number,
    videoPath: row.video_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
/** Maps legacy DB role `teacher` to `discipline_incharge` for permissions and JWT. */
function normalizeStaffRole(role) {
  if (role === "teacher") return "discipline_incharge";
  return role;
}

function toClientUser(row) {
  if (!row) return null;
  const u = { ...row, _id: row.id, studentId: row.student_id };
  delete u.password;
  if (u.role) u.role = normalizeStaffRole(u.role);
  return u;
}
function toClientViolation(row) {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    id: row.id,
    studentId: row.student_id,
    student: row.student_name,
    studentName: row.student_name,
    camera: row.camera_name,
    cameraId: row.camera_id,
    cameraName: row.camera_name,
    clipUrl: row.clip_url || null,
    time: row.created_at ? new Date(row.created_at).toLocaleString() : null,
  };
}
function toClientCamera(row) {
  if (!row) return null;
  return { ...row, _id: row.id };
}
function toClientNotification(row) {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    violationId: row.violation_id,
    time: row.created_at ? new Date(row.created_at).toLocaleString() : null,
  };
}
function toClientPolicyRule(row) {
  if (!row) return null;
  return { ...row, _id: row.id };
}
function toClientActivityLog(row) {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    user: row.user_name,
    userName: row.user_name,
    relatedId: row.related_id,
    time: row.created_at ? new Date(row.created_at).toLocaleString() : null,
  };
}
function toClientFine(row) {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    violationId: row.violation_id,
    manualViolationId: row.manual_violation_id ?? null,
    violationType: row.violation_type,
    policyRuleId: row.policy_rule_id,
    time: row.created_at ? new Date(row.created_at).toLocaleString() : null,
  };
}

/** Resolve which campus student receives a fine from a manual report review. */
async function resolveManualReportFineSubject(
  supabaseClient,
  existing,
  reporterUserRow,
  fineTargetRaw,
) {
  const fineTarget = String(fineTargetRaw || "").toLowerCase();
  if (fineTarget === "reporter") {
    const sid = reporterUserRow?.student_id;
    if (!sid)
      return {
        error:
          "Reporter account has no linked student_id. Cannot fine reporter.",
      };
    const { data: st } = await supabaseClient
      .from("students")
      .select("id, name")
      .eq("id", sid)
      .maybeSingle();
    if (!st) return { error: "Reporter student record not found." };
    return {
      studentId: st.id,
      studentName: st.name || reporterUserRow.name || "Student",
    };
  }
  if (fineTarget === "subject") {
    const sap = String(existing.subject_sap_id || "").trim();
    if (!sap)
      return {
        error:
          "Report has no subject SAP / roll number. Add it on the report or choose Reporter.",
      };
    let st = null;
    const { data: byRoll } = await supabaseClient
      .from("students")
      .select("id, name")
      .eq("roll_number", sap)
      .maybeSingle();
    st = byRoll;
    if (!st && sap.includes("@")) {
      const { data: byEmail } = await supabaseClient
        .from("students")
        .select("id, name")
        .ilike("email", sap)
        .maybeSingle();
      st = byEmail;
    }
    if (!st) {
      const { data: rows } = await supabaseClient
        .from("students")
        .select("id, name")
        .ilike("roll_number", `%${sap}%`)
        .limit(1);
      st = rows?.[0] || null;
    }
    if (!st) return { error: `No student matched subject SAP/roll "${sap}".` };
    return {
      studentId: st.id,
      studentName: st.name || existing.subject_student_name || "Student",
    };
  }
  return { error: "fineTarget must be reporter or subject" };
}

/** Student-submitted reports (mobile app → manual_violations). */
function toClientManualViolation(row, reporter) {
  if (!row) return null;
  const evidencePath =
    row.evidence_media_type === "video"
      ? row.video_storage_path
      : row.image_storage_path;
  return {
    ...row,
    _id: row.id,
    id: row.id,
    time: row.created_at ? new Date(row.created_at).toLocaleString() : null,
    reporterName: reporter?.name ?? null,
    reporterEmail: reporter?.email ?? null,
    evidencePath,
    reviewNote: row.review_note ?? null,
    reviewedAt: row.reviewed_at
      ? new Date(row.reviewed_at).toLocaleString()
      : null,
    reviewedByName: row.reviewed_by_name ?? null,
  };
}

async function enrichManualViolationWithSignedUrl(row, reporter) {
  const base = toClientManualViolation(row, reporter);
  const path = base.evidencePath;
  let evidenceSignedUrl = null;
  if (path) {
    const { data: signed, error: serr } = await supabase.storage
      .from("manual-violations")
      .createSignedUrl(path, 3600);
    if (!serr && signed?.signedUrl) evidenceSignedUrl = signed.signedUrl;
  }
  return { ...base, evidenceSignedUrl };
}

/* ─────────────────── Weapon alias groups ───────────────────
   AI YOLO model can output any of these strings. Grouping them
   means a policy rule for "gun" will fire on "pistol" / "rifle"
   etc., and a rule for "knife" will fire on "blade" / "knives".  */
const WEAPON_ALIAS_GROUPS = [
  ["gun", "pistol", "rifle", "firearm", "guns"],
  ["knife", "blade", "knives"],
  ["weapon"],
];

const DRESSCODE_ALIAS_GROUPS = [
  ["dresscode", "dress_code", "dress code"],
  ["above_the_knee", "above knee", "shorts", "skirt"],
  ["improper_dress", "improper dress"],
];

const VIOLATION_ALIAS_GROUPS = [
  ...WEAPON_ALIAS_GROUPS,
  ...DRESSCODE_ALIAS_GROUPS,
  [["fight", "fighting", "violence"]],
];

function sameViolationGroup(a, b) {
  return VIOLATION_ALIAS_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

/* -------------------- Fine Enforcement Helper -------------------- */
async function applyFineIfEligible(
  studentId,
  studentName,
  violationType,
  violationId,
) {
  try {
    // Load all active policy rules once and pick the best match using a
    // 4-tier priority chain so naming differences never block fining:
    //   1. Exact case-insensitive match on violation_type
    //   2. Alias group — e.g. "pistol" rule fires on "gun" detection
    //   3. Partial substring — "gun" rule matches "gun_with_person"
    //   4. Catch-all — rule has no violation_type set (applies to anything)
    const { data: allRules } = await supabase.from("policy_rules").select("*");

    if (!allRules || allRules.length === 0) {
      console.log(`[Fine] No policy rules defined in the system`);
      return { applied: false, reason: "no_policy_rule" };
    }

    const vt = violationType.toLowerCase().trim();

    // Priority 1 — exact match
    let rule = allRules.find(
      (r) => r.violation_type && r.violation_type.toLowerCase() === vt,
    );
    // Priority 2 — same alias group (weapon, dresscode, fight, etc.)
    if (!rule) {
      rule = allRules.find((r) => {
        if (!r.violation_type) return false;
        return sameViolationGroup(r.violation_type.toLowerCase(), vt);
      });
    }
    // Priority 3 — substring match (e.g. "gun" rule → "gun_with_person")
    if (!rule) {
      rule = allRules.find((r) => {
        if (!r.violation_type) return false;
        const rt = r.violation_type.toLowerCase();
        return rt.includes(vt) || vt.includes(rt);
      });
    }
    // Priority 4 — catch-all rule (violation_type is null / empty)
    if (!rule) {
      rule = allRules.find((r) => !r.violation_type);
    }

    if (!rule) {
      console.log(
        `[Fine] No matching rule for "${violationType}" (${allRules.length} rules, none matched)`,
      );
      return { applied: false, reason: "no_policy_rule" };
    }

    console.log(
      `[Fine] Rule "${rule.title}" (vt="${rule.violation_type || "catch-all"}") matched AI type "${violationType}"`,
    );

    // Check 15-minute cooldown: same student + same violation type
    const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: recentFine } = await supabase
      .from("fines")
      .select("id, created_at")
      .eq("student_id", studentId)
      .ilike("violation_type", violationType)
      .gte("created_at", windowStart)
      .maybeSingle();

    if (recentFine) {
      console.log(
        `[Fine] Cooldown active for ${studentName} (${violationType}) — skipping fine`,
      );
      return {
        applied: false,
        reason: "cooldown_active",
        cooldownUntil: new Date(
          new Date(recentFine.created_at).getTime() + 15 * 60 * 1000,
        ).toISOString(),
      };
    }

    // Insert the fine
    const { data: fineRow, error: fineErr } = await supabase
      .from("fines")
      .insert({
        student_id: studentId,
        student_name: studentName,
        violation_id: violationId || null,
        manual_violation_id: null,
        violation_type: violationType.toLowerCase(),
        policy_rule_id: rule.id,
        amount: rule.penalty,
        status: "Pending",
      })
      .select()
      .single();

    if (fineErr) throw fineErr;

    // Create notification for the fine
    await supabase.from("notifications").insert({
      title: `Fine Applied: ${studentName} — Rs. ${rule.penalty} for ${rule.title}`,
      violation_id: violationId || null,
      priority:
        rule.severity === "HIGH"
          ? "HIGH"
          : rule.severity === "LOW"
            ? "LOW"
            : "MED",
      read: false,
    });

    console.log(
      `[Fine] Applied Rs. ${rule.penalty} fine to ${studentName} for "${violationType}"`,
    );
    return {
      applied: true,
      fine: toClientFine(fineRow),
      rule: toClientPolicyRule(rule),
    };
  } catch (err) {
    console.error("[Fine] Error applying fine:", err.message);
    return { applied: false, reason: "error", error: err.message };
  }
}

const app = express();
app.use(cors());
// Increase JSON body parser limit to handle large image data (base64 encoded images can be large)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

const PROCESS_ID = Math.random().toString(36).substring(7).toUpperCase();
const AI_SERVER_URL = process.env.AI_SERVER_URL || "http://127.0.0.1:8000";
const LIVE_RECOGNITION_TIMEOUT_MS = 30000;
console.log(`[System] Initializing HawkEye Server (Process ID: ${PROCESS_ID})`);
const hasSupabase = !!(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);
console.log(
  `[Supabase] ${hasSupabase ? "Configured (" + process.env.SUPABASE_URL + ")" : "Missing .env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"}`,
);

// Global Request Logger for diagnostics
app.use((req, res, next) => {
  if (req.path === "/api/recognition/live") {
    console.log(
      `[Incoming] ${req.method} ${req.path} (${(req.headers["content-length"] / 1024).toFixed(1)} KB)`,
    );
  } else {
    console.log(`[Incoming] ${req.method} ${req.path}`);
  }
  next();
});

// Test Endpoint with Process ID verification
app.get("/api/test", (req, res) => {
  res.json({
    message: "HawkEye Server is active",
    processId: PROCESS_ID,
    version: "1.2.0",
    time: new Date().toISOString(),
  });
});

// Health check: verifies Supabase connectivity
app.get("/api/health", async (req, res) => {
  try {
    const { error } = await supabase.from("users").select("id").limit(1);
    if (error) throw error;
    res.json({ ok: true, supabase: "connected" });
  } catch (err) {
    console.error("[Health] Supabase:", err.message);
    res
      .status(503)
      .json({ ok: false, supabase: "error", message: err.message });
  }
});

// Simple Health Check for Recognition
app.get("/api/recognition/health", (req, res) => {
  res.json({ status: "ok", endpoint: "/api/recognition/live", ready: true });
});

/* -------------------- IP Camera Stream Proxy (avoids CORS) -------------------- */
function isAllowedStreamUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (/^10\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

app.get("/api/stream/proxy", (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url query required" });
  }
  if (!isAllowedStreamUrl(url)) {
    return res
      .status(403)
      .json({ error: "Only local/private network camera URLs are allowed" });
  }
  axios
    .get(url, {
      responseType: "stream",
      timeout: 0,
      maxRedirects: 3,
      validateStatus: () => true,
    })
    .then((streamRes) => {
      if (streamRes.status !== 200) {
        res
          .status(502)
          .json({ error: "Camera stream returned " + streamRes.status });
        return;
      }
      const contentType = streamRes.headers["content-type"];
      if (contentType) res.setHeader("Content-Type", contentType);
      const boundary = streamRes.headers["x-multipart-boundary"];
      if (boundary) res.setHeader("X-Multipart-Boundary", boundary);
      streamRes.data.pipe(res);
    })
    .catch((err) => {
      console.error("[Stream Proxy] Error:", err.message);
      res.status(502).json({
        error:
          "Could not connect to camera. Is the URL correct and the device on the same network?",
      });
    });
});

/* -------------------- FFmpeg Setup -------------------- */
ffmpeg.setFfmpegPath(ffmpegPath);

/* -------------------- Ensure folders exist -------------------- */
["uploads", "frames"].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

/* -------------------- Supabase (DB) -------------------- */
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("[System] Using Supabase for data storage");
} else {
  console.warn("[System] Supabase env not set; DB calls may fail.");
}

/* -------------------- Multer Setup -------------------- */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + ".webm");
  },
});

const upload = multer({ storage });

// Memory storage for violation video clips (uploaded directly to Supabase Storage)
const clipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

/* -------------------- Convert video to mp4 -------------------- */
function convertToMp4(inputPath) {
  return new Promise((resolve, reject) => {
    // Generate output path by replacing extension with .mp4
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, ".mp4");

    console.log(`Converting video: ${inputPath} → ${outputPath}`);

    ffmpeg(inputPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .output(outputPath)
      .on("start", (commandLine) => {
        console.log(`FFmpeg command: ${commandLine}`);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`Conversion progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on("end", () => {
        console.log(`✅ Video converted successfully: ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err) => {
        console.error(`❌ Video conversion error:`, err.message);
        reject(err);
      })
      .run();
  });
}

/* -------------------- Extract ~65 Frames -------------------- */
function extractFrames(videoPath, studentId, targetFrames = 65) {
  return new Promise((resolve, reject) => {
    const framesDir = path.resolve("frames", studentId);
    fs.mkdirSync(framesDir, { recursive: true });

    // ~10s video → 6–7 fps = ~65 frames
    const fps = targetFrames / 10;

    ffmpeg(videoPath)
      .outputOptions(["-vf", `fps=${fps}`])
      .output(path.join(framesDir, "%03d.jpg"))
      .on("end", () => {
        console.log(`✅ Extracted frames for ${studentId}`);
        resolve(framesDir);
      })
      .on("error", reject)
      .run();
  });
}

/* -------------------- Authentication Middleware -------------------- */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "No authorization header" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("*")
      .eq("id", decoded.id)
      .single();
    if (userErr || !userRow) {
      return res.status(401).json({ error: "User not found" });
    }
    const user = toClientUser(userRow);
    if (user.studentId) {
      const { data: studentRow } = await supabase
        .from("students")
        .select("*")
        .eq("id", user.studentId)
        .single();
      user.studentId = studentRow ? toClientStudent(studentRow) : null;
    }
    req.user = user;
    next();
  } catch (err) {
    console.error("Authentication error:", err);
    // Handle specific JWT errors
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    return res
      .status(401)
      .json({ error: "Authentication failed", details: err.message });
  }
};

/** Allow AI engine to POST violations without a user JWT. */
const internalAuth = (req, res, next) => {
  const secret = req.headers["x-ai-secret-key"];
  const clientIp = req.ip || req.socket?.remoteAddress || "";
  const isLocal =
    clientIp === "127.0.0.1" ||
    clientIp === "::1" ||
    clientIp === "::ffff:127.0.0.1" ||
    clientIp.endsWith("127.0.0.1");
  if (
    secret === process.env.AI_SECRET_KEY ||
    secret === "hawkeye_internal_secret_token" ||
    isLocal
  ) {
    req.user = {
      id: "system",
      role: "admin",
      name: "AI Engine",
      _id: "system",
    };
    return next();
  }
  return authenticate(req, res, next);
};

/* -------------------- Login -------------------- */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data: userRow, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    if (error) {
      const cause = error.cause
        ? ` (${error.cause.message || error.cause})`
        : "";
      console.error("[Login] Supabase error:", error.message, cause);
      const isNetwork =
        error.message === "fetch failed" ||
        (error.cause &&
          /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|CERT/.test(String(error.cause)));
      return res.status(500).json({
        error: isNetwork
          ? "Cannot reach Supabase. Check internet connection and SUPABASE_URL in backend .env."
          : "Database error. Check backend logs and ensure Supabase schema is applied.",
      });
    }
    if (!userRow) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!(await bcrypt.compare(password, userRow.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    let userObj = toClientUser(userRow);
    delete userObj.password;
    if (userRow.student_id) {
      const { data: studentRow } = await supabase
        .from("students")
        .select("*")
        .eq("id", userRow.student_id)
        .single();
      userObj.studentId = studentRow ? toClientStudent(studentRow) : null;
    }

    const token = jwt.sign(
      { id: userRow.id, email: userRow.email, role: userObj.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({ user: userObj, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Student Routes -------------------- */
app.get("/api/students", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge") {
      return res.status(403).json({ error: "Access denied" });
    }
    const { data: rows, error } = await supabase
      .from("students")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json((rows || []).map(toClientStudent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/students/profile", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Access denied" });
    }
    const sid = req.user.studentId?.id ?? req.user.studentId;
    if (!sid)
      return res.status(404).json({ error: "Student profile not found" });
    const { data: row, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", sid)
      .single();
    if (error || !row)
      return res.status(404).json({ error: "Student profile not found" });
    res.json({ user: req.user, student: toClientStudent(row) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/students/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge")
      return res.status(403).json({ error: "Access denied" });
    const { data: row, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error || !row)
      return res.status(404).json({ error: "Student not found" });
    res.json(toClientStudent(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/students/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Access denied" });
    const { name, rollNumber, email, department, password } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (rollNumber !== undefined) updates.roll_number = rollNumber.trim();
    if (email !== undefined) updates.email = email.trim();
    if (department !== undefined)
      updates.department = department.trim() || null;
    const hasStudentUpdates = Object.keys(updates).length > 0;
    const hasPasswordUpdate =
      password !== undefined && String(password).trim().length > 0;

    if (!hasStudentUpdates && !hasPasswordUpdate)
      return res.status(400).json({ error: "No fields to update" });

    if (hasStudentUpdates) {
      const { data: row, error } = await supabase
        .from("students")
        .update(updates)
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) {
        if (error.code === "23505")
          return res
            .status(400)
            .json({ error: "Email or roll number already in use" });
        throw error;
      }
    }

    if (hasPasswordUpdate) {
      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("id")
        .eq("student_id", req.params.id)
        .maybeSingle();
      if (userErr) throw userErr;
      if (userRow) {
        const hashed = await bcrypt.hash(String(password).trim(), 10);
        const { error: updateErr } = await supabase
          .from("users")
          .update({ password: hashed })
          .eq("id", userRow.id);
        if (updateErr) throw updateErr;
      }
    }

    const { data: row, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error) throw error;
    res.json(toClientStudent(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Users (admin list) -------------------- */
app.get("/api/users", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Access denied" });
    const { data: rows, error } = await supabase
      .from("users")
      .select("id, email, role, name, student_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(
      (rows || []).map((r) => ({ ...r, _id: r.id, studentId: r.student_id })),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/users", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Access denied" });
    const { email, password, name, role } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });
    const validRole = ["admin", "discipline_incharge", "student"].includes(role)
      ? role
      : "discipline_incharge";
    const hashed = await bcrypt.hash(password, 10);
    const { data: row, error } = await supabase
      .from("users")
      .insert({
        email: email.trim(),
        password: hashed,
        role: validRole,
        name: (name || "").trim() || null,
      })
      .select("id, email, role, name, student_id, created_at")
      .single();
    if (error) {
      if (error.code === "23505")
        return res.status(400).json({ error: "Email already in use" });
      throw error;
    }
    res.status(201).json({ ...row, _id: row.id, studentId: row.student_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.patch("/api/users/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Access denied" });
    const { name, email, role, password } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim() || null;
    if (email !== undefined) updates.email = email.trim();
    if (
      role !== undefined &&
      ["admin", "discipline_incharge", "student"].includes(role)
    )
      updates.role = role;
    if (password !== undefined && String(password).trim() !== "") {
      updates.password = await bcrypt.hash(String(password).trim(), 10);
    }
    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: "No fields to update" });
    const { data: row, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", req.params.id)
      .select("id, email, role, name, student_id, created_at")
      .single();
    if (error) {
      if (error.code === "23505")
        return res.status(400).json({ error: "Email already in use" });
      throw error;
    }
    res.json({ ...row, _id: row.id, studentId: row.student_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/users/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Access denied" });
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Violations -------------------- */
app.get("/api/violations", authenticate, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from("violations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json((rows || []).map(toClientViolation));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/violations/:id", authenticate, async (req, res) => {
  try {
    const { data: row, error } = await supabase
      .from("violations")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error) throw error;
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(toClientViolation(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/violations", internalAuth, async (req, res) => {
  try {
    const body = req.body;
    let studentId = body.studentId || null;
    let studentName = body.studentName ?? body.student ?? null;

    if (studentId && (!studentName || studentName === studentId)) {
      const { data: st } = await supabase
        .from("students")
        .select("name")
        .eq("id", studentId)
        .maybeSingle();
      if (st?.name) studentName = st.name;
    }

    const { data: row, error } = await supabase
      .from("violations")
      .insert({
        student_name: studentName,
        student_id: studentId,
        type: body.type,
        severity: body.severity,
        confidence: body.confidence,
        location: body.location,
        camera_id: body.cameraId,
        camera_name: body.cameraName,
        status: body.status || "Unverified",
      })
      .select()
      .single();
    if (error) throw error;

    // Auto-apply fine if student is known
    let fineResult = null;
    if (studentId && studentName && body.type) {
      fineResult = await applyFineIfEligible(
        studentId,
        studentName,
        body.type,
        row.id,
      );
    }

    res.status(201).json({ ...toClientViolation(row), fineResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Manual violations (mobile student reports) -------------------- */
app.get("/api/manual-violations", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge") {
      return res.status(403).json({ error: "Access denied" });
    }
    const { data: rows, error } = await supabase
      .from("manual_violations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const ids = [
      ...new Set((rows || []).map((r) => r.reporter_user_id).filter(Boolean)),
    ];
    let userMap = {};
    if (ids.length > 0) {
      const { data: users, error: uerr } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", ids);
      if (uerr) throw uerr;
      userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
    }

    const out = await Promise.all(
      (rows || []).map(async (row) => {
        const reporter = userMap[row.reporter_user_id];
        return enrichManualViolationWithSignedUrl(row, reporter);
      }),
    );
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/manual-violations/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge") {
      return res.status(403).json({ error: "Access denied" });
    }
    const {
      status,
      reviewNote,
      rewardPoints,
      rewardDescription,
      issueFine,
      fineAmount,
      fineTarget,
      fineReason,
    } = req.body || {};
    const allowed = ["pending", "approved", "rejected"];
    if (!status || !allowed.includes(String(status).toLowerCase())) {
      return res
        .status(400)
        .json({ error: "status must be pending, approved, or rejected" });
    }
    const nextStatus = String(status).toLowerCase();
    const reviewerLabel = req.user.name || req.user.email || "Staff";

    const { data: existing, error: exErr } = await supabase
      .from("manual_violations")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!existing) return res.status(404).json({ error: "Report not found" });

    const { data: reporterRow } = await supabase
      .from("users")
      .select("id, name, email, student_id")
      .eq("id", existing.reporter_user_id)
      .maybeSingle();

    const wantsFine = Boolean(issueFine);
    const amt = wantsFine ? Math.floor(Number(fineAmount) || 0) : 0;
    let fineResult = null;
    let pendingManualFine = null;
    if (wantsFine) {
      if (nextStatus === "pending") {
        return res.status(400).json({
          error:
            "Cannot issue a fine while setting status to pending. Choose approved or rejected, or clear the fine.",
        });
      }
      if (amt <= 0) {
        return res.status(400).json({
          error:
            "fineAmount must be a positive integer when issueFine is true.",
        });
      }
      const resolved = await resolveManualReportFineSubject(
        supabase,
        existing,
        reporterRow,
        fineTarget,
      );
      if (resolved.error)
        return res.status(400).json({ error: resolved.error });
      const violationTypeLabel =
        String(fineReason || "").trim() ||
        `Manual report: ${String(existing.category || "discipline").replace(/_/g, " ")}`;
      pendingManualFine = {
        studentId: resolved.studentId,
        studentName: resolved.studentName,
        amount: amt,
        violationType: violationTypeLabel.slice(0, 200),
      };
    }

    const updates = {
      status: nextStatus,
      review_note:
        reviewNote != null ? String(reviewNote).trim() || null : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by_name: reviewerLabel,
    };

    const { data: row, error } = await supabase
      .from("manual_violations")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;

    if (pendingManualFine) {
      const { data: fineRow, error: fineInsErr } = await supabase
        .from("fines")
        .insert({
          student_id: pendingManualFine.studentId,
          student_name: pendingManualFine.studentName,
          violation_id: null,
          manual_violation_id: row.id,
          violation_type: pendingManualFine.violationType,
          policy_rule_id: null,
          amount: pendingManualFine.amount,
          status: "Pending",
        })
        .select()
        .single();
      if (fineInsErr) throw fineInsErr;
      fineResult = toClientFine(fineRow);
      await supabase.from("notifications").insert({
        title: `Fine issued: ${pendingManualFine.studentName} — Rs ${pendingManualFine.amount} (manual report review)`,
        priority: "HIGH",
        read: false,
      });
    }

    const reporterName = reporterRow?.name || reporterRow?.email || "Student";
    const statusLabel =
      nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1);
    await supabase.from("activity_logs").insert({
      action: `Manual report ${statusLabel}`,
      description:
        nextStatus === "rejected"
          ? `Your discipline report was rejected.${updates.review_note ? ` Note: ${updates.review_note}` : ""}`
          : nextStatus === "approved"
            ? `Your discipline report was approved.`
            : `Your discipline report was set to pending.`,
      user_name: reporterName,
      related_id: String(row.id),
      icon:
        nextStatus === "approved"
          ? "CheckCircle"
          : nextStatus === "rejected"
            ? "XCircle"
            : "Clock",
      color:
        nextStatus === "approved"
          ? "green"
          : nextStatus === "rejected"
            ? "red"
            : "amber",
    });

    let rewardResult = null;
    const pts = rewardPoints != null ? Number(rewardPoints) : 0;
    const canGrantReportReward =
      req.user.role === "admin" || req.user.role === "discipline_incharge";
    if (
      nextStatus === "approved" &&
      canGrantReportReward &&
      pts > 0 &&
      reporterRow?.student_id
    ) {
      const { data: student } = await supabase
        .from("students")
        .select("*")
        .eq("id", reporterRow.student_id)
        .maybeSingle();
      if (student) {
        const { data: rewardRow, error: rerr } = await supabase
          .from("rewards")
          .insert({
            student_id: student.id,
            student_name: student.name,
            student_department: student.department || null,
            points: pts,
            description:
              rewardDescription ||
              `Reward for approved report (${row.category})`,
            issued_by: reviewerLabel,
          })
          .select()
          .single();
        if (!rerr && rewardRow) {
          rewardResult = toClientReward(rewardRow);
          await supabase.from("notifications").insert({
            title: `Reward: ${student.name} received ${pts} points (report approved)`,
            priority: "LOW",
            read: false,
          });
        }
      }
    }

    const payload = await enrichManualViolationWithSignedUrl(row, reporterRow);
    res.json({ ...payload, rewardResult, fineResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Cameras -------------------- */
app.get("/api/cameras", authenticate, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from("cameras")
      .select("*")
      .order("name");
    if (error) throw error;
    res.json((rows || []).map(toClientCamera));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/cameras", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Access denied" });
    const { name, stream, status } = req.body;
    const { data: row, error } = await supabase
      .from("cameras")
      .insert({
        name: name || "Camera",
        stream: stream || "",
        status: status || "Active",
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(toClientCamera(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.patch("/api/cameras/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Access denied" });
    const { name, stream, status } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (stream !== undefined) updates.stream = stream;
    if (status !== undefined) updates.status = status;
    const { data: row, error } = await supabase
      .from("cameras")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(toClientCamera(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/cameras/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Access denied" });
    const { error } = await supabase
      .from("cameras")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Notifications -------------------- */
app.get("/api/notifications", authenticate, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json((rows || []).map(toClientNotification));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/notifications", authenticate, async (req, res) => {
  try {
    const { title, violationId, priority } = req.body;
    const { data: row, error } = await supabase
      .from("notifications")
      .insert({
        title: title || "Notification",
        violation_id: violationId || null,
        priority: priority || "MED",
        read: false,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(toClientNotification(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.patch("/api/notifications/:id", authenticate, async (req, res) => {
  try {
    const { read } = req.body;
    const { data: row, error } = await supabase
      .from("notifications")
      .update({ read: read !== false })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(toClientNotification(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Policy Rules -------------------- */
app.get("/api/policy-rules", authenticate, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from("policy_rules")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json((rows || []).map(toClientPolicyRule));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/policy-rules", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Access denied" });
    const { title, violation_type, severity, penalty } = req.body;
    const { data: row, error } = await supabase
      .from("policy_rules")
      .insert({
        title: title || "Rule",
        violation_type: violation_type
          ? violation_type.toLowerCase().trim()
          : null,
        severity: severity || "MED",
        penalty: penalty ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(toClientPolicyRule(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.patch("/api/policy-rules/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Access denied" });
    const { title, violation_type, severity, penalty } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (violation_type !== undefined)
      updates.violation_type = violation_type
        ? violation_type.toLowerCase().trim()
        : null;
    if (severity !== undefined) updates.severity = severity;
    if (penalty !== undefined) updates.penalty = Number(penalty);
    const { data: row, error } = await supabase
      .from("policy_rules")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(toClientPolicyRule(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/policy-rules/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Access denied" });
    const { error } = await supabase
      .from("policy_rules")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Fines -------------------- */
app.get("/api/fines", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge") {
      return res.status(403).json({ error: "Access denied" });
    }
    const { data: rows, error } = await supabase
      .from("fines")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json((rows || []).map(toClientFine));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/fines/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge") {
      return res.status(403).json({ error: "Access denied" });
    }
    const { status } = req.body;
    const validStatuses = ["Pending", "Paid", "Waived"];
    if (!validStatuses.includes(status)) {
      return res
        .status(400)
        .json({ error: "Invalid status. Must be Pending, Paid, or Waived" });
    }
    const { data: row, error } = await supabase
      .from("fines")
      .update({ status })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(toClientFine(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Rewards -------------------- */
function toClientReward(row) {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    studentDepartment: row.student_department,
    issuedBy: row.issued_by,
    time: row.created_at ? new Date(row.created_at).toLocaleString() : null,
  };
}

// List all rewards (newest first)
app.get("/api/rewards", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge") {
      return res.status(403).json({ error: "Access denied" });
    }
    const { data: rows, error } = await supabase
      .from("rewards")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json((rows || []).map(toClientReward));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leaderboard: students ranked by total reward points
app.get("/api/rewards/leaderboard", authenticate, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from("rewards")
      .select("student_id, student_name, student_department, points");
    if (error) throw error;

    // Aggregate points per student
    const map = {};
    for (const r of rows || []) {
      const key = r.student_id || r.student_name;
      if (!map[key]) {
        map[key] = {
          studentId: r.student_id,
          name: r.student_name,
          department: r.student_department,
          points: 0,
        };
      }
      map[key].points += r.points || 0;
    }

    const leaderboard = Object.values(map)
      .sort((a, b) => b.points - a.points)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Issue a new reward
app.post("/api/rewards", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge") {
      return res.status(403).json({ error: "Access denied" });
    }
    const { studentId, points, description } = req.body;
    if (!studentId || !points || points <= 0) {
      return res
        .status(400)
        .json({ error: "studentId and positive points are required" });
    }

    // Fetch student name + department
    const { data: student } = await supabase
      .from("students")
      .select("*")
      .eq("id", studentId)
      .single();
    if (!student) return res.status(404).json({ error: "Student not found" });

    const { data: row, error } = await supabase
      .from("rewards")
      .insert({
        student_id: studentId,
        student_name: student.name,
        student_department: student.department || null,
        points: Number(points),
        description: description || null,
        issued_by: req.user.name || req.user.email,
      })
      .select()
      .single();
    if (error) throw error;

    // Notify
    await supabase.from("notifications").insert({
      title: `Reward Issued: ${student.name} received ${points} points`,
      priority: "LOW",
      read: false,
    });

    res.status(201).json(toClientReward(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a reward
app.delete("/api/rewards/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge") {
      return res.status(403).json({ error: "Access denied" });
    }
    const { error } = await supabase
      .from("rewards")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Violation Clip: Frame → MP4 via ffmpeg -------------------- */
app.post(
  "/api/violations/:id/clip-from-frames",
  authenticate,
  async (req, res) => {
    const violationId = req.params.id;
    const framesDir = path.resolve("frames", "clips", violationId);
    const outputPath = path.resolve("frames", "clips", `${violationId}.mp4`);

    try {
      const { frames } = req.body;
      if (!frames || !Array.isArray(frames) || frames.length === 0) {
        return res.status(400).json({ error: "No frames provided" });
      }

      // Save each base64 JPEG as a file
      fs.mkdirSync(framesDir, { recursive: true });
      for (let i = 0; i < frames.length; i++) {
        const b64 = frames[i].replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(
          path.join(framesDir, `${String(i).padStart(3, "0")}.jpg`),
          Buffer.from(b64, "base64"),
        );
      }

      // Stitch frames into MP4 using ffmpeg at 1 fps to match the real capture rate.
      // With a 15-frame buffer that gives a natural-speed ~15-second clip.
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(path.join(framesDir, "%03d.jpg"))
          .inputFPS(1) // 1 frame captured per real second → 1fps = natural playback speed
          .videoCodec("libx264")
          .outputOptions([
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "fast",
            "-movflags",
            "+faststart",
          ])
          .output(outputPath)
          .on("end", resolve)
          .on("error", (err) => reject(new Error(`ffmpeg: ${err.message}`)))
          .run();
      });

      // Upload MP4 to Supabase Storage
      const fileBuffer = fs.readFileSync(outputPath);
      const storagePath = `${violationId}.mp4`;
      const { error: uploadErr } = await supabase.storage
        .from("violation-clips")
        .upload(storagePath, fileBuffer, {
          contentType: "video/mp4",
          upsert: true,
        });
      if (uploadErr) throw new Error(`Storage: ${uploadErr.message}`);

      const { data: urlData } = supabase.storage
        .from("violation-clips")
        .getPublicUrl(storagePath);
      const clipUrl = urlData?.publicUrl;
      if (!clipUrl) throw new Error("Could not get public URL");

      // Persist on violation row
      const { data: updated, error: updateErr } = await supabase
        .from("violations")
        .update({ clip_url: clipUrl })
        .eq("id", violationId)
        .select()
        .single();
      if (updateErr) throw updateErr;

      console.log(
        `[Clip] ✅ ${frames.length}-frame MP4 saved for violation ${violationId}`,
      );
      res.json({ clipUrl, violation: toClientViolation(updated) });
    } catch (err) {
      console.error("[Clip] clip-from-frames error:", err.message);
      res.status(500).json({ error: err.message });
    } finally {
      // Cleanup temp files regardless of success/failure
      try {
        fs.rmSync(framesDir, { recursive: true, force: true });
      } catch (_) {}
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (_) {}
    }
  },
);

/* -------------------- Violation Clip Upload (raw video blob) -------------------- */
app.post(
  "/api/violations/:id/clip",
  authenticate,
  clipUpload.single("clip"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "No clip file provided" });

      const violationId = req.params.id;
      const ext = req.file.mimetype.includes("mp4") ? "mp4" : "webm";
      const storagePath = `${violationId}.${ext}`;

      // Upload buffer to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from("violation-clips")
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype || "video/webm",
          upsert: true,
        });
      if (uploadErr)
        throw new Error(`Storage upload failed: ${uploadErr.message}`);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("violation-clips")
        .getPublicUrl(storagePath);
      const clipUrl = urlData?.publicUrl;
      if (!clipUrl) throw new Error("Could not get public URL after upload");

      // Persist clip_url on the violation row
      const { data: updated, error: updateErr } = await supabase
        .from("violations")
        .update({ clip_url: clipUrl })
        .eq("id", violationId)
        .select()
        .single();
      if (updateErr) throw updateErr;

      console.log(
        `[Clip] ✅ Stored clip for violation ${violationId}: ${clipUrl}`,
      );
      res.json({ clipUrl, violation: toClientViolation(updated) });
    } catch (err) {
      console.error("[Clip] Upload error:", err.message);
      res.status(500).json({ error: err.message });
    }
  },
);

/* -------------------- Review Queue -------------------- */
app.get("/api/review-queue", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge") {
      return res.status(403).json({ error: "Access denied" });
    }
    const { data: rows, error } = await supabase
      .from("violations")
      .select("*")
      .eq("status", "PendingReview")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json((rows || []).map(toClientViolation));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve: link a student, mark Verified, optionally apply fine
app.patch("/api/review-queue/:id/approve", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge") {
      return res.status(403).json({ error: "Access denied" });
    }
    const { studentId, applyFine, policyRuleId } = req.body;

    // Fetch the violation
    const { data: violation, error: fetchErr } = await supabase
      .from("violations")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (fetchErr || !violation)
      return res.status(404).json({ error: "Violation not found" });
    if (violation.status !== "PendingReview") {
      return res
        .status(400)
        .json({ error: "Violation is not in PendingReview status" });
    }

    // Resolve student details if provided
    let studentName = violation.student_name || "Unknown";
    if (studentId) {
      const { data: studentRow } = await supabase
        .from("students")
        .select("*")
        .eq("id", studentId)
        .single();
      if (studentRow) studentName = studentRow.name;
    }

    // Update the violation to Verified and link student
    const updates = { status: "Verified" };
    if (studentId) {
      updates.student_id = studentId;
      updates.student_name = studentName;
    }
    const { data: updated, error: updateErr } = await supabase
      .from("violations")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    // Apply fine if requested and student is known
    let fineResult = null;
    if (applyFine && studentId && studentName) {
      if (policyRuleId) {
        // Incharge manually selected a rule — apply it directly
        const { data: rule } = await supabase
          .from("policy_rules")
          .select("*")
          .eq("id", policyRuleId)
          .single();
        if (rule) {
          const windowStart = new Date(
            Date.now() - 15 * 60 * 1000,
          ).toISOString();
          const { data: recentFine } = await supabase
            .from("fines")
            .select("id")
            .eq("student_id", studentId)
            .eq("policy_rule_id", policyRuleId)
            .gte("created_at", windowStart)
            .maybeSingle();
          if (!recentFine) {
            const { data: fineRow } = await supabase
              .from("fines")
              .insert({
                student_id: studentId,
                student_name: studentName,
                violation_id: req.params.id,
                manual_violation_id: null,
                violation_type: violation.type,
                policy_rule_id: rule.id,
                amount: rule.penalty,
                status: "Pending",
              })
              .select()
              .single();
            await supabase.from("notifications").insert({
              title: `Fine Applied: ${studentName} — Rs. ${rule.penalty} for ${rule.title}`,
              violation_id: req.params.id,
              priority:
                rule.severity === "HIGH"
                  ? "HIGH"
                  : rule.severity === "LOW"
                    ? "LOW"
                    : "MED",
              read: false,
            });
            fineResult = {
              applied: true,
              fine: toClientFine(fineRow),
              rule: toClientPolicyRule(rule),
            };
          } else {
            fineResult = { applied: false, reason: "cooldown_active" };
          }
        }
      } else {
        // Auto-match by violation type
        fineResult = await applyFineIfEligible(
          studentId,
          studentName,
          violation.type,
          req.params.id,
        );
      }
    }

    res.json({ violation: toClientViolation(updated), fineResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject: dismiss the violation
app.patch("/api/review-queue/:id/reject", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "discipline_incharge") {
      return res.status(403).json({ error: "Access denied" });
    }
    const { data: updated, error } = await supabase
      .from("violations")
      .update({ status: "Dismissed" })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(toClientViolation(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Analytics Summary -------------------- */
app.get("/api/analytics/summary", authenticate, async (req, res) => {
  try {
    const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
    const todayEnd = new Date().toISOString().slice(0, 10) + "T23:59:59.999Z";

    // Run all counts in parallel
    const [
      violationsAll,
      violationsToday,
      violationsHighSeverity,
      violationsUnverified,
      finesAll,
      finesPending,
      finesPaid,
      camerasAll,
      camerasActive,
    ] = await Promise.all([
      supabase.from("violations").select("*", { count: "exact", head: true }),
      supabase
        .from("violations")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd),
      supabase
        .from("violations")
        .select("*", { count: "exact", head: true })
        .ilike("severity", "HIGH"),
      supabase
        .from("violations")
        .select("*", { count: "exact", head: true })
        .ilike("status", "Unverified"),
      supabase.from("fines").select("amount, status, violation_type"),
      supabase
        .from("fines")
        .select("*", { count: "exact", head: true })
        .eq("status", "Pending"),
      supabase
        .from("fines")
        .select("*", { count: "exact", head: true })
        .eq("status", "Paid"),
      supabase.from("cameras").select("*", { count: "exact", head: true }),
      supabase
        .from("cameras")
        .select("*", { count: "exact", head: true })
        .ilike("status", "Active"),
    ]);

    const allFines = finesAll.data || [];
    const totalFineAmount = allFines.reduce(
      (sum, f) => sum + (f.amount || 0),
      0,
    );
    const collectedAmount = allFines
      .filter((f) => f.status === "Paid")
      .reduce((sum, f) => sum + (f.amount || 0), 0);
    const pendingAmount = allFines
      .filter((f) => f.status === "Pending")
      .reduce((sum, f) => sum + (f.amount || 0), 0);

    // Fines grouped by violation type
    const finesByType = {};
    allFines.forEach((f) => {
      const t = f.violation_type || "unknown";
      if (!finesByType[t]) finesByType[t] = { type: t, count: 0, amount: 0 };
      finesByType[t].count += 1;
      finesByType[t].amount += f.amount || 0;
    });

    // Violations trend: last 7 days
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: recentViolations } = await supabase
      .from("violations")
      .select("created_at, severity, type")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: true });

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const trendMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      trendMap[key] = { day: dayNames[d.getDay()], date: key, count: 0 };
    }
    (recentViolations || []).forEach((v) => {
      const key = v.created_at.slice(0, 10);
      if (trendMap[key]) trendMap[key].count += 1;
    });

    // Severity distribution
    const severityMap = { HIGH: 0, MED: 0, LOW: 0 };
    (recentViolations || []).forEach((v) => {
      const s = (v.severity || "MED").toUpperCase();
      if (severityMap[s] !== undefined) severityMap[s] += 1;
      else severityMap["MED"] += 1;
    });

    res.json({
      totalViolations: violationsAll.count ?? 0,
      todayViolations: violationsToday.count ?? 0,
      highSeverityViolations: violationsHighSeverity.count ?? 0,
      unverifiedViolations: violationsUnverified.count ?? 0,
      totalFines: allFines.length,
      pendingFines: finesPending.count ?? 0,
      paidFines: finesPaid.count ?? 0,
      totalFineAmount,
      collectedAmount,
      pendingAmount,
      finesByType: Object.values(finesByType),
      violationsTrend: Object.values(trendMap),
      severityDistribution: [
        { name: "High", value: severityMap.HIGH, color: "#EF4444" },
        { name: "Medium", value: severityMap.MED, color: "#6366F1" },
        { name: "Low", value: severityMap.LOW, color: "#3B82F6" },
      ],
      totalCameras: camerasAll.count ?? 0,
      activeCameras: camerasActive.count ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Activity / History Logs -------------------- */
app.get("/api/activity-logs", authenticate, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json((rows || []).map(toClientActivityLog));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/history-summary", authenticate, async (req, res) => {
  try {
    const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
    const todayEnd = new Date().toISOString().slice(0, 10) + "T23:59:59.999Z";
    const [r1, r2, r3] = await Promise.all([
      supabase
        .from("activity_logs")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("activity_logs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd),
      supabase.from("users").select("*", { count: "exact", head: true }),
    ]);
    res.json({
      totalLogs: r1.count ?? 0,
      todayActivity: r2.count ?? 0,
      activeUsers: r3.count ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/activity-logs", authenticate, async (req, res) => {
  try {
    const { action, description, userName, relatedId, icon, color } = req.body;
    const { data: row, error } = await supabase
      .from("activity_logs")
      .insert({
        action: action || "Activity",
        description: description || "",
        user_name: userName,
        related_id: relatedId,
        icon: icon || "",
        color: color || "",
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(toClientActivityLog(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- Register Student (Self-registration only, no auth required) -------------------- */
app.post("/api/students/register", upload.single("video"), async (req, res) => {
  try {
    const { name, rollNumber, email, department, password, confirmPassword } =
      req.body;

    if (
      !name ||
      !rollNumber ||
      !email ||
      !department ||
      !password ||
      !confirmPassword
    ) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Video is required" });
    }

    const { data: existingStudent } = await supabase
      .from("students")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingStudent) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res
        .status(400)
        .json({ error: "Student with this email already registered" });
    }

    const { data: existingRollNumber } = await supabase
      .from("students")
      .select("id")
      .eq("roll_number", rollNumber)
      .maybeSingle();
    if (existingRollNumber) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res
        .status(400)
        .json({ error: "Student with this roll number already exists" });
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingUser) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "User account already exists" });
    }

    let mp4Path;
    const originalExt = path.extname(req.file.originalname).toLowerCase();
    const uploadedPath = req.file.path;
    const uploadedExt = path.extname(uploadedPath).toLowerCase();

    // 1️⃣ Convert video to mp4 if needed (handles .webm, .mp4, .mov, .avi, etc.)
    if (uploadedExt === ".mp4" && originalExt === ".mp4") {
      // Already mp4, use as-is
      mp4Path = uploadedPath;
      console.log(`✅ Video is already MP4 format: ${mp4Path}`);
    } else {
      // Convert to mp4 using ffmpeg (handles any video format)
      console.log(`🔄 Converting video from ${uploadedExt} to .mp4...`);
      mp4Path = await convertToMp4(uploadedPath);
      // Clean up original file after conversion
      if (uploadedPath !== mp4Path && fs.existsSync(uploadedPath)) {
        try {
          fs.unlinkSync(uploadedPath);
          console.log(`🗑️ Removed original file: ${uploadedPath}`);
        } catch (cleanupErr) {
          console.warn(
            `⚠️ Could not remove original file: ${cleanupErr.message}`,
          );
        }
      }
    }

    // 2️⃣ Save student to Supabase
    const { data: studentRow, error: studentErr } = await supabase
      .from("students")
      .insert({
        name,
        roll_number: rollNumber,
        email,
        department,
        video_path: mp4Path,
      })
      .select()
      .single();
    if (studentErr) throw new Error(studentErr.message);
    const student = toClientStudent(studentRow);

    // 3️⃣ Create user account for student
    const hashedPassword = await bcrypt.hash(password, 10);
    const { error: userErr } = await supabase.from("users").insert({
      email,
      password: hashedPassword,
      role: "student",
      name,
      student_id: studentRow.id,
    });
    if (userErr) throw new Error(userErr.message);

    // 4️⃣ Extract frames (approximately 65 frames from 10-second video)
    const framesDir = await extractFrames(mp4Path, studentRow.id);

    // 5️⃣ Send ABSOLUTE path to AI server for training
    axios
      .post(
        `${AI_SERVER_URL}/train`,
        {
          studentId: studentRow.id,
          studentName: name,
          framesDir: framesDir,
        },
        {
          timeout: 300000, // 5 minutes timeout for training (YOLOv8-face + ArcFace can be slow)
        },
      )
      .then(() => {
        console.log(
          `✅ AI training completed for student: ${student.name} (${studentRow.id})`,
        );
      })
      .catch((err) => {
        if (err.code === "ECONNABORTED" || err.message.includes("timeout")) {
          console.error(
            `⚠️ AI training timed out for student ${studentRow.id} - training may still be in progress`,
          );
        } else {
          console.error(
            `⚠️ AI training failed for student ${studentRow.id}:`,
            err.message,
          );
        }
      });

    res.status(201).json({
      message: "Student registered successfully. AI training started.",
      student: {
        _id: student._id,
        name: student.name,
        rollNumber: student.rollNumber,
        email: student.email,
      },
    });
  } catch (err) {
    console.error("Student registration error:", err);

    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        console.error("Error cleaning up file:", cleanupErr);
      }
    }

    res
      .status(500)
      .json({ error: err.message || "Failed to register student" });
  }
});

/* -------------------- Recognition -------------------- */

/* -------------------- Recognition -------------------- */
app.post("/api/recognition/live", authenticate, async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) {
    console.log(
      "[Backend] ⚠ Received recognize-live request with no image data",
    );
    return res.status(400).json({ error: "Image required" });
  }

  console.log(
    `[Backend] 📡 Processing live recognition request (Image Size: ${Math.round(imageBase64.length / 1024)} KB)`,
  );

  try {
    // base64 → buffer
    const buffer = Buffer.from(
      imageBase64.replace(/^data:image\/\w+;base64,/, ""),
      "base64",
    );

    const formData = new FormData();
    formData.append("frame", buffer, {
      filename: "frame.jpg",
      contentType: "image/jpeg",
    });

    // Send to Flask AI
    console.log("[Backend] 🤖 Calling AI Server...");
    const aiRes = await axios.post(
      `${AI_SERVER_URL}/recognize-live`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: LIVE_RECOGNITION_TIMEOUT_MS,
      },
    );

    console.log(
      `[Backend] ✅ AI Server responded with ${aiRes.data.count || 0} detections`,
    );

    const aiResults = aiRes.data.results || [];
    const weaponDetectionsRaw = aiRes.data.weapon_detections || [];
    const processedRecognitions = [];
    const allDetectedFaces = [];

    for (const resItem of aiResults) {
      const { student_id, confidence, bbox, recognized } = resItem;
      const faceBox = { x: bbox[0], y: bbox[1], w: bbox[2], h: bbox[3] };

      allDetectedFaces.push(faceBox);

      if (recognized && student_id) {
        try {
          const { data: studentRow } = await supabase
            .from("students")
            .select("*")
            .eq("id", student_id)
            .single();
          const student = studentRow ? toClientStudent(studentRow) : null;
          if (student) {
            processedRecognitions.push({
              student,
              confidence,
              faceBox,
              recognized: true,
            });
            console.log(
              `✓ Batch Recognized: ${student.name} (${student_id}) at ${(confidence * 100).toFixed(1)}%`,
            );
          } else {
            console.warn(
              `[Backend] ⚠ AI recognized ID ${student_id} but Student not found in DB`,
            );
          }
        } catch (dbErr) {
          console.error(`Error fetching student ${student_id}:`, dbErr.message);
        }
      }
    }

    // Enrich weapon detections with student names, auto-create violations + fines
    const weaponDetections = [];
    const finesApplied = [];

    for (const w of weaponDetectionsRaw) {
      const entry = {
        weapon: w.weapon,
        confidence: w.confidence,
        bbox: w.bbox,
        personLabel: w.student_id ? null : w.person_label || "Unknown person",
      };

      if (w.student_id) {
        try {
          const { data: studentRow } = await supabase
            .from("students")
            .select("*")
            .eq("id", w.student_id)
            .single();
          const student = studentRow ? toClientStudent(studentRow) : null;
          entry.personLabel = student ? student.name : "Unknown person";
          entry.studentId = w.student_id;

          if (student) {
            console.log(
              `⚠ Weapon (${w.weapon}) held by: ${student.name} (${w.student_id})`,
            );

            // Auto-create violation record
            const { data: violationRow } = await supabase
              .from("violations")
              .insert({
                student_name: student.name,
                student_id: student._id,
                type: w.weapon.toLowerCase(),
                severity: "HIGH",
                confidence: w.confidence
                  ? `${(w.confidence * 100).toFixed(1)}%`
                  : null,
                location: "Camera Feed",
                status: "Unverified",
              })
              .select()
              .single();

            // Apply fine with 15-min cooldown
            const fineResult = await applyFineIfEligible(
              student._id,
              student.name,
              w.weapon.toLowerCase(),
              violationRow?.id || null,
            );

            entry.violationId = violationRow?.id || null;
            entry.fineResult = fineResult;

            if (fineResult.applied) {
              finesApplied.push({
                studentName: student.name,
                studentId: student._id,
                weapon: w.weapon,
                amount: fineResult.fine?.amount,
                fineId: fineResult.fine?._id,
              });
            }
          }
        } catch (e) {
          console.error(
            "[Recognition] Error processing weapon for student:",
            e.message,
          );
          entry.personLabel = "Unknown person";
        }
      }
      // Unknown person with weapon → send to review queue (with 15-min cooldown)
      if (!w.student_id) {
        try {
          const weaponType = (w.weapon || "unknown").toLowerCase();
          const fifteenMinAgo = new Date(
            Date.now() - 15 * 60 * 1000,
          ).toISOString();

          const { data: recentReview } = await supabase
            .from("violations")
            .select("id")
            .eq("status", "PendingReview")
            .eq("type", weaponType)
            .gte("created_at", fifteenMinAgo)
            .maybeSingle();

          if (!recentReview) {
            const { data: reviewRow } = await supabase
              .from("violations")
              .insert({
                student_name: "Unknown",
                student_id: null,
                type: weaponType,
                severity: "HIGH",
                confidence: w.confidence
                  ? `${(w.confidence * 100).toFixed(1)}%`
                  : null,
                location: "Camera Feed",
                status: "PendingReview",
              })
              .select()
              .single();

            if (reviewRow) {
              await supabase.from("notifications").insert({
                title: `Unknown person detected with ${w.weapon} — pending review`,
                violation_id: reviewRow.id,
                priority: "HIGH",
                read: false,
              });
              entry.reviewViolationId = reviewRow.id;
              console.log(
                `[Review] Unknown ${w.weapon} holder sent to review queue (violation ${reviewRow.id})`,
              );
            }
          } else {
            console.log(
              `[Review] Cooldown active for unknown ${weaponType} — not re-queuing`,
            );
          }
        } catch (e) {
          console.error(
            "[Review] Error creating review queue entry:",
            e.message,
          );
        }
      }

      weaponDetections.push(entry);
    }

    const fightDetection = aiRes.data.fight_detection || null;
    const dresscodeViolationsRaw = aiRes.data.dresscode_violations || [];
    const dresscodeViolations = [];
    const primaryRec = processedRecognitions[0] || null;

    if (fightDetection?.detected) {
      try {
        const student = primaryRec?.student;
        const fightConf = fightDetection.confidence;
        if (student) {
          const { data: violationRow } = await supabase
            .from("violations")
            .insert({
              student_name: student.name,
              student_id: student._id,
              type: "fight",
              severity: "HIGH",
              confidence: fightConf ? `${(fightConf * 100).toFixed(1)}%` : null,
              location: "Camera Feed",
              status: "Unverified",
            })
            .select()
            .single();
          const fineResult = await applyFineIfEligible(
            student._id,
            student.name,
            "fight",
            violationRow?.id || null,
          );
          if (fineResult.applied) {
            finesApplied.push({
              studentName: student.name,
              studentId: student._id,
              weapon: "fight",
              amount: fineResult.fine?.amount,
              fineId: fineResult.fine?._id,
            });
          }
        }
      } catch (e) {
        console.error(
          "[Recognition] Error processing fight detection:",
          e.message,
        );
      }
    }

    for (const dc of dresscodeViolationsRaw) {
      const entry = { type: dc.type, confidence: dc.confidence, bbox: dc.bbox };
      try {
        const student = primaryRec?.student;
        if (student) {
          const { data: violationRow } = await supabase
            .from("violations")
            .insert({
              student_name: student.name,
              student_id: student._id,
              type: dc.type,
              severity: "MED",
              confidence: dc.confidence
                ? `${(dc.confidence * 100).toFixed(1)}%`
                : null,
              location: "Camera Feed",
              status: "Unverified",
            })
            .select()
            .single();
          const fineResult = await applyFineIfEligible(
            student._id,
            student.name,
            dc.type,
            violationRow?.id || null,
          );
          entry.violationId = violationRow?.id || null;
          entry.fineResult = fineResult;
          if (fineResult.applied) {
            finesApplied.push({
              studentName: student.name,
              studentId: student._id,
              weapon: dc.type,
              amount: fineResult.fine?.amount,
              fineId: fineResult.fine?._id,
            });
          }
        }
      } catch (e) {
        console.error(
          "[Recognition] Error processing dresscode violation:",
          e.message,
        );
      }
      dresscodeViolations.push(entry);
    }

    res.json({
      recognized: processedRecognitions.length > 0,
      recognitions: processedRecognitions,
      faces: allDetectedFaces,
      count: aiResults.length,
      weaponDetections,
      fightDetection,
      dresscodeViolations,
      finesApplied,
    });
  } catch (err) {
    console.error("Recognition error:", err.message);
    if (err.code === "ECONNREFUSED") {
      return res.status(500).json({
        error: "AI server not running.",
        recognized: false,
        faces: [],
        errorType: "connection_refused",
      });
    }

    if (err.code === "ECONNABORTED" || err.message.includes("timeout")) {
      return res.status(504).json({
        error: "Recognition timeout",
        recognized: false,
        faces: [],
        errorType: "timeout",
      });
    }

    res.status(500).json({
      error: "Recognition failed",
      recognized: false,
      faces: [],
    });
  }
});

app.post("/api/recognition/single", authenticate, async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "Image required" });

    const buffer = Buffer.from(
      imageBase64.replace(/^data:image\/\w+;base64,/, ""),
      "base64",
    );
    const formData = new FormData();
    formData.append("frame", buffer, {
      filename: "frame.jpg",
      contentType: "image/jpeg",
    });

    const aiRes = await axios.post(
      `${AI_SERVER_URL}/recognize-live`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 30000,
      },
    );

    const results = aiRes.data.results || [];
    if (results.length === 0) return res.json({ recognized: false, faces: [] });

    const bestRec = results
      .filter((r) => r.recognized)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];

    if (bestRec) {
      const { data: studentRow } = await supabase
        .from("students")
        .select("*")
        .eq("id", bestRec.student_id)
        .single();
      const student = studentRow
        ? toClientStudent(studentRow)
        : { _id: bestRec.student_id, name: "Unknown" };
      return res.json({
        recognized: true,
        student,
        confidence: bestRec.confidence,
        faceBox: {
          x: bestRec.bbox[0],
          y: bestRec.bbox[1],
          w: bestRec.bbox[2],
          h: bestRec.bbox[3],
        },
        faces: results.map((r) => ({
          x: r.bbox[0],
          y: r.bbox[1],
          w: r.bbox[2],
          h: r.bbox[3],
        })),
      });
    }

    res.json({
      recognized: false,
      faces: results.map((r) => ({
        x: r.bbox[0],
        y: r.bbox[1],
        w: r.bbox[2],
        h: r.bbox[3],
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Recognition failed", details: err.message });
  }
});

/* -------------------- AI Server Proxy (authenticated) -------------------- */
function verifyTokenFromQuery(req) {
  const token =
    req.query.token || (req.headers.authorization || "").split(" ")[1];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

async function requireAuthOrQueryToken(req, res, next) {
  const decoded = verifyTokenFromQuery(req);
  if (!decoded) return authenticate(req, res, next);
  const { data: userRow } = await supabase
    .from("users")
    .select("*")
    .eq("id", decoded.id)
    .single();
  if (!userRow) return res.status(401).json({ error: "User not found" });
  req.user = toClientUser(userRow);
  next();
}

app.get("/api/ai/health", authenticate, async (req, res) => {
  try {
    const aiRes = await axios.get(`${AI_SERVER_URL}/health`, {
      timeout: 15000,
    });
    res.json(aiRes.data);
  } catch (err) {
    res
      .status(502)
      .json({ error: "AI server unavailable", details: err.message });
  }
});

app.get("/api/ai/stats", authenticate, async (req, res) => {
  try {
    const aiRes = await axios.get(`${AI_SERVER_URL}/api/stats`, {
      timeout: 15000,
    });
    res.json(aiRes.data);
  } catch (err) {
    res
      .status(502)
      .json({ error: "AI server unavailable", details: err.message });
  }
});

app.post("/api/ai/start", authenticate, async (req, res) => {
  try {
    const aiRes = await axios.post(`${AI_SERVER_URL}/api/start`, req.body, {
      timeout: 15000,
    });
    res.json(aiRes.data);
  } catch (err) {
    res.status(502).json({ error: err.response?.data?.error || err.message });
  }
});

app.post("/api/ai/stop", authenticate, async (req, res) => {
  try {
    const aiRes = await axios.post(
      `${AI_SERVER_URL}/api/stop`,
      {},
      { timeout: 10000 },
    );
    res.json(aiRes.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/ai/pause", authenticate, async (req, res) => {
  try {
    const aiRes = await axios.post(
      `${AI_SERVER_URL}/api/pause`,
      {},
      { timeout: 10000 },
    );
    res.json(aiRes.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/ai/resume", authenticate, async (req, res) => {
  try {
    const aiRes = await axios.post(
      `${AI_SERVER_URL}/api/resume`,
      {},
      { timeout: 10000 },
    );
    res.json(aiRes.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/ai/settings", authenticate, async (req, res) => {
  try {
    const aiRes = await axios.post(`${AI_SERVER_URL}/api/settings`, req.body, {
      timeout: 10000,
    });
    res.json(aiRes.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/ai/process-offline", authenticate, async (req, res) => {
  try {
    const aiRes = await axios.post(
      `${AI_SERVER_URL}/api/process_offline`,
      req.body,
      { timeout: 15000 },
    );
    const data = aiRes.data;
    if (data.output_url) {
      data.output_url = data.output_url.replace(
        "/static/",
        "/api/ai/processed/",
      );
    }
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.response?.data?.error || err.message });
  }
});

app.post(
  "/api/ai/upload-and-process",
  authenticate,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const form = new FormData();
      form.append("file", fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
      const aiRes = await axios.post(
        `${AI_SERVER_URL}/api/upload_and_process`,
        form,
        {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          timeout: 120000,
        },
      );
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      const data = aiRes.data;
      if (data.output_url) {
        data.output_url = data.output_url.replace(
          "/static/",
          "/api/ai/processed/",
        );
      }
      res.json(data);
    } catch (err) {
      if (req.file?.path)
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      res.status(502).json({ error: err.response?.data?.error || err.message });
    }
  },
);

app.get("/api/ai/video-feed", requireAuthOrQueryToken, async (req, res) => {
  try {
    const aiRes = await axios.get(`${AI_SERVER_URL}/video_feed`, {
      responseType: "stream",
      timeout: 0,
    });
    res.setHeader("Content-Type", "multipart/x-mixed-replace; boundary=frame");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    aiRes.data.pipe(res);
    req.on("close", () => aiRes.data.destroy());
  } catch (err) {
    if (!res.headersSent)
      res.status(502).json({ error: "AI video feed unavailable" });
  }
});

app.get(
  "/api/ai/processed/:filename",
  requireAuthOrQueryToken,
  async (req, res) => {
    try {
      const safe = path.basename(req.params.filename);
      const aiRes = await axios.get(`${AI_SERVER_URL}/static/${safe}`, {
        responseType: "stream",
        timeout: 0,
      });
      res.setHeader("Content-Type", "video/mp4");
      aiRes.data.pipe(res);
    } catch (err) {
      res.status(404).json({ error: "Processed video not found" });
    }
  },
);

/* -------------------- Error Handling Middleware -------------------- */
// Catch-all error handler - always return JSON
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    details: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// 404 handler - always return JSON
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

/* -------------------- Server -------------------- */
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📋 Available routes:`);
  console.log(`   POST /api/auth/login`);
  console.log(
    `   GET/POST/PATCH /api/policy-rules (PATCH /api/policy-rules/:id)`,
  );
  console.log(`   POST /api/students/register (Image registration)`);
  console.log(`   POST /api/recognition/live`);
  console.log(`   POST /api/recognition/single`);
  console.log(`   GET/PATCH /api/fines (PATCH /api/fines/:id)`);
  console.log(`   GET /api/analytics/summary`);
  console.log(`   GET /api/review-queue`);
  console.log(`   PATCH /api/review-queue/:id/approve`);
  console.log(`   PATCH /api/review-queue/:id/reject`);
  console.log(`   GET/POST /api/violations, GET /api/violations/:id`);
  console.log(`   POST /api/violations/:id/clip`);
  console.log(`   POST /api/violations/:id/clip-from-frames`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `❌ Port ${PORT} is already in use. Stop the other server first, then restart.`,
    );
  } else {
    console.error("❌ Server error:", err.message);
  }
  process.exit(1);
});

// Ensure Supabase Storage bucket exists for violation clips
(async () => {
  try {
    const { data: buckets, error: listErr } =
      await supabase.storage.listBuckets();
    if (listErr) {
      console.warn("[Storage] Could not list buckets:", listErr.message);
      return;
    }
    const exists = (buckets || []).some((b) => b.name === "violation-clips");
    if (!exists) {
      const { error: createErr } = await supabase.storage.createBucket(
        "violation-clips",
        {
          public: true,
          fileSizeLimit: 52428800,
          allowedMimeTypes: ["video/webm", "video/mp4", "video/ogg"],
        },
      );
      if (createErr)
        console.warn("[Storage] Could not create bucket:", createErr.message);
      else console.log("[Storage] ✅ Created violation-clips bucket");
    } else {
      console.log("[Storage] ✅ violation-clips bucket ready");
    }
  } catch (e) {
    console.warn("[Storage] Bucket init error:", e.message);
  }
})();
