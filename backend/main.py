"""Backend de ativacao do player: liga o MAC virtual da TV as credenciais da lista do cliente.

O servidor NAO transmite video. Ele so guarda "MAC da TV -> credenciais" e entrega
esses dados ao app quando o dispositivo esta ativo.

Rodar:  ADMIN_PASSWORD=suasenha SECRET_KEY=algo-longo uvicorn main:app --host 0.0.0.0 --port 8000
"""
import hashlib
import html
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, FastAPI, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from itsdangerous import BadSignature, URLSafeSerializer
from pydantic import BaseModel

DB_PATH = os.environ.get("DB_PATH", "player.db")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
SECRET_KEY = os.environ.get("SECRET_KEY", "")
TRIAL_DAYS = int(os.environ.get("TRIAL_DAYS", "0"))  # 0 = precisa ativar manualmente

if not ADMIN_PASSWORD or not SECRET_KEY:
    raise SystemExit("Defina ADMIN_PASSWORD e SECRET_KEY nas variaveis de ambiente.")

signer = URLSafeSerializer(SECRET_KEY, salt="admin-session")
MAC_RE = re.compile(r"^[0-9A-F]{2}(:[0-9A-F]{2}){5}$")

app = FastAPI(title="Player Activation", docs_url=None, redoc_url=None)
# O app da TV roda de file:// ou de outra origem, entao a API publica libera CORS.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


# ---------- banco ----------
@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mac TEXT UNIQUE NOT NULL,
                client_name TEXT DEFAULT '',
                active INTEGER NOT NULL DEFAULT 0,
                expires_at TEXT,
                created_at TEXT NOT NULL,
                last_seen TEXT
            );
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
                name TEXT NOT NULL DEFAULT 'Lista',
                type TEXT NOT NULL CHECK (type IN ('xtream','m3u')),
                server_url TEXT DEFAULT '',
                username TEXT DEFAULT '',
                password TEXT DEFAULT ''
            );
            """
        )


init_db()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def mac_from_uid(uid: str) -> str:
    """Gera um 'MAC virtual' estavel a partir do ID unico que a TV envia."""
    h = hashlib.sha256(uid.encode()).hexdigest().upper()[:12]
    return ":".join(h[i : i + 2] for i in range(0, 12, 2))


def is_active(row) -> bool:
    if not row["active"]:
        return False
    if row["expires_at"]:
        return datetime.fromisoformat(row["expires_at"]) > datetime.now(timezone.utc)
    return True


def device_payload(conn, row) -> dict:
    active = is_active(row)
    out = {"mac": row["mac"], "active": active, "expires_at": row["expires_at"], "playlists": []}
    if active:
        pls = conn.execute("SELECT * FROM playlists WHERE device_id = ?", (row["id"],)).fetchall()
        out["playlists"] = [
            {"id": p["id"], "name": p["name"], "type": p["type"], "server_url": p["server_url"],
             "username": p["username"], "password": p["password"]}
            for p in pls
        ]
    return out


# ---------- API publica (usada pelo app da TV) ----------
class RegisterIn(BaseModel):
    device_uid: str


@app.post("/api/device/register")
def register(body: RegisterIn):
    uid = body.device_uid.strip()
    if not 8 <= len(uid) <= 128:
        raise HTTPException(400, "device_uid invalido")
    mac = mac_from_uid(uid)
    with db() as c:
        row = c.execute("SELECT * FROM devices WHERE mac = ?", (mac,)).fetchone()
        if row is None:
            expires, active = None, 0
            if TRIAL_DAYS > 0:
                active = 1
                expires = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat(timespec="seconds")
            c.execute(
                "INSERT INTO devices (mac, active, expires_at, created_at, last_seen) VALUES (?,?,?,?,?)",
                (mac, active, expires, now_iso(), now_iso()),
            )
        else:
            c.execute("UPDATE devices SET last_seen = ? WHERE id = ?", (now_iso(), row["id"]))
        row = c.execute("SELECT * FROM devices WHERE mac = ?", (mac,)).fetchone()
        return device_payload(c, row)


@app.get("/api/check-device")
def check_device(mac: str):
    mac = mac.strip().upper()
    if not MAC_RE.match(mac):
        raise HTTPException(400, "MAC invalido")
    with db() as c:
        row = c.execute("SELECT * FROM devices WHERE mac = ?", (mac,)).fetchone()
        if row is None:
            raise HTTPException(404, "Dispositivo nao encontrado")
        c.execute("UPDATE devices SET last_seen = ? WHERE id = ?", (now_iso(), row["id"]))
        return device_payload(c, row)


# ---------- painel admin ----------
def is_admin(session: str | None) -> bool:
    if not session:
        return False
    try:
        return signer.loads(session) == "admin"
    except BadSignature:
        return False


def e(v) -> str:
    return html.escape(str(v if v is not None else ""), quote=True)


PAGE = """<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Painel</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#0f1115;color:#e8e8ea}
main{max-width:1000px;margin:0 auto;padding:20px}
h1,h2{font-weight:600} a{color:#7cb7ff}
table{width:100%;border-collapse:collapse;margin:12px 0}
th,td{padding:8px 10px;border-bottom:1px solid #2a2d35;text-align:left;font-size:14px;vertical-align:top}
input,select{background:#1a1d24;color:#e8e8ea;border:1px solid #333845;border-radius:6px;padding:7px;margin:2px}
button{background:#2f6fed;color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer}
button.red{background:#c0392b} button.gray{background:#444a58}
.ok{color:#4cd37b} .off{color:#ff6b6b} .card{background:#161920;border-radius:10px;padding:14px;margin:14px 0}
form.inline{display:inline}
</style></head><body><main>%s</main></body></html>"""


def page(body: str) -> HTMLResponse:
    return HTMLResponse(PAGE % body)


@app.get("/admin/login", response_class=HTMLResponse)
def login_form():
    return page(
        '<h1>Entrar</h1><form method="post" action="/admin/login">'
        '<input type="password" name="password" placeholder="Senha" autofocus>'
        "<button>Entrar</button></form>"
    )


@app.post("/admin/login")
def login(password: str = Form(...)):
    if not secrets.compare_digest(password.encode(), ADMIN_PASSWORD.encode()):
        return page('<h1>Entrar</h1><p class="off">Senha incorreta.</p><a href="/admin/login">Tentar de novo</a>')
    resp = RedirectResponse("/admin", status_code=303)
    resp.set_cookie("session", signer.dumps("admin"), httponly=True, samesite="strict", max_age=86400 * 7)
    return resp


@app.get("/admin/logout")
def logout():
    resp = RedirectResponse("/admin/login", status_code=303)
    resp.delete_cookie("session")
    return resp


def require_admin(session):
    if not is_admin(session):
        raise HTTPException(status_code=303, headers={"Location": "/admin/login"})


@app.get("/admin", response_class=HTMLResponse)
def admin_home(session: str | None = Cookie(None)):
    require_admin(session)
    with db() as c:
        rows = c.execute("SELECT * FROM devices ORDER BY created_at DESC").fetchall()
        counts = {r["device_id"]: r["n"] for r in c.execute(
            "SELECT device_id, COUNT(*) n FROM playlists GROUP BY device_id")}
    trs = ""
    for r in rows:
        status = '<span class="ok">ativo</span>' if is_active(r) else '<span class="off">inativo</span>'
        trs += (
            f'<tr><td><a href="/admin/device/{r["id"]}">{e(r["mac"])}</a></td>'
            f'<td>{e(r["client_name"])}</td><td>{status}</td><td>{e(r["expires_at"] or "sem vencimento")}</td>'
            f'<td>{counts.get(r["id"], 0)}</td><td>{e(r["last_seen"] or "-")}</td></tr>'
        )
    return page(
        "<h1>Dispositivos</h1>"
        '<div class="card"><form method="post" action="/admin/device/add">'
        '<input name="mac" placeholder="MAC (AA:BB:CC:11:22:33)" required size="22">'
        '<input name="client_name" placeholder="Nome do cliente">'
        "<button>Cadastrar MAC</button></form>"
        "<small>O MAC aparece na tela do app quando o cliente abre pela primeira vez.</small></div>"
        "<table><tr><th>MAC</th><th>Cliente</th><th>Status</th><th>Vencimento</th><th>Listas</th><th>Ultimo acesso</th></tr>"
        f"{trs}</table>"
        f'<p>{len(rows)} dispositivo(s) &middot; <a href="/admin/logout">Sair</a></p>'
    )


@app.post("/admin/device/add")
def device_add(mac: str = Form(...), client_name: str = Form(""), session: str | None = Cookie(None)):
    require_admin(session)
    mac = mac.strip().upper().replace("-", ":")
    if not MAC_RE.match(mac):
        raise HTTPException(400, "MAC invalido. Use o formato AA:BB:CC:11:22:33")
    with db() as c:
        c.execute(
            "INSERT OR IGNORE INTO devices (mac, client_name, active, created_at) VALUES (?,?,1,?)",
            (mac, client_name.strip(), now_iso()),
        )
        row = c.execute("SELECT id FROM devices WHERE mac = ?", (mac,)).fetchone()
    return RedirectResponse(f"/admin/device/{row['id']}", status_code=303)


@app.get("/admin/device/{device_id}", response_class=HTMLResponse)
def device_page(device_id: int, session: str | None = Cookie(None)):
    require_admin(session)
    with db() as c:
        d = c.execute("SELECT * FROM devices WHERE id = ?", (device_id,)).fetchone()
        if d is None:
            raise HTTPException(404, "Nao encontrado")
        pls = c.execute("SELECT * FROM playlists WHERE device_id = ?", (device_id,)).fetchall()
    exp = (d["expires_at"] or "")[:10]
    plrows = "".join(
        f'<tr><td>{e(p["name"])}</td><td>{e(p["type"])}</td><td>{e(p["server_url"])}</td>'
        f'<td>{e(p["username"])}</td><td><form class="inline" method="post" '
        f'action="/admin/playlist/{p["id"]}/delete"><input type="hidden" name="device_id" value="{device_id}">'
        '<button class="red">Remover</button></form></td></tr>'
        for p in pls
    )
    checked = "checked" if d["active"] else ""
    return page(
        f'<p><a href="/admin">&larr; Voltar</a></p><h1>{e(d["mac"])}</h1>'
        f'<div class="card"><form method="post" action="/admin/device/{device_id}/update">'
        f'<input name="client_name" placeholder="Nome do cliente" value="{e(d["client_name"])}">'
        f'<label><input type="checkbox" name="active" {checked}> Ativo</label> '
        f'Vencimento: <input type="date" name="expires" value="{e(exp)}">'
        "<button>Salvar</button></form></div>"
        "<h2>Listas</h2>"
        f"<table><tr><th>Nome</th><th>Tipo</th><th>Servidor / URL</th><th>Usuario</th><th></th></tr>{plrows}</table>"
        '<div class="card"><h3>Adicionar lista</h3>'
        f'<form method="post" action="/admin/device/{device_id}/playlist">'
        '<input name="name" placeholder="Nome" value="Lista">'
        '<select name="type"><option value="xtream">Xtream Codes</option><option value="m3u">M3U (URL)</option></select><br>'
        '<input name="server_url" placeholder="http://servidor:porta  (ou URL da M3U)" size="48" required><br>'
        '<input name="username" placeholder="Usuario (Xtream)"> <input name="password" placeholder="Senha (Xtream)">'
        "<br><button>Adicionar</button></form></div>"
        f'<form method="post" action="/admin/device/{device_id}/delete" '
        "onsubmit=\"return confirm('Excluir este dispositivo e suas listas?')\">"
        '<button class="red">Excluir dispositivo</button></form>'
    )


@app.post("/admin/device/{device_id}/update")
def device_update(device_id: int, client_name: str = Form(""), expires: str = Form(""),
                  active: str | None = Form(None), session: str | None = Cookie(None)):
    require_admin(session)
    exp = None
    if expires:
        try:
            exp = datetime.fromisoformat(expires).replace(hour=23, minute=59, second=59,
                                                          tzinfo=timezone.utc).isoformat(timespec="seconds")
        except ValueError:
            raise HTTPException(400, "Data invalida")
    with db() as c:
        c.execute("UPDATE devices SET client_name=?, active=?, expires_at=? WHERE id=?",
                  (client_name.strip(), 1 if active else 0, exp, device_id))
    return RedirectResponse(f"/admin/device/{device_id}", status_code=303)


@app.post("/admin/device/{device_id}/playlist")
def playlist_add(device_id: int, name: str = Form("Lista"), type: str = Form(...), server_url: str = Form(...),
                 username: str = Form(""), password: str = Form(""), session: str | None = Cookie(None)):
    require_admin(session)
    if type not in ("xtream", "m3u"):
        raise HTTPException(400, "Tipo invalido")
    if not re.match(r"^https?://", server_url.strip()):
        raise HTTPException(400, "A URL precisa comecar com http:// ou https://")
    with db() as c:
        c.execute(
            "INSERT INTO playlists (device_id, name, type, server_url, username, password) VALUES (?,?,?,?,?,?)",
            (device_id, name.strip() or "Lista", type, server_url.strip().rstrip("/") if type == "xtream" else server_url.strip(),
             username.strip(), password.strip()),
        )
    return RedirectResponse(f"/admin/device/{device_id}", status_code=303)


@app.post("/admin/playlist/{playlist_id}/delete")
def playlist_delete(playlist_id: int, device_id: int = Form(...), session: str | None = Cookie(None)):
    require_admin(session)
    with db() as c:
        c.execute("DELETE FROM playlists WHERE id = ?", (playlist_id,))
    return RedirectResponse(f"/admin/device/{device_id}", status_code=303)


@app.post("/admin/device/{device_id}/delete")
def device_delete(device_id: int, session: str | None = Cookie(None)):
    require_admin(session)
    with db() as c:
        c.execute("DELETE FROM devices WHERE id = ?", (device_id,))
    return RedirectResponse("/admin", status_code=303)


@app.get("/")
def root():
    return RedirectResponse("/admin")
