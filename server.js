import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

function apiKey(res) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) res.status(503).json({ error: "음성 서비스 API 키가 아직 연결되지 않았습니다." });
  return key;
}

app.get("/api/health", (_req, res) => res.json({ ok: true, voiceConfigured: Boolean(process.env.ELEVENLABS_API_KEY) }));

app.post("/api/voice/clone", upload.single("sample"), async (req, res) => {
  const key = apiKey(res); if (!key) return;
  if (req.body.consent !== "true") return res.status(400).json({ error: "본인 음성 복제 동의가 필요합니다." });
  if (!req.file || !req.file.mimetype.startsWith("audio/")) return res.status(400).json({ error: "음성 파일이 필요합니다." });
  const form = new FormData();
  form.append("name", String(req.body.name || "해피트리 원장 목소리").slice(0, 80));
  form.append("description", "본인이 동의하여 해피트리 릴스 제작기에 등록한 음성");
  form.append("files", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || "voice.webm");
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/voices/add", { method: "POST", headers: { "xi-api-key": key }, body: form });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.detail?.message || data.detail || "음성 등록에 실패했습니다." });
    res.json({ voiceId: data.voice_id, requiresVerification: Boolean(data.requires_verification) });
  } catch { res.status(502).json({ error: "음성 서비스에 연결하지 못했습니다." }); }
});

app.post("/api/voice/synthesize", async (req, res) => {
  const key = apiKey(res); if (!key) return;
  const voiceId = String(req.body.voiceId || "");
  const text = String(req.body.text || "").trim();
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(voiceId) || !text || text.length > 2500) return res.status(400).json({ error: "목소리 또는 대본을 확인해 주세요." });
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.55, similarity_boost: 0.8 } })
    });
    if (!response.ok) { const data = await response.json(); return res.status(response.status).json({ error: data.detail?.message || data.detail || "음원 생성에 실패했습니다." }); }
    res.type("audio/mpeg"); res.send(Buffer.from(await response.arrayBuffer()));
  } catch { res.status(502).json({ error: "음성 서비스에 연결하지 못했습니다." }); }
});

app.use(express.static(root));
app.get("/{*splat}", (_req, res) => res.sendFile(path.join(root, "index.html")));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Happytree Reels Maker listening on ${port}`));

