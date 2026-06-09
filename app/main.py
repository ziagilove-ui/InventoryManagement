import os
import sys
import tempfile
from pathlib import Path

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from authlib.integrations.starlette_client import OAuth
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from app.services.members import MemberStore
from app.services.sheets import InventoryStore


app = FastAPI(title="Inventory Search Web App")
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET_KEY", "change-this-secret-key"),
    same_site="lax",
    https_only=os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true",
)
app.mount("/static", StaticFiles(directory="static"), name="static")

inventory_store = InventoryStore()
member_store = MemberStore()
oauth = OAuth()
oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


class MemberUpdateRequest(BaseModel):
    role: str
    enabled: bool


def google_oauth_configured() -> bool:
    return bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))


def is_local_request(request: Request) -> bool:
    client_host = request.client.host if request.client else ""
    return client_host in {"127.0.0.1", "localhost", "::1", "testclient"}


def is_dev_inventory_request(request: Request) -> bool:
    return (
        not google_oauth_configured()
        and is_local_request(request)
        and request.headers.get("x-dev-mode") == "1"
    )


def require_member(request: Request) -> dict:
    member = request.session.get("member")
    if not member:
        raise HTTPException(status_code=401, detail="Login required")
    if not member.get("enabled"):
        request.session.clear()
        raise HTTPException(status_code=403, detail="Account disabled")
    return member


def require_admin(request: Request) -> dict:
    member = require_member(request)
    if member.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return member


@app.get("/")
def index(request: Request):
    html = Path("static/index.html").read_text(encoding="utf-8")

    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
        },
    )


@app.get("/dev")
def dev_index(request: Request):
    if google_oauth_configured():
        return RedirectResponse("/")
    if not is_local_request(request):
        raise HTTPException(status_code=403, detail="Dev page is local only")

    html = Path("static/index.html").read_text(encoding="utf-8")
    html = html.replace("<body>", '<body data-dev-mode="1">')
    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
        },
    )


@app.get("/api/auth/config")
def auth_config():
    return {"googleConfigured": google_oauth_configured()}


@app.get("/auth/google/login")
async def google_login(request: Request):
    if not google_oauth_configured():
        raise HTTPException(status_code=500, detail="Google OAuth env vars are required")

    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@app.get("/auth/google/callback")
async def google_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get("userinfo")
    if user_info is None:
        user_info = await oauth.google.userinfo(token=token)

    email = user_info.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Google account email is required")

    member = member_store.get_or_create_member(email=email, name=user_info.get("name", ""))
    if not member.get("enabled"):
        request.session.clear()
        raise HTTPException(status_code=403, detail="Account disabled")

    request.session["member"] = member
    return RedirectResponse("/")


@app.get("/api/me")
def me(request: Request):
    member = require_member(request)
    current_member = member_store.get_member(member["email"])
    if current_member is None or not current_member.get("enabled"):
        request.session.clear()
        raise HTTPException(status_code=403, detail="Account disabled")

    request.session["member"] = current_member
    return {"member": current_member}


@app.post("/api/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/inventory")
def inventory(request: Request, refresh: bool = False):
    if not is_dev_inventory_request(request):
        require_member(request)
    return inventory_store.get_inventory(refresh=refresh)


@app.get("/api/members")
def members(request: Request):
    require_admin(request)
    return {"members": member_store.list_members()}


@app.patch("/api/members/{email}")
def update_member(email: str, payload: MemberUpdateRequest, request: Request):
    require_admin(request)
    member = member_store.update_member(email=email, role=payload.role, enabled=payload.enabled)
    return {"member": member}


@app.post("/api/inventory/upload")
async def upload_inventory(request: Request, file: UploadFile = File(...)):
    require_admin(request)
    if not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="XLSX file is required")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(await file.read())

    try:
        return inventory_store.upload_xlsx(temp_path)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    finally:
        temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)
